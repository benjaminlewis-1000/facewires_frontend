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
// a per-card submit: every tile defaults to "pending confirm" at its
// snapped direction; a tile can be marked "not rotated" (dismiss) or have
// its direction adjusted - both purely local, no network call - and the
// pinned per-row button commits everything from the top of the current
// list through that row in one PATCH, same "this row and everything above
// it" semantics as Confirm row/Verify row there. There's no undo endpoint,
// so committing is final.
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

function directionToAngle(direction) {
  return direction === 'cw' ? 90 : direction === 'ccw' ? 270 : 180
}

// Rotations compose: the preview already shows the image rotated by
// snapToDirection(proposed_rotation_degrees). If the reviewer picks a
// different final direction, applying the DIFFERENCE between the two as an
// extra CSS transform on top of that same preview gives an accurate live
// look at the alternate result instantly - no second backend render, no
// image refetch.
function previewAdjustmentDegrees(row, direction) {
  const defaultAngle = directionToAngle(snapToDirection(row.proposed_rotation_degrees))
  return directionToAngle(direction) - defaultAngle
}

function directionLabel(direction) {
  return direction === 'cw' ? 'Clockwise' : direction === 'ccw' ? 'Counter-clockwise' : '180°'
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
    this.handleRowAction = this.handleRowAction.bind(this)
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
          tileState[row.id] = { dismissed: false, direction: snapToDirection(row.proposed_rotation_degrees) }
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
            tileState[row.id] = { dismissed: false, direction: snapToDirection(row.proposed_rotation_degrees) }
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

  // Cycles cw -> 180 -> ccw -> cw (or the reverse) - purely local, no
  // backend round-trip, per the API contract's own example flow.
  handleCycleDirection(id, forward) {
    const order = ['cw', '180', 'ccw']
    this.setState(prevState => {
      const current = prevState.tileState[id]
      const idx = order.indexOf(current.direction)
      const nextIdx = forward ? (idx + 1) % order.length : (idx - 1 + order.length) % order.length
      return {
        tileState: { ...prevState.tileState, [id]: { ...current, direction: order[nextIdx] } },
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

  // Mirrors gallery.jsx's handleRowAction exactly: acts on everything from
  // the top of the (currently visible) list through the clicked row's last
  // tile, inclusive - not just that row's own tiles.
  handleRowAction(rowEndId) {
    const { rows, tileState } = this.state
    const uptoIndex = rows.findIndex(r => r.id === rowEndId)
    if (uptoIndex === -1) return

    const swept = rows.slice(0, uptoIndex + 1)
    const confirm = []
    const dismiss_ids = []
    swept.forEach(row => {
      const t = tileState[row.id]
      if (t.dismissed) dismiss_ids.push(row.id)
      else confirm.push({ id: row.id, direction: t.direction })
    })
    if (confirm.length === 0 && dismiss_ids.length === 0) return

    const sweptIds = new Set(swept.map(r => r.id))
    this.setState(prevState => {
      const rowBusy = { ...prevState.rowBusy }
      sweptIds.forEach(id => { rowBusy[id] = true })
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
          sweptIds.forEach(id => { if (!rejectedIds.has(id)) delete rowBusy[id]; else rowBusy[id] = false })
          return {
            // Resolved (non-rejected) tiles drop out of the grid instantly -
            // no refetch, no re-render of their preview image needed.
            rows: prevState.rows.filter(row => !sweptIds.has(row.id) || rejectedIds.has(row.id)),
            count: Math.max(0, prevState.count - (confirmed + dismissed)),
            rowBusy,
            rowRejectReason,
          }
        })

        if (this.gridWrapperRef.current) this.gridWrapperRef.current.scrollTop = 0
      })
      .catch(error => {
        console.error('Error submitting rotation review row action', error)
        this.setState(prevState => {
          const rowBusy = { ...prevState.rowBusy }
          sweptIds.forEach(id => { rowBusy[id] = false })
          return { rowBusy, submitError: "Couldn't submit that row - try again." }
        })
      })
  }

  renderTile(row) {
    const t = this.state.tileState[row.id]
    const busy = !!this.state.rowBusy[row.id]
    const rejectReason = this.state.rowRejectReason[row.id]
    const adjustmentDeg = t.dismissed ? 0 : previewAdjustmentDegrees(row, t.direction)

    return (
      <div className={'rotationReviewTile' + (t.dismissed ? ' rotationReviewTileDismissed' : '') + (busy ? ' rotationReviewTileBusy' : '')} key={row.id}>
        <div className='rotationReviewPreviewWrap'>
          <img
            className='rotationReviewPreviewImg'
            src={`${row.preview_url}&height=300`}
            alt={row.filename}
            style={adjustmentDeg ? { transform: `rotate(${adjustmentDeg}deg)` } : undefined}
          />
        </div>

        <div className='rotationReviewChipRow'>
          <button
            className='rotationReviewRotateBtn'
            disabled={t.dismissed || busy}
            title='Rotate further counter-clockwise'
            onClick={() => this.handleCycleDirection(row.id, false)}
          >&#8634;</button>
          <span className='rotationReviewChip'>{t.dismissed ? 'Not rotated' : directionLabel(t.direction)}</span>
          <button
            className='rotationReviewRotateBtn'
            disabled={t.dismissed || busy}
            title='Rotate further clockwise'
            onClick={() => this.handleCycleDirection(row.id, true)}
          >&#8635;</button>
        </div>

        <div className='rotationReviewTileFooter'>
          <span className='rotationReviewMeta' title={row.filename}>{row.face_count} face{row.face_count === 1 ? '' : 's'}</span>
          <button
            className='rotationReviewDismissToggle'
            disabled={busy}
            title={t.dismissed ? 'Undo - this is rotated after all' : "Not rotated - don't touch this image"}
            onClick={() => this.handleToggleDismissed(row.id)}
          >
            {t.dismissed ? '↺' : '✕'}
          </button>
        </div>

        {rejectReason && <div className='rotationReviewRowError'>Rejected: {rejectReason}</div>}
      </div>
    )
  }

  renderGridRow(gridRow, rowIndex) {
    const columnCount = Math.max(1, this.state.columnCount)
    const lastInRow = gridRow[gridRow.length - 1]
    const gridTemplateColumns = `repeat(${columnCount}, var(--rotation-review-tile-width)) var(--rotation-review-row-button-width)`
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
          Images a backend audit flagged as possibly rotated, defaulted to the proposed
          correction - adjust the direction with the arrows or mark &#x2715; if an image
          isn't actually rotated, then hit "Confirm row" to commit that row and everything
          above it, same as confirming a row of unlabeled faces. There's no undo once
          committed.
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
