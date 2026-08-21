import '../css/imageScreen.css';
import '../css/imageModal.css';
import axiosInstance from './axios_setup';
// import ImageObj from './imageObj';
import React from 'react';
import store from 'store';
import { LazyLoadImage } from 'react-lazy-load-image-component';
// import { LazyLoadImage, trackWindowScroll } from 'react-lazy-load-image-component';
import Gallery from './gallery'
import { withRetry } from './apiRetry';
import { useContextMenu, Menu, Item } from 'react-contexify';
import 'react-contexify/ReactContexify.css';

const PERSON_NAME_MENU_ID = 'menu-person-name';

// Functional wrapper to leverage react-contexify's hook cleanly inside
// the class component below (same pattern as lazyImg.jsx).
function PersonNameContextWrapper({ children }) {
  const { show } = useContextMenu({ id: PERSON_NAME_MENU_ID });

  function handleContextMenu(event) {
    show({ event });
  }

  return (
    <span onContextMenu={handleContextMenu}>
      {children}
    </span>
  );
}

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
      // Bumped whenever a face is set as a person's highlight image, so
      // the highlight <img> URL below changes and forces a real refetch
      // instead of silently reusing the browser's cached response for
      // the (otherwise identical) person id URL.
      highlightVersion: 0,
    }

    // Bumped every time componentDidUpdate kicks off a new pair of
    // fetches. Each fetch's .then()/.catch() captures the value at
    // issue time and checks it against this on resolve - if they
    // don't match, a newer fetch has already superseded this one, so
    // the (now-stale) response is dropped instead of clobbering state
    // that a later, faster-resolving request already set correctly.
    this._fetchGeneration = 0

    this.toggle_unlikely = this.toggle_unlikely.bind(this)
    this.handleCheckbox = this.handleCheckbox.bind(this)
    this.bumpHighlightVersion = this.bumpHighlightVersion.bind(this)
    this.openRename = this.openRename.bind(this)

    // this.ref = React.createRef();
  }

  componentDidUpdate(prevProps, prevState, snapshot){

    if (this.props.api_id !== prevProps.api_id ||
        this.props.unlabeled !== prevProps.unlabeled ||
        this.props.only_unverified !== prevProps.only_unverified){
      const generation = ++this._fetchGeneration
      const debugTag = `[ImageScreen ${this.props.api_id}]`
      this.setState({loading: true})
      this.setState({loading_definite: true})
      this.setState({loading_poss: true})
      // Clear out the previous person's ids immediately, rather than
      // leaving them in state until the new fetches resolve - without
      // this, if the "possible" fetch below finishes before "definite"
      // does, loading flips to false and Gallery mounts using whichever
      // stale imagery_ids happens to still be sitting in state from
      // the last person, producing a gallery that mixes both people's
      // images.
      this.setState({imagery_ids: [], possible_ids: []})

      if (this.props.tab === 'People'){
        var req_type = 'face_declared'
        // var api_id = this.props.api_id_person
        //face_declared', 'face_poss
      }else if (this.props.tab === 'Folders'){
        req_type = 'directory'
        // api_id = this.props.api_id_folder
      }else{
        console.log(debugTag, "Invalid state")
      }

      var imagery_url = ''
      if (! (this.props.unlabeled && this.props.tab === "People") || this.props.tab !== 'People' || this.props.api_id === this.props.unassigned_person_id) {
        imagery_url = store.get('api_url') + '/paginate_obj_ids/' + this.props.api_id + '/' + req_type
        axiosInstance.get(imagery_url, {
            params: {
              only_unverified: this.props.only_unverified
            }
          })
          .then( (response) => {
            if (generation !== this._fetchGeneration) return
            this.setState({imagery_ids: response.data.id_list});
            this.setState({loading_definite: false})
            // Only the fetch that finishes last should flip the
            // overall loading flag - if we did it unconditionally here,
            // Gallery could mount before the still-in-flight "possible"
            // fetch (below) has had a chance to populate possible_ids.
            if (!this.state.loading_poss){
              this.setState({loading: false})
            }
          })
          .catch( (e) => {
            if (generation !== this._fetchGeneration) return
            console.error(debugTag, "GET (definite) FAILED - loading state will stay stuck without this", e)
            this.setState({loading_definite: false, loading: false})
          });
      }else{
        this.setState({imagery_ids: []});
        this.setState({loading_definite: false})
      }

      if (this.props.tab === 'People' ){
        imagery_url = store.get('api_url') + '/paginate_obj_ids/' + this.props.api_id + '/face_poss'
        axiosInstance.get(imagery_url)
          .then( (response) => {
            if (generation !== this._fetchGeneration) return
            this.setState({possible_ids: response.data.id_list});
            this.setState({loading_poss: false})
            // Same reasoning as the "definite" handler above - only
            // flip loading once both fetches for this generation are
            // actually done.
            if (!this.state.loading_definite){
              this.setState({loading: false})
            }
          })
          .catch( (e) => {
            if (generation !== this._fetchGeneration) return
            console.error(debugTag, "GET (possible) FAILED - loading state will stay stuck without this", e)
            this.setState({loading_poss: false, loading: false})
          });
      }
      else{
        // No "possible" concept outside the People tab (e.g. Folders) -
        // nothing async to wait on here. Don't flip the overall
        // loading flag though; the "definite" fetch above (still in
        // flight for this tab) owns that via its own
        // !this.state.loading_poss check once it resolves.
        this.setState({loading_poss: false})
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
    this.setState(prevState => ({ active: !prevState.active }))

    withRetry(() => axiosInstance.put(toggle_url))
      .then(response => {})
      .catch(error => {
        console.log("Error in toggle unlikely", error)
        this.props.onApiError && this.props.onApiError("Couldn't toggle 'further images unlikely' — please try again.")
      })
  }

  handleCheckbox(e) {
    this.setState(prevState => ({ active: !prevState.active }));
  }

  bumpHighlightVersion() {
    this.setState(prevState => ({ highlightVersion: prevState.highlightVersion + 1 }))
  }

  openRename() {
    if (this.props.selectedIndex === -100) return
    const currentName = this.props.people[this.props.selectedIndex].person_name
    const id_num = this.props.people[this.props.selectedIndex].id
    this.props.onRenamePerson && this.props.onRenamePerson(id_num, currentName)
  }


  buildScreen() {
    // The header (highlight image + name + "further images unlikely"
    // checkbox) only depends on the selected person, not on whether the
    // gallery is mid-refetch - keep it rendered across toggle-triggered
    // reloads instead of blanking it out while state.loading is true.
    if ( this.props.selectedIndex === -100 ){
      var selectedName = 'Unassigned'
      var further_unlikely = false
      var highlight_img = <img src='https://peoplefacts.com/wp-content/uploads/2014/06/mystery-person.png' alt="highlight" className='highlight_img' />
    }else{
      further_unlikely = this.props.people[this.props.selectedIndex].further_images_unlikely
      this.state.active = further_unlikely
      selectedName = this.props.people[this.props.selectedIndex].person_name
      var id_num = this.props.people[this.props.selectedIndex].id
      var id_url = store.get('api_url') + '/keyed_image/face_highlight/?access_key='
        + this.state.access_key + '&id=' + id_num + '&v=' + this.state.highlightVersion
      highlight_img = <img src={id_url} className="highlight_img"  alt="highlight" />
    }

    var body = null
    if (! this.state.loading){
      body = <Gallery
                    poss_ids = {this.state.possible_ids}
                    img_ids={this.state.imagery_ids}
                    people={this.props.people}
                    unassigned_person_id={this.props.unassigned_person_id}
                    ignore_person_id={this.props.ignore_person_id}
                    current_person_id={this.props.api_id}
                    ready = {this.state.loading}
                    updatePersonList={this.props.updatePersonList}
                    updatePersonCounts={this.props.updatePersonCounts}
                    unlabeled={this.props.unlabeled}
                    only_unverified={this.props.only_unverified}
                    onHighlightUpdated={this.bumpHighlightVersion}
                  />
    }

    return(
      <div>
        <div className='screenHeader'>
          {highlight_img}
          <PersonNameContextWrapper>
            <span className='header_person_name'>{selectedName}</span>
          </PersonNameContextWrapper>
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

        <Menu id={PERSON_NAME_MENU_ID}>
          <Item onClick={this.openRename}>
            Rename person
          </Item>
        </Menu>

        {body}
      </div>
    );
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
