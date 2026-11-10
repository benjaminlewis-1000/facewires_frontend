import React from 'react';
import store from 'store';
import axiosInstance from './axios_setup';
import { withRetry } from './apiRetry';
import '../css/rotationReview.css';

// Backend: api/rotation_review/ (django_picasa) - images a landmark-geometry
// audit flagged as possibly rotated. GET lists the FLAGGED backlog (stable
// id-ordered paging, not an infinite feed - this is a finite queue a
// reviewer works through to completion). Each row's preview_url is a
// complete, ready-to-use <img src> (its own access_key baked in, never
// browser-cached - rendered live every request since the backend audit can
// re-score a still-pending image) showing the real corrected result, not an
// approximation.
//
// UI mirrors gallery.jsx's unlabeled-faces "Confirm row" pattern rather than
// a per-card submit: a tile can have its direction adjusted or be marked
// "not rotated" - both purely local, no network call - and the pinned
// per-row button commits everything from the top of the current list
// through that row in one PATCH, same "this row and everything above it"
// semantics as Confirm row/Verify row there. There's no undo endpoint, so
// committing is final.
//
// Default presumption: ORIGINAL orientation is correct, not the backend's
// proposed correction - reversed 2026-11-09 per the user's own call, after
// the landmark-geometry signal's real false-positive rate (see
// django_picasa's rotation_geometry.py UPRIGHT_TOLERANCE_* comments - 91.4%
// of single-face flags were ordinary head tilts, not real rotations) made
// "default to the proposed fix" the wrong prior. Every tile now starts
// showing (and, on Confirm row, would commit) the image's true original
// orientation; the reviewer only has to act - cycling the rotate arrows -
// on the minority that a human eye can tell are genuinely rotated.
const PAGE_SIZE = 25
const DEFAULT_COLUMN_COUNT = 4

// proposed_rotation_degrees is a raw measured angle, not yet snapped - this
// mirrors the snap-to-nearest-90 the backend itself applies when it renders
// preview_url, so the default direction we preselect actually matches what
// the reviewer is looking at.
function snapToDirection(degrees) {
  const normalized = ((degrees % 360) + 360) % 360
  const candidates = [{ angle: 90, direction: 'cw' }, { angle: 180, direction: '180' }, { angle: 270, direction: 'ccw' }]
  let best = candidates[0]
  let bestDiff = Infinity
  candidates.forEach(c => {
    const diff = Math.min(Math.abs(normalized - c.angle), 360 - Math.abs(normalized - c.angle))
    if (diff < bestDiff) { bestDiff = diff; best = c }
  })
  return best.direction
}

// The backend's "cw"/"ccw" labels are a human-reviewer convention, not a
// literal CSS rotation direction - confirmed directly against PIL's actual
// transpose semantics (common/open_img_oriented.py's _pil_transpose_op):
// confirming "cw" applies PIL ROTATE_90 (90 deg counter-clockwise in PIL's
// own mathematical convention, i.e. visually a -90deg CSS rotation), and
// confirming "ccw" applies ROTATE_270 (270 CCW, visually +90deg CSS). Easy
// to get backwards since the label and the math sign actually run opposite
// - verified by rendering both server-side to confirm which is which
// before writing this, after a real-world case (image #170, a
// landmark_single_face false positive) exposed the swap: the double-click
// "see original orientation" preview was coming out 180deg off because
// this function previously had cw/ccw's CSS-equivalent values swapped with
// each other, and defaultAngle/currentDirection below compose directly
// off this.
function directionToAngle(direction) {
  return direction === 'cw' ? -90 : direction === 'ccw' ? 90 : direction === 'none' ? 0 : 180
}

// The CSS adjustment needed on top of the server-rendered preview (which
// already shows snapToDirection(proposed_rotation_degrees)) to CANCEL that
// rotation back out to the image's true original orientation.
// -defaultAngle(row) is what a tile's visualDeg starts at on every fetch
// (see fetchInitial/fetchMore) - the "presume original is correct" default.
function defaultAngle(row) {
  return directionToAngle(snapToDirection(row.proposed_rotation_degrees))
}

// Inverse of directionToAngle - snaps a raw (possibly-huge, possibly-
// negative - see visualDeg below) absolute angle back to whichever of the
// 4 selectable directions it's closest to, mod 360.
function angleToDirection(angle) {
  const normalized = ((angle % 360) + 360) % 360
  const directions = ['cw', '180', 'ccw', 'none']
  let best = null
  let bestDiff = Infinity
  directions.forEach(d => {
    const a = ((directionToAngle(d) % 360) + 360) % 360
    const diff = Math.min(Math.abs(normalized - a), 360 - Math.abs(normalized - a))
    if (diff < bestDiff) { bestDiff = diff; best = d }
  })
  return best
}

// A tile's currently-selected direction, derived from its visualDeg rather
// than stored separately - one source of truth instead of two fields that
// could drift out of sync with each other.
function currentDirection(row, visualDeg) {
  return angleToDirection(defaultAngle(row) + visualDeg)
}

// Picks whichever value congruent to `target` (mod 360) is numerically
// closest to `reference` - used so a CSS rotate() jump (e.g. the
// double-click "view original" jump) takes the short way around instead of
// spinning past 180 degrees the long way just because the raw target
// angle happened to land on the far side.
function nearestEquivalentAngle(target, reference) {
  const delta = (((target - reference) % 360) + 540) % 360 - 180
  return reference + delta
}

// Deliberately inverted from the backend's own "cw"/"ccw" contract words -
// see directionToAngle's comment above: confirming the backend's "cw"
// visually rotates the image counter-clockwise (and vice versa), which
// isn't a reasonable thing to show a human reviewer. This is the one
// place that distinction matters - the label text shown on screen - so
// it's inverted here only; the string actually sent to the backend
// (currentDirection's return value) is untouched.
function directionLabel(direction) {
  return direction === 'cw' ? 'Counter-clockwise' : direction === 'ccw' ? 'Clockwise' : direction === 'none' ? 'Original orientation' : '180°'
}

class RotationReviewTool extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      rows: [],
      count: 0,
      loading: true,
      loadError: null,
      loadingMore: false,
      loadMoreError: null,
      // Per-id local state, independent of the committed backend data -
      // same "stage locally, commit separately" shape as gallery.jsx's
      // clusterSelected, extended to carry a value (direction) rather than
      // just inclusion/exclusion. Defaults to pending-confirm at the
      // snapped direction for every row fetched (see fetchInitial/fetchMore).
      tileState: {},
      rowRejectReason: {},
      columnCount: DEFAULT_COLUMN_COUNT,
      rowBusy: {},
      submitError: null,
    }
    this.gridWrapperRef = React.createRef()
    this.fetchInitial = this.fetchInitial.bind(this)
    this.fetchMore = this.fetchMore.bind(this)
    this.handleToggleDismissed = this.handleToggleDismissed.bind(this)
    this.handleCycleDirection = this.handleCycleDirection.bind(this)
    this.handleViewProposed = this.handleViewProposed.bind(this)
    this.handleRowAction = this.handleRowAction.bind(this)
    this.handleConfirmSingle = this.handleConfirmSingle.bind(this)
    this.handleResize = this.handleResize.bind(this)
    this.handleScroll = this.handleScroll.bind(this)
  }

  componentDidMount() {
    this.fetchInitial()
    this.readSizeVars()
    this.resizeObserver = new ResizeObserver(this.handleResize)
    if (this.gridWrapperRef.current) this.resizeObserver.observe(this.gridWrapperRef.current)
  }

  componentWillUnmount() {
    if (this.resizeObserver) this.resizeObserver.disconnect()
  }

  // Single source of truth for tile sizing lives in rotationReview.css,
  // read live rather than duplicated as JS literals - same discipline
  // gallery.jsx's readSizeVars uses for --tile-size/--row-button-width.
  readSizeVars() {
    if (!this.gridWrapperRef.current) return
    const styles = getComputedStyle(this.gridWrapperRef.current)
    this.tileWidth = parseInt(styles.getPropertyValue('--rotation-review-tile-width'), 10) || 220
    this.rowButtonWidth = parseInt(styles.getPropertyValue('--rotation-review-row-button-width'), 10) || 32
  }

  handleResize(entries) {
    if (!this.tileWidth) this.readSizeVars()
    const width = entries[0].contentRect.width
    const columns = Math.max(1, Math.floor((width - this.rowButtonWidth) / this.tileWidth))
    if (columns !== this.state.columnCount) this.setState({ columnCount: columns })
  }

  fetchInitial() {
    this.setState({ loading: true, loadError: null })
    withRetry(() => axiosInstance.get(store.get('api_url') + `/rotation_review/?limit=${PAGE_SIZE}&offset=0`))
      .then(response => {
        const tileState = {}
        response.data.results.forEach(row => {
          tileState[row.id] = { dismissed: false, visualDeg: -defaultAngle(row) }
        })
        this.setState({
          rows: response.data.results,
          count: response.data.count,
          loading: false,
          tileState,
          rowRejectReason: {},
          submitError: null,
        })
      })
      .catch(error => {
        console.error('Error fetching rotation review list', error)
        this.setState({ loading: false, loadError: 'Could not load the rotation review list.' })
      })
  }

  // Infinite-scroll continuation, same streamed-page-appending shape as
  // ImageScreen's large face galleries. The offset passed here is
  // deliberately this.state.rows.length, NOT a running "total ever
  // fetched" counter: rows only ever shrinks via a successful confirm/
  // dismiss (which also removes that image from the backend's live
  // FLAGGED list immediately), so the backend's current FLAGGED order,
  // from this session's own point of view, always has exactly
  // rows.length already-seen images ahead of whatever comes next -
  // regardless of how many of those we've since resolved. Using a
  // separate "total fetched" counter instead would drift the moment any
  // row action resolves something before the next page loads.
  fetchMore() {
    if (this.state.loadingMore || this.state.rows.length >= this.state.count) return
    this.setState({ loadingMore: true, loadMoreError: null })
    const offset = this.state.rows.length
    axiosInstance.get(store.get('api_url') + `/rotation_review/?limit=${PAGE_SIZE}&offset=${offset}`)
      .then(response => {
        this.setState(prevState => {
          const tileState = { ...prevState.tileState }
          response.data.results.forEach(row => {
            tileState[row.id] = { dismissed: false, visualDeg: -defaultAngle(row) }
          })
          return {
            rows: [...prevState.rows, ...response.data.results],
            count: response.data.count,
            tileState,
            loadingMore: false,
          }
        })
      })
      .catch(error => {
        console.error('Error fetching more rotation review rows', error)
        this.setState({ loadingMore: false, loadMoreError: "Couldn't load more - scroll to retry." })
      })
  }

  handleScroll(event) {
    const el = event.target
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) this.fetchMore()
  }

  handleToggleDismissed(id) {
    this.setState(prevState => ({
      tileState: {
        ...prevState.tileState,
        [id]: { ...prevState.tileState[id], dismissed: !prevState.tileState[id].dismissed },
      },
    }))
  }

  // Steps cw -> 180 -> ccw -> none (original orientation) -> cw, or the
  // reverse - purely local, no backend round-trip. "none" is a 4th,
  // explicitly selectable orientation per the user's own request, distinct
  // from the X/dismiss toggle even though confirming at "none" ends up
  // functionally equivalent (see handleRowAction, which routes it into
  // dismiss_ids since the backend has no "none" direction value).
  //
  // Implemented as a plain +-90 nudge to visualDeg (the tile's single
  // source of truth for both its CSS preview rotation AND its derived
  // direction - see currentDirection), not as a lookup into the 4-entry
  // order array. A lookup-based version used to jump the CSS transform
  // from e.g. -180deg straight to +90deg (a raw 270deg difference) once
  // every 4th click, because 'cw'/'180'/'ccw'/'none' aren't evenly spaced
  // by directionToAngle's own values in traversal order - the fix is to
  // never represent the same rotation two different ways; every click
  // just adds the same 90deg, however far visualDeg has already wandered
  // from 0, so the step is always exactly 90deg and the sequence
  // naturally wraps around through all 4 directions.
  handleCycleDirection(id, forward) {
    this.setState(prevState => {
      const current = prevState.tileState[id]
      const delta = forward ? -90 : 90
      return {
        tileState: { ...prevState.tileState, [id]: { ...current, visualDeg: current.visualDeg + delta } },
      }
    })
  }

  // Double-click preview to jump straight to the backend's PROPOSED
  // correction (the tile's default is now the original orientation - see
  // the module comment up top - so this is the one quick way to check what
  // the algorithm actually guessed). Sets visualDeg to 0, which cancels the
  // default's original-orientation override and lets the server-rendered
  // preview (already snapToDirection(proposed_rotation_degrees)) show
  // through as-is, so currentDirection resolves to the proposed direction
  // directly rather than a separate display-only overlay - hitting the
  // rotate arrows right after a double-click correctly starts from the
  // proposed direction as the base. nearestEquivalentAngle picks the
  // representation of that target closest to the tile's current visualDeg,
  // so the jump itself is also a short, sensible spin rather than an
  // arbitrary one.
  handleViewProposed(row) {
    this.setState(prevState => {
      const current = prevState.tileState[row.id]
      return {
        tileState: {
          ...prevState.tileState,
          [row.id]: { dismissed: false, visualDeg: nearestEquivalentAngle(0, current.visualDeg) },
        },
      }
    })
  }

  computeGridRows() {
    const columns = Math.max(1, this.state.columnCount)
    const rows = []
    for (let i = 0; i < this.state.rows.length; i += columns) {
      rows.push(this.state.rows.slice(i, i + columns))
    }
    return rows
  }

  // Shared by handleRowAction (a whole swept row, "this row and everything
  // above it") and handleConfirmSingle (just one tile) - same PATCH shape,
  // same optimistic-removal/rejection handling either way, just a
  // different set of rows going in.
  submitRows(rowsToSubmit, { scrollTopOnSuccess } = {}) {
    const { tileState } = this.state
    const confirm = []
    const dismiss_ids = []
    rowsToSubmit.forEach(row => {
      const t = tileState[row.id]
      const direction = currentDirection(row, t.visualDeg)
      // "none" (original orientation) has no backend direction value -
      // confirming it is functionally the same as dismissing, so it's
      // routed the same way.
      if (t.dismissed || direction === 'none') dismiss_ids.push(row.id)
      else confirm.push({ id: row.id, direction })
    })
    if (confirm.length === 0 && dismiss_ids.length === 0) return

    const submittedIds = new Set(rowsToSubmit.map(r => r.id))
    this.setState(prevState => {
      const rowBusy = { ...prevState.rowBusy }
      submittedIds.forEach(id => { rowBusy[id] = true })
      return { rowBusy, submitError: null }
    })

    axiosInstance.patch(store.get('api_url') + '/rotation_review/bulk_action/', { confirm, dismiss_ids })
      .then(response => {
        const { confirmed, dismissed, rejected } = response.data
        const rejectedIds = new Set((rejected || []).map(r => r.id))
        const rowRejectReason = { ...this.state.rowRejectReason }
        ;(rejected || []).forEach(r => { rowRejectReason[r.id] = r.reason })

        this.setState(prevState => {
          const rowBusy = { ...prevState.rowBusy }
          submittedIds.forEach(id => { if (!rejectedIds.has(id)) delete rowBusy[id]; else rowBusy[id] = false })
          return {
            // Resolved (non-rejected) tiles drop out of the grid instantly -
            // no refetch, no re-render of their preview image needed.
            rows: prevState.rows.filter(row => !submittedIds.has(row.id) || rejectedIds.has(row.id)),
            count: Math.max(0, prevState.count - (confirmed + dismissed)),
            rowBusy,
            rowRejectReason,
          }
        })

        if (scrollTopOnSuccess && this.gridWrapperRef.current) this.gridWrapperRef.current.scrollTop = 0
      })
      .catch(error => {
        console.error('Error submitting rotation review action', error)
        this.setState(prevState => {
          const rowBusy = { ...prevState.rowBusy }
          submittedIds.forEach(id => { rowBusy[id] = false })
          return { rowBusy, submitError: "Couldn't submit - try again." }
        })
      })
  }

  // Mirrors gallery.jsx's handleRowAction exactly: acts on everything from
  // the top of the (currently visible) list through the clicked row's last
  // tile, inclusive - not just that row's own tiles.
  handleRowAction(rowEndId) {
    const { rows } = this.state
    const uptoIndex = rows.findIndex(r => r.id === rowEndId)
    if (uptoIndex === -1) return
    this.submitRows(rows.slice(0, uptoIndex + 1), { scrollTopOnSuccess: true })
  }

  // Per-tile fast path, alongside the X reject/dismiss toggle - commits
  // just this one image's currently-staged direction (or dismissal) right
  // now, without waiting on "Confirm row" to sweep everything above it
  // too. Doesn't scroll the grid back to top (unlike a row action) - a
  // single tile dropping out of what's likely the middle of the grid
  // shouldn't yank the reviewer back to the beginning of their scroll.
  handleConfirmSingle(row) {
    this.submitRows([row])
  }

  renderTile(row) {
    const t = this.state.tileState[row.id]
    const busy = !!this.state.rowBusy[row.id]
    const rejectReason = this.state.rowRejectReason[row.id]
    const direction = currentDirection(row, t.visualDeg)
    const adjustmentDeg = t.dismissed ? 0 : t.visualDeg
    // Highlight when a ROTATION is currently selected (deviating from the
    // default original-orientation presumption) - this is the minority
    // "needs action" case worth drawing the eye to now, unlike before this
    // reversal when 'none' was the deliberate, worth-calling-out choice.
    const isCorrectionSelected = !t.dismissed && direction !== 'none'

    return (
      <div className={'rotationReviewTile' + (t.dismissed ? ' rotationReviewTileDismissed' : '') + (busy ? ' rotationReviewTileBusy' : '') + (isCorrectionSelected ? ' rotationReviewTileFlagged' : '')} key={row.id}>
        <div
          className='rotationReviewPreviewWrap'
          onDoubleClick={() => this.handleViewProposed(row)}
          title='Double-click to see the proposed correction'
        >
          <img
            className='rotationReviewPreviewImg'
            src={`${row.preview_url}&height=300`}
            alt={row.filename}
            style={adjustmentDeg ? { transform: `rotate(${adjustmentDeg}deg)` } : undefined}
          />
        </div>

        <div className='rotationReviewChipRow'>
          {/* handleCycleDirection's `forward` argument walks the order
              array (cw -> 180 -> ccw -> none), which is NOT the same as
              "visually clockwise" - confirmed against real images that
              forward=true is what actually looks counter-clockwise on
              screen, so the two buttons below intentionally pass the
              opposite of what their icon/label would suggest. */}
          <button
            className='rotationReviewRotateBtn'
            disabled={t.dismissed || busy}
            title='Rotate further counter-clockwise'
            onClick={() => this.handleCycleDirection(row.id, true)}
          >&#8634;</button>
          <span className={'rotationReviewChip' + (isCorrectionSelected ? ' rotationReviewChipFlagged' : '')}>
            {t.dismissed ? 'Not rotated' : directionLabel(direction)}
          </span>
          <button
            className='rotationReviewRotateBtn'
            disabled={t.dismissed || busy}
            title='Rotate further clockwise'
            onClick={() => this.handleCycleDirection(row.id, false)}
          >&#8635;</button>
        </div>

        <div className='rotationReviewTileFooter'>
          <span className='rotationReviewMeta' title={row.filename}>{row.face_count} face{row.face_count === 1 ? '' : 's'}</span>
          <div className='rotationReviewTileActions'>
            <button
              className='rotationReviewConfirmSingle'
              disabled={busy}
              title='Confirm just this image now'
              onClick={() => this.handleConfirmSingle(row)}
            >
              ✓
            </button>
            <button
              className='rotationReviewDismissToggle'
              disabled={busy}
              title={t.dismissed ? 'Undo - this is rotated after all' : "Not rotated - don't touch this image"}
              onClick={() => this.handleToggleDismissed(row.id)}
            >
              {t.dismissed ? '↺' : '✕'}
            </button>
          </div>
        </div>

        {rejectReason && <div className='rotationReviewRowError'>Rejected: {rejectReason}</div>}
      </div>
    )
  }

  renderGridRow(gridRow, rowIndex) {
    const columnCount = Math.max(1, this.state.columnCount)
    const lastInRow = gridRow[gridRow.length - 1]
    // 1fr, not the fixed --rotation-review-tile-width - tiles stretch to
    // fill the row's actual available width instead of leaving dead space
    // before the pinned row button when the container is wider than
    // columnCount * tileWidth. columnCount itself is still chosen (in
    // handleResize) so each column gets at least tileWidth of room.
    const gridTemplateColumns = `repeat(${columnCount}, 1fr) var(--rotation-review-row-button-width)`
    const anyBusyInRow = gridRow.some(row => this.state.rowBusy[row.id])

    return (
      <div className='rotationReviewGridRow' style={{ gridTemplateColumns }} key={rowIndex}>
        {gridRow.map(row => this.renderTile(row))}
        <button
          className='rowConfirmButton rotationReviewRowButton'
          style={{ gridColumn: columnCount + 1 }}
          disabled={anyBusyInRow}
          onClick={() => this.handleRowAction(lastInRow.id)}
        >
          Confirm row
        </button>
      </div>
    )
  }

  render() {
    if (this.state.loading) return <p>Loading flagged images&hellip;</p>
    if (this.state.loadError) {
      return (
        <div>
          <p className='rotationReviewRowError'>{this.state.loadError}</p>
          <button onClick={this.fetchInitial}>Retry</button>
        </div>
      )
    }

    const { count, rows } = this.state
    const gridRows = this.computeGridRows()

    return (
      <div className='rotationReviewTool'>
        <p className='rotationReviewNote'>
          Images a backend audit flagged as possibly rotated, defaulted to their
          <strong> original orientation</strong> - this signal has a lot of false positives,
          so "Confirm row" with no changes confirms "not rotated" for everything above it.
          Only touch the arrows (which cycle through all four orientations, highlighted
          when a rotation is selected) for the ones that actually look wrong to the eye,
          then hit "Confirm row" to commit that row and everything above it, same as
          confirming a row of unlabeled faces. Double-click a preview to see what the
          backend actually proposed. There's no undo once committed.
        </p>

        <div className='rotationReviewHeadline'>
          <span>{count === 0 ? 'No flagged images' : `${rows.length} loaded of ${count}`}</span>
        </div>

        {this.state.submitError && <p className='rotationReviewRowError'>{this.state.submitError}</p>}

        {rows.length === 0 ? (
          <p>Nothing left to review.</p>
        ) : (
          <div className='rotationReviewGridWrapper' ref={this.gridWrapperRef} onScroll={this.handleScroll}>
            {gridRows.map((gridRow, i) => this.renderGridRow(gridRow, i))}
            {this.state.loadingMore && <p className='rotationReviewLoadingMore'>Loading more&hellip;</p>}
            {this.state.loadMoreError && <p className='rotationReviewRowError'>{this.state.loadMoreError}</p>}
          </div>
        )}
      </div>
    )
  }
}

export default RotationReviewTool
