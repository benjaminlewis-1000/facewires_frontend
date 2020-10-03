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


export default axiosInstance