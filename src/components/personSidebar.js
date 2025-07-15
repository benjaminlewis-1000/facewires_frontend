import React from 'react';
// import Person from './person'

// update parent from child: 
// https://www.codeproject.com/Tips/1215984/Update-State-of-a-Component-from-Another-in-React
class PersonSidebar extends React.Component {

  constructor(props) {
    super(props);
    // console.log(props)
    var default_url = this.props.people.find(element =>element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === 'Unassigned');
    // this.props.setSource(default_url.url)
    this.state = {
      personSelected: -100,
    }

    this.props.setSource('person', default_url.url, default_url.id, -100)
  }

  handleClick(index, url, id) {
    // console.log(index, url)
    this.props.setSource('person', url, id, index)
    this.setState({ personSelected: index })
  }

  makePerson(value, index, selected, unverified, unlabeled) {
    var className = selected ? 'click-state' : 'base-state'; // this.state.id === this.props.personSelected ? 'click-state' : 'base-state';
    // console.log(this.state.id, this.props.personSelected)

    var text = ""
    // Always make the Unassigned person show the num_possibilities.
    // The other switches change values according to the toggles
    // at the top of the screen -- "only unlabeled faces" and 
    // "only unverified faces" respectively
    if (unlabeled || value.person_name === "Unassigned"){
      text = `${value.person_name}   (${value.num_possibilities})`
    }else if (unverified){
      text = `${value.person_name}   (${value.num_unverified_faces})`
    }else{
      text = `${value.person_name}   (${value.num_faces})`
    }
    return(
      <button 
        className={className}
        key={index}
        onClick = {() =>  this.handleClick(index, value.url, value.id)  }
        onDrop = {() => {console.log("Dropped on me!")}}
        onDragOver={console.log("drag over")}
      >
        {text}
      </button>
    );
  }
  //

  render() {
    const people = this.props.people
    var items = []

    var only_unlabeled = this.props.unlabeled
    var only_unverified = this.props.only_unverified
    
    const myData = [].concat(people)
    myData.sort()
    const found_idx = myData.findIndex(element =>element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === 'Unassigned')
    var noOne = myData.find(element =>element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === 'Unassigned')
    noOne.person_name = 'Unassigned'

    items.push(this.makePerson(noOne, -100, this.state.personSelected === -100) )

    for (const [index, value] of myData.entries()) {

      if ( only_unlabeled && value.num_possibilities === 0){
        continue
      }
      if ( only_unverified && value.num_unverified_faces === 0){
        continue
      }
      if (index !== found_idx){
        items.push(this.makePerson(value, index, this.state.personSelected === index, only_unverified, only_unlabeled))
      }
      //
    }
    
    return(
      <div 
        className="sidebarList" 
        id="peopleSidebar" 
        // onChange = {
        //   (e) => this.props.setState(this.state.person)
        // }
       >
        {items}
      </div>
    );
  }
}


export default PersonSidebar;
