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

  runAction(row, body) {
    const key = rowKey(row)
    this.setState(prevState => ({
      rowBusy: { ...prevState.rowBusy, [key]: true },
      rowError: { ...prevState.rowError, [key]: null },
    }))
    withRetry(() => axiosInstance.patch(store.get('api_url') + '/geocode_review/action/', {
      locality: row.locality, country: row.country, metro_name: row.metro_name, ...body,
    }))
      .then(() => this.fetchRows())
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
            {suggestions.map(s => <option key={s.name} value={s.name}>{`${s.name} (${s.country_code})`}</option>)}
          </datalist>
          {row.metro_distance_km != null &&
            <span className='geocodeDistance'>{Math.round(row.metro_distance_km)} km away</span>}
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
    const firstValidatedIndex = rows.findIndex(r => r.metro_validated)
    const pending = firstValidatedIndex === -1 ? rows : rows.slice(0, firstValidatedIndex)
    const validated = firstValidatedIndex === -1 ? [] : rows.slice(firstValidatedIndex)

    return (
      <div className='geocodeReviewTool'>
        <div className='geocodeMetrics'>
          {metrics.validated} of {metrics.total} validated
        </div>
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
            {pending.map(row => this.renderRow(row))}
            {validated.length > 0 && (
              <tr className='geocodeValidatedDivider'>
                <td colSpan={4}>Validated</td>
              </tr>
            )}
            {validated.map(row => this.renderRow(row))}
          </tbody>
        </table>
      </div>
    )
  }
}

export default GeocodeReviewTool
