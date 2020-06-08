import React from 'react';
import Person from './person'

// update parent from child: 
// https://www.codeproject.com/Tips/1215984/Update-State-of-a-Component-from-Another-in-React
class PersonList extends React.Component {

  constructor(props) {
    super(props);
    console.log(props)
  }

  componentDidMount(){
    console.log("Person mount", this.props)
  }

  /*renderPerson(value, urls) {
    var idx = value[0]
    var val = value[1]
    return <Person 
             key={idx} 
             value={val} 
             updatePerson={this.setPerson} 
             urls = {urls}
             setUrls = {this.props.setUrls}
            />;
  }
  
  setPerson = (person) => {
    this.setState({ person })
    // console.log("Set person to : " + person)
    this.props.setSource(person, 'person')
  }
  constructor(props) {
    super(props);
    this.state = {person: this.props.people[0]}
  }
  render() {
    const people = this.props.people
    var items = []
    
    const myData = [].concat(people)
    myData.sort()

    for (const [index, value] of myData.entries()) {
    // TODO: key values need to be more stable
      // items.push(<button key={index} className="peopleButton">{value}</button>)
      // items.push(renderPerson(value)) // <Person key = {index} value={value}/>)
      // items.push( <Person key = {index} value={value}/>)
      var data = [index, value, 'myasdf']
      var urls_person = []
      var mult = Math.round(Math.random() * 10) + 1
      var numBase = Math.floor(Math.random() * 80) + 25 //Math.floor(80)) + 25
      // Math.round(Math.random() * 80) + 25
      for (var i = 0; i < numBase; i++) {
          urls_person[i] = "https://picsum.photos/id/" + (i + 5) * mult + "/200/200";
      }
      items.push(this.renderPerson(data, urls_person))
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
  }*/
}


export default PersonList;
