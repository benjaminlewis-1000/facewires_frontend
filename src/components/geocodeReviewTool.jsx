import React from 'react';
import store from 'store';
import axiosInstance from './axios_setup';
import { withRetry } from './apiRetry';
import '../css/geocodeReview.css';

// Backend: api/geocode_views.py (django_picasa). GeocodeCache is keyed
// per-coordinate (~11m rounding), not per place, so "one row per city" is
// something the backend builds by grouping on (locality, country,
// nearest_metro_name) - see that module's own comment for why grouping by
// metro name alone would risk a correction for one place silently
// "fixing" an unrelated, already-correct place that happens to share a
// metro name. A row's identity in this table is that same triple.
function rowKey(row) {
  return `${row.locality}||${row.country}||${row.metro_name}`
}

const SEARCH_DEBOUNCE_MS = 250

class GeocodeReviewTool extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      rows: [],
      metrics: { total: 0, validated: 0 },
      loading: true,
      loadError: null,
      // Per-row (keyed by rowKey) local UI state - the edit box's current
      // text, an in-flight flag, a save error, and the last-fetched
      // type-ahead suggestions (major_places.csv, offline/fast - see
      // handleEditChange). None of this is meaningful until the row's
      // group actually exists in state.rows.
      editText: {},
      rowBusy: {},
      rowError: {},
      suggestions: {},
    }
    this._searchTimers = {}
    this.fetchRows = this.fetchRows.bind(this)
  }

  componentDidMount() {
    this.fetchRows()
  }

  componentWillUnmount() {
    Object.values(this._searchTimers).forEach(t => clearTimeout(t))
  }

  fetchRows() {
    this.setState({ loading: true, loadError: null })
    withRetry(() => axiosInstance.get(store.get('api_url') + '/geocode_review/'))
      .then(response => {
        const editText = {}
        response.data.results.forEach(row => { editText[rowKey(row)] = row.metro_name })
        this.setState({
          rows: response.data.results,
          metrics: response.data.metrics,
          editText,
          loading: false,
        })
      })
      .catch(error => {
        console.error('Error fetching geocode review rows', error)
        this.setState({ loading: false, loadError: 'Could not load the geocode review list.' })
      })
  }

  // Debounced, offline, major_places.csv-backed type-ahead - cheap enough
  // to call on every keystroke (no rate limit, no network). The eventual
  // correction is validated for real server-side regardless of whether
  // the typed text came from picking a suggestion here or was free text
  // (api/geocode_views.py's _resolve_correction) - this is just to help
  // the common case of correcting to another well-known metro.
  handleEditChange(key, value) {
    this.setState(prevState => ({ editText: { ...prevState.editText, [key]: value } }))
    clearTimeout(this._searchTimers[key])
    if (!value || value.trim().length < 2) {
      this.setState(prevState => ({ suggestions: { ...prevState.suggestions, [key]: [] } }))
      return
    }
    this._searchTimers[key] = setTimeout(() => {
      axiosInstance.get(store.get('api_url') + '/geocode_review/search_places/', { params: { q: value } })
        .then(response => {
          this.setState(prevState => ({ suggestions: { ...prevState.suggestions, [key]: response.data.results } }))
        })
        .catch(() => { /* type-ahead is a convenience, not worth surfacing an error banner for */ })
    }, SEARCH_DEBOUNCE_MS)
  }

  // Patches just this one row's fields in place - no refetch of the whole
  // (potentially hundreds-of-rows) list on every Validate/Save click,
  // which would otherwise reset scroll position and every other row's
  // in-progress edit. See the .then() below for how rowKey - built from
  // locality/country/metro_name - gets re-keyed after a correction
  // changes metro_name.
  runAction(row, body) {
    const key = rowKey(row)
    this.setState(prevState => ({
      rowBusy: { ...prevState.rowBusy, [key]: true },
      rowError: { ...prevState.rowError, [key]: null },
    }))
    withRetry(() => axiosInstance.patch(store.get('api_url') + '/geocode_review/action/', {
      locality: row.locality, country: row.country, metro_name: row.metro_name, ...body,
    }))
      .then(response => {
        const patch = body.action === 'validate'
          ? { metro_validated: true }
          : {
            metro_name: response.data.metro_name,
            metro_state: response.data.metro_state,
            metro_distance_km: response.data.metro_distance_km,
            metro_validated: true,
            metro_override: true,
          }
        this.setState(prevState => ({
          rows: prevState.rows.map(r => (rowKey(r) === key ? { ...r, ...patch } : r)),
          rowBusy: { ...prevState.rowBusy, [key]: false },
          // Re-key editText/suggestions onto the row's new identity (a
          // correction changes metro_name, which rowKey is built from) so
          // the input keeps showing the value that was just saved instead
          // of reverting to whatever the old key's entry was.
          editText: { ...prevState.editText, [rowKey({ ...row, ...patch })]: patch.metro_name || row.metro_name },
        }))
      })
      .catch(error => {
        const message = error?.response?.data?.error || 'Something went wrong saving this row.'
        this.setState(prevState => ({
          rowBusy: { ...prevState.rowBusy, [key]: false },
          rowError: { ...prevState.rowError, [key]: message },
        }))
      })
  }

  handleValidate(row) {
    this.runAction(row, { action: 'validate' })
  }

  handleCorrect(row) {
    const key = rowKey(row)
    const correction = (this.state.editText[key] || '').trim()
    if (!correction || correction === row.metro_name) return
    this.runAction(row, { action: 'correct', metro_name_correction: correction })
  }

  renderRow(row) {
    const key = rowKey(row)
    const editValue = this.state.editText[key] ?? row.metro_name
    const busy = !!this.state.rowBusy[key]
    const error = this.state.rowError[key]
    const suggestions = this.state.suggestions[key] || []
    const changed = editValue.trim() !== row.metro_name && editValue.trim().length > 0
    const datalistId = `geocode-suggestions-${key}`

    return (
      <tr key={key} className={row.metro_validated ? 'geocodeRowValidated' : undefined}>
        <td className='geocodePreciseCity'>
          {row.locality || <span className='geocodeUnknownLocality'>(unknown)</span>}
          {row.state ? `, ${row.state}` : ''}
          {row.country ? `, ${row.country}` : ''}
        </td>
        <td>
          <input
            type='text'
            list={datalistId}
            value={editValue}
            disabled={busy}
            onChange={(e) => this.handleEditChange(key, e.target.value)}
          />
          <datalist id={datalistId}>
            {suggestions.map(s => (
              <option key={`${s.name}-${s.country_code}`} value={s.name}>
                {s.state ? `${s.name}, ${s.state}` : `${s.name} (${s.country_code})`}
              </option>
            ))}
          </datalist>
          <span className='geocodeDistance'>
            {row.metro_state ? `${row.metro_state} - ` : ''}
            {row.metro_distance_km != null ? `${Math.round(row.metro_distance_km)} km away` : ''}
          </span>
        </td>
        <td className='geocodeNumImages'>{row.num_images}</td>
        <td className='geocodeActions'>
          {row.metro_validated && !changed
            ? <span className='geocodeValidatedCheck'>&#10003; Validated</span>
            : <button disabled={busy || changed} onClick={() => this.handleValidate(row)}>Validate</button>}
          <button disabled={busy || !changed} onClick={() => this.handleCorrect(row)}>
            Save correction
          </button>
          {error && <div className='geocodeRowError'>{error}</div>}
        </td>
      </tr>
    )
  }

  render() {
    if (this.state.loading) return <p>Loading geocode review data&hellip;</p>
    if (this.state.loadError) {
      return (
        <div>
          <p className='geocodeRowError'>{this.state.loadError}</p>
          <button onClick={this.fetchRows}>Retry</button>
        </div>
      )
    }

    const { rows, metrics } = this.state
    // Filtered rather than sliced at "the first validated row" - once
    // Validate/Save correction patch a row in place instead of
    // refetching the whole (backend-pre-sorted) list, the array is no
    // longer guaranteed to stay validated-last, so the split has to be
    // recomputed from each row's own flag every render rather than
    // assumed from position.
    const knownPending = rows.filter(r => !r.metro_validated && r.locality)
    const unknownPending = rows.filter(r => !r.metro_validated && !r.locality)
    const validated = rows.filter(r => r.metro_validated)

    return (
      <div className='geocodeReviewTool'>
        <div className='geocodeMetrics'>
          {metrics.validated} of {metrics.total} validated
        </div>
        <div className='geocodeTableScroll'>
          <table className='geocodeReviewTable'>
            <thead>
              <tr>
                <th>Precise city</th>
                <th>Metro area</th>
                <th>Photos</th>
                <th>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {knownPending.map(row => this.renderRow(row))}
              {unknownPending.length > 0 && (
                <tr className='geocodeSectionDivider'>
                  <td colSpan={4}>Unknown precise location</td>
                </tr>
              )}
              {unknownPending.map(row => this.renderRow(row))}
              {validated.length > 0 && (
                <tr className='geocodeSectionDivider'>
                  <td colSpan={4}>Validated</td>
                </tr>
              )}
              {validated.map(row => this.renderRow(row))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }
}

export default GeocodeReviewTool
