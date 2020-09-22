import React from 'react';
import './picasaScreen.css';
import './misc.css';
// import PersonList from './personList2'
// import FolderList from './folderList'
// import ImageScreen from './imageScreen'
import axios from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';
import store from 'store';
import axiosRetry from 'axios-retry';
// var jsonDataFromXml = new XMLParser().parseFromString(xmlData);


import CircleLoader from "react-spinners/CircleLoader";
// var jsonDataFromXml = new XMLParser().parseFromString(xmlData);

var access_token = store.get('access_token')
// console.log("Acess token: " , access_token)

const axiosInstance = axios.create({
    // baseURL: store.get('api_url'),
    timeout: 5000,
    mode: 'cors',
    headers: {
        'Authorization': "JWT " + access_token,
        'Content-Type': 'application/json',
        'accept': 'application/json',
        // 'Access-Control-Allow-Origin': '*'
    }
});

// Solves random CORS failures
axiosRetry(axiosInstance, {retries: 3});

// const config = {
//     headers: { Authorization: `Bearer ${token}` }
// };


const refreshAuthLogic = failedRequest => {

    const bodyParameters = {
       refresh: store.get('refresh_token')
    };

    console.log("Refresh")
    try{
      axios.post(store.get('api_url') + '/token/refresh/', bodyParameters)
        .then(tokenRefreshResponse => {
          console.log("Refresh logic")
          localStorage.setItem('access_token', tokenRefreshResponse.data.access);
          failedRequest.response.config.headers['Authorization'] = 'Bearer ' + tokenRefreshResponse.data.token;
          return Promise.resolve(true);
      });
    }catch(e){
      console.log("axios error", e)
    }finally{
      console.log("Finally")
  
    }
  }

const options = {
  statusCodes: [401, 403]
}

createAuthRefreshInterceptor(axiosInstance, refreshAuthLogic, options)

class PicasaScreen extends React.Component{
  
  constructor(props) {
    super(props);
    var urls = []
    var mult = Math.round(Math.random() * 9) + 1

    // console.log(access_token)
        
    this.state = {
      people : [], 
      folders: [],
      urls: urls,
      people_url: store.get('api_url') + '/people/?fields=person_name,url,num_faces',
      dir_url: store.get('api_url') + '/directories/?fields=id,url,top_level_name,first_datesec,mean_datesec,num_images,year',
      loading: true,
      names_fetched: false,
      dirs_fetched: false
      
      // images : [
      //   // {url:'https://png.pngtree.com/png-clipart/20190515/original/pngtree-beautiful-hologram-water-color-frame-png-image_3643167.jpg',frequency:'000'},
      //   {url:'https://picsum.photos/200',frequency:'000'}
      // ],
      // urls : ['https://png.pngtree.com/png-clipart/20190515/original/pngtree-neon-bar-circular-border-png-image_3843928.jpg', 'https://png.pngtree.com/png-clipart/20190515/original/pngtree-beautiful-hologram-water-color-frame-png-image_3643167.jpg']
      // urls: ['https://picsum.photos/200','https://picsum.photos/200','https://picsum.photos/200','https://picsum.photos/200','https://picsum.photos/200','https://picsum.photos/200','https://picsum.photos/200']
    };
    // console.debug("People: ", this.state.people_url)

          // ? this.setState(applySetResult(result))
          // : this.setState(applyUpdateResult(result));
          

        
    for (var i = 0; i < (Math.round(Math.random() * 80) + 25); i++) {
        urls[i] = "https://picsum.photos/id/" + (i + 5) * mult + "/200/200";
    }

  }



  componentDidMount(){


    function compareNames(a, b) {
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
      return comparison;
    }

    console.debug("Picasa screen mounted")
    var next_url = this.state.people_url;
    while (next_url !== null){
      console.log(next_url, next_url !== null)
      // let data = this.getNames(next_url);
      // console.log(data)
      next_url = null
      this.compile_api_list(this.state.people_url, 'name_array').then(
        (resp) =>{
          resp.sort(compareNames)
          this.setState({'people': resp})
          console.log(this.state)
          //forceUpdate
          this.setState({names_fetched: true}); 
          if (this.state.dirs_fetched){
            this.setState({loading: false})
          }
        }
      )
      this.compile_api_list(this.state.dir_url, 'folder_aray').then(
        (resp) =>{
          resp.sort(compareDirectories)
          this.setState({'folders': resp})
          console.log(this.state)
          this.setState({dirs_fetched: true}); 
          if (this.state.names_fetched){
            this.setState({loading: false})
          }
          //forceUpdate
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
    console.log('Compile a list')
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
    console.log(data_array)

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
  


  render() {

    return(

      
      <div id="screenWrapper">

        <div >
          { this.state.loading ? (
            <div className="loader">
              <CircleLoader
              // css={override}
              size={250}
              color={"#993333"}
              loading={this.state.loading}
              />
            </div>
          ) : (
            <div>
            "Done Loading"
            </div>
          )}
          </div>
        </div>
    );
  }
}

export default PicasaScreen;
