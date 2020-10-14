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

    this.state = {
      loaded: false,
      ignored: false,
      type: this.props.type,
      selected: false
    }

    this.close_unassigned = this.close_unassigned.bind(this)
    this.close_assigned = this.close_assigned.bind(this)
    this.confirm_proposed = this.confirm_proposed.bind(this)
    this.localClick = this.localClick.bind(this)
    this.contextMenu = this.contextMenu.bind(this)
    // this.dropdown_enter = this.dropdown_enter.bind(this)
    // this.onClick = this.onClick.bind(this)
    
  }


  // componentWillReceiveProps({imgsSelected}) {
  //   console.log("Received")
  // }

  // shouldComponentUpdate(nextProps, nextState){
  //   // console.log("Hmmm", nextProps.imgsSelected, nextProps, nextState)
  //   return false
  // }

  // componentDidUpdate(prevProps, prevState, snapshot){
  //     console.log("Update")
  // }

  // onClick (event) {
  //   console.log("Drop")
  //   // this.props.onClick()
  // }


  close_unassigned(event){
    // console.log("Lazy img: ", this.props.imgsSelected())
    // console.log("Send ", this.props.face_id, " to .ignore", 'Person is ', this.props.current_person_id)
    this.setState({ignored: true})
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

  close_ignored(event){
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
    console.log("Unassign")
    this.setState({ignored: true})

    var unassign_url = store.get('api_url') + '/faces/' + this.props.face_id + '/unassign_face/'

    axiosInstance.put(unassign_url)
    .then(response => {
      
    }).catch(error => {
      console.log("Error in close_assigned")
    })
  }

  confirm_proposed(event){
    // console.log("Confirm ", this.props.face_id, 'Person is ', this.props.current_person_id)
    // console.log("Lazy img: ", this.props.imgsSelected())
    this.setState({type: 'confirmed'})
    this.setState({ignored: true})

    var confirm_url = store.get('api_url') + '/faces/' + this.props.face_id + '/assign_face_to_person/'

    axiosInstance.patch(confirm_url, {
      declared_name_key: this.props.current_person_id
    })
    .then(response => {
      console.log(response)
    }).catch(error => {
      console.log("Error in confirm_proposed")
    })
  }

  set_invisible(){
    console.log(this.props.imgsSelected)
    this.setState({ignored: true})
  }

  contextMenu(e){
    e.preventDefault();
    console.log("Context")
    
      // contextMenu.show({
      //   id: 1,
      //   event: e,
      // });

    // const rect = this.canvasRef.getBoundingClientRect();
    // const x = e.clientX - rect.left;
    // const y = e.clientY - rect.top;

    // // Some logic
    // if (
    //   x >= square.x &&
    //   x <= square.x + square.width &&
    //   y >= square.y &&
    //   y <= square.y + square.height
    // ) {
    //   // Don't forget to pass the id and the event and voila!
    // }
  }

  localClick(event){
    console.log("Log: ", this.props.imgsSelected())
    this.props.onClick(event, this.props.face_id, 0)
    if (this.props.imgsSelected().indexOf(this.props.face_id) >= 0){
      this.setState({selected: true})
    }else{
      this.setState({selected: false})
    }
    console.log("Set state", this.state.selected)
  }

  
handleClick(e, data) {
  console.log(data.foo);
}

  render(){
      if (this.state.selected){
        var className = 'img_thumb_active'
      }else{
        className = 'img_thumb'
      }
      // console.log(this.props.imgsSelected())

      var mutable_select = <MutableSelect 
                        peopleOptions = {this.props.peopleOptions}
                        face_id={this.props.face_id}
                        current_person_id={this.props.current_person_id}
                        setInvisible={(e)=>{this.set_invisible()}}
                        updatePersonList={this.props.updatePersonList}
                      />
      
      const component = 
          <LazyLoadImage 
            className={this.state.ignored ? 'hidden_img' :
                  this.state.selected ? 'img_thumb_active' : 'img_thumb'} 
            state={{'loaded': false}}
            src={this.props.url} 
            key={this.props.index}
            effect='blur'
            scrollPosition={this.props.scrollPosition}
            onClick={(e) =>{this.localClick(e)} }
            onContextMenu={(e) => {this.contextMenu(e)} }
            onDrop={ this.props.onDrop }
            onDrag={ this.props.onDrag }
            wrapperClassName= {this.state.loaded ? 'loaded' : 'loading'}
            afterLoad={() => {
              this.setState({loaded: true})
            } }
          />

          

      return(

        <div className={this.state.ignored ? 'hidden_img' : 'imgDiv' }>

          <ContextMenuTrigger id={this.props.index}>
            {component}
          </ContextMenuTrigger>
     
          <ContextMenu id={this.props.index}>
            <MenuItem onClick={this.close_assigned}>
              Remove from person
            </MenuItem>
          </ContextMenu>
          
          {
            {
              // 'defined': <button className='delete'>x</button>,
              'proposed': <button className= {this.state.ignored ? 'hidden_img' : 'yes'}
                          onClick={ (e)=>{this.confirm_proposed(e) } }
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
                                  onClick={ (e)=>{this.close_unassigned(e) } }
                                  >
                                  x
                                  </button>,
              'ignored':  <button className= {this.state.ignored ? 'hidden_img' : 'delete' }
                                  onClick={ (e)=>{this.close_ignored(e) } }
                                  >
                                  x
                                  </button>,
            }[this.state.type]
          }
          {this.props.ignore_tab ?  (
            <React.Fragment>
              <button 
                className= {this.state.ignored ? 'hidden_img' : 'delete' }
                onClick={ (e)=>{this.close_ignored(e) } }
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