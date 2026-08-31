import React from 'react';
import { createPortal } from 'react-dom';
import { Dropdown} from 'semantic-ui-react';
import store from 'store';
import axiosInstance from './axios_setup'
import { withRetry } from './apiRetry';
import { assignFaceToPerson } from './faceActions';

// PureComponent so a re-render of the parent LazyImage (e.g. from the
// gallery-wide re-renders trackWindowScroll forces on scroll) doesn't
// force this - a real search input + dropdown, mounted on every tile on
// the Ignore/Unassigned tabs - to redo work when none of its own props
// actually changed. Only pays off because lazyImg.jsx now passes stable
// function references in (see its constructor) rather than fresh
// closures every render.
class MutableSelect extends React.PureComponent{
  constructor(props){
    super(props);

    this.state = {
      // Normally starts false: on the Unassigned/Ignore tabs, every
      // visible tile mounts a MutableSelect as its *default* state (see
      // lazyImg.jsx), so this placeholder-input gate defers mounting the
      // real search Dropdown (heavier - full option list) until the user
      // actually clicks in, rather than paying that cost for every tile
      // up front. startExpanded skips the gate: set by lazyImg.jsx only
      // when this instance was mounted on demand via an explicit "send
      // to other person" trigger (right-click menu or the R hotkey) -
      // there's exactly one such instance at a time, so there's no bulk
      // mount cost to defer, and the user has already signaled intent to
      // type immediately.
      loaded: !!props.startExpanded,
      visible: true,
      filterValue: '',
      listOrder: 0,
      opt_len: 100,
      // Whether the dropdown opens above the input instead of below -
      // see updateMenuPosition, called whenever the dropdown opens.
      openUpward: false,
      // Viewport-relative coordinates the portaled menu positions itself
      // at (position:fixed) - see updateMenuPosition/render. null until
      // the first time the menu opens.
      menuRect: null,
    }

    this.focusRef = React.createRef();
    // Positioning root for the dropdown menu (position:relative,
    // .person_select in image_tile.css) - measured in updateMenuPosition
    // to decide whether there's room to open downward, and to compute
    // where the portaled menu (see render) should sit on screen.
    this.wrapperRef = React.createRef();

    this.makeSearchList=this.makeSearchList.bind(this)
    this.makeSearchListNew=this.makeSearchListNew.bind(this)
    this.onChange=this.onChange.bind(this)
    this.keyPress=this.keyPress.bind(this)
    this.assignPerson=this.assignPerson.bind(this)
    this.keyDown=this.keyDown.bind(this)
    this.focusInput=this.focusInput.bind(this)
    this.clickList=this.clickList.bind(this)
    this.updateMenuPosition=this.updateMenuPosition.bind(this)

  }

  // The menu actually becomes visible either when `visible` flips true
  // (reopening after a blur) or when `loaded` flips true while `visible`
  // is already true (the very first open - `visible` defaults to true in
  // the constructor, so the first click just reveals it via `loaded`
  // rather than toggling `visible` itself). Catching both here, rather
  // than only calling updateMenuPosition from the input's onClick below,
  // is what makes the very first open of a given tile's dropdown flip
  // upward correctly instead of only correcting itself on a second open.
  //
  // Also adds/removes a window scroll listener while open: the menu is
  // portaled to document.body and positioned with position:fixed off
  // wrapperRef's on-screen coordinates (see render/updateMenuPosition) -
  // since it's no longer a normal descendant of the tile, it needs to be
  // told explicitly to re-measure as the page scrolls, rather than just
  // moving along with its old DOM position the way an absolutely
  // positioned in-tree element would have.
  // startExpanded mounts already "open" (loaded && visible both true from
  // the constructor - see there) - componentDidUpdate's wasOpen/isOpen
  // transition check below never sees that transition (there's no
  // prevState on an initial mount), so the portaled menu's position would
  // otherwise never get computed and it'd sit permanently display:none
  // (see menuStyle, render). Mirrors what componentDidUpdate does for the
  // normal click-to-open transition. The explicit focus() call is
  // belt-and-suspenders alongside the input's own `autoFocus` attribute
  // (render, below) - autoFocus is applied by React when the DOM node is
  // created, which is reliable on a real initial mount like this one, but
  // doesn't depend on that DOM-insertion timing being honored by every
  // browser/portal combination.
  componentDidMount(){
    if (this.props.startExpanded){
      this.updateMenuPosition()
      window.addEventListener('scroll', this.updateMenuPosition, true)
      window.addEventListener('resize', this.updateMenuPosition)
      if (this.focusRef.current) this.focusRef.current.focus()
    }
  }

  componentDidUpdate(prevProps, prevState){
    const wasOpen = prevState.visible && prevState.loaded
    const isOpen = this.state.visible && this.state.loaded
    if (isOpen && !wasOpen){
      this.updateMenuPosition()
      window.addEventListener('scroll', this.updateMenuPosition, true)
      window.addEventListener('resize', this.updateMenuPosition)
    } else if (!isOpen && wasOpen){
      window.removeEventListener('scroll', this.updateMenuPosition, true)
      window.removeEventListener('resize', this.updateMenuPosition)
    }
  }

  componentWillUnmount(){
    window.removeEventListener('scroll', this.updateMenuPosition, true)
    window.removeEventListener('resize', this.updateMenuPosition)
  }

  focusInput(){
    this.focusRef.current.focus()
  }

  // Decides whether the dropdown should open upward instead of downward,
  // based on actual room left in the viewport, and records the trigger
  // input's current on-screen position for the portaled menu (see
  // render) to place itself against - called whenever the dropdown opens
  // and, while it's open, on every scroll/resize (see componentDidUpdate)
  // so a portaled menu doesn't visually detach from its trigger input as
  // the page moves under it. Uses the CSS max-height (.personSelectMenu,
  // image_tile.css) as a stand-in for the menu's real height rather than
  // measuring the menu itself, since it may not have any options
  // rendered yet at the moment it opens.
  updateMenuPosition(){
    if (!this.wrapperRef.current) return
    const MENU_MAX_HEIGHT = 250
    const rect = this.wrapperRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const openUpward = spaceBelow < MENU_MAX_HEIGHT && spaceAbove > spaceBelow
    this.setState({
      openUpward,
      menuRect: { left: rect.left, width: rect.width, top: rect.bottom, bottom: window.innerHeight - rect.top },
    })
  }

  // get_unique_list(){

  //   var uniq_selected = [...new Set(this.props.imgsSelected)]
  //   const thisIdx = uniq_selected.indexOf(this.props.face_id)
  //   uniq_selected.splice(thisIdx, 1)
  //   uniq_selected = uniq_selected.concat(this.props.face_id)
  //   this.props.setHidden()
  //   this.setState({ignored: true}) 
  //   this.props.clearImagesSelected()

  //   return uniq_selected
  // }

// Which person/count the selected faces are coming FROM, for local
// bookkeeping. ignore_tab and the Unassigned tab both take priority over
// the item's own defined/proposed type since they represent a distinct tab
// context; otherwise the face is being reassigned away from the person
// whose gallery it's currently shown in.
sourceCountDelta(n){
  if (this.props.ignore_tab){
    // Same defined/proposed split as gallery.jsx's buildCountDeltas -
    // ignore_tab mixes 'defined' (declared to .ignore, counted in
    // num_faces) and 'proposed' (still-candidate, counted in
    // num_possibilities) tiles, so a single unconditional num_faces
    // delta here was wrong for a 'proposed' source (nothing had ever
    // incremented num_faces for it). Only surfaced now because
    // reviewFlaggedOnly's tiles are always 'proposed', which made the
    // bug visible while wiring up its own count below.
    const delta = { id: this.props.ignore_person_id }
    if (this.props.type === 'proposed'){
      delta.num_possibilities = -n
    }else{
      delta.num_faces = -n
    }
    // reviewFlaggedOnly's tiles (".ignore"'s "Flagged for review" row)
    // are always 'proposed' by construction - reassigning one away from
    // .ignore here removes it from that pool too, same as every other
    // action already handled in gallery.jsx's buildCountDeltas.
    if (this.props.reviewFlaggedOnly) delta.num_review_flagged = -n
    return delta
  }
  if (this.props.current_person_id === this.props.unassigned_person_id){
    return { id: this.props.unassigned_person_id, num_possibilities: -n }
  }
  if (this.props.type === 'proposed'){
    return { id: this.props.current_person_id, num_possibilities: -n }
  }
  const delta = { id: this.props.current_person_id, num_faces: -n }
  // Same reasoning as gallery.jsx's close_assigned fix: the verify
  // gallery (only_unverified) only ever shows currently-unverified
  // 'defined' faces, so sending one to another person here is
  // guaranteed to remove an unverified face - decrement that sidebar
  // count too. Can't do this unconditionally, since the same "send to
  // other person" action from a normal person gallery could be moving
  // an already-verified face.
  if (this.props.only_unverified) delta.num_unverified_faces = -n
  return delta
}

// Assign a single face to targetId, independent of the primary
// face_to_new_person/assign_face_to_person call above. Used for the rest
// of a bulk selection once the target person id is known.
confirmFace(faceId, targetId){
  assignFaceToPerson(faceId, targetId)
    .then(response => {})
    .catch(error => {
      console.log("Error in confirm_proposed", error)
    })
}

assignPerson(inputName, api_key, personExists){
  const uniq_selected = this.props.get_unique_list(this.props.face_id)
  console.log(uniq_selected)
  const n = uniq_selected.length
  const restSelected = uniq_selected.filter(faceId => faceId !== this.props.face_id)
  // Where these faces are coming FROM - reused both for the source-side
  // count delta below and, for undo/redo purposes, as the person id to
  // send them back to if this action gets undone.
  const priorPersonId = this.sourceCountDelta(n).id

  this.setState({visible:false})
  this.setState({value: inputName})

  if (!personExists){
    var new_person_url = store.get('api_url') + '/faces/' + this.props.face_id + '/face_to_new_person/'

    withRetry(() => axiosInstance.put(new_person_url, { person_name: inputName }))
      .then(response => {
        if (response.data.success){
          const new_id = response.data.new_id
          this.props.updatePersonList(inputName, new_id, n)
          this.props.updatePersonCounts && this.props.updatePersonCounts([this.sourceCountDelta(n)])

          // face_id itself became the new person via face_to_new_person;
          // the rest of the bulk selection needs to be assigned to it
          // explicitly, now that its real id is known.
          restSelected.forEach(faceId => this.confirmFace(faceId, new_id))

          this.props.onRecordUndo && this.props.onRecordUndo({
            kind: 'assign_to_person',
            label: `Sent ${n} face${n === 1 ? '' : 's'} to ${inputName}`,
            faceIds: uniq_selected,
            context: { priorPersonId, targetPersonId: new_id },
            // updatePersonList already set the new person's counts
            // directly (rather than via a delta) - this synthetic target
            // delta exists only so undo/redo has something symmetric to
            // negate/reapply against the new person's row.
            forwardDeltas: [this.sourceCountDelta(n), { id: new_id, num_faces: n, num_unverified_faces: n }],
          })
        }
      }).catch(error => {
        console.log("Error in confirm_proposed", error)
        this.props.onApiError && this.props.onApiError(`Couldn't create new person "${inputName}" — please try again.`)
      })
  }else{
    const forwardDeltas = [
      this.sourceCountDelta(n),
      { id: api_key, num_faces: n, num_unverified_faces: n }
    ]
    this.props.updatePersonCounts && this.props.updatePersonCounts(forwardDeltas)
    this.props.onRecordUndo && this.props.onRecordUndo({
      kind: 'assign_to_person',
      label: `Sent ${n} face${n === 1 ? '' : 's'} to ${inputName}`,
      faceIds: uniq_selected,
      context: { priorPersonId, targetPersonId: api_key },
      forwardDeltas,
    })

    assignFaceToPerson(this.props.face_id, api_key)
      .then(response => {
        console.log(response)
      }).catch(error => {
        console.log("Error in confirm_proposed", error)
        this.props.onApiError && this.props.onApiError(`Couldn't assign face to "${inputName}" — please try again.`)
      })

    restSelected.forEach(faceId => this.confirmFace(faceId, api_key))
  }
  this.props.setInvisible()
}

clickList(event, textValue, api_key){
  console.log("Clicklist")
  // this.assignPerson(textValue, api_key, true)
}

onChange(event){
   // event.persist();
  this.setState({filterValue: event.target.value})
}

keyPress(event, option){
  if (event.key === 'Enter'){
    if (option === undefined){
      this.assignPerson(event.target.value, -1, false)
    }else{
      this.assignPerson(option.text, option.api_key, true)
    }

  }else{
    // console.log("Enter", event )

  }

}

keyDown(event){

  if (event.key === "Escape"){
    // Stop this from bubbling further - when this box is mounted inside
    // the full-size image modal (R hotkey there - see gallery.jsx),
    // react-modal's own content <div> has its own onKeyDown that also
    // reacts to Escape (ModalPortal.js) and closes the *whole* modal.
    // Without this, Escape here both cancelled edit mode (below) AND
    // closed the modal a beat later via that ancestor handler - per the
    // user, Escape here should only back out of "send to other person"
    // and leave the larger image open.
    event.stopPropagation()
    event.target.blur()
    this.setState({visible: false})
    // Backs the tile all the way out of "send to other person" mode
    // (LazyImage.cancelOtherAssignment reverts state.type to its
    // original prop value) rather than just closing the option list -
    // in contexts where this select is always shown regardless of type
    // (the ignore tab), there's no mode to back out of, so this is a
    // harmless no-op there and closing the list is all Escape does.
    this.props.onCancel && this.props.onCancel()
    return
  }

  var re = new RegExp(this.state.filterValue, 'gi');
  var options = this.props.peopleOptions.filter(person => person.text.match(re))

  // console.log(event.key)
  if (event.key === "ArrowDown"){
    this.setState({listOrder: Math.min(options.length - 1, this.state.listOrder + 1)});
  }
  if (event.key === "ArrowUp"){
    this.setState({listOrder: Math.max(0, this.state.listOrder - 1)} ) ;
  }
        // }
}

listClick(inputName, api_key){
  console.log("Clicked on list.", api_key)
  this.setState({visible: false})
  this.assignPerson(inputName, api_key, true)
  // Basically, push this up to the lazyImg.
}

blur(){
  setTimeout(() => {  
    this.setState({visible: false});
  }, 200);
}

makeSearchListNew(){

  var optionList = []
  var re = new RegExp(this.state.filterValue, 'gi');
  console.log(this.props.peopleOptions)
  var options = this.props.peopleOptions.filter(person => person.text.match(re))

  for (const [index, value] of options.entries()) {
      if (index === this.state.listOrder){
        var className='selected item'
      }else{
        className='item'
      }
      optionList.push(
        // <div className={className} key={value.key} api_key={value.api_key} role='option' onClick={(e)=>this.clickList(e, value.text, value.api_key)}>
        <div className={className} key={value.key} api_key={value.api_key} onClick={e => this.listClick(value.text, value.api_key)} onBlur={() => {console.log("blur")}} >
          <span>{value.text}</span>
        </div>
      )
    } 
    
  // this.setState({opt_len: optionList.length})
  //menu transition
      //mutableMenu

  // Portaled straight onto document.body rather than nested in the tile
  // (its old spot, inside .person_select) - a bumped z-index alone
  // didn't fix tiles in lower rows visually ducking under a sibling
  // tile's own trigger box, which means some ancestor along the way was
  // trapping it inside its own stacking context (position:absolute +
  // z-index only wins against *siblings sharing that same context* - it
  // can't escape one). Portaling out to the body sidesteps needing to
  // find/fix that ancestor: this is now a direct child of <body>, in the
  // same top-level stacking context as everything else, positioned with
  // real viewport coordinates (position:fixed off wrapperRef's
  // getBoundingClientRect() - see updateMenuPosition) instead of
  // relying on being laid out relative to its old DOM parent.
  const menuStyle = this.state.menuRect ? {
    position: 'fixed',
    left: this.state.menuRect.left,
    width: this.state.menuRect.width,
    ...(this.state.openUpward
      ? { bottom: this.state.menuRect.bottom }
      : { top: this.state.menuRect.top }),
  } : { display: 'none' }

  return(

    <div className="ui active visible search selection dropdown person_select" ref={this.wrapperRef}>
      <input
        className='search'
        type='text'
        defaultValue=''
        autoFocus
        ref={this.focusRef}
        onClick={(e) => {
          console.log("Click")
          this.setState({visible: true});
          this.setState({value: ''})
          this.updateMenuPosition()
        }
        }
        onBlur={() => {this.blur()}}
        onKeyDown={(e)=>{this.keyDown(e)} }
        // onKeyUp={(e)=>{
        //   this.setState({listOrder: Math.min(this.state.listOrder - 1, 0)});
        // }}
        // ref={(input)=> console.log(input)}
        onChange={(e)=>{this.onChange(e)}}
        onKeyPress={(e)=>{this.keyPress(e, options[this.state.listOrder])}}
      />

      {createPortal(
        <div
          className={`personSelectMenu ${this.state.visible ? 'visible' : ''}`}
          style={menuStyle}
          role="listbox"
        >
          {optionList}
        </div>,
        document.body
      )}
    </div>
  )


}


  makeSearchList(){
    return(
      
<Dropdown
          className='person_select'
          placeholder='Select Person'
          search
          selection
          options={this.props.peopleOptions}
          searchInput={{ autoFocus: true }}
          onChange={(event, data) => this.props.onChange(event,data)}
          noResultsMessage={"Add new person"}
          // onAdd={console.log("add")}
          // allowAdditions={true}
          // hideAdditions={true}

        />
    )
  }


  makeChange(){
    if (this.state.loaded){
      return(
        this.makeSearchListNew()
          // <form>
          // <input type='text' value="Clicked" onClick={()=>this.setState({loaded: true}) }/>
          // </form>

        
      )
    }else{

      return (

          <form>
          <input type='text' className='ui active visible search selection dropdown person_select' onClick={()=>this.setState({loaded: true}) }/>
          </form>
      )
    }
  }


  render(){
    return(
      <span className='person_select'>
      {this.makeChange()}
      </span>
    )
  }

}

export default MutableSelect