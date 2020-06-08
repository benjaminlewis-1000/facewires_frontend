import React from 'react';
import ImageObj from './imageObj'

class ImageScreen extends React.Component{
  constructor(props){
    super(props);
    this.state = {
      urls: this.props.urls
    }
    console.log("TODO: URLs should be an array of structs in ImageScreen")
    // this.handleChange = this.handleChange.bind(this);
    this.ref = React.createRef();
  }
  handleChange(event) {
    this.setState({
      media: event.target.value
    });
  }
  
  // componentDidMount() {
  //   console.log("mount")
  //   window.scrollTo(0, 0)
  // }
  componentDidUpdate(prevProps, prevState, snapshot) {
    window.scrollTo(0, 0) // Scrolls the whole window...
    // From https://stackoverflow.com/questions/45719909/scroll-to-bottom-of-an-overflowing-div-in-react
    const objDiv = document.getElementById('imageFieldScreen');
    objDiv.scrollTop = 0;
    
    if (prevState.urls !== this.props.urls){
      this.setState({
        urls: this.props.urls
      })
    }
  }
  
  // componentDidUpdate() {
  //       // I was not using an li but may work to keep your div scrolled to the bottom as li's are getting pushed to the div
  //       const objDiv = document.getElementById('imageField');
  //       objDiv.scrollTop = objDiv.scrollHeight;
  //     }
  
  render(){
    
    // const urls = this.props.urls
    const items = []
    for (const [index, value] of this.state.urls.entries()) {
    // TODO: key values need to be more stable
      items.push(<ImageObj key={index} image_url = {value} active={false}/>)
      // items.push(<button key={index} className="peopleButton">{value}</button>)
    }
    return(
      <div className = "imageScreen" id="imageFieldScreen" ref={this.ref}>
        {items}
      </div>
    );
  }
}

export default ImageScreen