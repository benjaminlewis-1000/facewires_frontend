import React from 'react';
import { trackWindowScroll } from 'react-lazy-load-image-component';
import store from 'store';
import '../css/image_tile.css'
import LazyImage from './lazyImg'
import InfiniteScroll from "react-infinite-scroll-component";

const styleLink = document.createElement("link");
styleLink.rel = "stylesheet";
styleLink.href = "https://cdn.jsdelivr.net/npm/semantic-ui/dist/semantic.min.css";
document.head.appendChild(styleLink);


class Gallery extends React.Component{
  
  constructor(props){
    super(props);
    var peopleOptions = []

    for (const [index, value] of this.props.people.entries()) {
      peopleOptions.push({
        key: index,
        value: value.person_name,
        text: value.person_name,
        api_key: value.id,
        // unassigned_person_id: this.props.unassigned_person_id,
        shiftOn: false
      })
    }


    this.state = {
      imgsSelected: [],
      peopleOptions: peopleOptions,
      shiftOn: false,
      lastClicked: -1,
      items: [],
      start_idx: 0,
      items_per_screen: 100,
      ready: false,
      more_to_load: true,
      combined_list: [],
      imgs_len: 0
    }


    this.clicks = [];
    this.close_unassigned = this.close_unassigned.bind(this)
    this.close_assigned = this.close_assigned.bind(this)
    this.confirm_proposed = this.confirm_proposed.bind(this)

  }

  componentDidUpdate(prevProps, prevState, snapshot){
    if (prevProps !== this.props){
      console.log("Update gallery", this.props.img_ids)

      // this.setState({combined_list: this.props.img_ids.concat(this.props.poss_ids)})
      this.setState({imgs_len: this.props.img_ids.length})
      this.setState({ready: true})
      this.fetchMoreData()

      // this.forceUpdate()
    }
  }

  singleClick(event, face_id, index){
    console.log(face_id)
    
    var idxToIdMap = this.props.img_ids.concat(this.props.poss_ids)

    var indexIfInList = this.state.imgsSelected.indexOf(face_id)
    // console.log(indexIfInList)

    if (event.shiftKey){
      var newlySelected = []
      var startIdx = this.state.lastClicked
      if (index < startIdx){
        var endIndex = startIdx
        startIdx = index
      }else{
        endIndex = index
      }
      for (var i = startIdx; i <= endIndex; i++){
        newlySelected.push(idxToIdMap[i])
      }
      this.setState({imgsSelected: this.state.imgsSelected.concat(newlySelected)})
    }else{
    
      if (indexIfInList >= 0){
        var newState = this.state.imgsSelected
        newState.splice(indexIfInList, 1)
        this.setState({imgsSelected: newState})
      }else{
        // console.log("Not in list", this.state.imgsSelected)
        if (event.ctrlKey) {
          this.setState({imgsSelected: this.state.imgsSelected.concat([face_id])})
        }else{
          this.setState({imgsSelected: [face_id]})
        }
      }

      this.setState({lastClicked: index})
    }
    console.log(this.state.imgsSelected)
  }

  dragLog (event, face_id, index) {
    var indexIfInList = this.state.imgsSelected.indexOf(face_id)
    // console.log(indexIfInList, indexIfInList === -1)
    
    var dragState = this.state.imgsSelected
    if (indexIfInList === -1){
      if (event.ctrlKey) {
        dragState = dragState.concat([face_id])
        console.log("Ctrl drag")
        this.singleClick(event, face_id)
        this.setState({imgsSelected: this.state.imgsSelected.concat([face_id])})
      }else{
        dragState = [face_id]
        this.setState({imgsSelected: [face_id]})
      }
    }
    // else{
      // console.log("Not in drag state")
    // }

    // if (event.ctrlKey) {
    //   console.log(dragState, this.state.imgsSelected)
    // }else{
    //   console.log(dragState, this.state.imgsSelected)
    // }
  }

  onDrop(event){
    console.log("Drop")
  }

  close_unassigned(event, face_id){
    console.log("Send ", face_id, " to .ignore")
  }

  close_assigned(event, face_id){
    console.log("Remove ", face_id, " from assigned")
  }

  confirm_proposed(event, face_id){
    console.log("Confirm ", face_id)
  }

  clickHandler(event, face_id, index) {
    
        event.persist()
        event.preventDefault();
        this.clicks.push(new Date().getTime());
        window.clearTimeout(timeout);
        var timeout = window.setTimeout(() => {
            if (this.clicks.length > 1 && this.clicks[this.clicks.length - 1] - this.clicks[this.clicks.length - 2] < 250) {
                // doubleClick(event.target);
                console.log("double")
                this.clicks = []
            } else if (this.clicks.length > 0) {
              console.log("singleClick")
                this.singleClick(event, face_id, index);
                this.clicks = []
            }
        }, 250);
    }

  createImage(index, face_id, type){
    // Type is a value in ['proposed', 'unassigned_tab', 'defined', 'ignored'].
      var url = store.get('api_url') + '/keyed_image/face_array/?access_key=' 
        + store.get('access_key') + '&id=' + face_id    

      var selected=this.state.imgsSelected.indexOf(face_id) >= 0
      console.log(selected)
      var img = <LazyImage 
        selected={this.state.imgsSelected.indexOf(face_id) >= 0}
        imgsSelected={() => this.state.imgsSelected}
        url={url}
        index={index}
        key={index}
        scrollPosition={this.props.scrollPosition}
        onClick={ (e) => this.clickHandler(e,  face_id, index) }
        onDoubleClick={ (e) => {console.log("double click")}}
        onDrag={ (e) => this.dragLog(e,  face_id, index) }
        onDrop={(e) => this.onDrop(e)}
        face_id={face_id}
        type={type}
        current_person_id={this.props.current_person_id}
        peopleOptions={this.state.peopleOptions}
        ignore_tab={this.props.current_person_id === this.props.ignore_person_id}
        updatePersonList={this.props.updatePersonList}

      />  
        
        
      return(
        <div key={index}>
         {img}
        </div>
      );

    }

//

  fetchMoreData = () => {
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
        concatItems.push(this.createImage(j, value, type))
      }

      this.setState({
        items: this.state.items.concat(concatItems)
      });

      if (end === combined_list.length){
        this.setState({more_to_load: false})
      }
  };


  render(){
    return(

      <div className='imageScreen'>
      {this.state.ready ? (

        
        <InfiniteScroll
          dataLength={this.state.items.length}
          next={this.fetchMoreData}
          hasMore={this.state.more_to_load}
          loader={<h4>Loading...</h4>}
        >
          {this.state.items}
        </InfiniteScroll>
        
    ):(
      <div> Loading </div>
    )
      }
        </div>    
    ); 

    }
}

export default trackWindowScroll(Gallery)