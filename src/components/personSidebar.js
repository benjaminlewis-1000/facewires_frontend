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

  makePerson(value, index, selected) {
    var className = selected ? 'click-state' : 'base-state'; // this.state.id === this.props.personSelected ? 'click-state' : 'base-state';
    // console.log(this.state.id, this.props.personSelected)
    return(
      <button 
        className={className}
        key={index}
        onClick = {() =>  this.handleClick(index, value.url, value.id)  }
        onDrop = {() => {console.log("Dropped on me!")}}
        onDragOver={console.log("drag over")}
      >
        {value.person_name}   ({value.num_faces})
      </button>
    );
  }
  //

  render() {
    const people = this.props.people
    var items = []

    var only_unlabeled = this.props.unlabeled
    
    const myData = [].concat(people)
    myData.sort()
    const found_idx = myData.findIndex(element =>element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === 'Unassigned')
    var noOne = myData.find(element =>element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === 'Unassigned')
    noOne.person_name = 'Unassigned'

    items.push(this.makePerson(noOne, -100, this.state.personSelected === -100) )

    for (const [index, value] of myData.entries()) {

      if (only_unlabeled && value.num_possibilities === 0){
        continue
      }
      if (index !== found_idx){
        items.push(this.makePerson(value, index, this.state.personSelected === index))
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
