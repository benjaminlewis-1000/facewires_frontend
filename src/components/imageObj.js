import React from 'react';

class ImageObj extends React.Component{
  
  constructor(props){
    super(props);
    this.state = {
      active: props.active,
    };
    // Need to bind 'this' in so functions can access 'this.'
    this.clickHandler=this.clickHandler.bind(this);
    this.toggleClass=this.toggleClass.bind(this);
  }
  
  componentDidMount() {
    this.setState({
      image_url: this.props.image_url,
      active: false
    })
  }

  componentWillUnmount() {

  }
  
  toggleClass() {
    const currentState = this.state.active;
    this.setState({ active: !currentState });
    console.log("This is now active? " + currentState )
   //  // console.log('toggle')
   }
  
  clickHandler() {
    
      console.log("State click")
    // if (event.ctrlKey) {
    //   {this.toggleClass()}
    // }else{
    //   console.log("State click")
    //   // Reset all the states
    // }
  }
    
  // When the component re-renders, we set the active state
  // back to false and update the state URL. Per documentation
  // at https://reactjs.org/docs/react-component.html#componentdidupdate,
  // the setState in this method needs to be wrapped in an if 
  // statement.
  componentDidUpdate(prevProps, prevState, snapshot){
    if (prevState.active){
      this.setState({
        active: false
      })
    }
    if (prevState.image_url !== this.props.image_url){
      this.setState({
        image_url: this.props.image_url
      })
    }
  }
  
  render(){
    return(
      <img 
        className={this.state.active ? 'img_thumb_active': 'img_thumb'} 
        // className='img_thumb' 
        src={this.state.image_url} 
        onClick = {this.clickHandler}
        alt=""
        // onclick = {() console.log("Click!") }
      />
    );
  }
}

export default ImageObj;
