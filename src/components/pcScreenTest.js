import React from 'react';
import './picasaScreen.css';
import './misc.css';
import PersonList from './personList2'
import FolderList from './folderList'
import ImageScreen from './imageScreen'
import axios from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';
import store from 'store';
// var jsonDataFromXml = new XMLParser().parseFromString(xmlData);

var access_token = store.get('access_token')
// console.log("Acess token: " , access_token)

const axiosInstance = axios.create({
    // baseURL: store.get('api_url'),
    timeout: 15000,
    headers: {
        'Authorization': "JWT " + access_token,
        'Content-Type': 'application/json',
        'accept': 'application/json',
        // 'Access-Control-Allow-Origin': '*'
    }
});

// const config = {
//     headers: { Authorization: `Bearer ${token}` }
// };


const refreshAuthLogic = failedRequest => {

    const bodyParameters = {
       refresh: store.get('refresh_token')
    };

    axios.post(store.get('api_url') + '/token/refresh/', bodyParameters)
      .then(tokenRefreshResponse => {
        localStorage.setItem('access_token', tokenRefreshResponse.data.access);
        failedRequest.response.config.headers['Authorization'] = 'Bearer ' + tokenRefreshResponse.data.token;
        console.log("Refresh logic")
        return Promise.resolve();
    });
  }

const options = {
  statusCodes: [401, 403]
}

createAuthRefreshInterceptor(axiosInstance, refreshAuthLogic, options)
//     axios: axiosInstance,
//     refreshAuthLogic: (failedRequest: any) => Promise<any>,
//     options: AxiosAuthRefreshOptions = {}
// ): number;

/*
axiosInstance.interceptors.response.use(
    response => response,
    error => {
      const originalRequest = error.config;
      
      if ( (error.response.status === 401 && error.response.statusText === "Unauthorized") || error.response.status === 403){ // || error.response.status == 403) {
          const refresh_token = localStorage.getItem('refresh_token');

          return axiosInstance
              .post('/token/refresh/', {refresh: refresh_token})
              .then((response) => {

                  localStorage.setItem('access_token', response.data.access);
                  localStorage.setItem('refresh_token', response.data.refresh);

                  axiosInstance.defaults.headers['Authorization'] = "JWT " + response.data.access;
                  originalRequest.headers['Authorization'] = "JWT " + response.data.access;

                  return axiosInstance(originalRequest);
              })
              .catch(err => {
                  console.log(err)
              });
      }
      console.log("Returning error")
      return Promise.reject(error);
  }
);*/

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
      people_url: store.get('api_url') + '/people/?fields=person_name,url,num_faces'
      
      // images : [
      //   // {url:'https://png.pngtree.com/png-clipart/20190515/original/pngtree-beautiful-hologram-water-color-frame-png-image_3643167.jpg',frequency:'000'},
      //   {url:'https://picsum.photos/200',frequency:'000'}
      // ],
      // urls : ['https://png.pngtree.com/png-clipart/20190515/original/pngtree-neon-bar-circular-border-png-image_3843928.jpg', 'https://png.pngtree.com/png-clipart/20190515/original/pngtree-beautiful-hologram-water-color-frame-png-image_3643167.jpg']
      // urls: ['https://picsum.photos/200','https://picsum.photos/200','https://picsum.photos/200','https://picsum.photos/200','https://picsum.photos/200','https://picsum.photos/200','https://picsum.photos/200']
    };
    console.debug("People: ", this.state.people_url)

          // ? this.setState(applySetResult(result))
          // : this.setState(applyUpdateResult(result));
          

    // console.log("namelist", namelist)
        
    for (var i = 0; i < (Math.round(Math.random() * 80) + 25); i++) {
        urls[i] = "https://picsum.photos/id/" + (i + 5) * mult + "/200/200";
    }

  }

  componentDidMount(){
    console.debug("Picasa screen mounted")
    this.getNames(this.state.people_url)
  }

  // getNames = async(url) => {

  //   const a = new Promise((resolve, reject) => {

  //     axiosInstance.get(url)
  //     .then( (response) => {
  //       // this.state.image_ids =  response.data['url_keys']
  //       var data = response.data
  //       return resolve();
  //     }, (imlist_error) => {
  //       console.log(imlist_error)
  //     }).catch(err => {
  //         console.log(err)
  //     });

  //   });

  //   return await a;
  // }
    
  // getNames = async (url) => {

  //   const names = new Promise((resolve, reject) => {
  //     setTimeout( function (response) { 
  //       axiosInstance.get(url)
  //       .then(reponse => {
  //         resolve({data: response.data});
  //       });
  //     }, 4000);
  //   })
           

  //   return names

    
  // }


      // next === null
      //   ? this.setState(applySetResult(result))
      //   : 

    // var namelist = getNames(api_url) //.then(console.log(allnames))

  
  // setUrls = (url_list) => {
  //   this.setState({
  //     urls: url_list
  //   })
  // }

  // getNames = (url) => {
  //   console.debug(url)
  //   axiosInstance.get(url)
  //   .then( (response) => {
      
  //     var data = response.data;
  //     var name_data = data.results
  //     var next = data.next;

  //     var joined = this.state.people.concat(name_data)
  //     this.setState({people: joined})

  //     console.debug("Person name state: ", this.state)
  //     if ( next !== null ){
  //       console.debug("Getting next")
  //       this.getNames(next)
  //     }
  //   }, (error) => {

  //     console.log(error)
  //     console.log(error.response, error.response.data);
  //   }).catch(err => {
  //       console.log(err)
  //   });
  // }
  
  setSource = (source, type) => {
    console.log("Set top-level source to : " + source + ", type = " + type)
    this.setState({ source })
  }
  
  renderPersonList(){
    return (
      <PersonList
        people={this.state.people}
        parentState = {this.state}
        setSource = {this.setSource}
        setUrls = {this.setUrls}
      />
    );
  }
  
  renderFolderList(){
    return (
      <FolderList
        folders={this.state.folders}
        setSource = {this.setSource}
        setUrls = {this.setUrls}
      />
    );
  }
  
  // urls = 
  renderImageTest(){
    
    
    return(
      <ImageScreen
        // urls = {this.state.urls}
        urls = {this.state.urls}
      />
      ); 
  }

  renderSettingsBar(){
    return(
        <div className = "settingsBar">
          Settings
        </div>
    );
  }
  // this.getNames(this.state.people_url)
  
  render() {

    return(

      
      <div id="screenWrapper">
        <div id="picasaScreenSidebar">
          {this.renderFolderList()}
          {this.renderPersonList()}
        </div>
        <div id="picasaWorkArea">
          {this.renderImageTest()}
          {this.renderSettingsBar()}
        </div>
      </div>
    );
  }
}

export default PicasaScreen;
