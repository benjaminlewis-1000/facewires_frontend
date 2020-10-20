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
    this.set_as_thumbnail = this.set_as_thumbnail.bind(this)
    
  }

   componentDidUpdate(prevProps, prevState, snapshot){
     // if (prevProps !== this.props){
       console.log("Update lazy image")
       // this.forceUpdate()
     // }
   }
 
  shouldComponentUpdate(nextProps, nextState){
    console.log("Should it? ")
    return this.props.selected!==nextProps.selected;
  }

  componentDidUpdate(prevProps, prevState, snapshot) {
   console.log("Recieved")
  }

  close_unassigned(){
    // console.log("Lazy img: ", this.props.imgsSelected())
    // console.log("Send ", this.props.face_id, " to .ignore", 'Person is ', this.props.current_person_id)
    this.setState({ignored: true}, () => {console.log(this.state.ignored)}) 
    // console.log(this.props.imgsSelected, 'close unassigned')
    var ignore_url = store.get('api_url') + '/faces/' + this.props.face_id + '/ignore_face/'

    axiosInstance.put(ignore_url, {
        ignore_type: 'soft'
    })
    .then(response => {
      console.log(response)
    }).catch(error => {
      console.log("Error in close_unassigned")
    })
    
  }

  close_ignored(){
    // console.log("Send ", this.props.face_id, " to .realignore", 'Person is ', this.props.current_person_id)
    // console.log("Lazy img: ", this.props.imgsSelected())
    this.setState({ignored: true})
    var ignore_url = store.get('api_url') + '/faces/' + this.props.face_id + '/ignore_face/'

    axiosInstance.put(ignore_url, {
        ignore_type: 'hard'
    })
    .then(response => {
      console.log(response)
    }).catch(error => {
      console.log("Error in close_ignored")
    })
  }

  close_assigned(){
    // Unassigne a face from this person. 
    // console.log("Unassign")
    this.setState({ignored: true})

    var unassign_url = store.get('api_url') + '/faces/' + this.props.face_id + '/unassign_face/'

    axiosInstance.put(unassign_url)
    .then(response => {
      
    }).catch(error => {
      console.log("Error in close_assigned")
    })
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
    // console.log("Confirm ", this.props.face_id, 'Person is ', this.props.current_person_id)
    // console.log("Lazy img: ", this.props.imgsSelected())
    this.setState({type: 'confirmed'})
    this.setState({ignored: true})

    var confirm_url = store.get('api_url') + '/faces/' + this.props.face_id + '/assign_face_to_person/'

    axiosInstance.patch(confirm_url, {
      declared_name_key: this.props.current_person_id
    })
    .then(response => {
      // console.log(response)
    }).catch(error => {
      console.log("Error in confirm_proposed")
    })
  }

  set_invisible(){
    // console.log(this.props.imgsSelected)
    this.setState({ignored: true})
  }

  localClick(event){
    // console.log("Log: ", this.props.imgsSelected())
    this.props.onClick(event, this.props.face_id, 0).then( (val) => {
      console.log("Hey", val, this.props.face_id,  val.indexOf(this.props.face_id), this.props)
      // console.log("Local clikc: ", zz, this.props.face_id)
//      if (val.indexOf(this.props.face_id) >= -1){
//        this.setState({selected: true})
//      }else{
//        this.setState({selected: false})
//      }
      // console.log("Set state", this.state.selected)
    })
  }

  otherAssignment(){
    this.setState({type: 'unassigned_tab'})
  }

  
// handleClick(e, data) {
//   console.log(data.foo);
// }

  render(){
//      if (this.props.selected){
//        var className = 'img_thumb_active'
//      }else{
//        className = 'img_thumb'
//      }
//      console.log(this.props.imgsSelected())

      var mutable_select = <MutableSelect 
                        peopleOptions = {this.props.peopleOptions}
                        face_id={this.props.face_id}
                        current_person_id={this.props.current_person_id}
                        setInvisible={(e)=>{this.set_invisible()}}
                        updatePersonList={this.props.updatePersonList}
                      />
      
      return(

        <div className={this.state.ignored ? 'hidden_img' : 'imgDiv' }>

          <ContextMenuTrigger id={this.props.index.toString()}>
            <LazyLoadImage 
              className={ this.state.ignored  ? 'hidden_img' :
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
