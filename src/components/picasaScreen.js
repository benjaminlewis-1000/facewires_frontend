import React from 'react';
import './misc.css';
import '../css/menubar.css'
import '../css/sidebar.css'
import '../css/image_tile.css'
// import PersonList from './personList2'
// import FolderList from './folderList'
// import ImageScreen from './imageScreen'
import store from 'store';
// import { Grid, Form, Header, Message, Menu,Sidebar, Dropdown} from 'semantic-ui-react';
// import { Redirect, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';

import MenuExampleTabular from './tabular_menu.js'
import FolderSidebar from './folderSidebar'
import PersonSidebar from './personSidebar'
import ImageScreen from './imageScreen'
import axiosInstance from './axios_setup'
// var jsonDataFromXml = new XMLParser().parseFromString(xmlData);


import CircleLoader from "react-spinners/CircleLoader";

const styleLink = document.createElement("link");
styleLink.rel = "stylesheet";
styleLink.href = "https://cdn.jsdelivr.net/npm/semantic-ui/dist/semantic.min.css";
document.head.appendChild(styleLink);

// const DropdownExampleDropdown = () => (
  
// )



// export default DropdownExampleSearchSelection

class PicasaScreen extends React.Component{
  
  constructor(props) {
    super(props);

    this.state = {
      people : [], 
      folders: [],
      people_url: store.get('api_url') + '/people/?fields=person_name,url,num_faces,id,num_possibilities',
      dir_url: store.get('api_url') + '/directories/?fields=id,url,top_level_name,first_datesec,mean_datesec,num_images,year',
      param_url: store.get('api_url') + '/parameters/',
      loading: true,
      names_fetched: false,
      dirs_fetched: false,
      params_fetched: false,
      tab: 'People',
      unlabeled_toggle: false,
      api_id: 0,
      selectedIndex: -100,
      
    };
          
    // console.log(this.state.param_url)
    axiosInstance.get(this.state.param_url)    
    .then( (response) => {
      // var info = response.data
      var access_key = response.data.random_access_key;

      this.setState({params_fetched: true})
      store.set('access_key', access_key);

      if (this.state.names_fetched && this.state.dirs_fetched){
        this.setState({loading: false})
      }
    })

    this.updatePersonList = this.updatePersonList.bind(this)
        

  }


  compareNames(a, b) {
    // Use toUpperCase() to ignore character casing
    const nameA = a.person_name.toUpperCase();
    const nameB = b.person_name.toUpperCase();

    let comparison = 0;
    if (nameA > nameB) {
      comparison = 1;
    } else if (nameA < nameB) {
      comparison = -1;
    }
    return comparison;
  }

  componentDidMount(){



    function compareDirectories(a, b) {
      // Use toUpperCase() to ignore character casing
      const timeA = a.first_datesec;
      const timeB = b.first_datesec;
      const yearA = a.year;
      const yearB = b.year;

      let comparison = 0;
      if (yearA > yearB) {
        comparison = 1;
      } else if (yearA < yearB) {
        comparison = -1;
      } else if (yearA === yearB){
        if (timeA > timeB) {
          comparison = 1;
        } else if (timeA < timeB) {
          comparison = -1;
        } 
      }
      // Reverse order - multiply by -1
      return comparison * -1;
    }

    // console.debug("Picasa screen mounted")
    var next_url = this.state.people_url;
    while (next_url !== null){
      // console.log(next_url, next_url !== null)
      // let data = this.getNames(next_url);
      // console.log(data)
      next_url = null
      this.compile_api_list(this.state.people_url, 'name_array').then(
        (resp) =>{
          resp.sort(this.compareNames)
          resp = resp.filter(element => element.num_faces > 0)
          this.setState({'people': resp})
          this.setState({names_fetched: true}); 
          this.setState({api_id: resp[0].id})
          if (this.state.dirs_fetched && this.state.params_fetched){
            this.setState({loading: false})
          }
          var unassigned_person_id  = resp.find(element =>element.person_name === "_NO_FACE_ASSIGNED_" || element.person_name === 'Unassigned');
          var ignore_person_id  = resp.find(element =>element.person_name === ".ignore" );
          this.setState({unassigned_id: unassigned_person_id.id})
          this.setState({ignore_person_id: ignore_person_id.id})

          console.log(this.state)
        }
      )
      this.compile_api_list(this.state.dir_url, 'folder_aray').then(
        (resp) =>{
          resp.sort(compareDirectories)
          // console.log("Folder length", resp.length)
          for (var i = resp.length - 1; i >= 0; i--){
            if (resp[i].num_images === 0){
              resp.splice(i, 1)
            }
          }
          // console.log("Folder length after: ", resp.length)
          this.setState({'folders': resp})
          this.setState({dirs_fetched: true}); 
          if (this.state.names_fetched && this.state.params_fetched){
            this.setState({loading: false})
          }

          console.log(this.state)
        }
      )
      // console.log("Now you can continue")
      
      // while ( ! ( this.state.dirs_fetched  &&  this.state.names_fetched) ){
      //   setTimeout(() => 
      //   {
      //   console.log('wait')
      //   }, 1000)
      // }
      // this.setState({loading: false});
    }
  }


////////////////////////////////////////
///  Get all the names or folders, with a linked list.
////////////////////////////////////////
  compile_api_list = async (base_url, state_field) => {
    var data_array = [];
    // console.log('Compile a list: ', base_url, "Base url")
    // return "hi"
    var next_url = base_url;
    try{
      while (next_url !== null){
        // Await waits for the function to load and the then to execute
        // before continuing the loop.
        await this.fetchAPIURL(next_url, "adsf").then( 
          (resp) => {
            // console.log(resp)
            next_url = resp.data.next
            data_array = data_array.concat(resp.data.results);

          }
        )
      }
    }catch(e){
      console.log('error', e)
    }
    // console.log(data_array)

    return data_array
  }


  fetchAPIURL = async (url, sort_function) => {

    const names = new Promise((resolve, reject) => {
        axiosInstance.get(url)
        .then( (response) => {
          resolve({data: response.data});
        }
        , (namelist_error) => {
          console.log("CORS ERROR: ", namelist_error)
        }
        )
        .catch(err => {
            console.log(err)
        });
    })
           

    return names

    
  }

////////////////////////////////////////
///  END of name fetching
////////////////////////////////////////


////////////////////////////////////////
///  START of callbacks
////////////////////////////////////////


  tabSelectCallback = (childData) => {
    this.setState({tab: childData})
  }
  
  setApiUrl = (childType, childUrl, childId, index) => {
    // console.debug("API folder: ", childData, childId)
    console.log(index)
    if (childType === 'folder'){
      this.setState({api_source: childUrl})
      this.setState({api_id: childId})
      this.setState({selectedIndex: index})
    }else if (childType === 'person'){
      this.setState({api_source: childUrl})
      this.setState({api_id: childId})
      this.setState({selectedIndex: index})
    }
    // console.log(this.state.image_api_id)
  }

  setToggle = (childField) => {
    console.debug( "Child field: ", childField)
    this.setState(prevState => ({
      [childField] : !prevState[childField]
    }))
    // console.log(this.state)
  }

////////////////////////////////////////
///  END of callbacks
////////////////////////////////////////

  updatePersonList(person_name, api_key){
    console.log("Updating person list in PicasaScreen", person_name, api_key, this.state.people)
    var new_object = {'id': api_key,
                      'num_faces' : 1,
                      'num_possibilities': 0,
                      'person_name': person_name,
                      'url': store.get('api_url') + '/people/' + api_key + '/'}

    var person_list = this.state.people.concat(new_object)
    person_list.sort(this.compareNames)
    this.setState({people: person_list})

    console.log(new_object)
  }

  renderSidebar() {

    if ( this.state.tab === "Tools" ){
      return <p>Tools</p>
    }
      
    if ( this.state.tab === "People" ){
      return (
      <div>
        <PersonSidebar people={this.state.people} setSource={this.setApiUrl} unlabeled={this.state.unlabeled_toggle} />
        <ImageScreen 
          tab={this.state.tab} 
          api_source={this.state.api_source} 
          api_id={this.state.api_id}
          people={this.state.people}
          unassigned_person_id={this.state.unassigned_id}
          ignore_person_id={this.state.ignore_person_id}
          updatePersonList={this.updatePersonList}
          unlabeled={this.state.unlabeled_toggle}
          selectedIndex={this.state.selectedIndex}
        />
      </div>
      );
    }
      
    if ( this.state.tab === "Folders" ){
      return (
      <div>
        <FolderSidebar folders={this.state.folders} setSource={this.setApiUrl} />
        <ImageScreen 
          tab={this.state.tab} 
          api_source={this.state.api_source} 
          api_id={this.state.api_id} 
          people={this.state.people}
          unlabeled={this.state.unlabeled_toggle}
          selectedIndex={this.state.selectedIndex}
        />
      </div>
      );
    }
      
    return <p>Unknown state</p>
    
  }

  render() {

    var {history} = this.props;
    return(

      
      <div>

        <Helmet>
          <title>Face Classifier</title>
        </Helmet>

        

        <React.Fragment>
          { this.state.loading ? (
            <div className='spinBackground'>
              <div className="loader">
                <CircleLoader
                // css={override}
                size={250}
                color={"#993333"}
                loading={this.state.loading}
                />
              </div>
            </div>
            ) : (
            <div>
              <MenuExampleTabular tabSelectCallback = {this.tabSelectCallback} setToggle={this.setToggle} />
              <div>
                {this.renderSidebar()}
              </div>
            </div>
            )
          }
        </React.Fragment>
          
      </div>
    );
  }
}


const handleLogout = history => () => {
  console.log("Logging out")
  store.remove('loggedIn');
  // history.push('/login');
  window.location = "/login"
};

export default PicasaScreen;
