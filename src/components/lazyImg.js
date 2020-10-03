import React from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';


class LazyImage extends React.Component{
  constructor(props){
    super(props);

    this.state = {
      loaded: false,
    }
    
  }   

  render(){
    if (this.props.selected){
        // Selected = true
        var className = 'img_thumb_active'
      }else{
        className = 'img_thumb'
      }
      
    return(
        <LazyLoadImage 
          className={className}
          state={{'loaded': false}}
          src={this.props.url} 
          key={this.props.index}
          effect='blur'
          scrollPosition={this.props.scrollPosition}
          onClick={ this.props.onClick }
          onDrag={ this.props.onDrag }
          wrapperClassName= {this.state.loaded ? 'loaded' : 'loading'}
          afterLoad={() => {
            this.setState({loaded: true})
          } }
        />
    )
  }

}

export default LazyImage