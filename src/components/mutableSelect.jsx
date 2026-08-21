import React from 'react';
import { Dropdown} from 'semantic-ui-react';
import store from 'store';
import axiosInstance from './axios_setup'
import { withRetry } from './apiRetry';

class MutableSelect extends React.Component{
  constructor(props){
    super(props);

    this.state = {
      loaded: false,
      visible: true,
      filterValue: '',
      listOrder: 0,
      opt_len: 100,
      // Whether the dropdown opens above the input instead of below -
      // see updateMenuPosition, called whenever the dropdown opens.
      openUpward: false,
    }

    this.focusRef = React.createRef();
    // Positioning root for the dropdown menu (position:relative,
    // .person_select in image_tile.css) - measured in updateMenuPosition
    // to decide whether there's room to open downward.
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
  componentDidUpdate(prevProps, prevState){
    const wasOpen = prevState.visible && prevState.loaded
    const isOpen = this.state.visible && this.state.loaded
    if (isOpen && !wasOpen){
      this.updateMenuPosition()
    }
  }

  focusInput(){
    this.focusRef.current.focus()
  }

  // Decides whether the dropdown should open upward instead of downward,
  // based on actual room left in the viewport - called right as the
  // dropdown opens (the input's onClick below). Uses the CSS max-height
  // (.personSelectMenu, image_tile.css) as a stand-in for the menu's
  // real height rather than measuring the menu itself, since it may not
  // have any options rendered yet at the moment it opens.
  updateMenuPosition(){
    if (!this.wrapperRef.current) return
    const MENU_MAX_HEIGHT = 250
    const rect = this.wrapperRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const openUpward = spaceBelow < MENU_MAX_HEIGHT && spaceAbove > spaceBelow
    if (openUpward !== this.state.openUpward){
      this.setState({ openUpward })
    }
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
    return { id: this.props.ignore_person_id, num_faces: -n }
  }
  if (this.props.current_person_id === this.props.unassigned_person_id){
    return { id: this.props.unassigned_person_id, num_possibilities: -n }
  }
  if (this.props.type === 'proposed'){
    return { id: this.props.current_person_id, num_possibilities: -n }
  }
  return { id: this.props.current_person_id, num_faces: -n }
}

// Assign a single face to targetId, independent of the primary
// face_to_new_person/assign_face_to_person call above. Used for the rest
// of a bulk selection once the target person id is known.
confirmFace(faceId, targetId){
  var confirm_url = store.get('api_url') + '/faces/' + faceId + '/assign_face_to_person/'
  withRetry(() => axiosInstance.patch(confirm_url, { declared_name_key: targetId }))
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
        }
      }).catch(error => {
        console.log("Error in confirm_proposed", error)
        this.props.onApiError && this.props.onApiError(`Couldn't create new person "${inputName}" — please try again.`)
      })
  }else{
    var confirm_url = store.get('api_url') + '/faces/' + this.props.face_id + '/assign_face_to_person/'

    this.props.updatePersonCounts && this.props.updatePersonCounts([
      this.sourceCountDelta(n),
      { id: api_key, num_faces: n, num_unverified_faces: n }
    ])

    withRetry(() => axiosInstance.patch(confirm_url, { declared_name_key: api_key }))
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
  return(

    <div className="ui active visible search selection dropdown person_select" ref={this.wrapperRef}>
      <input
        className='search'
        type='text'
        defaultValue=''
        autoFocus
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

      <div
        className={`personSelectMenu ${this.state.visible ? 'visible' : ''} ${this.state.openUpward ? 'upward' : ''}`}
        role="listbox"
      >
        {optionList}
      </div>
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