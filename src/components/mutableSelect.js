import React from 'react';
import { Dropdown} from 'semantic-ui-react';
import store from 'store';
import axiosInstance from './axios_setup'

class MutableSelect extends React.Component{
  constructor(props){
    super(props);

    this.state = {
      loaded: false,
      visible: true,
      filterValue: '',
      listOrder: 0,
      opt_len: 100
    }

    this.focusRef = React.createRef();

    this.makeSearchList=this.makeSearchList.bind(this)
    this.makeSearchListNew=this.makeSearchListNew.bind(this)
    this.onChange=this.onChange.bind(this)
    this.keyPress=this.keyPress.bind(this)
    this.assignPerson=this.assignPerson.bind(this)
    this.keyDown=this.keyDown.bind(this)
    this.focusInput=this.focusInput.bind(this)
    this.clickList=this.clickList.bind(this)
    
  }  

  focusInput(){
    this.focusRef.current.focus()
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

assignPerson(inputName, api_key, personExists){
  const uniq_selected = this.props.get_unique_list()
  console.log(uniq_selected)
  console.log("Assigning person ", inputName, "Exists? " , personExists, "API KEY: ", api_key)

  this.setState({visible:false})
  this.setState({value: inputName})

  if (!personExists){
    console.log("Propagate new person back to master personList. ")
    console.error("On the backend, if the person 'doesn''t' exist, need to double check.")

    var new_person_url = store.get('api_url') + '/faces/' + this.props.face_id + '/face_to_new_person/'


    axiosInstance.put(new_person_url, {
      person_name: inputName
    })
    .then(response => {
      console.log(response)
      if (response.data.success){
        this.props.updatePersonList(inputName, response.data.new_id)
      }
    }).catch(error => {
      console.log("Error in confirm_proposed")
    })

  }else{
    var confirm_url = store.get('api_url') + '/faces/' + this.props.face_id + '/assign_face_to_person/'

    axiosInstance.patch(confirm_url, {
      declared_name_key: api_key
    })
    .then(response => {
      console.log(response)
    }).catch(error => {
      console.log("Error in confirm_proposed")
    })
  }
  this.props.setInvisible()


  function confirm(faceId){

    var confirm_url = store.get('api_url') + '/faces/' + faceId + '/assign_face_to_person/'

    axiosInstance.patch(confirm_url, {
      declared_name_key: api_key
    })
    .then(response => {
      // console.log(response)
    }).catch(error => {
      console.log("Error in confirm_proposed")
    })
  }

  uniq_selected.forEach(confirm)
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

    <div className="ui active visible search selection dropdown person_select">
      <input 
        className='search' 
        type='text'
        defaultValue=''
        autoFocus
        onClick={(e) => {
          console.log("Click")
          this.setState({visible: true});
          this.setState({value: ''})
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

      <div className={`${this.state.visible ? 'visible': ''}  menu transition`} role="listbox" >
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