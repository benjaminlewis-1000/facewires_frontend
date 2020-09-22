
import React from 'react';


class Folder extends React.Component{
  
  constructor(props) {
    super(props);
    this.state = {
      name: props.value,
      numPics: Math.round(Math.random() * 100)
    };
  }
  
  handleClick() {
    // this.setState({clicked: true});
    this.props.updateSource(this.state.name, 'folder');
    // console.log('Click! ' + this.state.name)
  }
  render() {
    // var className = this.state.clicked ? 'click-state' : 'base-state';
    return(
      <button 
        className="peopleButton"
        // className={className}
        onClick = {() =>
         this.handleClick()
        }
      >
        {this.state.name}  ({this.state.numPics})
      </button>
    );
  }
}


export default Folder;