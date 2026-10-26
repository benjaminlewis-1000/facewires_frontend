import React from 'react';
import store from 'store';
import axiosInstance from './axios_setup';
import { withRetry } from './apiRetry';
import '../css/classificationSettings.css';

// Backend: api/views.py's WindowedClassificationConfigViewSet (Person,
// pre-existing) and PhotoCollectionConfigViewSet (new, 2026-10-26) -
// django_picasa, both registered under /api/. Two independent settings,
// shown as two sections on one page rather than one combined table,
// since they're scoped at different levels (person vs. collection) and
// have no shared row identity.
function clampFloorInput(raw) {
  // '' means "clear the floor" (-> null). Anything else must parse as a
  // number in [0, 1] - the backend enforces this too, but failing fast
  // client-side avoids a round-trip for an obviously bad value.
  const trimmed = raw.trim()
  if (trimmed === '') return { value: null, valid: true }
  const parsed = Number(trimmed)
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) return { value: null, valid: false }
  return { value: parsed, valid: true }
}

// Generic comparator shared by both tables below - booleans sort
// false-then-true, strings use localeCompare, numbers sort numerically.
function compareRows(a, b, key) {
  const av = a[key]
  const bv = b[key]
  if (typeof av === 'boolean') return (av ? 1 : 0) - (bv ? 1 : 0)
  if (typeof av === 'string') return av.localeCompare(bv)
  return av - bv
}

// Rows with no value for the sorted key (a floor left blank/"no
// restriction") are kept at the bottom regardless of direction - null
// isn't meaningfully less-or-greater than a real value, so it
// shouldn't jump to the top just because the sort was reversed.
function sortRows(rows, sortState) {
  if (!sortState.key) return rows
  const key = sortState.key
  const withValue = rows.filter(r => r[key] != null).sort((a, b) => compareRows(a, b, key))
  const withoutValue = rows.filter(r => r[key] == null)
  if (sortState.dir === 'desc') withValue.reverse()
  return [...withValue, ...withoutValue]
}

class ClassificationSettingsTool extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      peopleRows: [],
      peopleLoading: true,
      peopleLoadError: null,
      peopleRowBusy: {},
      peopleRowError: {},
      // Locally-edited window_days text per person_id, so typing doesn't
      // fight the row's own stored value until the field is committed
      // (blur) - same reasoning as the geocode/camera tools' rowBusy
      // pattern, just for a text input instead of a toggle.
      windowDaysInput: {},

      collectionRows: [],
      collectionsLoading: true,
      collectionsLoadError: null,
      collectionRowBusy: {},
      collectionRowError: {},
      detScoreInput: {},
      relSizeInput: {},

      // No default sort (key: null) - rows are shown in whatever order
      // the backend returned them until a column header is clicked.
      peopleSort: { key: null, dir: 'asc' },
      collectionSort: { key: null, dir: 'asc' },
    }
    this.fetchPeopleRows = this.fetchPeopleRows.bind(this)
    this.fetchCollectionRows = this.fetchCollectionRows.bind(this)
    this.handleToggleWindowed = this.handleToggleWindowed.bind(this)
    this.handleWindowDaysBlur = this.handleWindowDaysBlur.bind(this)
    this.handleFloorBlur = this.handleFloorBlur.bind(this)
    this.handleSort = this.handleSort.bind(this)
  }

  // Clicking the same column again flips direction; clicking a
  // different column starts it fresh at ascending.
  handleSort(section, key) {
    const stateKey = section === 'people' ? 'peopleSort' : 'collectionSort'
    this.setState(prevState => {
      const prev = prevState[stateKey]
      const dir = prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc'
      return { [stateKey]: { key, dir } }
    })
  }

  renderSortHeader(label, key, section, title) {
    const sortState = section === 'people' ? this.state.peopleSort : this.state.collectionSort
    const active = sortState.key === key
    const arrow = active ? (sortState.dir === 'asc' ? ' ▲' : ' ▼') : ''
    return (
      <th
        className='classificationSettingsSortableHeader'
        title={title}
        onClick={() => this.handleSort(section, key)}
      >
        {label}
        {title && <span className='classificationSettingsHelpIcon'>&#10067;</span>}
        {arrow}
      </th>
    )
  }

  componentDidMount() {
    this.fetchPeopleRows()
    this.fetchCollectionRows()
  }

  fetchPeopleRows() {
    this.setState({ peopleLoading: true, peopleLoadError: null })
    withRetry(() => axiosInstance.get(store.get('api_url') + '/windowed_classification_config/'))
      .then(response => {
        const windowDaysInput = {}
        response.data.forEach(row => { windowDaysInput[row.person_id] = String(row.classification_window_days) })
        this.setState({
          peopleRows: response.data,
          peopleLoading: false,
          windowDaysInput,
          peopleRowBusy: {}, peopleRowError: {},
        })
      })
      .catch(error => {
        console.error('Error fetching windowed classification config', error)
        this.setState({ peopleLoading: false, peopleLoadError: 'Could not load the people list.' })
      })
  }

  fetchCollectionRows() {
    this.setState({ collectionsLoading: true, collectionsLoadError: null })
    withRetry(() => axiosInstance.get(store.get('api_url') + '/photo_collection_config/'))
      .then(response => {
        const detScoreInput = {}
        const relSizeInput = {}
        response.data.forEach(row => {
          detScoreInput[row.collection_id] = row.min_face_det_score == null ? '' : String(row.min_face_det_score)
          relSizeInput[row.collection_id] = row.min_face_relative_size == null ? '' : String(row.min_face_relative_size)
        })
        this.setState({
          collectionRows: response.data,
          collectionsLoading: false,
          detScoreInput, relSizeInput,
          collectionRowBusy: {}, collectionRowError: {},
        })
      })
      .catch(error => {
        console.error('Error fetching photo collection config', error)
        this.setState({ collectionsLoading: false, collectionsLoadError: 'Could not load the collection list.' })
      })
  }

  // Optimistic toggle, reverted on failure. window_days is omitted from
  // the body - per the API contract, toggling on/off never needs to
  // re-specify it.
  handleToggleWindowed(personId, nextEnabled) {
    this.setState(prevState => ({
      peopleRows: prevState.peopleRows.map(r => r.person_id === personId ? { ...r, use_windowed_classification: nextEnabled } : r),
      peopleRowBusy: { ...prevState.peopleRowBusy, [personId]: true },
      peopleRowError: { ...prevState.peopleRowError, [personId]: null },
    }))

    axiosInstance.post(store.get('api_url') + '/windowed_classification_config/set_windowed/', {
      person_id: personId, enabled: nextEnabled,
    })
      .then(() => {
        this.setState(prevState => ({
          peopleRowBusy: { ...prevState.peopleRowBusy, [personId]: false },
        }))
      })
      .catch(error => {
        console.error('Error setting windowed classification', error)
        this.setState(prevState => ({
          peopleRows: prevState.peopleRows.map(r => r.person_id === personId ? { ...r, use_windowed_classification: !nextEnabled } : r),
          peopleRowBusy: { ...prevState.peopleRowBusy, [personId]: false },
          peopleRowError: { ...prevState.peopleRowError, [personId]: "Couldn't update this setting - please try again." },
        }))
      })
  }

  handleWindowDaysBlur(personId) {
    const row = this.state.peopleRows.find(r => r.person_id === personId)
    if (!row) return
    const raw = this.state.windowDaysInput[personId].trim()
    const parsed = Number(raw)
    if (raw === '' || Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      // Invalid - revert the text box to the last known-good value
      // rather than sending a request the backend would 404 anyway.
      this.setState(prevState => ({
        windowDaysInput: { ...prevState.windowDaysInput, [personId]: String(row.classification_window_days) },
        peopleRowError: { ...prevState.peopleRowError, [personId]: 'Window must be a whole number of days greater than 0.' },
      }))
      return
    }
    if (parsed === row.classification_window_days) return

    this.setState(prevState => ({
      peopleRowBusy: { ...prevState.peopleRowBusy, [personId]: true },
      peopleRowError: { ...prevState.peopleRowError, [personId]: null },
    }))

    // enabled must always be sent per the API contract - reuse the row's
    // current toggle state unchanged.
    axiosInstance.post(store.get('api_url') + '/windowed_classification_config/set_windowed/', {
      person_id: personId, enabled: row.use_windowed_classification, window_days: parsed,
    })
      .then(response => {
        this.setState(prevState => ({
          peopleRows: prevState.peopleRows.map(r => r.person_id === personId
            ? { ...r, classification_window_days: response.data.classification_window_days }
            : r),
          peopleRowBusy: { ...prevState.peopleRowBusy, [personId]: false },
        }))
      })
      .catch(error => {
        console.error('Error setting classification window', error)
        this.setState(prevState => ({
          windowDaysInput: { ...prevState.windowDaysInput, [personId]: String(row.classification_window_days) },
          peopleRowBusy: { ...prevState.peopleRowBusy, [personId]: false },
          peopleRowError: { ...prevState.peopleRowError, [personId]: "Couldn't update this setting - please try again." },
        }))
      })
  }

  handleFloorBlur(collectionId, field) {
    const row = this.state.collectionRows.find(r => r.collection_id === collectionId)
    if (!row) return
    const inputKey = field === 'min_face_det_score' ? 'detScoreInput' : 'relSizeInput'
    const raw = this.state[inputKey][collectionId]
    const { value, valid } = clampFloorInput(raw)
    if (!valid) {
      this.setState(prevState => ({
        [inputKey]: { ...prevState[inputKey], [collectionId]: row[field] == null ? '' : String(row[field]) },
        collectionRowError: { ...prevState.collectionRowError, [collectionId]: 'Must be blank or a number between 0 and 1.' },
      }))
      return
    }
    if (value === row[field]) return

    this.setState(prevState => ({
      collectionRowBusy: { ...prevState.collectionRowBusy, [collectionId]: true },
      collectionRowError: { ...prevState.collectionRowError, [collectionId]: null },
    }))

    // Only the one changed field is sent - the other floor key is left
    // out entirely rather than re-sent, per the API contract ("either
    // floor key optional"), so a blur on one field can never clobber the
    // other with a stale value.
    axiosInstance.post(store.get('api_url') + '/photo_collection_config/set_floors/', {
      collection_id: collectionId, [field]: value,
    })
      .then(response => {
        this.setState(prevState => ({
          collectionRows: prevState.collectionRows.map(r => r.collection_id === collectionId
            ? { ...r, [field]: response.data[field] }
            : r),
          collectionRowBusy: { ...prevState.collectionRowBusy, [collectionId]: false },
        }))
      })
      .catch(error => {
        console.error('Error setting collection face-detection floor', error)
        this.setState(prevState => ({
          [inputKey]: { ...prevState[inputKey], [collectionId]: row[field] == null ? '' : String(row[field]) },
          collectionRowBusy: { ...prevState.collectionRowBusy, [collectionId]: false },
          collectionRowError: { ...prevState.collectionRowError, [collectionId]: "Couldn't update this setting - please try again." },
        }))
      })
  }

  renderPeopleRow(row) {
    const busy = !!this.state.peopleRowBusy[row.person_id]
    const error = this.state.peopleRowError[row.person_id]

    return (
      <tr key={row.person_id}>
        <td className='classificationSettingsName'>{row.person_name}</td>
        <td className='classificationSettingsCount'>{row.confirmed_count}</td>
        <td className='classificationSettingsToggleCell'>
          <label className='classificationSettingsToggle'>
            <input
              type='checkbox'
              checked={row.use_windowed_classification}
              disabled={busy}
              onChange={(e) => this.handleToggleWindowed(row.person_id, e.target.checked)}
            />
            <span>{row.use_windowed_classification ? 'Enabled' : 'Disabled'}</span>
          </label>
        </td>
        <td className='classificationSettingsNumberCell'>
          <input
            type='number'
            min='1'
            step='1'
            className='classificationSettingsNumberInput'
            disabled={busy || !row.use_windowed_classification}
            title={row.use_windowed_classification ? undefined : 'Enable windowed classification to edit this.'}
            value={this.state.windowDaysInput[row.person_id]}
            onChange={(e) => this.setState(prevState => ({
              windowDaysInput: { ...prevState.windowDaysInput, [row.person_id]: e.target.value },
            }))}
            onBlur={() => this.handleWindowDaysBlur(row.person_id)}
          />
          {' '}days
          {error && <div className='classificationSettingsRowError'>{error}</div>}
        </td>
      </tr>
    )
  }

  renderCollectionRow(row) {
    const busy = !!this.state.collectionRowBusy[row.collection_id]
    const error = this.state.collectionRowError[row.collection_id]

    return (
      <tr key={row.collection_id}>
        <td className='classificationSettingsName'>
          {row.name}
          {row.is_default && <span className='classificationSettingsDefaultBadge'>Default</span>}
          <span className='classificationSettingsRootDir'>{row.root_directory}</span>
        </td>
        <td className='classificationSettingsNumberCell'>
          <input
            type='number'
            min='0'
            max='1'
            step='0.01'
            placeholder='none'
            className='classificationSettingsNumberInput'
            disabled={busy}
            value={this.state.detScoreInput[row.collection_id]}
            onChange={(e) => this.setState(prevState => ({
              detScoreInput: { ...prevState.detScoreInput, [row.collection_id]: e.target.value },
            }))}
            onBlur={() => this.handleFloorBlur(row.collection_id, 'min_face_det_score')}
          />
        </td>
        <td className='classificationSettingsNumberCell'>
          <input
            type='number'
            min='0'
            max='1'
            step='0.01'
            placeholder='none'
            className='classificationSettingsNumberInput'
            disabled={busy}
            value={this.state.relSizeInput[row.collection_id]}
            onChange={(e) => this.setState(prevState => ({
              relSizeInput: { ...prevState.relSizeInput, [row.collection_id]: e.target.value },
            }))}
            onBlur={() => this.handleFloorBlur(row.collection_id, 'min_face_relative_size')}
          />
          {error && <div className='classificationSettingsRowError'>{error}</div>}
        </td>
      </tr>
    )
  }

  renderPeopleSection() {
    if (this.state.peopleLoading) return <p>Loading people&hellip;</p>
    if (this.state.peopleLoadError) {
      return (
        <div>
          <p className='classificationSettingsRowError'>{this.state.peopleLoadError}</p>
          <button onClick={this.fetchPeopleRows}>Retry</button>
        </div>
      )
    }
    const rows = sortRows(this.state.peopleRows, this.state.peopleSort)
    return (
      <div className='classificationSettingsTableScroll'>
        <table className='classificationSettingsTable'>
          <thead>
            <tr>
              {this.renderSortHeader('Person', 'person_name', 'people')}
              {this.renderSortHeader('Confirmed faces', 'confirmed_count', 'people')}
              {this.renderSortHeader('Windowed classification', 'use_windowed_classification', 'people')}
              {this.renderSortHeader('Window', 'classification_window_days', 'people')}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => this.renderPeopleRow(row))}
          </tbody>
        </table>
      </div>
    )
  }

  renderCollectionsSection() {
    if (this.state.collectionsLoading) return <p>Loading collections&hellip;</p>
    if (this.state.collectionsLoadError) {
      return (
        <div>
          <p className='classificationSettingsRowError'>{this.state.collectionsLoadError}</p>
          <button onClick={this.fetchCollectionRows}>Retry</button>
        </div>
      )
    }
    const rows = sortRows(this.state.collectionRows, this.state.collectionSort)
    return (
      <div className='classificationSettingsTableScroll'>
        <table className='classificationSettingsTable'>
          <thead>
            <tr>
              {this.renderSortHeader('Collection', 'name', 'collection')}
              {this.renderSortHeader(
                'Min detection score', 'min_face_det_score', 'collection',
                "The model's confidence that a detected face is actually a face (0-1) - a face below this is discarded before it's ever considered for classification."
              )}
              {this.renderSortHeader(
                'Min relative size', 'min_face_relative_size', 'collection',
                'The minimum size of a detected face as a fraction of the full image (0-1) - filters out faces too small/distant to classify reliably.'
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => this.renderCollectionRow(row))}
          </tbody>
        </table>
      </div>
    )
  }

  render() {
    return (
      <div className='classificationSettingsTool'>
        <div className='classificationSettingsSectionHeadline'>
          <span>Windowed classification</span>
          <button onClick={this.fetchPeopleRows}>Refresh</button>
        </div>
        <p className='classificationSettingsNote'>
          Only people with at least 50 confirmed faces (or already enabled) are listed.
          Turning this on limits automatic classification to recent photos within the
          window below, instead of someone's entire history.
        </p>
        {this.renderPeopleSection()}

        <div className='classificationSettingsSectionHeadline classificationSettingsSecondSection'>
          <span>Face-detection floors</span>
          <button onClick={this.fetchCollectionRows}>Refresh</button>
        </div>
        <p className='classificationSettingsNote'>
          Leave a field blank for no restriction. Both values are a fraction between 0 and 1.
        </p>
        {this.renderCollectionsSection()}
      </div>
    )
  }
}

export default ClassificationSettingsTool
