import '../css/imageScreen.css';
import axiosInstance from './axios_setup';
import ImageObj from './imageObj';
import React from 'react';
import store from 'store';
import { LazyLoadImage, trackWindowScroll } from 'react-lazy-load-image-component';

class ImageScreen extends React.Component{
  constructor(props){
    super(props);
    this.state = {
      loading_definite: true,
      loading_poss: true,
      loading: true,
      imagery_ids: [],
      possible_ids: [],
      access_key: store.get('access_key')
    }
    // this.handleChange = this.handleChange.bind(this);
    // this.ref = React.createRef();
  }

  componentDidUpdate(prevProps, prevState, snapshot){

    if (this.props.api_id !== prevProps.api_id){
      console.log("Update needed")
      this.setState({loading: true})
      this.setState({loading_definite: true})
      this.setState({loading_poss: true})
      
      if (this.props.tab === 'People'){
        var req_type = 'face_declared'
        // var api_id = this.props.api_id_person
        //face_declared', 'face_poss
      }else if (this.props.tab === 'Folders'){
        req_type = 'directory'
        // api_id = this.props.api_id_folder
      }else{
        console.log("Invalid state")
      }

      // console.log(this.props)
      var imagery_url = store.get('api_url') + '/paginate_obj_ids/' + this.props.api_id + '/' + req_type
      console.log(imagery_url)
      try{
        axiosInstance.get(imagery_url)
        .then( (response) => {
          // resolve({data: response.data});
          console.log(response)
          this.setState({imagery_ids: response.data.id_list}); 
          this.setState({loading_definite: false})

          if (this.state.loading_poss){
            this.setState({loading: false})
          }
        });
      }catch(e){
        console.log('error', e)
      }

      if (this.props.tab === 'People'){
        var imagery_url = store.get('api_url') + '/paginate_obj_ids/' + this.props.api_id + '/' + 'face_poss'
        console.log(imagery_url)
        try{
          axiosInstance.get(imagery_url)
          .then( (response) => {
            // resolve({data: response.data});
            console.log(response)
            this.setState({possible_ids: response.data.id_list}); 
            this.setState({loading_poss: false})

          if (this.state.loading_definite){
            this.setState({loading: false})
          }
          });
        }catch(e){
          console.log('error', e)
        }
      }else{
        this.setState({loading_poss: true})
      }
    }

  }

  errorCallback(msg){
    console.log(msg)
  }
  loadCallback(msg){
    console.log("Loaded: ", msg)
  }

  createImage(index, resource_id){
      var url = store.get('api_url') + '/keyed_image/face_array/?access_key=' 
        + this.state.access_key + '&id=' + resource_id

      var img = 
        <LazyLoadImage 
          // className={this.state.active ? 'img_thumb_active': 'img_thumb'} 
          className='img_thumb' 
          src={url} 
          key={index}
          effect='blur'
          // retry={{ count: 10, delay: 2 }}
          // onError = { () => {this.errorCallback(url) } }
          // onLoad= { () => {this.loadCallback(url) } }
          // noLazyLoad={false}
          // onClick = {this.clickHandler}
          // onclick = {() console.log("Click!") }
        />
        // <Img
        //   src={url}
        //   key={index}
        // />
      return img
    }

  buildScreen() {
    if (this.state.loading){
      return(
      <div className='imageScreen'>
        Image screen {this.props.tab} {this.props.api_id} <a href={this.props.api_source}>API Source</a>
      </div>
      );
    }{

      var items = []
      for (const [index, value] of this.state.imagery_ids.entries()) {
        items.push(this.createImage(index, value))
      } 
      var index = items.length;
      if (this.props.tab === 'People'){
        for (const [index_alt, value] of this.state.possible_ids.entries()) {
          items.push(this.createImage(index + index_alt, value))
        } 
      }


      // const Gallery = {

      // }
      
      return(
         
        <div className='imageScreen'>
          {items}
        </div> 
      );

    }
  }
  // handleChange(event) {
  //   this.setState({
  //     media: event.target.value
  //   });
  // }
  
  // componentDidMount() {
  //   console.log("mount")
  //   window.scrollTo(0, 0)
  // }
  // componentDidUpdate(prevProps, prevState, snapshot) {
  //   window.scrollTo(0, 0) // Scrolls the whole window...
  //   // From https://stackoverflow.com/questions/45719909/scroll-to-bottom-of-an-overflowing-div-in-react
  //   const objDiv = document.getElementById('imageFieldScreen');
  //   objDiv.scrollTop = 0;
    
  //   if (prevState.urls !== this.props.urls){
  //     this.setState({
  //       urls: this.props.urls
  //     })
  //   }
  // }
  
  // componentDidUpdate() {
  //       // I was not using an li but may work to keep your div scrolled to the bottom as li's are getting pushed to the div
  //       const objDiv = document.getElementById('imageField');
  //       objDiv.scrollTop = objDiv.scrollHeight;
  //     }
  
  render(){
    return(
      this.buildScreen()
    ); 
  }
}

export default ImageScreen
