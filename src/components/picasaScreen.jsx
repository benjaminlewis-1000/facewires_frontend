import React from 'react';
import './misc.css';
import '../css/menubar.css'
import '../css/sidebar.css'
import '../css/image_tile.css'
import '../css/login.css'
import '../css/imageModal.css'
import store from 'store';
import { Helmet } from 'react-helmet';
import { Redirect } from 'react-router-dom';

import MenuExampleTabular from './tabular_menu'
import { mapWithConcurrency } from './concurrencyPool';
import FolderSidebar from './folderSidebar'
import PersonSidebar from './personSidebar'
import ImageScreen from './imageScreen'
import ToolsScreen from './toolsScreen'
import axiosInstance from './axios_setup'
import { isAuthFailure } from './authRedirect';
import { withRetry } from './apiRetry';
import { assignFaceToPerson, bulkFaceOperation } from './faceActions';
import {
  sha256Hex, isVideoFile, hasAcceptedExtension, uploadSingleShot, initChunkedUpload,
  uploadChunk, getChunkedStatus, completeChunkedUpload,
} from './uploadActions';
import {
  listWatchedAlbums, createWatchedAlbum, deleteWatchedAlbum,
  initPickerSession, pollPickerSession, completeSession,
} from './googlePhotosActions';
import { Message } from 'semantic-ui-react';
import CircleLoader from "react-spinners/CircleLoader";

// Cap how many pagination requests are in flight at once. 5 is a
// reasonable default — enough to get the concurrency win, low enough
// to not hammer the backend even if the dataset grows a lot.
const PAGINATION_CONCURRENCY = 5;

// Chunk uploads run in parallel (the backend explicitly allows this -
// each index writes its own file, no cross-chunk locking) - same
// concurrency-pool helper and similar cap as pagination above.
const UPLOAD_CHUNK_CONCURRENCY = 4;

// Per-chunk retry budget on any failure (matches the upload spec's own
// reference implementation) - deliberately not this app's withRetry
// helper, which skips 4xx: a chunk checksum mismatch here is worth
// retrying (could be genuine transit corruption, not a deterministic
// client bug), same as any other transient failure.
const UPLOAD_CHUNK_MAX_ATTEMPTS = 5;

// How many undo/redo entries to keep. Bookkeeping is light (each entry is
// just a handful of ids/numbers) so 20 is generous rather than tight.
const MAX_UNDO_HISTORY = 20;

// Undoing/redoing an action that touches more than this many faces asks
// for confirmation first - a misclick both doing and then undoing
// something this size is exactly the case worth a pause for, since every
// reversal here is a real write against the live backend.
const BULK_CONFIRM_THRESHOLD = 10;

// How often startPhotoSync polls the backend (which itself proxies
// Google's sessions.get) while waiting for the user to finish picking
// items in the Google Photos tab it opened - see that method below.
const PHOTO_SYNC_POLL_INTERVAL_MS = 3000;

// Every numeric people-count field a delta can touch - see
// updatePersonCounts and negateDeltas below.
const COUNT_FIELDS = ['num_faces', 'num_possibilities', 'num_possibilities_video', 'num_possibilities_image', 'num_unverified_faces'];

// Undo applies the exact inverse of whatever deltas an action originally
// applied; redo re-applies them as-is. Keeping this as a pure negation
// (rather than recomputing deltas from current state at undo/redo time)
// is what lets undo/redo work regardless of whether the Gallery instance
// that originally fired the action is even still mounted.
function negateDeltas(deltas){
  return deltas.map(delta => {
    const negated = { id: delta.id }
    for (const field of COUNT_FIELDS){
      if (delta[field]) negated[field] = -delta[field]
    }
    return negated
  })
}

// Owns the text input's own keystroke-by-keystroke state locally.
// PicasaScreen sits above the (large, ~700+ entry) sidebar list, so if
// the input's value lived in PicasaScreen's state instead, every
// keystroke would re-render that whole sidebar along with it - kept
// this isolated so typing only re-renders this small subtree.
class RenameModal extends React.Component {
  constructor(props){
    super(props);
    this.state = { value: props.initialValue };
    this.handleChange = this.handleChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleConfirm = this.handleConfirm.bind(this);
  }

  handleChange(e){
    this.setState({ value: e.target.value });
  }

  handleConfirm(){
    this.props.onSubmit(this.state.value);
  }

  handleKeyDown(e){
    if (e.key === 'Enter') this.handleConfirm();
    if (e.key === 'Escape') this.props.onCancel();
  }

  render(){
    return (
      <div className='Overlay RenameOverlay' onClick={this.props.onCancel}>
        <div className='renameModal' onClick={(e) => e.stopPropagation()}>
          <h3>Rename person</h3>
          <input
            type="text"
            autoFocus
            value={this.state.value}
            onChange={this.handleChange}
            onKeyDown={this.handleKeyDown}
          />
          {this.props.error && (
            <div className='renameModalError'>{this.props.error}</div>
          )}
          <div className='renameModalActions'>
            <button className='renameCancelBtn' onClick={this.props.onCancel}>
              Cancel
            </button>
            <button
              className='renameConfirmBtn'
              disabled={this.props.submitting}
              onClick={this.handleConfirm}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }
}

// Same "own its keystroke state locally" reasoning as RenameModal above.
// Reuses the .item/.item:hover styling from image_tile.css (already
// imported by this file) that mutableSelect.jsx's person-search dropdown
// uses, for a consistent look, though this is a plain always-open list
// in a modal rather than an absolutely-positioned dropdown - no
// flip/positioning logic needed here.
class MergeModal extends React.Component {
  constructor(props){
    super(props);
    this.state = { filterValue: '' };
    this.handleChange = this.handleChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  handleChange(e){
    this.setState({ filterValue: e.target.value });
  }

  handleKeyDown(e){
    if (e.key === 'Escape') this.props.onCancel();
  }

  render(){
    // Escape regex special characters so a stray "(" etc. in the search
    // box can't throw a SyntaxError out of `new RegExp` and crash the
    // modal - mutableSelect.jsx's equivalent filter doesn't bother with
    // this, but there's no reason not to be safe here.
    const escaped = this.state.filterValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'gi');
    const options = this.props.people
      .filter(p => p.id !== this.props.sourceId && p.id !== this.props.unassignedId && p.id !== this.props.ignorePersonId)
      .filter(p => p.person_name.match(re));

    return (
      <div className='Overlay RenameOverlay' onClick={this.props.onCancel}>
        <div className='renameModal' onClick={(e) => e.stopPropagation()}>
          <h3>Merge "{this.props.sourceName}" into...</h3>
          {this.props.submitting ? (
            <div>
              Merging {this.props.progress.total > 0 ? `${this.props.progress.done} of ${this.props.progress.total}` : '...'}
            </div>
          ) : (
            <>
              <input
                type="text"
                autoFocus
                placeholder="Search people..."
                value={this.state.filterValue}
                onChange={this.handleChange}
                onKeyDown={this.handleKeyDown}
              />
              <div className='mergeModalList'>
                {options.map(p => (
                  <div
                    key={p.id}
                    className='item'
                    onClick={() => this.props.onSubmit(p.id, p.person_name)}
                  >
                    {p.person_name}
                  </div>
                ))}
              </div>
            </>
          )}
          {this.props.error && (
            <div className='renameModalError'>{this.props.error}</div>
          )}
          <div className='renameModalActions'>
            <button className='renameCancelBtn' disabled={this.props.submitting} onClick={this.props.onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }
}

class PicasaScreen extends React.Component{
  
  constructor(props) {
    super(props);

    this.state = {
      people : [], 
      folders: [],
      // people_url: store.get('api_url') + '/people/?fields=person_name,url,num_faces,id,num_possibilities&limit=1000',
      people_url: store.get('api_url') + '/person_list/',
      dir_url: store.get('api_url') + '/folder_list/',
      param_url: store.get('api_url') + '/parameters/',
      loading: true,
      // Set (to a short user-facing message) if the initial params/people/
      // folder fetches fail outright, or if the people list comes back
      // empty - both used to leave `loading` stuck true forever (an
      // unhandled rejection, or a hang inside fetchAPIURL) instead of
      // surfacing anything. See render() below.
      loadError: '',
      names_fetched: false,
      dirs_fetched: false,
      params_fetched: false,
      tab: 'People',
      unlabeled_toggle: false,
      only_unverified_toggle: false,
      face: false,
      total: false,
      t2: false,
      api_id: 0,
      selectedIndex: -100,
      // True only while the sidebar's ".ignore" subordinate row
      // ("Flagged for review") is the active selection - api_id/
      // api_source still point at .ignore itself (this isn't a real
      // Person), this just tells ImageScreen's face_poss fetch to add
      // the extra mobile_review_hidden filter. Reset to false by
      // setApiUrl any time a normal sidebar row is clicked.
      reviewFlaggedOnly: false,
      // ".ignore" subordinate row on the verify screen ("Flagged &
      // unverified") - faces already declared to .ignore, not yet
      // verified, that were ALSO flagged at some point (mobile_review_hidden
      // survives confirm, see CLAUDE.md). Only meaningful alongside
      // only_unverified_toggle (see setToggle's reset below) - tells
      // ImageScreen's face_declared fetch to add the flagged filter.
      // Mutually exclusive with reviewFlaggedOnly (that one's the
      // unlabeled-toggle equivalent, for still-proposed candidates) - see
      // selectReviewFlagged/selectReviewFlaggedUnverified and setApiUrl
      // below.
      reviewFlaggedUnverifiedOnly: false,

      showRenameModal: false,
      renamePersonId: null,
      renameInitialValue: '',
      renameError: '',
      renameSubmitting: false,

      showMergeModal: false,
      mergeSourceId: null,
      mergeSourceName: '',
      mergeError: '',
      mergeSubmitting: false,
      mergeProgress: { done: 0, total: 0 },

      // Undo/redo history for face actions (send-to-other-person,
      // send-to-ignore, confirm) - see CLAUDE.md and pushUndoable/
      // performUndo/performRedo below. Deliberately plain in-memory
      // state, not persisted to the `store` localStorage helper this
      // app uses elsewhere - replaying an undo against faces that moved
      // some other way since the tab was last open (another session, or
      // the 10-minute background reconciliation) is worse than just
      // losing the history on reload.
      undoStack: [],
      undoPointer: -1,
      undoBusy: false,
      undoError: '',
      // Bumped on every undo/redo so ImageScreen re-fetches the
      // currently-displayed gallery, in case it was affected - see
      // imageScreen.jsx's componentDidUpdate.
      refreshVersion: 0,

      // People tab's "Only Unlabeled Faces" confirm queue - restricts it
      // to image-sourced faces, video-sourced faces, or 'all' (default).
      // Lifted up here (rather than kept local to ImageScreen, like the
      // confidence sort toggle) specifically so PersonSidebar can also
      // read it - every row's displayed count needs to reflect the
      // active filter (PersonListView's num_possibilities_video/
      // num_possibilities_image, kept live via gallery.jsx's
      // buildCountDeltas the same way num_possibilities itself already
      // is), and PersonSidebar is ImageScreen's sibling, not its parent/
      // child, so this has to live one level up to be shared between
      // them. Reset to 'all' on every person/folder switch (setApiUrl)
      // for consistency with the sort toggle, even though - unlike that
      // one - carrying this particular filter over to a new person isn't
      // actually misleading (every row already shows its own correct
      // split regardless of who's selected).
      possMediaFilter: 'all',

      // In-flight/completed upload jobs (Tools tab's "Upload Photos" -
      // see uploadActions.js for the underlying API calls). Lives here
      // rather than in the Upload tool's own component state so an
      // upload survives switching to a different tab (Tools unmounts on
      // tab switch, PicasaScreen doesn't) - same reasoning as the undo/
      // redo stack above. Each entry: {id, file, filename, size,
      // kind: 'single'|'chunked', status: 'hashing'|'uploading'|
      // 'completed'|'failed', progress (0-1), error, results (server's
      // files[] array), uploadId, chunkSize, totalChunks, receivedChunks
      // (a Set)}. `file` (the real File object) only lives for this
      // session/tab - it can't survive an actual page reload, see
      // _runChunkedUpload's pending-uploads lookup for what does.
      uploads: [],

      // Tools tab's "Google Photos" screen - list of watched albums
      // (fetched lazily, see fetchPhotoWatches) and any sync currently in
      // progress. Lives here, not in GooglePhotosTool's own state, for the
      // same tab-survival reason uploads does above: starting a sync opens
      // Google's own picker UI in a new tab, and polling for the user to
      // finish there needs to keep running even if this tab gets switched
      // away from Tools in the meantime.
      photoWatches: [],
      photoWatchesFetched: false,
      // Keyed by watched-album id. Each entry: {sessionId, status:
      // 'picking'|'polling'|'completing'|'failed', error, result:
      // {new_count, already_had_count}}. Absent from this map entirely
      // means "not currently syncing" - the normal/idle state for a watch
      // entry, checked as `!!this.state.photoSyncSessions[id]` rather than
      // a boolean flag on the album itself, since a sync session belongs
      // to a single attempt, not the album's persistent record.
      photoSyncSessions: {},
      // Set from a ?google_photos_connected=1/?google_photos_error=...
      // query param on mount - see componentDidMount. {type: 'success'|
      // 'error', message} or null.
      googlePhotosBanner: null,
    };
          
    // console.log(this.state.param_url)
    axiosInstance.get(this.state.param_url)    
    .then( (response) => {
      // var info = response.data
      var access_key = response.data.random_access_key;

      store.set('access_key', access_key);

      // Read the sibling flags off prevState, not this.state - three
      // independent fetches (params/people/folders) each flip their own
      // "fetched" flag and check whether the other two are already done
      // to decide when to clear `loading`. Reading this.state directly
      // used to race: if two fetches resolved close enough together that
      // React batched their setState calls, a callback could read a
      // stale this.state that hadn't yet picked up a sibling's flag,
      // so `loading` never got cleared - the app-level "sits and spins"
      // bug. Combining the flag-set and the loading check into one
      // functional setState update makes it atomic against prevState.
      this.setState(prevState => {
        const next = { params_fetched: true }
        if (prevState.names_fetched && prevState.dirs_fetched) next.loading = false
        return next
      })
    })
    .catch((error) => {
      console.log('Failed to fetch parameters', error)
      if (isAuthFailure(error)) {
        // axios_setup.jsx's interceptor already called bounceToLogin() for
        // this exact error before it ever reached this catch block - the
        // redirect is already in flight. Showing our own "couldn't reach
        // the server" error here would just flash a misleading message for
        // a beat before that navigation completes, so leave the spinner
        // running instead. (Older versions of this comment assumed only
        // MainApp's one-time mount check would catch this - that stopped
        // being reliably true once auth failures could happen later in the
        // session's life; see CLAUDE.md's "background-tab bug" writeup.)
        return
      }
      this.setState({loading: false, loadError: "Couldn't reach the server. Please check your connection and try again."})
    })

    this.updatePersonList = this.updatePersonList.bind(this)
    this.updatePersonCounts = this.updatePersonCounts.bind(this)
    this.updatePersonName = this.updatePersonName.bind(this)
    this.fetchPeopleList = this.fetchPeopleList.bind(this)
    this.retryInitialLoad = this.retryInitialLoad.bind(this)
    this.openRenameModal = this.openRenameModal.bind(this)
    this.closeRenameModal = this.closeRenameModal.bind(this)
    this.submitRename = this.submitRename.bind(this)

    this.openMergeModal = this.openMergeModal.bind(this)
    this.closeMergeModal = this.closeMergeModal.bind(this)
    this.submitMerge = this.submitMerge.bind(this)

    this.pushUndoable = this.pushUndoable.bind(this)
    this.performUndo = this.performUndo.bind(this)
    this.performRedo = this.performRedo.bind(this)
    this._handleUndoRedoKeyDown = this._handleUndoRedoKeyDown.bind(this)

    // Forwarded down through ImageScreen onto whichever Gallery is
    // currently mounted (imageScreen.jsx's buildScreen) - null whenever
    // no Gallery is mounted (e.g. mid-refetch, or a different tab/toggle
    // entirely). Lets performUndo/performRedo patch an already-visible
    // grid's hidden set directly (tryGalleryVisibilityPatch below)
    // instead of unconditionally forcing a full refetch+remount via
    // bumpRefreshVersion - the common case (undoing an action just taken
    // on the gallery you're still looking at) needs no server round trip
    // at all, since the affected faces are already loaded, just filtered
    // out of view the same way runBulkOperation/setHidden already do for
    // a live (non-undo) action.
    this.galleryRef = React.createRef()

    this.setPossMediaFilter = this.setPossMediaFilter.bind(this)

    this.startUpload = this.startUpload.bind(this)
    this.retryUpload = this.retryUpload.bind(this)
    this.dismissUpload = this.dismissUpload.bind(this)
    this.dismissAllUploads = this.dismissAllUploads.bind(this)

    this.fetchPhotoWatches = this.fetchPhotoWatches.bind(this)
    this.addWatchedAlbum = this.addWatchedAlbum.bind(this)
    this.removeWatchedAlbum = this.removeWatchedAlbum.bind(this)
    this.startPhotoSync = this.startPhotoSync.bind(this)
    this.dismissPhotoSync = this.dismissPhotoSync.bind(this)

  }

  // How often to reconcile locally-bookkept people counts against the
  // backend's actual numbers (e.g. faces sent back to Unassigned get
  // reassigned by someone else in the background over time).
  static PEOPLE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

  // Threshold below which a file goes through the single-shot upload
  // endpoint instead of chunked - conservatively under the documented
  // 25MB default chunk_size (which the backend can change; this only
  // decides which endpoint to call up front, not the actual chunk math,
  // which always comes from the live /init/ response - see
  // _runChunkedUpload). Any video always goes chunked regardless of
  // size, per the upload spec's own recommendation - those are the files
  // most likely to be large and/or on a slow connection.
  static UPLOAD_CHUNK_THRESHOLD_BYTES = 20 * 1024 * 1024;

  // localStorage key (via the `store` package already used elsewhere in
  // this app) for chunked uploads that haven't completed yet - lets
  // startUpload recognize "you already started this" if the same file
  // (by name+size+checksum) is picked again after a reload, and resume
  // from the backend's own received_chunks instead of restarting from
  // scratch. Single-shot uploads have no partial-progress concept, so
  // they aren't tracked here - if interrupted, they simply restart.
  static PENDING_UPLOADS_KEY = 'pending_chunked_uploads';


  compareNames(a, b) {
    // Use toUpperCase() to ignore character casing
    const nameA = a.person_name.toUpperCase();
    const nameB = b.person_name.toUpperCase();

    let comparison = 0;
    if (nameA > nameB) {
      comparison = 1;
    } else if (nameA < nameB) {
      comparison = -1;
    }
    return comparison;
  }

  componentDidMount(){
    // Google Photos "Connect" flow (see CLAUDE.md) leaves the SPA entirely
    // for a real browser redirect chain out to Google and back - the
    // backend's OAuth callback lands back here as a full page load with
    // ?google_photos_connected=1 or ?google_photos_error=... on /faces
    // (same idea as the app's existing Authelia SSO redirect). Read it
    // once here rather than in GooglePhotosTool itself, since the user
    // may well land back on a different tab than Tools - this banner
    // needs to be visible regardless of which tab is active. Cleaned up
    // via replaceState so a later re-render/remount doesn't re-show it.
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('google_photos_connected')
    const error = params.get('google_photos_error')
    if (connected || error) {
      this.setState({
        googlePhotosBanner: connected
          ? { type: 'success', message: 'Google Photos connected.' }
          : { type: 'error', message: `Couldn't connect Google Photos: ${error}` },
      })
      window.history.replaceState(null, '', window.location.pathname)
    }

    function compareDirectories(a, b) {
      // Use toUpperCase() to ignore character casing
      const timeA = a.first_datesec;
      const timeB = b.first_datesec;
      const yearA = a.year;
      const yearB = b.year;

      let comparison = 0;
      if (yearA > yearB) {
        comparison = 1;
      } else if (yearA < yearB) {
        comparison = -1;
      } else if (yearA === yearB){
        if (timeA > timeB) {
          comparison = 1;
        } else if (timeA < timeB) {
          comparison = -1;
        } 
      }
      // Reverse order - multiply by -1
      return comparison * -1;
    }

    // console.debug("Picasa screen mounted")
    var next_url = this.state.people_url;
    while (next_url !== null){
      // console.log(next_url, next_url !== null)
      // let data = this.getNames(next_url);
      // console.log(data)
      next_url = null
      this.fetchPeopleList(true)
      this.compile_api_list(this.state.dir_url, 'folder_aray').then(
        (resp) =>{
          resp.sort(compareDirectories)
          // console.log("Folder length", resp.length)
          for (var i = resp.length - 1; i >= 0; i--){
            if (resp[i].num_images === 0){
              resp.splice(i, 1)
            }
          }
          // console.log("Folder length after: ", resp.length)
          // See the params-fetch handler above for why this is one
          // functional setState keyed off prevState rather than a
          // separate this.state.names_fetched/params_fetched check.
          this.setState(prevState => {
            const next = { folders: resp, dirs_fetched: true }
            if (prevState.names_fetched && prevState.params_fetched) next.loading = false
            return next
          })

          console.log(this.state)
        }
      ).catch((error) => {
        console.log('Failed to fetch folders', error)
        // See the params-fetch catch above for why an auth failure
        // specifically is left alone rather than shown as a server error.
        if (isAuthFailure(error)) return
        this.setState({loading: false, loadError: "Couldn't reach the server. Please check your connection and try again."})
      })
    }

    this.peopleRefreshInterval = setInterval(
      () => this.fetchPeopleList(false),
      PicasaScreen.PEOPLE_REFRESH_INTERVAL_MS
    )

    document.addEventListener("keydown", this._handleUndoRedoKeyDown)
  }

  componentWillUnmount(){
    clearInterval(this.peopleRefreshInterval)
    document.removeEventListener("keydown", this._handleUndoRedoKeyDown)
  }

  // Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) for undo/redo, mirroring gallery.jsx's
  // existing Delete/Shift+R shortcut pattern. Skipped entirely while a text
  // input/textarea has focus (rename modal, merge search box, mutableSelect's
  // person search) so this can't fight with typing or the browser's own
  // undo in those fields.
  _handleUndoRedoKeyDown(event){
    const tag = event.target && event.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (!(event.ctrlKey || event.metaKey)) return

    if (event.key === 'z' || event.key === 'Z'){
      event.preventDefault()
      if (event.shiftKey){
        this.performRedo()
      }else{
        this.performUndo()
      }
    }else if (event.key === 'y' || event.key === 'Y'){
      event.preventDefault()
      this.performRedo()
    }
  }

  // Fetch the people list and refresh state.people. On the initial call
  // (isInitial=true) this also does one-time setup: names_fetched/loading
  // flags and locating the special Unassigned/.ignore person ids. Later
  // calls (from the periodic refresh) just reconcile the counts.
  fetchPeopleList(isInitial){
    return this.compile_api_list(this.state.people_url, 'name_array').then(
      (resp) => {
        resp.sort(this.compareNames)
        resp = resp.filter(element => element.num_faces > 0 || element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === ".ignore")
        this.setState({'people': resp})

        if (isInitial){
          var unassigned_person_id = resp.find(element =>element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === 'Unassigned');
          var ignore_person_id = resp.find(element =>element.person_name === ".ignore" );

          // An empty (or malformed - missing the special Unassigned/.ignore
          // records) people list used to crash here (resp[0]/.id on
          // undefined) with no .catch anywhere in the chain, which left
          // `loading` stuck true forever instead of showing anything.
          if (resp.length === 0 || !unassigned_person_id || !ignore_person_id){
            console.log("People list came back empty or missing special records", resp)
            this.setState({loading: false, loadError: "Couldn't load your people list from the server. Please try again."})
            return
          }

          console.log("Getting people")
          console.log(resp)
          console.log(unassigned_person_id)
          console.log(ignore_person_id)

          // See the params-fetch handler above for why this is one
          // functional setState keyed off prevState rather than a
          // separate this.state.dirs_fetched/params_fetched check.
          this.setState(prevState => {
            const next = {
              names_fetched: true,
              api_id: resp[0].id,
              unassigned_id: unassigned_person_id.id,
              ignore_person_id: ignore_person_id.id,
            }
            if (prevState.dirs_fetched && prevState.params_fetched) next.loading = false
            return next
          })

          console.log(this.state)
        } else {
          console.log("Reconciled people counts from backend", resp)
        }
      }
    ).catch((error) => {
      console.log('Failed to fetch people list', error)
      // See the params-fetch catch above for why an auth failure
      // specifically is left alone rather than shown as a server error.
      if (isInitial && !isAuthFailure(error)){
        this.setState({loading: false, loadError: "Couldn't reach the server. Please check your connection and try again."})
      }
    })
  }

  // The failed fetches happened during construction/mount, so the
  // simplest reliable way to retry is a full reload rather than trying
  // to re-run each of the three initial fetch chains in place.
  retryInitialLoad(){
    window.location.reload()
  }


////////////////////////////////////////
///  Get all the names or folders, with a linked list.
////////////////////////////////////////
  compile_api_list = async (base_url, state_field) => {
    try {
      const firstPageResp = await this.fetchAPIURL(base_url);
      const firstPageData = firstPageResp.data;
      let data_array = [...firstPageData.results];

      const pageSize = firstPageData.results.length;
      if (!firstPageData.next || pageSize === 0) {
        return data_array;
      }

      const totalPages = Math.ceil(firstPageData.count / pageSize);
      const remainingUrls = [];
      for (let page = 1; page < totalPages; page++) {
        const url = new URL(base_url);
        url.searchParams.set('limit', pageSize);
        url.searchParams.set('offset', page * pageSize);
        remainingUrls.push(url.toString());
      }

      const remainingResponses = await mapWithConcurrency(
        remainingUrls,
        PAGINATION_CONCURRENCY,
        url => this.fetchAPIURL(url)
      );

      for (const resp of remainingResponses) {
        data_array = data_array.concat(resp.data.results);
      }

      return data_array;
    } catch (e) {
      console.log('error', e);
      // Rethrow rather than returning [] - a silent [] here would let
      // fetchPeopleList/the folder fetch below treat a real backend
      // failure as "zero results", which used to crash on resp[0].id
      // (people) or just render an empty gallery with no explanation
      // (folders). Let callers decide how to surface the failure.
      throw e;
    }
  };


  fetchAPIURL = async (url, sort_function) => {
    try {
      const response = await axiosInstance.get(url);
      return { data: response.data };
    } catch (err) {
      console.log(url, err);
      // Previously this swallowed the error and just logged it, leaving
      // the caller's promise pending forever (e.g. backend down/CORS
      // failure) - compile_api_list's own try/catch below only works if
      // this actually rejects.
      throw err;
    }
  }

////////////////////////////////////////
///  END of name fetching
////////////////////////////////////////


////////////////////////////////////////
///  START of callbacks
////////////////////////////////////////


  logoutclick = (childData) => {
    console.log("Logout")
    store.set('loggedIn', false);
    window.location = "/login"
    return <Redirect to="/login" />;
  }

  tabSelectCallback = (childData) => {
    this.setState({tab: childData})
  }
  
  setApiUrl = (childType, childUrl, childId, index) => {
    if (childType === 'folder'){
      this.setState({api_source: childUrl})
      this.setState({api_id: childId})
      this.setState({selectedIndex: index})
      this.setState({reviewFlaggedOnly: false, reviewFlaggedUnverifiedOnly: false})
    }else if (childType === 'person'){
      this.setState({api_source: childUrl})
      this.setState({api_id: childId})
      this.setState({selectedIndex: index})
      // A normal sidebar click always means "leave the .ignore
      // subordinate filtered view" - selectReviewFlagged/
      // selectReviewFlaggedUnverified below are the only paths that turn
      // either back on.
      this.setState({reviewFlaggedOnly: false, reviewFlaggedUnverifiedOnly: false})
      // possMediaFilter deliberately NOT reset here - it's now a
      // cross-person setting (every row in the sidebar reflects it, not
      // just whoever's selected), so switching to review a different
      // person's videos while "Video only" is active should keep
      // showing just their videos, not silently fall back to "Both".
    }
    // console.log(this.state.image_api_id)
  }

  // Sidebar's ".ignore" subordinate row ("Flagged for review") - selects
  // .ignore itself (same as clicking its own row would) plus flips
  // reviewFlaggedOnly on, which ImageScreen reads to add the extra
  // mobile_review_hidden filter to its face_poss fetch. See
  // personSidebar.jsx's makeReviewFlaggedRow/handleReviewFlaggedClick.
  selectReviewFlagged = () => {
    const ignoreId = this.state.ignore_person_id
    const ignorePerson = this.state.people.find(p => p.id === ignoreId)
    if (!ignorePerson) return
    const index = this.state.people.findIndex(p => p.id === ignoreId)
    this.setState({
      api_source: ignorePerson.url,
      api_id: ignoreId,
      selectedIndex: index,
      reviewFlaggedOnly: true,
      reviewFlaggedUnverifiedOnly: false,
    })
  }

  // Sidebar's ".ignore" subordinate row on the verify screen ("Flagged &
  // unverified") - mirrors selectReviewFlagged above, but for faces
  // already declared to .ignore, not yet verified, that were ALSO
  // flagged at some point (mobile_review_hidden survives confirm - see
  // CLAUDE.md). See personSidebar.jsx's makeReviewFlaggedUnverifiedRow/
  // handleReviewFlaggedUnverifiedClick.
  selectReviewFlaggedUnverified = () => {
    const ignoreId = this.state.ignore_person_id
    const ignorePerson = this.state.people.find(p => p.id === ignoreId)
    if (!ignorePerson) return
    const index = this.state.people.findIndex(p => p.id === ignoreId)
    this.setState({
      api_source: ignorePerson.url,
      api_id: ignoreId,
      selectedIndex: index,
      reviewFlaggedOnly: false,
      reviewFlaggedUnverifiedOnly: true,
    })
  }

  setToggle = (childField) => {
    console.debug( "Child field: ", childField)
    // 'unlabeled_toggle' and 'only_unverified_toggle' are mutually exclusive -
    // turning one on flips the other off. Both can be off at once.
    const exclusiveToggles = ['unlabeled_toggle', 'only_unverified_toggle']
    if (exclusiveToggles.includes(childField)){
      this.setState(prevState => {
        const turningOn = !prevState[childField]
        const next = { [childField]: turningOn }
        if (turningOn){
          for (const other of exclusiveToggles){
            if (other !== childField) next[other] = false
          }
        }
        // The ".ignore" subordinate rows only show alongside their own
        // toggle - "Flagged for review" under unlabeled (see
        // personSidebar.jsx), "Flagged & unverified" under only_unverified.
        // If that toggle is ending up off after this change - whether
        // because it was the one directly clicked, or because the OTHER
        // toggle was just turned on and knocked it off via the
        // exclusiveToggles loop above - leaving the review-flagged flag
        // set would strand the gallery in a filtered state with no
        // visible row/way back to it.
        const unlabeledWillBeOn = childField === 'unlabeled_toggle' ? turningOn : next.unlabeled_toggle ?? prevState.unlabeled_toggle
        const onlyUnverifiedWillBeOn = childField === 'only_unverified_toggle' ? turningOn : next.only_unverified_toggle ?? prevState.only_unverified_toggle
        if (!unlabeledWillBeOn && prevState.reviewFlaggedOnly){
          next.reviewFlaggedOnly = false
        }
        if (!onlyUnverifiedWillBeOn && prevState.reviewFlaggedUnverifiedOnly){
          next.reviewFlaggedUnverifiedOnly = false
        }
        return next
      })
    }else{
      this.setState(prevState => ({
        [childField] : !prevState[childField]
      }))
    }
  }

////////////////////////////////////////
///  END of callbacks
////////////////////////////////////////

  updatePersonList(person_name, api_key, count){
    count = count || 1
    console.log("Updating person list in PicasaScreen", person_name, api_key, this.state.people)
    var new_object = {'id': api_key,
                      'num_faces' : count,
                      'num_possibilities': 0,
                      'num_unverified_faces': count,
                      'person_name': person_name,
                      'url': store.get('api_url') + '/people/' + api_key + '/'}

    var person_list = this.state.people.concat(new_object)
    person_list.sort(this.compareNames)
    this.setState({people: person_list})

    console.log(new_object)
  }

  // Apply local count deltas to state.people so the sidebar reflects
  // face operations immediately, without waiting on a refetch. deltas is
  // an array of {id, num_faces?, num_possibilities?, num_unverified_faces?,
  // num_review_flagged?} where each present field is a signed delta to
  // add (not an absolute value).
  // Reconciled against the backend periodically by fetchPeopleList.
  updatePersonCounts(deltas){
    if (!deltas || deltas.length === 0) return
    this.setState(prevState => {
      const people = prevState.people.map(person => {
        const delta = deltas.find(d => d.id === person.id)
        if (!delta) return person

        const updated = { ...person }
        for (const field of ['num_faces', 'num_possibilities', 'num_possibilities_video', 'num_possibilities_image', 'num_unverified_faces', 'num_review_flagged', 'num_review_flagged_unverified']){
          if (delta[field]){
            updated[field] = Math.max(0, (updated[field] || 0) + delta[field])
          }
        }
        return updated
      })
      return { people }
    })
  }

  // Applies a rename locally so the header and sidebar update
  // immediately, without waiting on a refetch. The sidebar re-sorts by
  // name on every render, so this also fixes list ordering.
  updatePersonName(id, newName){
    this.setState(prevState => ({
      people: prevState.people.map(person =>
        person.id === id ? { ...person, person_name: newName } : person
      )
    }))
  }

  // Shared rename trigger for both the sidebar list buttons
  // (personSidebar.jsx) and the selected person's name in the header
  // (imageScreen.jsx) - lives here since both are siblings under this
  // component and need to open the same modal.
  openRenameModal(id, currentName){
    this.setState({
      showRenameModal: true,
      renamePersonId: id,
      renameInitialValue: currentName,
      renameError: '',
      renameSubmitting: false,
    })
  }

  closeRenameModal(){
    this.setState({ showRenameModal: false, renameError: '', renameSubmitting: false })
  }

  submitRename(rawValue){
    const newName = rawValue.trim()
    if (!newName){
      this.setState({ renameError: 'Name cannot be empty.' })
      return
    }

    const id_num = this.state.renamePersonId
    const rename_url = store.get('api_url') + '/people/' + id_num + '/rename/'

    this.setState({ renameSubmitting: true, renameError: '' })

    withRetry(() => axiosInstance.put(rename_url, { person_name: newName }))
      .then(response => {
        this.updatePersonName(id_num, newName)
        this.setState({ showRenameModal: false, renameSubmitting: false })
      })
      .catch(error => {
        const backendError = error.response && error.response.data && error.response.data.error
        this.setState({
          renameSubmitting: false,
          renameError: backendError || "Couldn't rename — please try again.",
        })
      })
  }

  // Shared merge trigger, same reasoning as openRenameModal above.
  // Refuses to open on the two special people (Unassigned/.ignore) -
  // "merge all their faces into someone else" doesn't make sense for
  // either of those buckets.
  openMergeModal(id, currentName){
    if (id === this.state.unassigned_id || id === this.state.ignore_person_id) return
    this.setState({
      showMergeModal: true,
      mergeSourceId: id,
      mergeSourceName: currentName,
      mergeError: '',
      mergeSubmitting: false,
      mergeProgress: { done: 0, total: 0 },
    })
  }

  closeMergeModal(){
    // Don't let the modal be dismissed mid-merge - there's no cancel
    // for in-flight PATCH requests, and closing would just orphan the
    // progress state with no way to tell if it finished.
    if (this.state.mergeSubmitting) return
    this.setState({ showMergeModal: false, mergeError: '' })
  }

  // There's no bulk person-merge endpoint on the backend - this reassigns
  // every one of the source person's already-declared faces to the
  // target, one PATCH per face (same call mutableSelect.jsx's
  // "send to other person" uses for a single face), concurrency-capped
  // the same way picasaScreen's own pagination fetches are. Doesn't touch
  // the source's unconfirmed/possible matches (num_possibilities) -
  // those are just proposed guesses, not actually the source person's
  // faces yet, so silently confirming them onto the target as part of a
  // merge would be presumptuous.
  //
  // TODO (blocked on backend): the actually-wanted behavior is to also
  // reassign the source's possible/unconfirmed matches to the target,
  // but *still as possible matches* rather than auto-confirming them -
  // there's no endpoint yet for "repoint a proposed match's candidate
  // person" without confirming it (assign_face_to_person always
  // confirms). Once that endpoint exists: fetch the source's face_poss
  // ids the same way as face_declared below, and reassign them via the
  // new endpoint in a second mapWithConcurrency pass. See CLAUDE.md.
  submitMerge(targetId, targetName){
    const sourceId = this.state.mergeSourceId
    if (targetId === sourceId) return

    this.setState({ mergeSubmitting: true, mergeError: '' })

    const face_list_url = store.get('api_url') + '/paginate_obj_ids/' + sourceId + '/face_declared'

    axiosInstance.get(face_list_url)
      .then(response => {
        const faceIds = response.data.id_list || []
        this.setState({ mergeProgress: { done: 0, total: faceIds.length } })

        if (faceIds.length === 0){
          this.finishMerge(sourceId, targetId)
          return
        }

        let completed = 0
        return mapWithConcurrency(faceIds, PAGINATION_CONCURRENCY, (faceId) => {
          const assign_url = store.get('api_url') + '/faces/' + faceId + '/assign_face_to_person/'
          return withRetry(() => axiosInstance.patch(assign_url, { declared_name_key: targetId }))
            .then(() => {
              completed += 1
              this.setState({ mergeProgress: { done: completed, total: faceIds.length } })
            })
        }).then(() => {
          this.finishMerge(sourceId, targetId)
        })
      })
      .catch(error => {
        console.log("Error in merge", error)
        this.setState({
          mergeSubmitting: false,
          mergeError: "Couldn't complete the merge - some faces may have already moved. Check both people before retrying.",
        })
      })
  }

  // Applies the merge locally (moves the source's face counts onto the
  // target and drops the now-empty source from the sidebar) rather than
  // waiting on a full people-list refetch, same immediacy reasoning as
  // updatePersonCounts/updatePersonName. Safe to remove the source
  // outright here (unlike a generic refetch) since personSidebar.jsx and
  // imageScreen.jsx both now track the selected person by id rather than
  // array position, so the removal can't silently point either at the
  // wrong person.
  //
  // TODO (blocked on backend): this only removes the source from the
  // frontend's list - fetchPeopleList already filters out num_faces===0
  // people (except the two special names) so it won't reappear, but the
  // now-empty person record itself is never actually deleted on the
  // backend and will sit there as an orphan. Needs a delete-person
  // endpoint; once it exists, call it here (or right after the merge
  // completes) instead of/alongside this local-only removal. See
  // CLAUDE.md.
  finishMerge(sourceId, targetId){
    this.setState(prevState => {
      const source = prevState.people.find(p => p.id === sourceId)
      const movedFaces = source ? source.num_faces : 0
      const movedUnverified = source ? source.num_unverified_faces : 0

      const people = prevState.people
        .filter(p => p.id !== sourceId)
        .map(p => p.id === targetId
          ? { ...p, num_faces: p.num_faces + movedFaces, num_unverified_faces: p.num_unverified_faces + movedUnverified }
          : p
        )

      return { people, showMergeModal: false, mergeSubmitting: false }
    })
  }

  // Records one undoable action. Called from gallery.jsx's runBulkOperation
  // (send-to-ignore, confirm) and mutableSelect.jsx's assignPerson
  // (send-to-other-person), each of which already builds a single
  // faceIds array covering its whole selection/row before calling this -
  // so one user action (even a 47-face "confirm row" click) is always
  // exactly one history entry, never one per face.
  pushUndoable(record){
    this.setState(prevState => {
      const truncated = prevState.undoStack.slice(0, prevState.undoPointer + 1)
      let undoStack = truncated.concat([{ ...record, id: `${Date.now()}-${Math.random()}` }])
      if (undoStack.length > MAX_UNDO_HISTORY){
        undoStack = undoStack.slice(undoStack.length - MAX_UNDO_HISTORY)
      }
      return { undoStack, undoPointer: undoStack.length - 1 }
    })
  }

  bumpRefreshVersion(){
    this.setState(prevState => ({ refreshVersion: prevState.refreshVersion + 1 }))
  }

  // Called by ImageScreen when the user clicks a different "Confirm
  // from" option.
  setPossMediaFilter(mediaFilter){
    this.setState({ possMediaFilter: mediaFilter })
  }

  // Fires the actual reversing (or, for redo, re-applying) API call(s) for
  // one action record. Shared by performUndo/performRedo below - `reverse`
  // picks which direction, since the two are otherwise identical shapes
  // (apply a count delta, fire a call, roll back on failure).
  runUndoRedoCall(record, reverse){
    switch (record.kind){
      case 'assign_to_person': {
        const targetId = reverse ? record.context.priorPersonId : record.context.targetPersonId
        return mapWithConcurrency(record.faceIds, PAGINATION_CONCURRENCY, faceId =>
          assignFaceToPerson(faceId, targetId))
      }
      case 'close_unassigned':
        return bulkFaceOperation(reverse ? 'close_ignored' : 'close_unassigned', record.faceIds, record.context.currentPersonId)
      case 'confirm_proposed':
        // Reverse is close_assigned - see gallery.jsx's runBulkOperation
        // for why this is safe to fire now (the backend bug that used to
        // make this a silent no-op on an already-declared face is fixed).
        return bulkFaceOperation(reverse ? 'close_assigned' : 'confirm_proposed', record.faceIds, record.context.currentPersonId)
      default:
        return Promise.reject(new Error(`Unknown undo record kind: ${record.kind}`))
    }
  }

  // Attempts the fast, no-refetch path for reflecting an undo/redo in the
  // currently-mounted Gallery. Returns true if it succeeded (caller
  // should skip bumpRefreshVersion entirely) - false means either no
  // Gallery is mounted, it's showing a different person/folder than this
  // record's context, or (rarer) the affected faces simply aren't loaded
  // there, all of which mean there's nothing to patch and the existing
  // full-refresh fallback is the only correct option.
  //
  // The gallery to patch is always whichever person's gallery the action
  // was ORIGINALLY fired from - context.currentPersonId for
  // close_unassigned/confirm_proposed (recorded directly, gallery.jsx's
  // runBulkOperation), or context.priorPersonId for assign_to_person
  // (mutableSelect.jsx's sourceCountDelta always resolves to
  // current_person_id too, just under a different field name - see
  // CLAUDE.md). Every one of these kinds already hides the affected
  // faces from that exact gallery immediately via setHidden when the
  // action first fires (for live, non-undo use) - so reversing that is
  // just as simple as un-hiding them again, and redoing is re-hiding,
  // PROVIDED you're still looking at that same gallery and it hasn't
  // unmounted/refetched since.
  tryGalleryVisibilityPatch(record, hide){
    const galleryPersonId = record.kind === 'assign_to_person'
      ? record.context.priorPersonId
      : record.context.currentPersonId
    const gallery = this.galleryRef.current
    if (!gallery || gallery.props.current_person_id !== galleryPersonId) return false
    return gallery.applyUndoRedoPatch(record.faceIds, hide)
  }

  performUndo(){
    const { undoStack, undoPointer, undoBusy } = this.state
    if (undoPointer < 0 || undoBusy) return
    const record = undoStack[undoPointer]

    if (record.faceIds.length > BULK_CONFIRM_THRESHOLD){
      const ok = window.confirm(`Undo "${record.label}"? This affects ${record.faceIds.length} faces.`)
      if (!ok) return
    }

    this.setState({ undoBusy: true, undoError: '' })
    this.updatePersonCounts(negateDeltas(record.forwardDeltas))

    this.runUndoRedoCall(record, true)
      .then(() => {
        this.setState({ undoPointer: undoPointer - 1, undoBusy: false })
        if (!this.tryGalleryVisibilityPatch(record, false)) this.bumpRefreshVersion()
      })
      .catch(error => {
        console.log("Error undoing action", record, error)
        // Roll all the way back: nothing succeeded (or we can't tell what
        // did), so leave the stack pointer where it was and undo the
        // optimistic count delta too, rather than leaving local counts
        // out of sync with a reversal that may not have actually happened.
        this.updatePersonCounts(record.forwardDeltas)
        this.setState({
          undoBusy: false,
          undoError: `Couldn't undo "${record.label}" — some faces may have already moved. Check before retrying.`,
        })
      })
  }

  performRedo(){
    const { undoStack, undoPointer, undoBusy } = this.state
    if (undoPointer >= undoStack.length - 1 || undoBusy) return
    const record = undoStack[undoPointer + 1]

    if (record.faceIds.length > BULK_CONFIRM_THRESHOLD){
      const ok = window.confirm(`Redo "${record.label}"? This affects ${record.faceIds.length} faces.`)
      if (!ok) return
    }

    this.setState({ undoBusy: true, undoError: '' })
    this.updatePersonCounts(record.forwardDeltas)

    this.runUndoRedoCall(record, false)
      .then(() => {
        this.setState({ undoPointer: undoPointer + 1, undoBusy: false })
        if (!this.tryGalleryVisibilityPatch(record, true)) this.bumpRefreshVersion()
      })
      .catch(error => {
        console.log("Error redoing action", record, error)
        this.updatePersonCounts(negateDeltas(record.forwardDeltas))
        this.setState({
          undoBusy: false,
          undoError: `Couldn't redo "${record.label}" — some faces may have already moved. Check before retrying.`,
        })
      })
  }

  ////////////////////////////////////////
  ///  Tools tab - "Upload Photos"
  ////////////////////////////////////////

  _pendingUploadSignature(filename, size, checksum){
    return `${filename}::${size}::${checksum}`
  }

  _loadPendingUploads(){
    return store.get(PicasaScreen.PENDING_UPLOADS_KEY) || {}
  }

  _savePendingUpload(signature, record){
    const all = this._loadPendingUploads()
    all[signature] = record
    store.set(PicasaScreen.PENDING_UPLOADS_KEY, all)
  }

  _removePendingUpload(signature){
    const all = this._loadPendingUploads()
    delete all[signature]
    store.set(PicasaScreen.PENDING_UPLOADS_KEY, all)
  }

  updateUploadJob(id, patch){
    this.setState(prevState => ({
      uploads: prevState.uploads.map(job => job.id === id ? { ...job, ...patch } : job)
    }))
  }

  // Kicks off tracking + the actual upload pipeline for one file - called
  // once per file dropped/selected, so a multi-file drop gets one
  // independent job/progress entry per file, all running concurrently.
  async startUpload(file){
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const kind = (isVideoFile(file.name) || file.size > PicasaScreen.UPLOAD_CHUNK_THRESHOLD_BYTES) ? 'chunked' : 'single'
    const job = {
      id, file, filename: file.name, size: file.size, kind,
      status: 'hashing', progress: 0, error: null, results: null,
      uploadId: null, chunkSize: null, totalChunks: null, receivedChunks: new Set(),
    }
    this.setState(prevState => ({ uploads: [...prevState.uploads, job] }))

    // The backend re-checks extension AND actual content regardless (a
    // renamed .txt won't pass there either) - this is purely a fast,
    // no-network rejection for the common case (an obviously-wrong file
    // type) so it doesn't cost a hash + upload round-trip first. Shaped
    // exactly like the server's own rejection response so the Upload
    // tool's results rendering doesn't need two different code paths.
    if (!hasAcceptedExtension(file.name)){
      this.updateUploadJob(id, {
        status: 'completed', progress: 1,
        results: { status: 'rejected', files: [{ filename: file.name, status: 'rejected', reason: 'Unsupported file type.' }] },
      })
      return
    }

    try {
      const checksum = await sha256Hex(file)
      if (kind === 'single'){
        await this._runSingleShotUpload(id, file, checksum)
      } else {
        await this._runChunkedUpload(id, file, checksum)
      }
    } catch (error) {
      console.error('Upload failed', file.name, error)
      // error.isChunkUploadFailure carries its own specific, already-
      // human-readable summary (which chunk, why) - _runChunkedUpload's
      // own construction of it, not a raw axios/server error, so it has
      // no `.response` to read a message off of the usual way.
      const message = error?.isChunkUploadFailure
        ? error.message
        : (error?.response?.data?.error || 'Upload failed - please try again.')
      this.updateUploadJob(id, { status: 'failed', error: message })
    }
  }

  async _runSingleShotUpload(id, file, checksum){
    this.updateUploadJob(id, { status: 'uploading', progress: 0 })
    const response = await uploadSingleShot(file, checksum, (progressEvent) => {
      if (progressEvent.total){
        this.updateUploadJob(id, { progress: progressEvent.loaded / progressEvent.total })
      }
    })
    this.updateUploadJob(id, { status: 'completed', progress: 1, results: response.data })
  }

  async _runChunkedUpload(id, file, checksum){
    const signature = this._pendingUploadSignature(file.name, file.size, checksum)
    const pending = this._loadPendingUploads()[signature]

    let uploadId, chunkSize, totalChunks, receivedChunks

    if (pending){
      // Confirm the session is still alive (48h lifetime, or it may have
      // already completed/failed some other way) rather than trusting a
      // possibly-stale localStorage record - a 404 here means expired or
      // unknown, so fall through to a fresh /init/ instead.
      try {
        const statusResp = await getChunkedStatus(pending.uploadId)
        if (statusResp.data.status === 'in_progress'){
          uploadId = pending.uploadId
          chunkSize = statusResp.data.chunk_size
          totalChunks = statusResp.data.total_chunks
          receivedChunks = new Set(statusResp.data.received_chunks)
        }
      } catch (e) {
        this._removePendingUpload(signature)
      }
    }

    if (!uploadId){
      const initResp = await initChunkedUpload(file.name, file.size, checksum)
      uploadId = initResp.data.upload_id
      chunkSize = initResp.data.chunk_size
      totalChunks = initResp.data.total_chunks
      receivedChunks = new Set()
      this._savePendingUpload(signature, { uploadId })
    }

    this.updateUploadJob(id, {
      status: 'uploading', uploadId, chunkSize, totalChunks,
      receivedChunks, progress: receivedChunks.size / totalChunks,
    })

    const missingIndices = []
    for (let i = 0; i < totalChunks; i++){
      if (!receivedChunks.has(i)) missingIndices.push(i)
    }

    // Sent in parallel - the backend explicitly allows this (each index
    // writes its own file, no cross-chunk locking). Each worker catches
    // its OWN failure rather than letting it propagate straight out of
    // mapWithConcurrency (which would reject its whole Promise.all on
    // the first one) - a chunk that's still genuinely failing after every
    // retry shouldn't orphan sibling chunks that are mid-flight or still
    // queued behind it; those still complete and are durably received
    // server-side regardless of what happens to the JS Promise chain
    // afterward, and a retry (see retryUpload) already knows to skip
    // whatever's in receivedChunks rather than re-sending it.
    const chunkFailures = []
    await mapWithConcurrency(missingIndices, UPLOAD_CHUNK_CONCURRENCY, async (index) => {
      const blob = file.slice(index * chunkSize, (index + 1) * chunkSize)
      try {
        await this._uploadChunkWithRetry(uploadId, index, blob)
      } catch (error) {
        chunkFailures.push({ index, error })
        return
      }
      this.setState(prevState => ({
        uploads: prevState.uploads.map(job => {
          if (job.id !== id) return job
          const nextReceived = new Set(job.receivedChunks)
          nextReceived.add(index)
          return { ...job, receivedChunks: nextReceived, progress: nextReceived.size / job.totalChunks }
        })
      }))
    })

    if (chunkFailures.length > 0){
      const { index, error } = chunkFailures[0]
      const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')
      const detail = isTimeout
        ? 'the connection was too slow to finish it in time'
        : (error?.response?.data?.error || error?.message || 'unknown error')
      const summary = chunkFailures.length === 1
        ? `Chunk ${index} failed after ${UPLOAD_CHUNK_MAX_ATTEMPTS} attempts (${detail}).`
        : `${chunkFailures.length} chunks failed after ${UPLOAD_CHUNK_MAX_ATTEMPTS} attempts each (e.g. chunk ${index}: ${detail}).`
      const aggregateError = new Error(summary)
      aggregateError.isChunkUploadFailure = true
      throw aggregateError
    }

    const completeResp = await completeChunkedUpload(uploadId)
    this._removePendingUpload(signature)
    this.updateUploadJob(id, { status: 'completed', progress: 1, results: completeResp.data })
  }

  // Exponential backoff between attempts (1s, 2s, 4s, 8s) - retrying the
  // exact same request instantly is only useful for a true one-off
  // blip; a slow/degraded connection (the actual cause found in a real
  // 865MB upload failure, 2026-09-11 - see UPLOAD_REQUEST_TIMEOUT_MS's
  // own comment) needs real time to recover, or at least isn't made
  // worse by giving it some.
  async _uploadChunkWithRetry(uploadId, index, blob){
    const checksum = await sha256Hex(blob)
    let lastError
    for (let attempt = 1; attempt <= UPLOAD_CHUNK_MAX_ATTEMPTS; attempt++){
      try {
        return await uploadChunk(uploadId, index, blob, checksum)
      } catch (error) {
        lastError = error
        if (attempt < UPLOAD_CHUNK_MAX_ATTEMPTS){
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)))
        }
      }
    }
    throw lastError
  }

  // Re-runs the whole pipeline for this job's file rather than trying to
  // resume a half-built in-memory state - for 'chunked', this naturally
  // picks back up from receivedChunks via the pending-uploads lookup
  // above (same file/size/checksum -> same signature), so it re-hashes
  // and re-checks /status/ rather than re-uploading what's already
  // there. The old (failed) job entry is dropped in favor of the new one
  // startUpload creates, so there's just one row per file, not a stale
  // failed one sitting alongside a fresh retry.
  retryUpload(id){
    const job = this.state.uploads.find(j => j.id === id)
    if (!job) return
    this.dismissUpload(id)
    this.startUpload(job.file)
  }

  dismissUpload(id){
    this.setState(prevState => ({ uploads: prevState.uploads.filter(job => job.id !== id) }))
  }

  // Only clears finished jobs (completed/failed) - a still-active
  // (hashing/uploading) one keeps running regardless either way (this
  // just stops it from being displayed, not a cancel), but leaving it
  // visible is what a user would actually expect from "dismiss all"
  // ("clear out the finished stuff", not "clear out everything even
  // what's still going").
  dismissAllUploads(){
    this.setState(prevState => ({
      uploads: prevState.uploads.filter(job => job.status !== 'completed' && job.status !== 'failed')
    }))
  }

  // Called lazily (GooglePhotosTool's componentDidMount) rather than
  // alongside the params/people/folders fetches in the constructor -
  // photoWatchesFetched guards against re-fetching every time the tool
  // tab is reopened, since the list only actually changes via this
  // component's own add/remove/sync methods, all of which already keep
  // state.photoWatches in sync themselves.
  fetchPhotoWatches(){
    if (this.state.photoWatchesFetched) return
    listWatchedAlbums()
      .then(response => this.setState({ photoWatches: response.data, photoWatchesFetched: true }))
      .catch(error => console.log('Failed to fetch watched Google Photos albums', error))
  }

  addWatchedAlbum(title){
    return createWatchedAlbum(title).then(response => {
      this.setState(prevState => ({ photoWatches: [...prevState.photoWatches, response.data] }))
    })
  }

  removeWatchedAlbum(albumId){
    return deleteWatchedAlbum(albumId).then(() => {
      this.setState(prevState => ({
        photoWatches: prevState.photoWatches.filter(a => a.id !== albumId),
        photoSyncSessions: Object.fromEntries(
          Object.entries(prevState.photoSyncSessions).filter(([id]) => Number(id) !== albumId)),
      }))
    })
  }

  // `callback` (setState's own third-argument style) matters here, not
  // just cosmetic: startPhotoSync calls this and then immediately calls
  // _pollPhotoSync, which reads the just-set sessionId back off
  // this.state to decide whether it's still the current poll chain
  // (isCurrent). setState is async - without waiting for it to actually
  // commit first, that read could see stale state and isCurrent() would
  // wrongly report false, silently killing the very first poll before it
  // ever fires.
  updatePhotoSyncSession(albumId, patch, callback){
    this.setState(prevState => ({
      photoSyncSessions: {
        ...prevState.photoSyncSessions,
        [albumId]: { ...prevState.photoSyncSessions[albumId], ...patch },
      },
    }), callback)
  }

  dismissPhotoSync(albumId){
    this.setState(prevState => {
      const next = { ...prevState.photoSyncSessions }
      delete next[albumId]
      return { photoSyncSessions: next }
    })
  }

  // Opens Google's own Picker UI in a new tab and polls our backend (which
  // proxies Google's sessions.get) until the user finishes selecting
  // items there. There's no way to shortcut this wait - see
  // googlePhotosActions.js/CLAUDE.md - Google's Picker API has no "notify
  // me when done" push, only polling, and no way to skip straight to
  // "what's new" without the user reselecting the album's contents.
  async startPhotoSync(albumId){
    this.updatePhotoSyncSession(albumId, { status: 'picking', sessionId: null, error: null, result: null })
    try {
      const initResp = await initPickerSession(albumId)
      const sessionId = initResp.data.session_id
      window.open(initResp.data.picker_uri, '_blank')
      this.updatePhotoSyncSession(albumId, { status: 'polling', sessionId },
        () => this._pollPhotoSync(albumId, sessionId))
    } catch (error) {
      this.updatePhotoSyncSession(albumId, {
        status: 'failed', error: error?.response?.data?.error || 'Could not start a Google Photos session.',
      })
    }
  }

  _pollPhotoSync(albumId, sessionId){
    // Guards against a stale timer still firing after the session moved
    // on for some other reason (the album was removed, or the user
    // clicked "Sync now" again and started a second session) - a session
    // id mismatch here means this exact poll chain is no longer current,
    // so it just stops rather than acting on it.
    const isCurrent = () => this.state.photoSyncSessions[albumId]?.sessionId === sessionId
    if (!isCurrent()) return

    pollPickerSession(albumId, sessionId)
      .then(response => {
        if (!isCurrent()) return
        if (response.data.media_items_set){
          this._finishPhotoSync(albumId, sessionId)
        } else {
          setTimeout(() => this._pollPhotoSync(albumId, sessionId), PHOTO_SYNC_POLL_INTERVAL_MS)
        }
      })
      .catch(error => {
        if (!isCurrent()) return
        this.updatePhotoSyncSession(albumId, {
          status: 'failed', error: error?.response?.data?.error || 'Lost contact with Google Photos.',
        })
      })
  }

  _finishPhotoSync(albumId, sessionId){
    this.updatePhotoSyncSession(albumId, { status: 'completing' })
    completeSession(albumId, sessionId)
      .then(response => {
        this.updatePhotoSyncSession(albumId, { status: 'completed', result: response.data })
        // Refetch rather than patch in place - last_synced_at/item_count
        // are computed server-side (photos_watch_views.py's
        // _serialize_album), simplest single source of truth after a
        // sync actually changes them.
        this.setState({ photoWatchesFetched: false }, this.fetchPhotoWatches)
      })
      .catch(error => {
        this.updatePhotoSyncSession(albumId, {
          status: 'failed', error: error?.response?.data?.error || 'Could not finish syncing this album.',
        })
      })
  }

  renderSidebar() {

    if ( this.state.tab === "Tools" ){
      return (
        <ToolsScreen
          uploads={this.state.uploads}
          onStartUpload={this.startUpload}
          onRetryUpload={this.retryUpload}
          onDismissUpload={this.dismissUpload}
          onDismissAllUploads={this.dismissAllUploads}
          photoWatches={this.state.photoWatches}
          photoSyncSessions={this.state.photoSyncSessions}
          onFetchPhotoWatches={this.fetchPhotoWatches}
          onAddWatchedAlbum={this.addWatchedAlbum}
          onRemoveWatchedAlbum={this.removeWatchedAlbum}
          onStartPhotoSync={this.startPhotoSync}
          onDismissPhotoSync={this.dismissPhotoSync}
        />
      )
    }
      
    if ( this.state.tab === "People" ){
      return (
      <div>
        <PersonSidebar people={this.state.people} setSource={this.setApiUrl} unlabeled={this.state.unlabeled_toggle} only_unverified={this.state.only_unverified_toggle} onRenamePerson={this.openRenameModal} onMergePerson={this.openMergeModal} reviewFlaggedOnly={this.state.reviewFlaggedOnly} onSelectReviewFlagged={this.selectReviewFlagged} reviewFlaggedUnverifiedOnly={this.state.reviewFlaggedUnverifiedOnly} onSelectReviewFlaggedUnverified={this.selectReviewFlaggedUnverified} possMediaFilter={this.state.possMediaFilter} />
        <ImageScreen
          tab={this.state.tab}
          api_source={this.state.api_source}
          api_id={this.state.api_id}
          people={this.state.people}
          unassigned_person_id={this.state.unassigned_id}
          ignore_person_id={this.state.ignore_person_id}
          updatePersonList={this.updatePersonList}
          updatePersonCounts={this.updatePersonCounts}
          onRenamePerson={this.openRenameModal}
          onRecordUndo={this.pushUndoable}
          refreshVersion={this.state.refreshVersion}
          galleryRef={this.galleryRef}
          possMediaFilter={this.state.possMediaFilter}
          onSetMediaFilter={this.setPossMediaFilter}
          unlabeled={this.state.unlabeled_toggle}
          only_unverified={this.state.only_unverified_toggle}
          selectedIndex={this.state.selectedIndex}
          reviewFlaggedOnly={this.state.reviewFlaggedOnly}
          reviewFlaggedUnverifiedOnly={this.state.reviewFlaggedUnverifiedOnly}
        />
      </div>
      );
    }

    if ( this.state.tab === "Folders" ){
      return (
      <div>
        <FolderSidebar folders={this.state.folders} setSource={this.setApiUrl} />
        <ImageScreen
          tab={this.state.tab}
          api_source={this.state.api_source}
          api_id={this.state.api_id}
          people={this.state.people}
          folders={this.state.folders}
          unlabeled={this.state.unlabeled_toggle}
          only_unverified={this.state.only_unverified_toggle}
          selectedIndex={this.state.selectedIndex}
        />
      </div>
      );
    }
      
    return <p>Unknown state</p>
    
  }

  render() {

    var {history} = this.props;
    return(

      
      <div>

        <Helmet>
          <title>Face Classifier</title>
        </Helmet>

        

        <React.Fragment>
          { this.state.loadError ? (
            <div className='spinBackground'>
              <div className="loader" style={{textAlign: 'center', color: '#333', maxWidth: '400px'}}>
                <p style={{fontSize: '18px', fontWeight: 'bold'}}>Something went wrong</p>
                <p>{this.state.loadError}</p>
              </div>
              <button className='logoutButton' onClick={this.retryInitialLoad}>Retry</button>
              <button className='logoutButton' onClick={this.logoutclick}>Logout</button>
            </div>
          ) : this.state.loading ? (
            <div className='spinBackground'>
              <div className="loader">
                <CircleLoader
                // css={override}
                size={250}
                color={"#993333"}
                loading={this.state.loading}
                />
              </div>
              <button className='logoutButton' onClick = {this.logoutclick} >Abort and Logout</button>
            </div>
            ) : (
            <div>
              <MenuExampleTabular
                tabSelectCallback = {this.tabSelectCallback}
                setToggle={this.setToggle}
                onLogout={this.props.onLogout}
                toggleState={{
                  unlabeled_toggle: this.state.unlabeled_toggle,
                  only_unverified_toggle: this.state.only_unverified_toggle,
                  face: this.state.face,
                  total: this.state.total,
                  t2: this.state.t2,
                }}
                canUndo={this.state.undoPointer >= 0 && !this.state.undoBusy}
                canRedo={this.state.undoPointer < this.state.undoStack.length - 1 && !this.state.undoBusy}
                onUndo={this.performUndo}
                onRedo={this.performRedo}
                undoLabel={this.state.undoPointer >= 0 ? this.state.undoStack[this.state.undoPointer].label : ''}
                redoLabel={this.state.undoPointer < this.state.undoStack.length - 1 ? this.state.undoStack[this.state.undoPointer + 1].label : ''}
                uploadingCount={this.state.uploads.filter(j => j.status === 'hashing' || j.status === 'uploading').length}
              />
              <div>
                {this.renderSidebar()}
              </div>

              {this.state.googlePhotosBanner && (
                <Message
                  positive={this.state.googlePhotosBanner.type === 'success'}
                  negative={this.state.googlePhotosBanner.type === 'error'}
                  onDismiss={() => this.setState({ googlePhotosBanner: null })}
                  content={this.state.googlePhotosBanner.message}
                  style={{ position: 'fixed', top: 90, right: 20, zIndex: 200, maxWidth: 320 }}
                />
              )}

              {this.state.undoError && (
                <Message
                  negative
                  onDismiss={() => this.setState({ undoError: '' })}
                  header="Undo/redo failed"
                  content={this.state.undoError}
                  style={{ position: 'fixed', top: 90, right: 20, zIndex: 200, maxWidth: 320 }}
                />
              )}

              {this.state.showRenameModal && (
                <RenameModal
                  initialValue={this.state.renameInitialValue}
                  error={this.state.renameError}
                  submitting={this.state.renameSubmitting}
                  onCancel={this.closeRenameModal}
                  onSubmit={this.submitRename}
                />
              )}

              {this.state.showMergeModal && (
                <MergeModal
                  people={this.state.people}
                  sourceId={this.state.mergeSourceId}
                  sourceName={this.state.mergeSourceName}
                  unassignedId={this.state.unassigned_id}
                  ignorePersonId={this.state.ignore_person_id}
                  error={this.state.mergeError}
                  submitting={this.state.mergeSubmitting}
                  progress={this.state.mergeProgress}
                  onCancel={this.closeMergeModal}
                  onSubmit={this.submitMerge}
                />
              )}
            </div>
            )
          }
        </React.Fragment>

      </div>
    );
  }
}


const handleLogout = history => () => {
  console.log("Logging out")
  store.remove('loggedIn');
  // history.push('/login');
  window.location = "/login"
};

export default PicasaScreen;
