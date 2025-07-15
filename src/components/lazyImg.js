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
      // ignored: false,
      type: this.props.type,
    }

    this.localClick = this.localClick.bind(this)
    this.otherAssignment = this.otherAssignment.bind(this)
    this.set_as_thumbnail = this.set_as_thumbnail.bind(this)
    this.get_unique_list = this.get_unique_list.bind(this)
    
  }

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

  

  set_invisible(){
    // console.log(this.props.imgsSelected)
    this.setState({ignored: true})
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
            <MenuItem onClick={ (e) => {this.props.api_action('close_assigned', this.props.face_id)} }>
              Remove from person
            </MenuItem>
            <MenuItem onClick={ (e) => {this.props.api_action('close_unassigned', this.props.face_id)}}>
              Send to ignore
            </MenuItem>
            <MenuItem onClick={ this.otherAssignment}>
              Send to other person
            </MenuItem>
            <MenuItem onClick={ (e) => {this.props.api_action('verify_face', this.props.face_id)} }>
              Verify face
            </MenuItem>
            <MenuItem onClick={ this.set_as_thumbnail}>
              Set as highlight image
            </MenuItem>
          </ContextMenu>
          
          {
            {
              // 'defined': <button className='delete'>x</button>,
              'proposed': <button className= {this.props.hidden ? 'hidden_img' : 'yes'}
                          onClick={ (e) => {this.props.api_action('confirm_proposed', this.props.face_id) } }
                          >
                          &#10003;
                          </button>,
              'unassigned_tab':  mutable_select
            }[this.state.type]
          }
          {
            {
              'proposed': <button className= {this.props.hidden ? 'hidden_img' : 'no'}
                          onClick={ (e)=>{this.props.api_action('close_assigned', this.props.face_id) } }
                          >
                          x
                          </button>,
              'unassigned_tab':  <button className= {this.props.hidden ? 'hidden_img' : 'delete' }
                                  onClick={ (e)=>{this.props.api_action('close_unassigned', this.props.face_id) } }
                                  >
                                  x
                                  </button>,
              'ignored':  <button className= {this.props.hidden ? 'hidden_img' : 'delete' }
                                  onClick={ (e)=>{this.props.api_action('close_ignored', this.props.face_id) } }
                                  >
                                  x
                                  </button>,
            }[this.state.type]
          }
          {this.props.ignore_tab ?  (
            <React.Fragment>
              <button 
                className= {this.props.hidden ? 'hidden_img' : 'delete' }
                onClick={ (e)=>{this.props.api_action('close_ignored', this.props.face_id) } }
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
