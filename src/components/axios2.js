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


let authToken = '';

const refreshAuthLogic = (failedRequest) => {

    const bodyParameters = {
       refresh: store.get('refresh_token')
    };

    // console.log("Refresh")
    // console.log(failedRequest)
    // try{
    //   console.log("Try")
    return axiosInstance.post(store.get('api_url') + '/token/refresh/', bodyParameters)
      .then((tokenRefreshResponse) => {
        // console.log("Then?")
        // console.log("Refresh logic", tokenRefreshResponse)
        console.log(tokenRefreshResponse.data)
        const access_token = tokenRefreshResponse.data.access
        localStorage.setItem('access_token', access_token);
        failedRequest.response.config.headers.Authorization = 'JWT ${access_token}';
        
        // failedRequest.response.config.headers.Authorization = 'JWT ${tokenRefreshResponse.data.token}';
        // console.log("Resolved.")
        return Promise.resolve();
    }).catch(
      () => {
        console.log("Axios catch")
      }
    );
    // }catch(e){
    //   console.log("axios error", e)
    // }finally{
    //   console.log("Finally")
    // }
    // return Promise.resolve(true);
  }

function getAuthToken() {
    if (authToken) {
        console.log(`Token exists: ${authToken}`);
        return `Token ${authToken}`;
    }
    return null;
}

var st = new Date()

axiosInstance.interceptors.request.use((request) => {
    var et = new Date()
    var refresh_url = store.get('api_url') + '/token/refresh/'
    var elapsed = et - st
    if (elapsed > 3000 && request.url !== refresh_url){// 300 seconds - 5 minutes
        console.log("Need to request a new key.", elapsed)
        console.log(request.url)
            // return request
        const bodyParameters = {
           refresh: store.get('refresh_token')
        };
        axiosInstance.post(refresh_url, bodyParameters).then((tokenRefreshResponse) => {
            // console.log("Then?")
            // console.log("Refresh logic", tokenRefreshResponse)
            console.log(tokenRefreshResponse.data)
            // const access_token = tokenRefreshResponse.data.access
            // localStorage.setItem('access_token', access_token);
            // // failedRequest.response.config.headers.Authorization = 'JWT ${access_token}';
            
            // // failedRequest.response.config.headers.Authorization = 'JWT ${tokenRefreshResponse.data.token}';
            // // console.log("Resolved.")
            // console.log(`Requesting ${request.url}`, et - st);
            // st = new Date()
        })
            return request
    } else{
        return request
    }
    // console.log(`Requesting ${request.url}`, et - st);
    // const token = getAuthToken();
    // // if (token) {
    // //     request.headers.Authorization = token;
    // // }
    // return request;
});

const options = {
  statusCodes: [401, 403]
}

// createAuthRefreshInterceptor(axiosInstance, refreshAuthLogic, options)


export default axiosInstance