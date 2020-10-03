import React from 'react';
import { trackWindowScroll } from 'react-lazy-load-image-component';
import store from 'store';
import '../css/image_tile.css'
import LazyImage from './lazyImg'
import MutableSelect from './mutableSelect'

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
        unassigned_person_id: this.props.unassigned_person_id,
        shiftOn: false
      })
    }


    this.state = {
      imgsSelected: [],
      peopleOptions: peopleOptions,
      shiftOn: false,
      lastClicked: -1
    }

    // console.log(this.props.people)
    // const peopleOptions = this.props.people

    // const DropdownExampleSearchSelection = () => (
      
    // )
  }

  clickety(event, resource_id, index){
    
    var idxToIdMap = this.props.img_ids.concat(this.props.poss_ids)
    console.log(idxToIdMap, this.props.img_ids)

    var indexIfInList = this.state.imgsSelected.indexOf(resource_id)

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
        if (event.ctrlKey) {
          this.setState({imgsSelected: this.state.imgsSelected.concat([resource_id])})
        }else{
          this.setState({imgsSelected: [resource_id]})
        }
      }
      console.log(this.state)

      this.setState({lastClicked: index})
    }
  }

  dragLog (event, resource_id, index) {
    var indexIfInList = this.state.imgsSelected.indexOf(resource_id)
    console.log(indexIfInList, indexIfInList === -1)
    
    var dragState = this.state.imgsSelected
    if (indexIfInList === -1){
      if (event.ctrlKey) {
        dragState = dragState.concat([resource_id])
        console.log("Ctrl drag")
        this.clickety(event, resource_id)
        this.setState({imgsSelected: this.state.imgsSelected.concat([resource_id])})
      }else{
        dragState = [resource_id]
        this.setState({imgsSelected: [resource_id]})
      }
    }else{
      console.log("Not in drag state")
    }

    if (event.ctrlKey) {
      console.log(dragState, this.state.imgsSelected)
    }else{
      console.log(dragState, this.state.imgsSelected)
    }
  }

  createImage(index, resource_id, type){
      var url = store.get('api_url') + '/keyed_image/face_array/?access_key=' 
        + store.get('access_key') + '&id=' + resource_id

      // if (this.state.imgsSelected.indexOf(resource_id) >= 0){
      //   // Selected = true
      //   var className = 'img_thumb_active'
      // }else{
      //   className = 'img_thumb'
      // }
      

        
      var img = <LazyImage 
        selected={this.state.imgsSelected.indexOf(resource_id) >= 0}
        url={url}
        index={index}
        key={index}
        scrollPosition={this.props.scrollPosition}
        onClick={ (e) => this.clickety(e,  resource_id, index) }
        onDrag={ (e) => this.dragLog(e,  resource_id, index) }

      />  
          // if (type === 'defined'){
          //   {<button 
          //     className='delete'
          //   >x</button>}
          // }else if (type === 'proposed'){
          //   {<button 
          //     className='yes'
          //   >&#10003;</button>
          //  <button 
          //     className='no'
          //   >x</button>}
          // }else if (type === 'unassigned_tab'){
          //   <MutableSelect peopleOptions = {this.state.peopleOptions}/>
          // }
        
      return (
        <div className='imgDiv' key={index}>
          {img}
          {
            {
              // 'defined': <button className='delete'>x</button>,
              'proposed': <button className='yes'>&#10003;</button>,
              'unassigned_tab':  <MutableSelect peopleOptions = {this.state.peopleOptions}/>
            }[type]
          }
          {
            {
              'proposed': <button className='no'>x</button>,
              'unassigned_tab':  <button className='delete'>x</button>,
            }[type]
          }
        </div>
      );
    }

  makeScreen(){
    var items = []
    console.log(this.props.current_id, this.props.unassigned_person_id)

    if (this.props.current_id === this.props.unassigned_person_id){
      var defined_term = 'unassigned_tab'
    }else{
      defined_term = 'defined'
    }

    for (const [index, value] of this.props.img_ids.entries()) {
      items.push(this.createImage(index, value, defined_term))
    }
    var idx_offset = items.length
    for (const [index, value] of this.props.poss_ids.entries()) {
      items.push(this.createImage(index + idx_offset, value, 'proposed'))
    }

    return items
  }

  render(){
    return(

      <div className='imageScreen'>
        
        {this.makeScreen()}
      </div>    
    ); 
  }

}

export default trackWindowScroll(Gallery)