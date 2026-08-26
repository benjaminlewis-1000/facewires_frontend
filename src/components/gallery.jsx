import React from 'react';
import store from 'store';
import '../css/image_tile.css'
import LazyImage from './lazyImg'
import { List } from 'react-window';
import Modal from "react-modal";
import { bulkFaceOperation } from './faceActions';
import { Message } from 'semantic-ui-react'; // already a dependency, used elsewhere (login.jsx)

// Tile/row-button sizing is declared once in image_tile.css (--tile-size /
// --row-button-width custom properties, see the comment there) and read
// here via getComputedStyle - single source of truth, so the JS row/column
// math below can't silently drift out of sync with the CSS. Read lazily
// (not at module-eval time, before the document may be ready) and cached
// at module scope, so later Gallery remounts within the same browser
// session (switching people/folders, etc.) reuse it instantly instead of
// re-reading getComputedStyle.
let cachedTileSize = null;
let cachedRowButtonWidth = null;

function readSizeVars(){
  if (cachedTileSize && cachedRowButtonWidth){
    return { tileSize: cachedTileSize, rowButtonWidth: cachedRowButtonWidth }
  }
  const styles = getComputedStyle(document.documentElement)
  const tileSize = parseFloat(styles.getPropertyValue('--tile-size')) || 150
  const rowButtonWidth = parseFloat(styles.getPropertyValue('--row-button-width')) || 28
  cachedTileSize = tileSize
  cachedRowButtonWidth = rowButtonWidth
  return { tileSize, rowButtonWidth }
}

// One row of the virtualized gallery grid - react-window (see Gallery's
// render() below) mounts/unmounts these as they scroll in and out of view,
// so only a couple screens' worth of .imgDiv tiles are ever live DOM nodes
// at once, regardless of how many faces are loaded overall. Kept as its
// own top-level component (not defined inline in render()) because
// react-window's rowComponent must be a referentially-stable component - a
// fresh function identity every render would remount every row, every
// render.
function GalleryRow({ index, style, ariaAttributes, rows, columnCount, tileSize, rowButtonWidth,
  rowButtonMode, rowButtonLabel, handleRowAction, imgsSelected, apiUrl, accessKey,
  ...tileProps }){
  const row = rows[index] || []
  const lastItem = row[row.length - 1]

  const gridTemplateColumns = rowButtonMode
    ? `repeat(${columnCount}, ${tileSize}px) ${rowButtonWidth}px`
    : `repeat(${columnCount}, ${tileSize}px)`

  return (
    <div className='galleryRow' style={{ ...style, gridTemplateColumns }} {...ariaAttributes}>
      {row.map(([itemIndex, face_id, type]) => (
        <LazyImage
          key={face_id}
          selected={imgsSelected.indexOf(face_id) >= 0}
          url={apiUrl + '/keyed_image/face_array/?access_key=' + accessKey + '&id=' + face_id}
          index={itemIndex}
          face_id={face_id}
          type={type}
          {...tileProps}
        />
      ))}
      {rowButtonMode && lastItem && (
        <button
          className='rowConfirmButton'
          style={{ gridColumn: columnCount + 1 }}
          onClick={() => handleRowAction(rowButtonMode, lastItem[1])}
        >
          {rowButtonLabel}
        </button>
      )}
    </div>
  )
}

class Gallery extends React.Component{

  constructor(props){
    super(props);
    var peopleOptions = []

    this.clickHandler = this.clickHandler.bind(this)
    this.get_unique_list = this.get_unique_list.bind(this)
    this.handleRowAction = this.handleRowAction.bind(this)
    // Imperative handle onto react-window's List - used by handleRowAction
    // to scroll back to the top after a row confirm/verify (see there).
    this.listRef = React.createRef()
    this.runBulkOperation = this.runBulkOperation.bind(this)
    this.handleListResize = this.handleListResize.bind(this)
    this.getRowButtonMode = this.getRowButtonMode.bind(this)

    const { tileSize, rowButtonWidth } = readSizeVars()
    this.tileSize = tileSize
    this.rowButtonWidth = rowButtonWidth

    for (const [index, value] of this.props.people.entries()) {
      peopleOptions.push({
        key: index,
        value: value.person_name,
        text: value.person_name,
        api_key: value.id,
        num_images: value.num_faces,
        shiftOn: false
      })
    }

    // Sort peopleOptions by number of images,
    // most to least.
    peopleOptions.sort(function(a, b) {
      return b.num_images - a.num_images
    });

    // Every loaded item across img_ids/poss_ids, as [combinedIndex, faceId,
    // type] triples - built once up front (buildItems) rather than trickled
    // in via infinite-scroll pagination, since ImageScreen already fetched
    // the *entire* id list before ever mounting a Gallery (see CLAUDE.md).
    // Virtualization (react-window's List, in render() below) is what
    // keeps the DOM small, not withholding data from itemsRef.
    this.itemsRef = []
    this._typeById = {}
    this.buildItems()

    this.state = {
      imgsSelected: [],
      hidden: [],
      peopleOptions: peopleOptions,
      lastClicked: -1,
      itemsVersion: 0,
      errorMessage: null,
      modalOpen: false,
      modalURL: "https://cdn.pixabay.com/photo/2016/05/24/16/48/mountains-1412683__340.png",
      // How many tiles fit per row at the gallery's current width - kept
      // in state (rather than just an instance field) because it drives
      // the row layout, so a change needs to trigger a re-render. Refined
      // for real once react-window reports the list's actual width via
      // handleListResize; 1 is just a safe non-zero placeholder for the
      // first paint.
      columnCount: 1,
    }

    // Tracks a still-pending single click waiting to see if a second one
    // follows (see clickHandler) - null when there's nothing pending.
    this.pendingClick = null
    this.api_action = this.api_action.bind(this)
    this.toggleModal = this.toggleModal.bind(this);
    this.setHidden = this.setHidden.bind(this);
    this.unselectAll = this.unselectAll.bind(this);
    this.clearImagesSelected = this.clearImagesSelected.bind(this);
    // Bound once (rather than a fresh arrow function every render) so
    // it's a stable reference - LazyImage is a PureComponent, and a fresh
    // function prop on every render defeated that memoization for every
    // tile, every render (worse on the Ignore/Unassigned tabs, where each
    // tile mounts a MutableSelect instead of a plain button).
    this.handleApiError = (msg) => this.setState({ errorMessage: msg })
  }

  // Builds itemsRef/_typeById from img_ids/poss_ids - see the constructor
  // comment above. Called again from componentDidUpdate if those props
  // actually change underneath an already-mounted Gallery (in practice
  // ImageScreen unmounts/remounts Gallery on every person/tab switch - see
  // its own `!this.state.loading` render gate - so this mostly won't fire,
  // but is cheap and correct to keep as a defensive fallback).
  buildItems(){
    const combined_list = this.props.img_ids.concat(this.props.poss_ids)
    const imgs_len = this.props.img_ids.length
    const items = []
    const typeById = {}

    for (let j = 0; j < combined_list.length; j++){
      const value = combined_list[j]
      let type
      if (this.props.current_person_id === this.props.unassigned_person_id){
        type = 'unassigned_tab'
      } else {
        type = j < imgs_len ? 'defined' : 'proposed'
      }
      items.push([j, value, type])
      typeById[value] = type
    }

    this.itemsRef = items
    this._typeById = typeById
  }

  componentDidMount(){
    document.addEventListener("keydown", this._handleKeyDown);
  }

  // Which row-action label (if any) this gallery shows - shared by
  // render() (to know whether/what to draw) and handleListResize (to know
  // whether a button's width needs to be reserved in the per-row column
  // count). See render() below for why the Unassigned tab is excluded.
  getRowButtonMode(){
    if (this.props.current_person_id === this.props.unassigned_person_id) return null
    if (this.props.unlabeled) return 'confirm'
    if (this.props.only_unverified) return 'verify'
    return null
  }

  // react-window's List reports its own rendered width/height here
  // whenever they change (mount, window resize, sidebar resize, etc.) -
  // replaces the old ResizeObserver-on-gridRef + measureTileWidth/
  // measureButtonWidth dance, since tile/button sizes are now known
  // synchronously up front (readSizeVars) and only the container's width
  // still needs to come from the live DOM.
  handleListResize({ width }){
    const reserved = this.getRowButtonMode() ? this.rowButtonWidth : 0
    const columns = Math.max(1, Math.floor((width - reserved) / this.tileSize))
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
    if (prevProps.img_ids !== this.props.img_ids ||
        prevProps.poss_ids !== this.props.poss_ids ||
        prevProps.current_person_id !== this.props.current_person_id){
      this.buildItems()
      this.setState(prevState => ({ itemsVersion: prevState.itemsVersion + 1 }))
    }
  }

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

    let definedCount = 0
    let proposedCount = 0
    faceIds.forEach(id => {
      if (this._typeById[id] === 'defined') definedCount++
      else if (this._typeById[id] === 'proposed') proposedCount++
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
        if (definedCount) {
          addDelta(current_person_id, { num_faces: -definedCount })
          // The verify gallery (only_unverified) only ever shows faces
          // that are currently unverified, so a 'defined' face removed
          // from here is guaranteed to be one - decrement the sidebar's
          // unverified count too. Can't do this unconditionally: the
          // same action fired from a normal person gallery could be
          // removing an already-verified face, which shouldn't touch
          // num_unverified_faces at all.
          if (this.props.only_unverified) addDelta(current_person_id, { num_unverified_faces: -definedCount })
        }
        if (proposedCount) addDelta(current_person_id, { num_possibilities: -proposedCount })
        addDelta(unassigned_person_id, { num_possibilities: n })
        break
      case 'close_unassigned':
        // "Send to ignore" is reachable from any face's context menu, not
        // just the Unassigned tab - it was always debiting
        // unassigned_person_id regardless of where the face actually came
        // from, so sending an already-declared face (e.g. from the verify
        // gallery) to ignore never touched current_person_id's num_faces/
        // num_unverified_faces at all. Same source-determination as
        // close_assigned just above.
        if (current_person_id === unassigned_person_id) {
          addDelta(unassigned_person_id, { num_possibilities: -n })
        } else {
          if (definedCount) {
            addDelta(current_person_id, { num_faces: -definedCount })
            if (this.props.only_unverified) addDelta(current_person_id, { num_unverified_faces: -definedCount })
          }
          if (proposedCount) addDelta(current_person_id, { num_possibilities: -proposedCount })
        }
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
    const deltas = this.buildCountDeltas(action_type, faceIds)

    if (this.props.updatePersonCounts){
      this.props.updatePersonCounts(deltas)
    }

    // Only 'close_unassigned' is recorded for undo/redo right now (see
    // CLAUDE.md / picasaScreen.jsx's undo stack). 'close_assigned' and
    // 'close_ignored' are themselves used as the *reverse* calls for other
    // undoable actions. 'confirm_proposed' *was* also recorded - its
    // reverse is 'close_assigned' - but that's the same operation already
    // suspected (CLAUDE.md's "Remove from person" bug) to return success
    // without actually persisting server-side: undoing a confirm looked
    // like it worked (the local count moved back) but a refresh showed the
    // face never actually left the person. Pulled from the undo stack
    // until that backend bug is fixed, same treatment 'verify_face'
    // already gets for having no trustworthy reverse.
    if (this.props.onRecordUndo && action_type === 'close_unassigned'){
      const label = `Sent ${faceIds.length} face${faceIds.length === 1 ? '' : 's'} to ignore`
      this.props.onRecordUndo({
        kind: action_type,
        label,
        faceIds: [...faceIds],
        context: { currentPersonId: current_person_id },
        forwardDeltas: deltas,
      })
    }

    this.setState(prevState => ({
      hidden: [...new Set(prevState.hidden.concat(faceIds))]
    }))

    bulkFaceOperation(action_type, faceIds, current_person_id)
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

  // Groups the currently-visible (non-hidden) items into rows of
  // state.columnCount tiles each - shared by render() (react-window pages
  // through these rows) and handleRowAction (to know which face_ids are
  // "up to and including" a given row). Memoized on (itemsRef, hidden,
  // columns) identity - itemsRef only changes wholesale (buildItems, on a
  // real person/tab switch), so a plain recompute-when-any-of-these-changed
  // cache is enough; no need for the incremental/append-only tail-only
  // path the old non-virtualized version needed; that existed to avoid
  // re-scanning the *entire* loaded list on every infinite-scroll page
  // load, which no longer happens at all now that react-window (not
  // manual pagination) decides what's actually rendered.
  computeVisibleRows(){
    const items = this.itemsRef
    const hidden = this.state.hidden
    const columns = Math.max(1, this.state.columnCount)
    const cache = this._visibleCache

    if (cache && cache.items === items && cache.hidden === hidden && cache.columns === columns){
      return { visible: cache.visible, rows: cache.rows }
    }

    const hiddenSet = new Set(hidden)
    const visible = items.filter(([, id]) => !hiddenSet.has(id))
    const rows = []
    for (let i = 0; i < visible.length; i += columns){
      rows.push(visible.slice(i, i + columns))
    }
    this._visibleCache = { items, hidden, columns, visible, rows }
    return { visible, rows }
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

    // Confirming/verifying "up to and including this row" hides everything
    // from the top of the gallery through the clicked row - the images
    // that used to be *below* it are now the new top of the list, but the
    // scroll container's scrollTop doesn't change on its own, so without
    // this the user would keep looking at whatever now happens to be at
    // that same pixel offset (a jarring, unrelated set of faces) instead
    // of picking up where they left off. Scroll back to row 0 so the
    // newly-topmost (formerly-next) images are immediately visible.
    if (this.listRef.current){
      this.listRef.current.scrollToRow({ index: 0, align: 'start', behavior: 'auto' })
    }
  }

  onDrop(event){
    console.log("Drop")
  }

  // Distinguishes a single click (select) from a double click (open the
  // full-size modal) on the same tile - tracks one pending click directly:
  // the first click starts a timer and remembers which face/when; if a
  // second click on the same face arrives before that timer fires, it's a
  // double-click - cancel the pending timer (so the single-click branch
  // never runs at all) and open the modal immediately.
  clickHandler(event, face_id, index) {
    event.persist()
    event.preventDefault()

    const now = new Date().getTime()
    const pending = this.pendingClick
    const isDoubleClick = pending && pending.face_id === face_id && (now - pending.time) < 250

    if (isDoubleClick) {
      window.clearTimeout(pending.timeoutId)
      this.pendingClick = null
      this.unselectAll()
      this.setState({modalURL: store.get('api_url') + '/keyed_image/face_source/?id=' + face_id + '&access_key=' + store.get('access_key') })
      this.toggleModal()
      return Promise.resolve([])
    }

    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        this.pendingClick = null
        const imgs_selected = this.singleClick(event, face_id, index)
        resolve(imgs_selected)
      }, 250)
      this.pendingClick = { face_id, time: now, timeoutId }
    })
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
    // getRowButtonMode above, also used by handleListResize.)
    const rowButtonMode = this.getRowButtonMode()
    const rowButtonLabel = rowButtonMode === 'confirm' ? 'Confirm row' : 'Verify row'

    // Everything a tile needs that's the same across every row - built
    // once per Gallery render (not per row/per tile) and handed to
    // react-window as rowProps, which forwards it to every GalleryRow.
    const rowProps = {
      rows,
      columnCount: columns,
      tileSize: this.tileSize,
      rowButtonWidth: this.rowButtonWidth,
      rowButtonMode,
      rowButtonLabel,
      handleRowAction: this.handleRowAction,
      imgsSelected: this.state.imgsSelected,
      apiUrl: store.get('api_url'),
      accessKey: store.get('access_key'),
      get_unique_list: this.get_unique_list,
      api_action: this.api_action,
      onApiError: this.handleApiError,
      setHidden: this.setHidden,
      onClick: this.clickHandler,
      clearImagesSelected: this.clearImagesSelected,
      current_person_id: this.props.current_person_id,
      unassigned_person_id: this.props.unassigned_person_id,
      ignore_person_id: this.props.ignore_person_id,
      peopleOptions: this.state.peopleOptions,
      ignore_tab: this.props.current_person_id === this.props.ignore_person_id,
      only_unverified: this.props.only_unverified,
      updatePersonList: this.props.updatePersonList,
      updatePersonCounts: this.props.updatePersonCounts,
      onRecordUndo: this.props.onRecordUndo,
      unselectAll: this.unselectAll,
      onHighlightUpdated: this.props.onHighlightUpdated,
    }

    return(

      <div className='imageScreen'>
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

        <List
          listRef={this.listRef}
          className='galleryGrid'
          style={{ height: 'calc(100vh - var(--screen-header-height) - var(--menu-bar-height) - 13px)' }}
          rowComponent={GalleryRow}
          rowCount={rows.length}
          rowHeight={this.tileSize}
          rowProps={rowProps}
          onResize={this.handleListResize}
          overscanCount={3}
        />
      </div>
    );

    }
}

export default Gallery
