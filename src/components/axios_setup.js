// import React from 'react';
import store from 'store';
import axios from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';
import axiosRetry from 'axios-retry';

var access_token = store.get('access_token')
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

// axios.interceptors.response.use(response => response)
// axios.interceptors.response.use(
//   response => response,
//   error => {console.log("Error 1")}
// )

// axiosInstance.interceptors.response.use(response => response)
// axiosInstance.interceptors.response.use(
//   response => response,
//   error => {console.log("Error 2")}
// )

const refreshAuthLogic = failedRequest => {

    const bodyParameters = {
       refresh: store.get('refresh_token')
    };

    console.log("Refresh")
    console.log(failedRequest)
    try{
      console.log("Try")
      axios.post(store.get('api_url') + '/token/refresh/', bodyParameters)
        .then(tokenRefreshResponse => {
          console.log("Then?")
          console.log("Refresh logic", tokenRefreshResponse)
          localStorage.setItem('access_token', tokenRefreshResponse.data.access);
          failedRequest.response.config.headers['Authorization'] = 'JWT ' + tokenRefreshResponse.data.token;
          console.log("Resolved.")
          return Promise.resolve(true);
      }).catch(
        () => {
          console.log("Axios catch")
        }
      );
    }catch(e){
      console.log("Catch")
      console.log("axios error", e)
    }finally{
      console.log("Finally")
    }
    return Promise.resolve(true);
  }

const options = {
  statusCodes: [401, 403]
}

createAuthRefreshInterceptor(axiosInstance, refreshAuthLogic, options)


export default axiosInstance