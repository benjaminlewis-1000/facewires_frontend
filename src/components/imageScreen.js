import '../css/imageScreen.css';
import '../css/imageModal.css';
import axiosInstance from './axios_setup';
// import ImageObj from './imageObj';
import React from 'react';
import store from 'store';
import { LazyLoadImage } from 'react-lazy-load-image-component';
// import { LazyLoadImage, trackWindowScroll } from 'react-lazy-load-image-component';
import Gallery from './gallery'

class ImageScreen extends React.Component{

  constructor(props){
    super(props);
    this.state = {
      loading_definite: true,
      loading_poss: true,
      loading: true,
      active: false,
      imagery_ids: [],
      possible_ids: [],
      access_key: store.get('access_key'),
    }


    this.toggle_unlikely = this.toggle_unlikely.bind(this)
    this.handleCheckbox = this.handleCheckbox.bind(this)

    // this.ref = React.createRef();
  }

  componentDidUpdate(prevProps, prevState, snapshot){

    if (this.props.api_id !== prevProps.api_id || 
      ( this.props.unlabeled !== prevProps.unlabeled && 
        this.props.only_unverified !== prevProps.only_unverified && 
        this.props.api_id !== this.props.unassigned_person_id) ){
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

      console.log("Props: ", this.props)

      var imagery_url = ''
      if (! (this.props.unlabeled && this.props.tab === "People") || this.props.tab !== 'People' || this.props.api_id === this.props.unassigned_person_id) {
        imagery_url = store.get('api_url') + '/paginate_obj_ids/' + this.props.api_id + '/' + req_type
        console.log(imagery_url)
        console.log("Only Unverified: ", this.props.only_unverified)
        try{
          axiosInstance.get(imagery_url, {
            params: {
              only_unverified: this.props.only_unverified
            }
          })
          .then( (response) => {
            
            this.setState({imagery_ids: response.data.id_list}); 
            this.setState({loading_definite: false})

          });
        }catch(e){
          console.log('error', e)
        }
      }else{
        this.setState({imagery_ids: []}); 
        this.setState({loading_definite: false})
      }

      if (this.props.tab === 'People' ){
        imagery_url = store.get('api_url') + '/paginate_obj_ids/' + this.props.api_id + '/face_poss'
        console.log(imagery_url)
        try{
          axiosInstance.get(imagery_url)
          .then( (response) => {
            // resolve({data: response.data});
            // console.log(response)
            this.setState({possible_ids: response.data.id_list}); 
            this.setState({loading_poss: false})

            if (! this.state.loading_definite){
              this.setState({loading: false})
            }

            this.setState({loading: false})
          });
        }catch(e){
          console.log('error', e)
        }
      }else{
        this.setState({loading_poss: false})
        this.setState({loading: false})
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


  createUrl( resource_id){
    var url = store.get('api_url') + '/keyed_image/face_array/?access_key=' 
        + this.state.access_key + '&id=' + resource_id
    return url
  }

  toggle_unlikely(){
    var id_num = this.props.people[this.props.selectedIndex].id
    var toggle_url = store.get('api_url') + '/people/' + id_num + '/toggle_further_unlikely/'

    var old_unlikely = this.props.people[this.props.selectedIndex].further_images_unlikely
    this.props.people[this.props.selectedIndex].further_images_unlikely = !old_unlikely
    this.state.active = !this.state.active
    
    axiosInstance.put(toggle_url)
    .then(response => {
      
    }).catch(error => {
      console.log("Error in toggle unlikely")
    })
  }

  handleCheckbox(e) {
    const name = e.target.name;
    const checked = e.target.checked;
    this.setState((prevState) => {
        this.state.active = !prevState.active;
    });
  }


  buildScreen() {
    if (this.state.loading){
      return(
          <div className='screenHeader'>
          </div>
      );
    }else{

      // var items = []
      // for (const [index, value] of this.state.imagery_ids.entries()) {
      //   items.push(this.createImage(index, value))
      // } 
      // var index = items.length;
      // if (this.props.tab === 'People'){
      //   for (const [index_alt, value] of this.state.possible_ids.entries()) {
      //     items.push(this.createImage(index + index_alt, value))
      //   } 
      // }

      // var urls = []
      // for (const [index, value] of this.state.imagery_ids.entries()) {
      //   urls.push(this.createUrl(value))
      // } 
      // if (this.props.tab === 'People'){
      //   for (const [index_alt, value] of this.state.possible_ids.entries()) {
      //     urls.push(this.createUrl(value))
      //   } 
      // }
      // console.log("Ready",this.state)
      var gallery = <Gallery
                    poss_ids = {this.state.possible_ids} 
                    img_ids={this.state.imagery_ids}
                    people={this.props.people}
                    unassigned_person_id={this.props.unassigned_person_id}
                    ignore_person_id={this.props.ignore_person_id}
                    current_person_id={this.props.api_id}
                    ready = {this.state.loading}
                    updatePersonList={this.props.updatePersonList}
                    unlabeled={this.props.unlabeled}
                    only_unverified={this.props.only_unverified}
                  />

      // console.log("selected index: ", this.props.people)
      if ( this.props.selectedIndex === -100 ){
        var selectedName = 'Unassigned'
        // var id_url = null
        var further_unlikely = false
        var highlight_img = <img src='https://peoplefacts.com/wp-content/uploads/2014/06/mystery-person.png' alt="highlight" className='highlight_img' />
        //
      }else{
        further_unlikely = this.props.people[this.props.selectedIndex].further_images_unlikely
        this.state.active = further_unlikely
        selectedName = this.props.people[this.props.selectedIndex].person_name
        var id_num = this.props.people[this.props.selectedIndex].id
        var id_url = store.get('api_url') + '/keyed_image/face_highlight/?access_key=' 
          + this.state.access_key + '&id=' + id_num
        highlight_img = <img src={id_url} className="highlight_img"  alt="highlight" />
      }



      

       
                             // <img src="https://i.pinimg.com/originals/00/99/f4/0099f4d94bcd096e932b750edea40c5d.jpg" alt="Mountain" className='modalImage' /> 
      return(
        <div>
          <div className='screenHeader'>
            {highlight_img} 
            <span className='header_person_name'>{selectedName}</span>
            <span className='no_classify_checkbox'>
                &emsp;&emsp;&emsp;
                <input type="checkbox" 
                    checked={this.state.active} 
                    onClick={this.toggle_unlikely}
                    onChange={this.handleCheckbox}>
                </input>
                &nbsp;
                Further Images Unlikely
            </span>

          </div>
          {gallery}
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
