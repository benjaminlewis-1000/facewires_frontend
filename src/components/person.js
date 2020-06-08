import React from 'react';

class Person extends React.Component{
  
  constructor(props) {
    super(props);
    this.state = {
      name: props.value,
      urls: props.urls,
      numPics: props.urls.length,
    };
  }
  getInitialState() {
    return {
      clicked: false
    };
  }
  handleClick() {
    console.log(this.state.urls[0])
    this.setState({clicked: true});
    this.props.updatePerson(this.state.name, 'gsg');
    this.props.setUrls(this.state.urls)
             // setUrls = this.props.setUrls
    // console.log('Click! ' + this.state.name)
  }
// render: function() {
    // var className = this.state.clicked ? 'click-state' : 'base-state';
    // return <div className={className} onClick={this.handleClick}>click here</div>;
  // }
  render() {
    var className = this.state.clicked ? 'click-state' : 'base-state';
    return(
      <button 
        // className="peopleButton"
        className={className}
        // onClick={() => this.setState({value: "click"})}
        onClick = {() =>
          // this.removeClass('peopleButton'),
          // (this).addClass('showhidenew')
          // alert('click')
         this.handleClick()
        }
        // onChange = {
        //   (e) => this.props.updatePerson(this.state.name)
        // }
        // onClick={() => alert('click')}
      >
        {this.state.name}   ({this.state.numPics})
      </button>
    );
  }
}


export default Person;