import React from 'react';
// import { useCallback, useEffect } from 'react';
import { trackWindowScroll } from 'react-lazy-load-image-component';
import ReactDOM from 'react-dom';
import store from 'store';
import '../css/image_tile.css'
import LazyImage from './lazyImg'
import InfiniteScroll from "react-infinite-scroll-component";
import axiosInstance from './axios_setup'
import Modal from "react-modal";
import { withRetry } from './apiRetry';
import { Message } from 'semantic-ui-react'; // already a dependency, used elsewhere (login.jsx)

// A rendered .imgDiv tile's width, in px. Measured live off the DOM
// (see measureTileWidth) instead of hardcoded, so it can't drift out of
// sync with image_tile.css. Cached at module scope, outside the class,
// so once any Gallery instance has measured it, later remounts within
// the same browser session (switching people/folders, etc.) reuse it
// instead of re-measuring - it can't change without a page reload.
let cachedTileWidth = null;

// Same idea, for a rendered .rowConfirmButton's width - see
// measureButtonWidth.
let cachedButtonWidth = null;

// Same idea, for a rendered .imgDiv's height - see measureTileWidth.
// Kept separate from cachedTileWidth (rather than assumed equal, even
// though image_tile.css currently makes .imgDiv a 150x150 square) so
// row-button placement stays correct if that ever changes.
let cachedTileHeight = null;

class Gallery extends React.Component{

  constructor(props){
    super(props);
    var peopleOptions = []

    this.clickHandler = this.clickHandler.bind(this)
    this.get_unique_list = this.get_unique_list.bind(this)
    this.handleRowAction = this.handleRowAction.bind(this)
    this.runBulkOperation = this.runBulkOperation.bind(this)
    this.measureTileWidth = this.measureTileWidth.bind(this)
    this.measureButtonWidth = this.measureButtonWidth.bind(this)
    this.recomputeColumns = this.recomputeColumns.bind(this)
    this.ensureGridObserved = this.ensureGridObserved.bind(this)
    this.getRowButtonMode = this.getRowButtonMode.bind(this)
    this.gridRef = React.createRef()
    // Instance copy of the cached width, if one exists yet - not in
    // state, since changing it shouldn't by itself trigger a re-render
    // (recomputeColumns, below, is what actually updates state.columnCount).
    this.tileWidth = cachedTileWidth
    this.tileHeight = cachedTileHeight
    this.buttonWidth = cachedButtonWidth
    this.gridObserved = false

    for (const [index, value] of this.props.people.entries()) {
      peopleOptions.push({
        key: index,
        value: value.person_name,
        text: value.person_name,
        api_key: value.id,
        num_images: value.num_faces,
        // unassigned_person_id: this.props.unassigned_person_id,
        shiftOn: false
      })
    }

    // Sort peopleOptions by number of images,
    // most to least.
    peopleOptions.sort(function(a, b) {
      return b.num_images - a.num_images
    });


    this.state = {
      imgsSelected: [],
      hidden: [],
      peopleOptions: peopleOptions,
      shiftOn: false,
      lastClicked: -1,
      items: [],
      start_idx: 0,
      items_per_screen: 100,
      ready: false,
      more_to_load: true,
      combined_list: [],
      imgs_len: 0,
      errorMessage: null,
      modalOpen: false,
      modalURL: "https://cdn.pixabay.com/photo/2016/05/24/16/48/mountains-1412683__340.png",
      // How many tiles fit per row at the gallery's current width - kept
      // in state (rather than just an instance field) because it drives
      // where the row-confirm buttons render, so a change needs to
      // trigger a re-render. Refined for real once the grid is measured;
      // 1 is just a safe non-zero placeholder for the first paint.
      columnCount: 1,
    }


    this.clicks = [];
    this.last_face_id=-1
    this.api_action = this.api_action.bind(this)
    this.toggleModal = this.toggleModal.bind(this);
    this.setHidden = this.setHidden.bind(this);
    this.unselectAll = this.unselectAll.bind(this);
    this.clearImagesSelected = this.clearImagesSelected.bind(this);

      // this.handleKeyPress = useCallback((event) => {
      //   console.log(`Key pressed: ${event.key}`);
      // }, []);
  }  

  componentDidMount(){
    document.addEventListener("keydown", this._handleKeyDown);

    // ImageScreen only ever constructs a <Gallery> once its own fetches
    // have resolved (see imageScreen.jsx's `!this.state.loading` gate) -
    // so by the time this instance exists at all, this.props already
    // has good data. ready otherwise only gets set true from
    // componentDidUpdate below, which never fires on a first mount -
    // without this, a Gallery whose person never changes again after
    // the initial mount would stay stuck showing the "Loading"
    // placeholder in render() forever, since InfiniteScroll (and so
    // fetchMoreData) never even gets rendered until ready is true.
    this.setState({ ready: true })
    this.fetchMoreData()

    // Recompute columnCount whenever the grid's own rendered width
    // changes - window resizes, but also e.g. the sidebar changing width -
    // ResizeObserver watches the element itself rather than the window,
    // so it covers both without a separate window 'resize' listener.
    this.resizeObserver = new ResizeObserver(() => this.recomputeColumns())
    this.ensureGridObserved()

    if (this.tileWidth){
      // Already measured in an earlier session, this browser tab -
      // just need today's container width to get columnCount.
      this.recomputeColumns()
    }else{
      this.measureTileWidth()
    }
    this.measureButtonWidth()
  }

  componentWillUnmount(){
    if (this.resizeObserver){
      this.resizeObserver.disconnect()
    }
  }

  // state.ready starts false, so on first mount the grid div (and its
  // ref) don't exist yet - render() shows a "Loading" placeholder
  // instead (see below). componentDidMount's observe() call was
  // therefore silently a no-op on gridRef.current === null, and nothing
  // ever retried attaching it once the grid actually appeared, which is
  // why resizing/navigating stopped recalculating columns after the
  // first successful pass. Re-tried from componentDidUpdate below,
  // same as measureTileWidth already was, until it succeeds once.
  ensureGridObserved(){
    if (this.gridObserved || !this.gridRef.current || !this.resizeObserver) return
    this.resizeObserver.observe(this.gridRef.current)
    this.gridObserved = true
  }

  // Reads the actual rendered width of a live .imgDiv tile off the DOM,
  // rather than hardcoding a copy of image_tile.css's .imgDiv width -
  // that way this can't silently drift out of sync with the CSS if the
  // tile size ever changes there. No-ops if nothing's rendered yet
  // (state.items starts empty and fills in asynchronously) - re-tried
  // from componentDidUpdate below once items exist.
  measureTileWidth(){
    if (this.tileWidth || !this.gridRef.current) return

    const tile = this.gridRef.current.querySelector('.imgDiv')
    if (!tile) return

    const rect = tile.getBoundingClientRect()
    if (rect.width > 0){
      this.tileWidth = rect.width
      cachedTileWidth = rect.width
      this.tileHeight = rect.height
      cachedTileHeight = rect.height
      this.recomputeColumns()
    }
  }

  // Which row-action label (if any) this gallery shows - shared by
  // render() (to know whether/what to draw) and recomputeColumns (to
  // know whether a button's width needs to be reserved in the
  // per-row column count). See render() below for why the Unassigned
  // tab is excluded.
  getRowButtonMode(){
    if (this.props.current_person_id === this.props.unassigned_person_id) return null
    if (this.props.unlabeled) return 'confirm'
    if (this.props.only_unverified) return 'verify'
    return null
  }

  // Same idea as measureTileWidth, for a rendered .rowConfirmButton -
  // only relevant on galleries that actually show one (getRowButtonMode
  // truthy). Can't measure until a button has actually rendered once,
  // which itself needs a first (possibly slightly-too-wide) columnCount
  // guess from recomputeColumns - re-tried from componentDidUpdate below
  // until it succeeds, at which point recomputeColumns reruns and
  // self-corrects columnCount to the width-aware value.
  measureButtonWidth(){
    if (this.buttonWidth || !this.gridRef.current || !this.getRowButtonMode()) return

    const button = this.gridRef.current.querySelector('.rowConfirmButton')
    if (!button) return

    const width = button.getBoundingClientRect().width
    if (width > 0){
      this.buttonWidth = width
      cachedButtonWidth = width
      this.recomputeColumns()
    }
  }

  recomputeColumns(){
    if (!this.tileWidth || !this.gridRef.current) return

    // Reserve one button's worth of width per row on galleries that
    // show the row-action button, so the JS-computed row groupings
    // (computeVisibleRows/rowEndIds) match how many tiles the browser's
    // own float-wrap layout actually fits before the button - otherwise
    // the button spills onto its own line and misaligns everything
    // after it. Until buttonWidth is known, falls back to the
    // tile-only estimate; self-corrects once measureButtonWidth finds it.
    const reserved = this.getRowButtonMode() ? (this.buttonWidth || 0) : 0
    const containerWidth = this.gridRef.current.getBoundingClientRect().width
    const columns = Math.max(1, Math.floor((containerWidth - reserved) / this.tileWidth))
    if (columns !== this.state.columnCount){
      this.setState({ columnCount: columns })
    }
  }

  _handleKeyDown = (event) => {
    const cp = this.props.current_person_id
    const ip = this.props.ignore_person_id
    if (event.key == 'Delete'){
        console.log(event)

        // If on ignore tab: 
        if ( cp === ip ){
            console.log("Ignore tab")
            this.api_action('close_ignored')
        }else{
            console.log("Person tab")
        }
    }
    if (event.key === 'R' && event.shiftKey){
        console.log("Shift-r")
        this.api_action('close_assigned')
    }
  }
  


  componentDidUpdate(prevProps, prevState, snapshot){
    if (prevProps !== this.props){
      // console.log("Update gallery", this.props.img_ids)

      // this.setState({combined_list: this.props.img_ids.concat(this.props.poss_ids)})
      this.setState({imgs_len: this.props.img_ids.length})
      this.setState({ready: true})
      this.fetchMoreData()

      // this.forceUpdate()
    }

    // The grid div (and .imgDiv tiles inside it) render asynchronously -
    // state.ready starts false and state.items fills in via
    // fetchMoreData - so the calls made at mount time may have found
    // nothing yet. Keep retrying on each update until each succeeds
    // once; both bail out immediately on their own once already done.
    this.ensureGridObserved()
    if (!this.tileWidth){
      this.measureTileWidth()
    }
    if (!this.buttonWidth){
      this.measureButtonWidth()
    }
  }

  // useEffect(handleKeyPress) {
  //   // attach the event listener
  //   document.addEventListener('keydown', handleKeyPress);

  //   // remove the event listener
  //   return () => {
  //     document.removeEventListener('keydown', handleKeyPress);
  //   };
  // }

  singleClick(event, face_id, index){
    console.log(face_id)
    
    var idxToIdMap = this.props.img_ids.concat(this.props.poss_ids)

    var indexIfInList = this.state.imgsSelected.indexOf(face_id)
    // console.log(indexIfInList)

    var imagesSelected = this.state.imgsSelected
    console.log(this.state.lastClicked, index)

    var startIdx = -1
    if (event.shiftKey){
      if (this.state.lastClicked === -1){
        startIdx = index
        this.setState({lastClicked: index})
        imagesSelected = [face_id]
      }
      else {
        var newlySelected = []
        startIdx = this.state.lastClicked
        if (index < startIdx){
          var endIndex = startIdx
          startIdx = index
        }else{
          endIndex = index
        }
        for (var i = startIdx; i <= endIndex; i++){
          if (this.state.hidden.indexOf(idxToIdMap[i]) < 0){
            newlySelected.push(idxToIdMap[i])
          }
          // console.log(this.state.hidden.indexOf(idxToIdMap[i]) >= 0)
          // console.log(idxToIdMap[i])
          // console.log(this.state.hidden)
        }
        console.log(newlySelected)
        imagesSelected = imagesSelected.concat(newlySelected)
      }
    }else{
    
      if (indexIfInList >= 0){
        imagesSelected.splice(indexIfInList, 1)
      }else{
        // console.log("Not in list", this.state.imgsSelected)
        if (event.ctrlKey) {
          imagesSelected = imagesSelected.concat([face_id])
          // this.setState({imgsSelected: this.state.imgsSelected.concat([face_id])})
        }else{
          imagesSelected =  [face_id]
          // this.setState({imgsSelected:})
        }
      }

      this.setState({lastClicked: index})
    }
        // this.setState({imgsSelected: newState})
    this.setState({imgsSelected: imagesSelected})
    return imagesSelected
  }

  clearImagesSelected(){
    this.setState({imgsSelected: []})
  }

  unselectAll(){
    this.setState({imgsSelected: []})
    this.setState({lastClicked: -1})
  }


  ///////////////////////////////////////////
  // API calls
  ///////////////////////////////////////////

  
  get_unique_list(added_id){

    var uniq_selected = [...new Set(this.state.imgsSelected)]
    this.setHidden(added_id)
    this.clearImagesSelected()
    
    if (added_id !== undefined){
        const thisIdx = uniq_selected.indexOf(added_id)
        uniq_selected.splice(thisIdx, 1)
        uniq_selected = uniq_selected.concat(added_id)
    }

    return uniq_selected
  }


  // Build {id -> deltas} for the local people-count bookkeeping, based on
  // which action fired and whether the affected faces were 'defined'
  // (already confirmed to current_person) or 'proposed' (a possible match).
  // See CLAUDE.md / conversation with the user for the agreed semantics.
  buildCountDeltas(action_type, faceIds){
    const current_person_id = this.props.current_person_id
    const unassigned_person_id = this.props.unassigned_person_id
    const ignore_person_id = this.props.ignore_person_id

    const typeById = {}
    this.state.items.forEach(([, id, type]) => { typeById[id] = type })

    let definedCount = 0
    let proposedCount = 0
    faceIds.forEach(id => {
      if (typeById[id] === 'defined') definedCount++
      else if (typeById[id] === 'proposed') proposedCount++
    })
    const n = faceIds.length

    const deltas = []
    const addDelta = (id, fields) => {
      if (id === undefined || id === null) return
      let entry = deltas.find(d => d.id === id)
      if (!entry) { entry = { id }; deltas.push(entry) }
      for (const [k, v] of Object.entries(fields)) entry[k] = (entry[k] || 0) + v
    }

    switch (action_type){
      case 'confirm_proposed':
        addDelta(current_person_id, { num_possibilities: -n, num_faces: n, num_unverified_faces: n })
        break
      case 'close_assigned':
        if (definedCount) addDelta(current_person_id, { num_faces: -definedCount })
        if (proposedCount) addDelta(current_person_id, { num_possibilities: -proposedCount })
        addDelta(unassigned_person_id, { num_possibilities: n })
        break
      case 'close_unassigned':
        addDelta(unassigned_person_id, { num_possibilities: -n })
        addDelta(ignore_person_id, { num_faces: n })
        break
      case 'close_ignored':
        addDelta(ignore_person_id, { num_faces: -n })
        break
      case 'verify_face':
        addDelta(current_person_id, { num_unverified_faces: -n })
        break
      default:
        break
    }

    return deltas
  }

  api_action(action_type, face_id){
    console.log("Action Triggered: ", action_type, face_id)

    var action_valid = ['close_unassigned', 'close_ignored', 'close_assigned', 'confirm_proposed', 'verify_face'].includes(action_type)
    if (!action_valid) {
      console.error("Invalid action_type passed to api_action: ", action_type);
      return;
    }

    const uniq_selected = this.get_unique_list(face_id)
    this.unselectAll()
    this.runBulkOperation(action_type, uniq_selected)
  }

  // Shared tail end of every bulk face operation: apply the local
  // people-count deltas, mark the affected faces hidden so they
  // disappear from the grid immediately, then fire the real PATCH.
  // Used both by api_action (single/multi-select actions driven by
  // click-selection) and handleRowAction below (row-level bulk actions,
  // which arrive with an explicit face_id list rather than one built
  // from click-selection state).
  runBulkOperation(action_type, faceIds){
    if (!faceIds || faceIds.length === 0) return

    const current_person_id = this.props.current_person_id

    if (this.props.updatePersonCounts){
      this.props.updatePersonCounts(this.buildCountDeltas(action_type, faceIds))
    }

    this.setState(prevState => ({
      hidden: [...new Set(prevState.hidden.concat(faceIds))]
    }))

    var bulk_patch_url = store.get('api_url') + '/faces/bulk_operation/';
    var data_list = {
      face_id_list: faceIds,
      operation: action_type,
      current_person_id: current_person_id
    };

    withRetry(() => axiosInstance.patch(bulk_patch_url, data_list), { retries: 3, delayMs: 1000 })
      .then(response => {
        console.log(response)
      })
      .catch(error => {
        console.log("Error in bulk operation " + action_type + " " + error)
        this.setState({
          errorMessage: `"${action_type.replace('_', ' ')}" didn't go through after a few tries — please try again.`
        })
      })
  }

  // Groups the currently-visible (non-hidden) items into rows the same
  // way the browser's float-wrap layout does, using state.columnCount
  // (see recomputeColumns/measureTileWidth above). Shared by render()
  // (to know where to draw a row-action button) and handleRowAction
  // (to know which face_ids are "up to and including" a given row).
  //
  // Memoized: render() (and therefore this) runs on every scroll event
  // via trackWindowScroll, but items/hidden/columnCount - the only
  // things that actually affect the result - change far less often than
  // that. Caching on those three (items/hidden compared by reference,
  // since state always replaces them with a new array rather than
  // mutating in place) skips redoing this O(n) work on the many renders
  // where none of them changed.
  computeVisibleRows(){
    const { items, hidden, columnCount } = this.state
    const cache = this._rowsCache
    if (cache && cache.items === items && cache.hidden === hidden && cache.columnCount === columnCount){
      return cache.result
    }

    const hiddenSet = new Set(hidden)
    const visible = items.filter(([, id]) => !hiddenSet.has(id))
    const columns = Math.max(1, columnCount)

    // Actual row groupings (chunks of `columns` items each, last row may
    // be shorter) - used by render() to place the row-action button at a
    // fixed slot per row (see render()'s button positioning) rather than
    // right after however many tiles happen to be in that row.
    const rows = []
    for (let i = 0; i < visible.length; i += columns){
      rows.push(visible.slice(i, i + columns))
    }

    const result = { visible, rows }
    this._rowsCache = { items, hidden, columnCount, result }
    return result
  }

  // mode is 'confirm' (unlabeled-faces gallery - bulk confirm_proposed)
  // or 'verify' (unverified-faces gallery - bulk verify_face). Both are
  // wired to the real API via runBulkOperation.
  handleRowAction(mode, rowEndFaceId){
    const { visible } = this.computeVisibleRows()
    const uptoIndex = visible.findIndex(([, id]) => id === rowEndFaceId)
    if (uptoIndex === -1) return

    // 'confirm' targets the row's still-proposed (checkmark/x) faces -
    // 'defined' ones aren't proposals, nothing to confirm. 'verify'
    // targets its 'defined' faces - only_unverified already scopes the
    // fetched 'defined' faces server-side to unverified ones, so
    // type === 'defined' here already means "needs verifying".
    const relevantType = mode === 'confirm' ? 'proposed' : 'defined'
    const faceIds = visible
      .slice(0, uptoIndex + 1)
      .filter(([, , type]) => type === relevantType)
      .map(([, id]) => id)

    if (faceIds.length === 0) return

    const action_type = mode === 'confirm' ? 'confirm_proposed' : 'verify_face'
    this.runBulkOperation(action_type, faceIds)
  }

  onDrop(event){
    console.log("Drop")
  }

  clickHandler(event, face_id, index) {
    
        event.persist()
        event.preventDefault();
        this.clicks.push(new Date().getTime());
        var timeout
        window.clearTimeout(timeout);
        var sameFace = (this.last_face_id === face_id)
        this.last_face_id = face_id

        let promiseA = new Promise((resolve, reject) => {
          timeout = window.setTimeout(() => {
              if (this.clicks.length > 1 && this.clicks[this.clicks.length - 1] - this.clicks[this.clicks.length - 2] < 250 && sameFace) {
                // doubleClick(event.target);
                console.log("double")
                this.setState({modalURL: store.get('api_url') + '/keyed_image/face_source/?id=' + face_id + '&access_key=' + store.get('access_key') })
                this.clicks = []
                this.toggleModal()
                resolve([])
              } else {
                // console.log("singleClick")
                var imgs_selected = this.singleClick(event, face_id, index);
                this.clicks = []
                // console.log('image select: ', imgs_selected)
                resolve(imgs_selected)
              }
              //  else{
              //   this.clicks = []
              //   resolve(this.state.imgsSelected)
              // }
          }, 250);
        })
        return promiseA
        // return Promise.resolve("asdf");
    }


 toggleModal() {
    this.setState({modalOpen: !this.state.modalOpen});
  }

  setHidden(current_selected_id){
    // console.log("Set hidden", this.state.imgsSelected, current_selected_id)
    var uniq_selected = [...new Set(this.state.imgsSelected.concat(this.state.hidden).concat([current_selected_id]))]
    // console.log("Setting hidden " + uniq_selected)
    this.setState({hidden: uniq_selected})
  }

  fetchMoreData = () => {
      // TODO(perf, low priority): this.state.items.concat(concatItems) below
      // rebuilds the whole accumulated items array on every page load, so
      // cost grows ~quadratically with total images loaded (see CLAUDE.md
      // "Known perf issue" notes). Doesn't affect correctness - confirm/verify
      // row actions still see every loaded item regardless of scroll position.
      //
      // Cheap runaway-loop tripwire: fetchMoreData should only fire on
      // real scroll/pagination events, at most a handful of times a
      // second. If something (e.g. InfiniteScroll's own visibility
      // detection getting confused by the row layout) starts calling it
      // back-to-back with no gap, this surfaces it immediately instead
      // of just presenting as "the page is slow."
      const now = performance.now()
      const sinceLast = this._lastFetchAt ? Math.round(now - this._lastFetchAt) : null
      this._lastFetchAt = now
      if (sinceLast !== null && sinceLast < 16){
        console.warn(`[Gallery ${this.props.current_person_id}] fetchMoreData firing faster than one frame (${sinceLast}ms) - likely runaway loop`)
      }

      var combined_list = this.props.img_ids.concat(this.props.poss_ids)

      var start = this.state.start_idx
      var end = Math.min(start + this.state.items_per_screen, combined_list.length)
      this.setState({start_idx: end})

      var concatItems = [];
      var imgs_len = this.props.img_ids.length

      for (var j = start; j < end; j++){
        var value = combined_list[j]
        if (this.props.current_person_id === this.props.unassigned_person_id){
          var type = 'unassigned_tab'
        }else{
          if (j < imgs_len){
             type = 'defined'
          }else{
            type = 'proposed'
          }
        }
        concatItems.push([j, value, type])
      }

      this.setState({
        items: this.state.items.concat(concatItems)
      });

      if (end === combined_list.length){
        this.setState({more_to_load: false})
      }
  };

  render(){
    const { rows } = this.computeVisibleRows()
    const columns = Math.max(1, this.state.columnCount)

    // Row-action button only makes sense on the two toggle-driven
    // galleries it's meant for - unlabeled faces (bulk-confirm the
    // proposed/checkmark-x rows) and unverified faces (bulk-verify the
    // still-unverified defined rows) - and never on the Unassigned tab,
    // whose tiles are a different type ('unassigned_tab') entirely.
    // picasaScreen.jsx already keeps these two toggles mutually
    // exclusive, so at most one of these is ever true. (See
    // getRowButtonMode above, also used by recomputeColumns.)
    const rowButtonMode = this.getRowButtonMode()
    const rowButtonLabel = rowButtonMode === 'confirm' ? 'Confirm row' : 'Verify row'

    return(

      <div className='imageScreen'>
      {this.state.ready ? (

        <>
          {this.state.errorMessage && (
            <Message
              negative
              onDismiss={() => this.setState({ errorMessage: null })}
              header="Action failed"
              content={this.state.errorMessage}
              style={{ position: 'fixed', top: 90, right: 20, zIndex: 200, maxWidth: 320 }}
            />
          )}
          <Modal
            isOpen={this.state.modalOpen}
            onRequestClose={this.toggleModal}
            contentLabel="My dialog"
            className="Modal"
            overlayClassName="Overlay"
            shouldCloseOnOverlayClick={true}
          >
            <img
              src={this.state.modalURL}
              alt="Full size"
              className='modalImage'
            />
          </Modal>

          <InfiniteScroll
            dataLength={this.state.items.length}
            next={this.fetchMoreData}
            hasMore={this.state.more_to_load}
            loader={<h4>Loading...</h4>}
          >
            {/* Wraps the floated .imgDiv tiles so their combined height
                doesn't collapse to 0 (a plain float-clearfix issue) - also
                doubles as the element measureTileWidth/recomputeColumns
                observe to figure out row layout. */}
            {/* TODO(perf, low priority): no virtualization here - every
                loaded tile stays mounted as a live <img> even once scrolled
                far out of view, so long scroll sessions accumulate real
                memory/render cost. See CLAUDE.md "Known perf issue" notes. */}
            <div className='galleryGrid' ref={this.gridRef}>
              {this.state.items.map( x_val =>
                <LazyImage
                  key={x_val[1]}
                  selected={this.state.imgsSelected.indexOf(x_val[1]) >= 0}
                  // imgsSelected={this.state.imgsSelected}
                  get_unique_list={this.get_unique_list}
                  hidden={this.state.hidden.indexOf(x_val[1]) >= 0}
                  api_action={this.api_action}
                  onApiError={(msg) => this.setState({ errorMessage: msg })}
                  setHidden={this.setHidden}
                  url={store.get('api_url') + '/keyed_image/face_array/?access_key='
                      + store.get('access_key') + '&id=' + x_val[1] }
                  index={x_val[0]}
                  scrollPosition={this.props.scrollPosition}
                  // onClick={ (e) => this.clickHandler(e,  x_val[1], x_val[0]) }
                  onClick={this.clickHandler}
                  clearImagesSelected={this.clearImagesSelected}
                  face_id={x_val[1]}
                  type={x_val[2]}
                  current_person_id={this.props.current_person_id}
                  unassigned_person_id={this.props.unassigned_person_id}
                  ignore_person_id={this.props.ignore_person_id}
                  peopleOptions={this.state.peopleOptions}
                  ignore_tab={this.props.current_person_id === this.props.ignore_person_id}
                  updatePersonList={this.props.updatePersonList}
                  updatePersonCounts={this.props.updatePersonCounts}
                  unselectAll={this.unselectAll}
                  onHighlightUpdated={this.props.onHighlightUpdated}
                />
              )}
              {/* Row-action buttons are pinned to a fixed slot per row
                  (same left/top for every row) rather than floated right
                  after however many tiles that row happens to have - so
                  the button never moves, even on a short/partial row,
                  saving the mouse trip. Absolutely positioned within
                  .galleryGrid (position:relative in image_tile.css),
                  outside the tiles' float flow - recomputeColumns still
                  reserves buttonWidth of empty space per row so this
                  never overlaps the last tile. */}
              {rowButtonMode && this.tileWidth && this.tileHeight && rows.map((row, rowIndex) => {
                const lastItem = row[row.length - 1]
                if (!lastItem) return null
                return (
                  <button
                    key={`row-btn-${lastItem[1]}`}
                    className='rowConfirmButton'
                    style={{ left: columns * this.tileWidth, top: rowIndex * this.tileHeight }}
                    onClick={() => this.handleRowAction(rowButtonMode, lastItem[1])}
                  >
                    {rowButtonLabel}
                  </button>
                )
              })}
            </div>
          </InfiniteScroll>
        </>

    ):(
      <div> Loading </div>
    )
      }
        </div>
    );

    }
}

export default trackWindowScroll(Gallery)
