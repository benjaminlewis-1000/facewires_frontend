import React from 'react';
import store from 'store';
import axiosInstance from './axios_setup';
import { withRetry } from './apiRetry';
import '../css/cameraGpsBackfill.css';

// Backend: api/camera_gps_backfill_views.py (django_picasa). Rows are
// grouped by camera_model alone (not make+model) - the same physical
// device can write different camera_make spellings across firmware/OS
// versions, so splitting on make+model would fragment one device's real
// count across multiple rows. camera_model is the row's identity and
// what gets sent back on toggle.
class CameraGpsBackfillTool extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      rows: [],
      loading: true,
      loadError: null,
      // Per-camera_model local UI state for the toggle - an in-flight
      // flag and a save error, same shape as geocodeReviewTool.jsx's
      // rowBusy/rowError.
      rowBusy: {},
      rowError: {},
    }
    this.fetchRows = this.fetchRows.bind(this)
    this.handleToggle = this.handleToggle.bind(this)
  }

  componentDidMount() {
    this.fetchRows()
  }

  fetchRows() {
    this.setState({ loading: true, loadError: null })
    withRetry(() => axiosInstance.get(store.get('api_url') + '/camera_gps_backfill_config/'))
      .then(response => {
        // Sort client-side by missing_gps descending - the backend's own
        // list is unordered (see the API contract), and this is the order
        // most useful for deciding which camera to prioritize.
        const rows = [...response.data].sort((a, b) => b.missing_gps - a.missing_gps)
        this.setState({ rows, loading: false })
      })
      .catch(error => {
        console.error('Error fetching camera GPS backfill config', error)
        this.setState({ loading: false, loadError: 'Could not load the camera list.' })
      })
  }

  // Optimistic toggle, reverted on failure - mirrors
  // geocodeReviewTool.jsx's runAction pattern, just keyed on camera_model
  // directly instead of a compound key, since that's this contract's own
  // row identity. Not wrapped in withRetry: a toggle is a simple upsert
  // with no internal server-side retry loop to collide with (unlike the
  // geocode tool's live Nominatim call), so a plain single attempt with a
  // clear error on failure is enough.
  handleToggle(cameraModel, nextEnabled) {
    this.setState(prevState => ({
      rows: prevState.rows.map(r => r.camera_model === cameraModel ? { ...r, enabled: nextEnabled } : r),
      rowBusy: { ...prevState.rowBusy, [cameraModel]: true },
      rowError: { ...prevState.rowError, [cameraModel]: null },
    }))

    axiosInstance.post(store.get('api_url') + '/camera_gps_backfill_config/set_enabled/', {
      camera_model: cameraModel, enabled: nextEnabled,
    })
      .then(() => {
        this.setState(prevState => ({
          rowBusy: { ...prevState.rowBusy, [cameraModel]: false },
        }))
      })
      .catch(error => {
        // Error bodies here are an HTML 404 page (render_404), not JSON -
        // per the API contract, any non-200 is just a generic failure,
        // nothing further to parse out of it.
        console.error('Error setting camera GPS backfill enabled state', error)
        this.setState(prevState => ({
          rows: prevState.rows.map(r => r.camera_model === cameraModel ? { ...r, enabled: !nextEnabled } : r),
          rowBusy: { ...prevState.rowBusy, [cameraModel]: false },
          rowError: { ...prevState.rowError, [cameraModel]: "Couldn't update this setting - please try again." },
        }))
      })
  }

  renderRow(row) {
    const busy = !!this.state.rowBusy[row.camera_model]
    const error = this.state.rowError[row.camera_model]

    return (
      <tr key={row.camera_model}>
        <td className='cameraGpsModel'>
          {row.camera_model}
          {row.camera_make_examples && row.camera_make_examples.length > 0 && (
            <span className='cameraGpsMakeExamples'>{row.camera_make_examples.join(', ')}</span>
          )}
        </td>
        <td className='cameraGpsCount'>{row.total}</td>
        <td className='cameraGpsCount'>{row.missing_gps}</td>
        <td className='cameraGpsToggleCell'>
          <label className='cameraGpsToggle'>
            <input
              type='checkbox'
              checked={row.enabled}
              disabled={busy}
              onChange={(e) => this.handleToggle(row.camera_model, e.target.checked)}
            />
            <span>{row.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          {error && <div className='cameraGpsRowError'>{error}</div>}
        </td>
      </tr>
    )
  }

  render() {
    if (this.state.loading) return <p>Loading camera list&hellip;</p>
    if (this.state.loadError) {
      return (
        <div>
          <p className='cameraGpsRowError'>{this.state.loadError}</p>
          <button onClick={this.fetchRows}>Retry</button>
        </div>
      )
    }

    return (
      <div className='cameraGpsBackfillTool'>
        <p className='cameraGpsNote'>
          Turning a camera on doesn't guarantee its photos will get a location - it only
          lets a background job attempt them. Whether any given photo actually matches
          depends on what that photo's file recorded and whether location history covers
          that date.
        </p>
        <p className='cameraGpsWarning'>
          Only enable a camera that has always been your own device - enabling one that
          was ever someone else's will misattribute their photos to your location.
        </p>
        <div className='cameraGpsTableScroll'>
          <table className='cameraGpsTable'>
            <thead>
              <tr>
                <th>Camera</th>
                <th>Photos</th>
                <th>Missing GPS</th>
                <th>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {this.state.rows.map(row => this.renderRow(row))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }
}

export default CameraGpsBackfillTool
