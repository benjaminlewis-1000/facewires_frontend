import React from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import MutableSelect from './mutableSelect'
import store from 'store';
import { ContextMenu, MenuItem, ContextMenuTrigger } from "react-contextmenu";
import axiosInstance from './axios_setup'
// import { Menu, MenuItem } from '@progress/kendo-react-layout';
// import { Popup } from '@progress/kendo-react-popup';



class LazyImage extends React.Component{
  constructor(props){
    super(props);
    console.log("Construct")

    this.state = {
      loaded: false,
      ignored: false,
      type: this.props.type,
    }

    this.close_unassigned = this.close_unassigned.bind(this)
    this.close_assigned = this.close_assigned.bind(this)
    this.confirm_proposed = this.confirm_proposed.bind(this)
    this.localClick = this.localClick.bind(this)
    this.otherAssignment = this.otherAssignment.bind(this)
    this.verifyFace = this.verifyFace.bind(this)
    this.set_as_thumbnail = this.set_as_thumbnail.bind(this)
    this.get_unique_list = this.get_unique_list.bind(this)
    
  }

  //  componentDidUpdate(prevProps, prevState, snapshot){
  //    // if (prevProps !== this.props){
  //      console.log("Update lazy image")
  //      // this.forceUpdate()
  //    // }
  //  }
 
  // shouldComponentUpdate(nextProps, nextState){
  //   console.log("Should it? ")
  //   return this.props.selected!==nextProps.selected;
  // }

  // componentDidUpdate(prevProps, prevState, snapshot) {
  //  console.log("Recieved")
  // }

  get_unique_list(){

    var uniq_selected = [...new Set(this.props.imgsSelected)]
    const thisIdx = uniq_selected.indexOf(this.props.face_id)
    uniq_selected.splice(thisIdx, 1)
    uniq_selected = uniq_selected.concat(this.props.face_id)
    this.props.setHidden(this.props.face_id)
    this.setState({ignored: true}) 

    console.log(uniq_selected)
    this.props.clearImagesSelected()
    return uniq_selected
  }

  close_unassigned(){

    const uniq_selected = this.get_unique_list()

    function softIgnore(faceId){
      var ignore_url = store.get('api_url') + '/faces/' + faceId + '/ignore_face/'
      // console.log(faceId, ignore_url)
      // var ignore_url = store.get('api_url') + '/faces/' + this.props.face_id + '/ignore_face/'
      axiosInstance.put(ignore_url, {
          ignore_type: 'soft'
      })
      .then(response => {
        // console.log(response)
      }).catch(error => {
        console.log("Error in close_unassigned")
      })
    }

    uniq_selected.forEach(softIgnore)
    this.props.unselectAll()
    
  }

  close_ignored(){
    // console.log("Send ", this.props.face_id, " to .realignore", 'Person is ', this.props.current_person_id)
    // console.log("Lazy img: ", this.props.imgsSelected())
    // this.setState({ignored: true})
    // var ignore_url = store.get('api_url') + '/faces/' + this.props.face_id + '/ignore_face/'

    const uniq_selected = this.get_unique_list()

    function hardIgnore(faceId){
      var ignore_url = store.get('api_url') + '/faces/' + faceId + '/ignore_face/'
      // var ignore_url = store.get('api_url') + '/faces/' + this.props.face_id + '/ignore_face/'
      axiosInstance.put(ignore_url, {
          ignore_type: 'hard'
      })
      .then(response => {
        console.log(response)
      }).catch(error => {
        console.log("Error in close_unassigned")
      })
    }

    uniq_selected.forEach(hardIgnore)
    this.props.unselectAll()

  }

  close_assigned(){

    const uniq_selected = this.get_unique_list()
    const current_person_id = this.props.current_person_id

    function unassign(faceId){

      var unassign_url = store.get('api_url') + '/faces/' + faceId + '/unassign_face/'
      var reject_url = store.get('api_url')  + '/faces/' + faceId + '/reject_association/'

      axiosInstance.put(unassign_url)
      .then(response => {
        
      }).catch(error => {
        console.log("Error in close_assigned")
      })
      
      axiosInstance.put(reject_url, {
          unassociate_id: current_person_id
      })
      .then(response => {
        
      }).catch(error => {
        console.log("Error in close_assigned rejection list")
      })
    }

    uniq_selected.forEach(unassign)
    this.props.unselectAll()

  }

  set_as_thumbnail(){
     // Accessible as <root>/api/faces/<face_id>/set_as_person_thumbnail/
        // # Accept: HTML PUT
    var thumbnail_url = store.get('api_url') + '/faces/' + this.props.face_id + '/set_as_person_thumbnail/'
    
    axiosInstance.put(thumbnail_url)
    .then(response => {
      
    }).catch(error => {
      console.log("Error in set as thumbnail")
    })
  }

  confirm_proposed(){

    const uniq_selected = this.get_unique_list()
    console.log("Confirming!")
    const current_person_id = this.props.current_person_id

    function confirm(faceId){

      var confirm_url = store.get('api_url') + '/faces/' + faceId + '/assign_face_to_person/'

      axiosInstance.patch(confirm_url, {
        declared_name_key: current_person_id
      })
      .then(response => {
        // console.log(response)
      }).catch(error => {
        console.log("Error in confirm_proposed")
      })
    }

    uniq_selected.forEach(confirm)
    this.props.unselectAll()
  }

  set_invisible(){
    // console.log(this.props.imgsSelected)
    this.setState({ignored: true})
  }

  verifyFace(){
    console.log("Verify", this.props.face_id)
    const uniq_selected = this.get_unique_list()
    this.props.unselectAll()
    console.log(uniq_selected)

    function verify(faceId){

      var verify_url = store.get('api_url') + '/faces/' + faceId + '/verify_face/'
      // console.log(verify_url)
      axiosInstance.patch(verify_url)
      .then(response => {
        
      }).catch(error => {
        console.log("Error in verify_face")
      })
    }

    uniq_selected.forEach(verify)
  }

  localClick(event){
    // console.log("Log: ", this.props.imgsSelected())
    this.props.onClick(event, this.props.face_id, 0)
//     .then( (val) => {
//       console.log("Hey", val, this.props.face_id,  val.indexOf(this.props.face_id), this.props)
//       // console.log("Local clikc: ", zz, this.props.face_id)
// //      if (val.indexOf(this.props.face_id) >= -1){
// //        this.setState({selected: true})
// //      }else{
// //        this.setState({selected: false})
// //      }
//       // console.log("Set state", this.state.selected)
//     })
  }

  otherAssignment(){
    this.setState({type: 'unassigned_tab'})
  }

  
// handleClick(e, data) {
//   console.log(data.foo);
// }

  render(){


      var mutable_select = <MutableSelect 
                        peopleOptions = {this.props.peopleOptions}
                        face_id={this.props.face_id}
                        current_person_id={this.props.current_person_id}
                        setInvisible={(e)=>{this.set_invisible()}}
                        setHidden={this.props.setHidden}
                        updatePersonList={this.props.updatePersonList}
                        imgsSelected={this.props.imgsSelected}
                        clearImagesSelected={this.props.clearImagesSelected}
                        get_unique_list={this.get_unique_list}
                      />
      
      return(

        <div className={ (this.props.hidden || this.state.ignored) ? 'hidden_img' : 'imgDiv' }>

          <ContextMenuTrigger id={this.props.index.toString()}>
            <LazyLoadImage 
              className={  (this.props.hidden || this.state.ignored)  ? 'hidden_img' :
                    this.props.selected ? 'img_thumb_active' : 'img_thumb'} 
              state={{'loaded': false}}
              src={this.props.url} 
              key={this.props.index}
              effect='blur'
              scrollPosition={this.props.scrollPosition}
              onClick={(e) =>{this.localClick(e)} }
              onDrop={ this.props.onDrop }
              onDrag={ this.props.onDrag }
              wrapperClassName= {this.state.loaded ? 'loaded' : 'loading'}
              afterLoad={() => {
                this.setState({loaded: true})
              } }
            />

          </ContextMenuTrigger>
     
          <ContextMenu id={this.props.index.toString()}>
            <MenuItem onClick={this.close_assigned}>
              Remove from person
            </MenuItem>
            <MenuItem onClick={this.close_unassigned}>
              Send to ignore
            </MenuItem>
            <MenuItem onClick={this.otherAssignment}>
              Send to other person
            </MenuItem>
            <MenuItem onClick={this.verifyFace}>
              Verify face
            </MenuItem>
            <MenuItem onClick={this.set_as_thumbnail}>
              Set as highlight image
            </MenuItem>
          </ContextMenu>
          
          {
            {
              // 'defined': <button className='delete'>x</button>,
              'proposed': <button className= {this.state.ignored ? 'hidden_img' : 'yes'}
                          onClick={ (e)=>{this.confirm_proposed() } }
                          >
                          &#10003;
                          </button>,
              'unassigned_tab':  mutable_select
            }[this.state.type]
          }
          {
            {
              'proposed': <button className= {this.state.ignored ? 'hidden_img' : 'no'}
                          onClick={ (e)=>{this.close_assigned() } }
                          >
                          x
                          </button>,
              'unassigned_tab':  <button className= {this.state.ignored ? 'hidden_img' : 'delete' }
                                  onClick={ (e)=>{this.close_unassigned() } }
                                  >
                                  x
                                  </button>,
              'ignored':  <button className= {this.state.ignored ? 'hidden_img' : 'delete' }
                                  onClick={ (e)=>{this.close_ignored() } }
                                  >
                                  x
                                  </button>,
            }[this.state.type]
          }
          {this.props.ignore_tab ?  (
            <React.Fragment>
              <button 
                className= {this.state.ignored ? 'hidden_img' : 'delete' }
                onClick={ (e)=>{this.close_ignored() } }
              >
                x
              </button>
              {mutable_select}
            </React.Fragment> 
            ) : <span></span> }
        </div>

      )
  }

}

export default LazyImage
