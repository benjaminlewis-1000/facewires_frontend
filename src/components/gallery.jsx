import React from 'react';
import store from 'store';
import '../css/image_tile.css'
import LazyImage from './lazyImg'
import MutableSelect from './mutableSelect'
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
  rowButtonMode, rowButtonLabel, handleRowAction, imgsSelected, apiUrl, accessKey, imageKeyedType,
  editingFaceId, onEditComplete, ...tileProps }){
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
          url={apiUrl + '/keyed_image/' + imageKeyedType + '/?access_key=' + accessKey + '&id=' + face_id}
          index={itemIndex}
          face_id={face_id}
          type={type}
          forceEdit={editingFaceId === face_id}
          onEditComplete={onEditComplete}
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

  // Builds the {value, text, api_key, num_images} option list MutableSelect
  // searches through for "send to other person" - sorted most-to-least
  // photos, same as before. Pulled out into its own method (rather than
  // just constructor-local code) so componentDidUpdate below can rebuild
  // it when a new person shows up in this.props.people, not just at mount.
  buildPeopleOptions(people){
    var peopleOptions = []
    for (const [index, value] of people.entries()) {
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

    return peopleOptions
  }

  constructor(props){
    super(props);

    this.clickHandler = this.clickHandler.bind(this)
    this.doubleClickHandler = this.doubleClickHandler.bind(this)
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
      peopleOptions: this.buildPeopleOptions(this.props.people),
      lastClicked: -1,
      itemsVersion: 0,
      errorMessage: null,
      modalOpen: false,
      modalURL: "https://cdn.pixabay.com/photo/2016/05/24/16/48/mountains-1412683__340.png",
      // Position of the currently-open modal image within this.itemsRef -
      // lets the modal page back/forward through the folder without
      // closing (Folders tab only - see showAdjacentModalImage/render).
      // -1 means "nothing open"/not applicable.
      modalItemIndex: -1,
      // How many tiles fit per row at the gallery's current width - kept
      // in state (rather than just an instance field) because it drives
      // the row layout, so a change needs to trigger a re-render. Refined
      // for real once react-window reports the list's actual width via
      // handleListResize; 1 is just a safe non-zero placeholder for the
      // first paint.
      columnCount: 1,
      // Face id of the tile that should force itself into "send to other
      // person" edit mode (R hotkey, People tab "Only Unlabeled Faces"
      // view - see _handleKeyDown/startSendToOtherPerson). null means no
      // tile is being forced into edit mode via the keyboard.
      editingFaceId: null,
      // R hotkey while the modal is open (People tab, "Only Unlabeled
      // Faces" view) - mounts a MutableSelect directly in the modal for
      // the currently-open face, same idea as editingFaceId above but
      // for the modal's single image instead of a grid tile. See
      // _handleKeyDown/render.
      modalSendToOtherPerson: false,
    }

    this.api_action = this.api_action.bind(this)
    this.toggleModal = this.toggleModal.bind(this);
    this.showAdjacentModalImage = this.showAdjacentModalImage.bind(this);
    this.resolveModalFace = this.resolveModalFace.bind(this);
    this.startSendToOtherPerson = this.startSendToOtherPerson.bind(this);
    this.clearEditingFace = this.clearEditingFace.bind(this);
    this.openModalSendToOtherPerson = this.openModalSendToOtherPerson.bind(this);
    this.cancelModalSendToOtherPerson = this.cancelModalSendToOtherPerson.bind(this);
    this.finishModalSendToOtherPerson = this.finishModalSendToOtherPerson.bind(this);
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
    // Folder tiles are whole photos (ImageFile ids), not faces - Confirm
    // row/Verify row both fire face-specific bulk operations
    // (confirm_proposed/verify_face) that would silently misapply to
    // whatever unrelated Face row happens to share that numeric id. The
    // unlabeled/only_unverified toggle state is People-tab UI that simply
    // doesn't get reset on tab switch, so this can't be relied on alone.
    if (this.props.tab === 'Folders') return null
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
    // Page the open modal with the arrow keys - Folders tab only, same
    // scoping as the prev/next buttons themselves (see render).
    if (this.state.modalOpen && this.props.tab === 'Folders'){
      if (event.key === 'ArrowLeft'){
        event.preventDefault()
        this.showAdjacentModalImage(-1)
      }
      if (event.key === 'ArrowRight'){
        event.preventDefault()
        this.showAdjacentModalImage(1)
      }
      return
    }

    // C/X/Q resolve the face currently open in the modal, R opens a
    // "send to other person" search box in the modal itself - People
    // tab, "Only Unlabeled Faces" view only (that toggle is what limits
    // this gallery's tiles to proposed/possible matches - see
    // ImageScreen's componentDidUpdate - so every modal-openable tile
    // here is a real confirm/reject/ignore candidate). Q rather than I
    // for ignore, matching the grid's own C/X/Q/R hotkeys below - was I
    // here only because the modal hotkeys shipped before the grid ones
    // did. Same INPUT/TEXTAREA guard as picasaScreen.jsx's undo/redo
    // Ctrl+Z/Ctrl+Y handler, so this can't fire while typing in the
    // rename/merge/person-search boxes (including MutableSelect's own
    // box once R has opened it below).
    if (this.state.modalOpen && this.props.tab === 'People' && this.props.unlabeled){
      const tag = event.target && event.target.tagName
      if (tag !== 'INPUT' && tag !== 'TEXTAREA'){
        const key = event.key.toLowerCase()
        if (key === 'r' && !this.state.modalSendToOtherPerson){
          event.preventDefault()
          this.openModalSendToOtherPerson()
          return
        }
        const actionByKey = { c: 'confirm_proposed', x: 'close_assigned', q: 'close_unassigned' }
        if (actionByKey[key]){
          event.preventDefault()
          this.resolveModalFace(actionByKey[key])
          return
        }
      }
    }

    // Same C/X (plus Q for ignore, R for "send to other person") but for
    // a selected tile in the grid itself, modal closed - People tab,
    // "Only Unlabeled Faces" view only, same scoping as the modal block
    // above. Mirrors the existing Delete/Shift+R bulk-action pattern just
    // below (api_action called with no face_id operates on
    // this.state.imgsSelected as-is). R is checked without Shift so it
    // doesn't collide with the pre-existing Shift+R (close_assigned)
    // shortcut - event.key is the same 'R'/'r' either way once lower-
    // cased, only event.shiftKey tells them apart.
    if (!this.state.modalOpen && this.props.tab === 'People' && this.props.unlabeled && this.state.imgsSelected.length > 0){
      const tag = event.target && event.target.tagName
      if (tag !== 'INPUT' && tag !== 'TEXTAREA'){
        const key = event.key.toLowerCase()
        if (key === 'r' && !event.shiftKey){
          event.preventDefault()
          this.startSendToOtherPerson()
          return
        }
        const actionByKey = { c: 'confirm_proposed', x: 'close_assigned', q: 'close_unassigned' }
        if (actionByKey[key]){
          event.preventDefault()
          this.api_action(actionByKey[key])
          return
        }
      }
    }

    // Same reasoning as getRowButtonMode/isFolderTile above - Delete and
    // Shift+R both fire face-specific bulk operations, which would
    // silently misapply to an unrelated Face row if fired against a
    // folder tile's ImageFile id.
    if (this.props.tab === 'Folders') return

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

    // Rebuild peopleOptions when someone new shows up (or a merge removes
    // one) so a brand-new person created via one tile's "send to other
    // person" search immediately becomes searchable from every other
    // tile's, instead of only after a refetch/remount. Keyed on length,
    // not on props.people's own reference: PicasaScreen.updatePersonCounts
    // creates a new state.people array (via .map()) on every single bulk
    // face action - confirm, ignore, verify, all of it - to update
    // in-place count fields, without changing how many people there are.
    // Rebuilding+re-sorting peopleOptions (O(people count log people count))
    // on every one of those, for a library with hundreds/thousands of
    // people, would be real, unnecessary overhead on the single hottest
    // action in the app. A person being renamed still won't show its new
    // name in other tiles' dropdowns until remount either, for the same
    // reason - not fixed here since it wasn't reported and rebuilding on
    // every rename is cheap anyway (renames are rare) if that's wanted later.
    if (prevProps.people.length !== this.props.people.length){
      this.setState({ peopleOptions: this.buildPeopleOptions(this.props.people) })
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
    // Also drops any tile forced into "send to other person" edit mode
    // (R hotkey) - get_unique_list (called by both api_action and
    // MutableSelect's assignPerson) already routes through here on every
    // resolution, successful or not, so this is the one place that
    // reliably clears editingFaceId once its tile is no longer relevant.
    this.setState({imgsSelected: [], editingFaceId: null})
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
        // Same reasoning as close_assigned/close_unassigned's Unassigned
        // deltas elsewhere in this switch: confirm_proposed only ever
        // fires on 'proposed' tiles (see lazyImg.jsx - the checkmark
        // button only renders for that type), which still have
        // declared_name === Unassigned right up until associate_person()
        // moves them (api/views.py's bulk_thread). They were already
        // sitting in Unassigned's num_possibilities before this action,
        // so confirming them needs to debit Unassigned too - missing
        // this meant confirming a proposed candidate correctly grew the
        // target person's count but left Unassigned's sidebar number
        // stale (reported for the .ignore person specifically, but this
        // applied to confirming a candidate for any person).
        addDelta(unassigned_person_id, { num_possibilities: -n })
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
        // Faces actually moved into Unassigned here (the 'defined'
        // sub-case - associate_person(blank_person.id) on the backend,
        // when the face was declared to current_person_id) really do land
        // in Unassigned's review queue for the first time, so those count.
        // A 'proposed' face being rejected as a candidate for .ignore
        // specifically is different: reject_association() never touches
        // declared_name (see face_manager/models.py) - a face with .ignore
        // as a possible match already has declared_name === Unassigned, so
        // it was already sitting in Unassigned's count before this action,
        // not newly added to it. That's not true for rejecting a candidate
        // for any other (real) person - this delta was written for that
        // case, where the face becoming visible in Unassigned's queue
        // *is* new, so only skip it specifically when current_person_id is
        // .ignore.
        const newlyUnassignedCount = current_person_id === ignore_person_id ? definedCount : n
        addDelta(unassigned_person_id, { num_possibilities: newlyUnassignedCount })
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
          if (proposedCount) {
            addDelta(current_person_id, { num_possibilities: -proposedCount })
            // Same reasoning as close_assigned's newlyUnassignedCount
            // comment above: a 'proposed' face here still has
            // declared_name === Unassigned (reject_association()/soft
            // ignore never touches declared_name until it's actually
            // moved), so it was already sitting in Unassigned's own
            // num_possibilities before this action - missing this line
            // meant pressing "I" on a candidate from e.g. the modal
            // hotkeys or a normal proposed tile's context menu correctly
            // debited the specific person's count but silently left
            // Unassigned's sidebar number stale.
            addDelta(unassigned_person_id, { num_possibilities: -proposedCount })
          }
        }
        addDelta(ignore_person_id, { num_faces: n })
        break
      case 'close_ignored':
        // Same defined/proposed split as close_assigned/close_unassigned
        // above - this only ever fires while viewing the .ignore person
        // (gallery.jsx's Delete-key handler), but that gallery can show
        // both 'defined' tiles (already declared to .ignore, counted in
        // .ignore's num_faces) and 'proposed' tiles (possible-match
        // candidates for .ignore, counted in .ignore's num_possibilities
        // instead) - see lazyImg.jsx's ignore_tab comment. Decrementing
        // num_faces by the full n regardless used to silently corrupt
        // .ignore's num_faces count whenever a 'proposed' tile was
        // included (nothing had ever incremented it for that face).
        if (definedCount) addDelta(ignore_person_id, { num_faces: -definedCount })
        if (proposedCount) addDelta(ignore_person_id, { num_possibilities: -proposedCount })
        break
      case 'verify_face':
        addDelta(current_person_id, { num_unverified_faces: -n })
        break
      default:
        break
    }

    // Every tile in the ".ignore" "Flagged for review" gallery
    // (reviewFlaggedOnly, threaded from ImageScreen) is, by construction,
    // a 'proposed' .ignore candidate with mobile_review_hidden=True (the
    // backend's ?flagged=true filter - see picasa/api/views.py). Any
    // action taken here moves the face out of that pool one way or
    // another (confirmed, rejected, sent to Unassigned, hard-ignored),
    // so the sidebar's num_review_flagged count needs the same
    // decrement regardless of which action fired - this was previously
    // only reflected on the next 10-minute people-list poll.
    if (this.props.reviewFlaggedOnly && proposedCount){
      addDelta(ignore_person_id, { num_review_flagged: -proposedCount })
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

  // Used to debounce single-click selection against double-click-to-open,
  // by delaying every single click up to 250ms to see whether a second one
  // followed - meaning every click's visual highlight lagged behind the
  // actual mouse click by up to a quarter second, every time, even for a
  // genuine single click that no double-click was ever coming for. Browsers
  // already distinguish these natively (a real double-click fires two
  // `click` events immediately, back-to-back, *and* a separate `dblclick`
  // event) - selection now applies immediately on every click, with
  // clickHandler/doubleClickHandler wired to the two native events
  // separately instead of hand-timing them. A genuine double-click still
  // fires singleClick twice first (harmless - the second click, since the
  // tile's already selected from the first, just toggles it back off
  // before doubleClickHandler's own unselectAll()/modal-open runs), so the
  // end state is identical to before, just without the artificial delay.
  clickHandler(event, face_id, index) {
    event.preventDefault()
    return Promise.resolve(this.singleClick(event, face_id, index))
  }

  doubleClickHandler(event, face_id) {
    event.preventDefault()
    this.unselectAll()
    this.setState({
      modalURL: this.buildModalUrl(face_id),
      modalItemIndex: this.itemsRef.findIndex(([, id]) => id === face_id),
    })
    this.toggleModal()
  }


 toggleModal() {
    // Reset unconditionally - covers both closing (overlay click, Escape
    // via react-modal's own onRequestClose) leaving a stray
    // modalSendToOtherPerson=true that would otherwise show the search
    // box immediately the next time any modal opens, and opening (no-op,
    // already false).
    this.setState({modalOpen: !this.state.modalOpen, modalSendToOtherPerson: false});
  }

  // Folder tiles are ImageFile ids, not Face ids - face_source (which does
  // Face.objects.get(id=...)) would show an unrelated photo. full_big/
  // medium/small are pre-generated thumbnails capped at 500x500
  // (FILEPOPULATOR_THUMBNAIL_SIZE_BIG, picasa/settings.py) - too small for
  // a "full size" modal view. slideshow is the one KeyedImageView type
  // that actually opens the original file on disk (img_obj.filename, not
  // a pre-generated thumbnail) and live-resizes it, defaulting to
  // DEFAULT_RESOLUTION_HEIGHT (2160px/4K) rather than 500px - the closest
  // equivalent to face_source's live 700px resize of the source image,
  // just for a whole ImageFile instead of a single face.
  buildModalUrl(id){
    const modalType = this.props.tab === 'Folders' ? 'slideshow' : 'face_source'
    let url = store.get('api_url') + '/keyed_image/' + modalType + '/?id=' + id + '&access_key=' + store.get('access_key')
    // Verify-faces screen only - draws a box around the specific face
    // being reviewed (picasa/api/views.py's face_source highlight_box
    // param), scaled server-side to match its live resize. Doesn't apply
    // to Folders (slideshow has no single face in mind) or the People
    // tab generally - only where you're specifically deciding "is this
    // really the right face for this person," which is what
    // only_unverified is for.
    if (this.props.tab === 'People' && this.props.only_unverified){
      url += '&highlight_box=true'
    }
    return url
  }

  // Pages the open modal to the previous/next image in this.itemsRef
  // (delta -1/+1) without closing it. Folders-tab only (see render) -
  // itemsRef there is just the folder's photos in a fixed order (no
  // hidden/selection concept to account for, unlike the People tab), so
  // walking it directly by index is enough.
  showAdjacentModalImage(delta){
    const newIndex = this.state.modalItemIndex + delta
    if (newIndex < 0 || newIndex >= this.itemsRef.length) return
    const [, id] = this.itemsRef[newIndex]
    this.setState({ modalURL: this.buildModalUrl(id), modalItemIndex: newIndex })
  }

  // Resolves the face currently open in the modal (C/X/Q hotkeys - People
  // tab, "Only Unlabeled Faces" view only, see _handleKeyDown), then closes
  // the modal - this is an occasional action, not a review-queue workflow,
  // so per the user it should drop back to the grid rather than auto-
  // advance to the next face.
  resolveModalFace(actionType){
    if (this.state.modalItemIndex < 0) return
    const [, faceId] = this.itemsRef[this.state.modalItemIndex]
    this.api_action(actionType, faceId)
    this.setState({ modalOpen: false, modalItemIndex: -1, modalSendToOtherPerson: false })
  }

  // R hotkey while the modal is open - mounts a MutableSelect directly in
  // the modal (see render) for whichever face is currently open there,
  // startExpanded so it's immediately focused/typeable, same as the R
  // hotkey already does for a grid tile via startSendToOtherPerson below.
  openModalSendToOtherPerson(){
    if (this.state.modalItemIndex < 0) return
    this.setState({ modalSendToOtherPerson: true })
  }

  // Escape in the modal's search box (MutableSelect's onCancel) backs out
  // to just viewing the image again, same as it does for a grid tile -
  // doesn't close the modal itself.
  cancelModalSendToOtherPerson(){
    this.setState({ modalSendToOtherPerson: false })
  }

  // MutableSelect's setInvisible - fired once assignPerson has kicked off
  // the real API call(s) (get_unique_list, called at the top of
  // assignPerson, already hid the tile in the grid via setHidden). This
  // is an occasional action like C/X/Q above, so close the modal the same
  // way rather than leaving it open on a face that's already resolved.
  finishModalSendToOtherPerson(){
    this.setState({ modalOpen: false, modalItemIndex: -1, modalSendToOtherPerson: false })
  }

  // R hotkey (grid, not modal - People tab "Only Unlabeled Faces" view,
  // see _handleKeyDown). Forces whichever tile was most recently added to
  // the selection into MutableSelect's "send to other person" edit mode
  // (LazyImage's componentDidUpdate reacts to the forceEdit prop this
  // drives via otherAssignment - same local mechanism the right-click
  // menu's "Send to other person" already uses). Picking a person there
  // still resolves the *whole* current selection via the existing
  // get_unique_list/assignPerson bulk path - this only decides which
  // single tile visually hosts the dropdown.
  startSendToOtherPerson(){
    if (this.state.imgsSelected.length === 0) return
    const faceId = this.state.imgsSelected[this.state.imgsSelected.length - 1]
    this.setState({ editingFaceId: faceId })
  }

  clearEditingFace(){
    this.setState({ editingFaceId: null })
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
      // Folder tiles are ImageFile ids (whole photos), not Face ids -
      // face_array would do Face.objects.get(id=<image_id>) and show
      // whatever unrelated face happens to share that number. full_small
      // is a pre-generated 100x100 thumbnail, matching .img_thumb's own
      // 100px display width (image_tile.css) with no live resizing needed
      // server-side either.
      imageKeyedType: this.props.tab === 'Folders' ? 'full_small' : 'face_array',
      // Every face-specific bulk action (right-click menu, checkmark/x,
      // mutable_select) operates on what folder tiles actually hold - an
      // ImageFile id - as if it were a Face id. Rather than track down
      // every individual control, LazyImage suppresses all of them at
      // once behind this single flag.
      isFolderTile: this.props.tab === 'Folders',
      get_unique_list: this.get_unique_list,
      api_action: this.api_action,
      onApiError: this.handleApiError,
      setHidden: this.setHidden,
      onClick: this.clickHandler,
      onDoubleClick: this.doubleClickHandler,
      clearImagesSelected: this.clearImagesSelected,
      current_person_id: this.props.current_person_id,
      unassigned_person_id: this.props.unassigned_person_id,
      ignore_person_id: this.props.ignore_person_id,
      peopleOptions: this.state.peopleOptions,
      ignore_tab: this.props.current_person_id === this.props.ignore_person_id,
      only_unverified: this.props.only_unverified,
      reviewFlaggedOnly: this.props.reviewFlaggedOnly,
      updatePersonList: this.props.updatePersonList,
      updatePersonCounts: this.props.updatePersonCounts,
      onRecordUndo: this.props.onRecordUndo,
      unselectAll: this.unselectAll,
      onHighlightUpdated: this.props.onHighlightUpdated,
      editingFaceId: this.state.editingFaceId,
      onEditComplete: this.clearEditingFace,
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
          {this.props.tab === 'Folders' && (
            <button
              className='modalNavButton prev'
              disabled={this.state.modalItemIndex <= 0}
              onClick={() => this.showAdjacentModalImage(-1)}
              aria-label='Previous image'
            >
              &#8592;
            </button>
          )}
          <img
            src={this.state.modalURL}
            alt="Full size"
            className='modalImage'
          />
          {this.props.tab === 'Folders' && (
            <button
              className='modalNavButton next'
              disabled={this.state.modalItemIndex < 0 || this.state.modalItemIndex >= this.itemsRef.length - 1}
              onClick={() => this.showAdjacentModalImage(1)}
              aria-label='Next image'
            >
              &#8594;
            </button>
          )}
          {this.props.tab === 'People' && this.props.unlabeled && (
            this.state.modalSendToOtherPerson && this.state.modalItemIndex >= 0 ? (
              // R was just pressed - the same MutableSelect a grid tile's
              // R hotkey/right-click "Send to other person" mounts,
              // just hosted in the modal instead of a tile (see
              // openModalSendToOtherPerson/finishModalSendToOtherPerson/
              // cancelModalSendToOtherPerson above). get_unique_list
              // returns just this one face_id, since doubleClickHandler
              // already cleared imgsSelected when the modal opened.
              <div className='modalSendToPerson'>
                <MutableSelect
                  peopleOptions={this.state.peopleOptions}
                  get_unique_list={this.get_unique_list}
                  face_id={this.itemsRef[this.state.modalItemIndex][1]}
                  type={this.itemsRef[this.state.modalItemIndex][2]}
                  startExpanded={true}
                  current_person_id={this.props.current_person_id}
                  unassigned_person_id={this.props.unassigned_person_id}
                  ignore_person_id={this.props.ignore_person_id}
                  ignore_tab={this.props.current_person_id === this.props.ignore_person_id}
                  only_unverified={this.props.only_unverified}
                  reviewFlaggedOnly={this.props.reviewFlaggedOnly}
                  setInvisible={this.finishModalSendToOtherPerson}
                  onCancel={this.cancelModalSendToOtherPerson}
                  setHidden={this.setHidden}
                  updatePersonList={this.props.updatePersonList}
                  updatePersonCounts={this.props.updatePersonCounts}
                  onRecordUndo={this.props.onRecordUndo}
                  imgsSelected={this.state.imgsSelected}
                  clearImagesSelected={this.clearImagesSelected}
                  onApiError={this.handleApiError}
                />
              </div>
            ) : (
              <div className='modalHotkeyHint'>
                <span><kbd>C</kbd> Confirm</span>
                <span><kbd>X</kbd> Unassign</span>
                <span><kbd>Q</kbd> Ignore</span>
                <span><kbd>R</kbd> Other person</span>
              </div>
            )
          )}
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
