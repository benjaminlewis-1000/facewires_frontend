import React from 'react';

// import Person from './person'
// update parent from child: 
// https://www.codeproject.com/Tips/1215984/Update-State-of-a-Component-from-Another-in-React
class PersonList extends React.Component {

  constructor(props) {
    super(props);
    console.debug("Person list props: ", props)
  }

  componentDidMount(){
    // console.log("Person mount", this.props.parentState)
  }

  render() {

    return (
      <div> </div>
    )
  }
}


export default PersonList;
