import React from 'react';
import store from 'store';
import axiosInstance from './axios_setup';
import { withRetry } from './apiRetry';
import '../css/videoFaceExtraction.css';

// Backend: api/video_face_extraction/ (django_picasa) - lists videos
// where VideoFile.face_extraction_failed=True and lets them be re-queued
// via Celery. Fire-and-forget on the backend's end (202) with NO
// progress/status endpoint, and - confirmed from face_manager/tasks.py's
// process_video_faces directly, not assumed - when retried by id, the
// task resets face_extraction_failed=False for every targeted video as
// soon as it starts running, BEFORE processing any of them individually.
// That means a video vanishing from this list only tells us the task
// picked it up (still mid-processing, or genuinely done) - NOT that it
// succeeded; those two look identical here. The one thing this endpoint
// *can* tell us for certain: a video that disappears and later
// reappears has definitely failed again (the task reset it, then set it
// back to True on a new failure) - that transition is what the
// auto-poll below (every POLL_INTERVAL_MS, stopping after
// POLL_MAX_DURATION_MS or once nothing's left to watch, and on unmount)
// actually watches for. Deliberately doesn't claim "succeeded" anywhere -
// that would be overclaiming a signal this endpoint doesn't give.
const POLL_INTERVAL_MS = 20 * 1000;
const POLL_MAX_DURATION_MS = 10 * 60 * 1000;

function formatDuration(seconds) {
  if (seconds == null) return '—'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function formatTimeoutCount(count) {
  if (!count) return null
  if (count >= 5) return 'Gave up after 5 timeouts'
  return `Timed out ${count}x`
}

class VideoFaceExtractionTool extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      rows: [],
      loading: true,
      loadError: null,
      // Per-video-id local UI state, same shape as cameraGpsBackfillTool's
      // rowBusy/rowError - busy while a retry POST for that one row is in
      // flight, queued once it's been successfully queued (waiting on the
      // background poll above to resolve it).
      rowBusy: {},
      rowError: {},
      rowQueued: {},
      // ids queued this session whose outcome hasn't resolved yet (still
      // visible in every poll since being queued - i.e. the task hasn't
      // started on them) - what the poll loop below actually watches.
      pendingIds: new Set(),
      // ids that have disappeared from at least one poll since being
      // queued (task started) but haven't reappeared (yet) - tracked
      // separately from pendingIds so a reappearance can be recognized
      // as "failed again" rather than "never left."
      clearedIds: new Set(),
      // ids that disappeared and then reappeared - a confirmed new
      // failure, rendered with a distinct badge. Cleared for an id the
      // moment it's retried again.
      failedAgainIds: new Set(),
      retryAllBusy: false,
      retryAllError: null,
    }
    this.fetchRows = this.fetchRows.bind(this)
    this.handleRetryOne = this.handleRetryOne.bind(this)
    this.handleRetryAll = this.handleRetryAll.bind(this)
    this.poll = this.poll.bind(this)
  }

  componentDidMount() {
    this.fetchRows()
  }

  componentWillUnmount() {
    clearInterval(this.pollInterval)
    clearTimeout(this.pollStopTimeout)
  }

  startPolling() {
    if (this.pollInterval) return
    this.pollInterval = setInterval(this.poll, POLL_INTERVAL_MS)
    this.pollStopTimeout = setTimeout(() => this.stopPolling(), POLL_MAX_DURATION_MS)
  }

  stopPolling() {
    clearInterval(this.pollInterval)
    clearTimeout(this.pollStopTimeout)
    this.pollInterval = null
  }

  // Background refetch, separate from fetchRows (the user-facing
  // loading-state one) - walks each watched id through the disappear-
  // then-reappear state machine described up top, rather than just
  // blindly replacing state the way a manual "Refresh list" click does.
  poll() {
    axiosInstance.get(store.get('api_url') + '/video_face_extraction/')
      .then(response => {
        const newRows = response.data.results
        const newIds = new Set(newRows.map(r => r.id))
        const pendingIds = new Set()
        const clearedIds = new Set()
        const failedAgainIds = new Set(this.state.failedAgainIds)

        this.state.pendingIds.forEach(id => {
          if (newIds.has(id)) {
            pendingIds.add(id)
          } else {
            clearedIds.add(id)
          }
        })
        this.state.clearedIds.forEach(id => {
          if (newIds.has(id)) {
            // Disappeared, now back - a confirmed new failure, not just
            // "still queued." Stop watching it as pending/cleared; it's
            // a normal row again (retryable) with its failedAgain badge.
            failedAgainIds.add(id)
          } else {
            clearedIds.add(id)
          }
        })

        if (pendingIds.size === 0 && clearedIds.size === 0) this.stopPolling()

        this.setState({
          rows: newRows,
          pendingIds, clearedIds, failedAgainIds,
          rowQueued: {},
        })
      })
      .catch(error => {
        // A transient failure here just means the next poll tries again -
        // not worth surfacing as a user-visible error the way the manual
        // fetchRows below does.
        console.error('Error polling video face extraction list', error)
      })
  }

  fetchRows() {
    this.setState({ loading: true, loadError: null })
    withRetry(() => axiosInstance.get(store.get('api_url') + '/video_face_extraction/'))
      .then(response => {
        this.setState({
          rows: response.data.results,
          loading: false,
          // A manual refresh is a deliberate "show me the truth now" -
          // clears every local marker, including pending/failed-again
          // tracking, same as it already cleared rowBusy/rowError/rowQueued.
          rowBusy: {}, rowError: {}, rowQueued: {},
          pendingIds: new Set(), clearedIds: new Set(), failedAgainIds: new Set(),
          retryAllError: null,
        })
        this.stopPolling()
      })
      .catch(error => {
        console.error('Error fetching video face extraction list', error)
        this.setState({ loading: false, loadError: 'Could not load the failed-video list.' })
      })
  }

  handleRetryOne(id) {
    this.setState(prevState => ({
      rowBusy: { ...prevState.rowBusy, [id]: true },
      rowError: { ...prevState.rowError, [id]: null },
    }))

    axiosInstance.post(store.get('api_url') + '/video_face_extraction/', { video_ids: [id] })
      .then(() => {
        this.setState(prevState => {
          const pendingIds = new Set(prevState.pendingIds)
          pendingIds.add(id)
          const clearedIds = new Set(prevState.clearedIds)
          clearedIds.delete(id)
          const failedAgainIds = new Set(prevState.failedAgainIds)
          failedAgainIds.delete(id)
          return {
            rowBusy: { ...prevState.rowBusy, [id]: false },
            rowQueued: { ...prevState.rowQueued, [id]: true },
            pendingIds, clearedIds, failedAgainIds,
          }
        })
        this.startPolling()
      })
      .catch(error => {
        // 400 here means this id stopped being "currently failed" between
        // the list load and this click (e.g. a scheduled run beat us to
        // it) - per the API contract, the fix is just a fresh GET, not
        // trying to recover the specific id from the error body.
        console.error('Error queuing video face extraction retry', error)
        this.setState(prevState => ({
          rowBusy: { ...prevState.rowBusy, [id]: false },
          rowError: { ...prevState.rowError, [id]: "Couldn't queue a retry - try refreshing the list." },
        }))
      })
  }

  handleRetryAll() {
    this.setState({ retryAllBusy: true, retryAllError: null })

    axiosInstance.post(store.get('api_url') + '/video_face_extraction/', {})
      .then(response => {
        const queuedIds = response.data.video_ids || []
        this.setState(prevState => {
          const rowQueued = { ...prevState.rowQueued }
          const pendingIds = new Set(prevState.pendingIds)
          const clearedIds = new Set(prevState.clearedIds)
          const failedAgainIds = new Set(prevState.failedAgainIds)
          queuedIds.forEach(id => {
            rowQueued[id] = true
            pendingIds.add(id)
            clearedIds.delete(id)
            failedAgainIds.delete(id)
          })
          return { retryAllBusy: false, rowQueued, pendingIds, clearedIds, failedAgainIds }
        })
        if (queuedIds.length > 0) this.startPolling()
      })
      .catch(error => {
        console.error('Error queuing retry-all video face extraction', error)
        this.setState({ retryAllBusy: false, retryAllError: "Couldn't queue retries - try again." })
      })
  }

  renderRow(row) {
    const busy = !!this.state.rowBusy[row.id]
    const queued = !!this.state.rowQueued[row.id]
    const failedAgain = this.state.failedAgainIds.has(row.id)
    const error = this.state.rowError[row.id]
    const timeoutText = formatTimeoutCount(row.face_extraction_timeout_count)

    const rowClass = queued ? 'videoFaceExtractionRowQueued' : failedAgain ? 'videoFaceExtractionRowFailedAgain' : ''

    return (
      <tr key={row.id} className={rowClass}>
        <td className='videoFaceExtractionFilename'>{row.filename}</td>
        <td className='videoFaceExtractionCount'>{formatDuration(row.duration_seconds)}</td>
        <td className='videoFaceExtractionError'>
          {failedAgain && <span className='videoFaceExtractionFailedAgainBadge'>Failed again after retry</span>}
          {row.face_extraction_error || <span className='videoFaceExtractionUnknown'>(no error recorded)</span>}
          {timeoutText && <span className='videoFaceExtractionTimeout'>{timeoutText}</span>}
        </td>
        <td className='videoFaceExtractionActionCell'>
          <button
            disabled={busy || queued}
            onClick={() => this.handleRetryOne(row.id)}
          >
            {queued ? 'Queued' : busy ? 'Queuing…' : 'Retry'}
          </button>
          {error && <div className='videoFaceExtractionRowError'>{error}</div>}
        </td>
      </tr>
    )
  }

  render() {
    if (this.state.loading) return <p>Loading failed videos&hellip;</p>
    if (this.state.loadError) {
      return (
        <div>
          <p className='videoFaceExtractionRowError'>{this.state.loadError}</p>
          <button onClick={this.fetchRows}>Retry</button>
        </div>
      )
    }

    const { rows } = this.state

    return (
      <div className='videoFaceExtractionTool'>
        <div className='videoFaceExtractionHeadline'>
          <span className='videoFaceExtractionCountLabel'>
            {rows.length} video{rows.length === 1 ? '' : 's'} currently failed
          </span>
          <div>
            <button onClick={this.fetchRows}>Refresh list</button>
            <button
              className='videoFaceExtractionRetryAll'
              disabled={this.state.retryAllBusy || rows.length === 0}
              onClick={this.handleRetryAll}
            >
              {this.state.retryAllBusy ? 'Queuing…' : 'Retry all'}
            </button>
          </div>
        </div>
        {this.state.retryAllError && <p className='videoFaceExtractionRowError'>{this.state.retryAllError}</p>}
        {(this.state.pendingIds.size > 0 || this.state.clearedIds.size > 0) && (
          <p className='videoFaceExtractionPollingNote'>
            Watching queued video(s) in the background - a row disappearing means it's
            being worked on (or already fixed); it'll reappear here, marked "Failed again,"
            if it fails a second time.
          </p>
        )}

        {rows.length === 0 ? (
          <p>No videos are currently in a failed state.</p>
        ) : (
          <div className='videoFaceExtractionTableScroll'>
            <table className='videoFaceExtractionTable'>
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Duration</th>
                  <th>Error</th>
                  <th>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => this.renderRow(row))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }
}

export default VideoFaceExtractionTool
