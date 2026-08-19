import store from 'store';
import axios from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';
import axiosRetry from 'axios-retry';

// Grab the base API url from your config store with a reliable fallback
const apiBaseUrl = store.get('api_url') || 'https://picasa.exploretheworld.tech/api';

var access_token = store.get('access_token');

const axiosInstance = axios.create({
    baseURL: apiBaseUrl,
    timeout: 15000,
    withCredentials: true,  // Crucial for passing cookies across domains
    xsrfCookieName: 'csrftoken',
    xsrfHeaderName: 'X-CSRFToken',
    headers: {
        'Authorization': access_token ? "JWT " + access_token : '',
        'Content-Type': 'application/json',
        'accept': 'application/json',
    }
});

// Solves random network glitches / CORS blips by retrying
axiosRetry(axiosInstance, { retries: 3 });

const refreshAuthLogic = (failedRequest) => {
    const bodyParameters = {
       refresh: store.get('refresh_token')
    };

    return axiosInstance.post(apiBaseUrl + '/token/refresh/', bodyParameters)
      .then((tokenRefreshResponse) => {
        const access_token = tokenRefreshResponse.data.access;
        store.set('access_token', access_token);
        failedRequest.response.config.headers.Authorization = `JWT ${access_token}`;
        return Promise.resolve();
    }).catch(() => {
        console.log("Axios refresh catch error");
    });
};

function getNewToken(){
    const bodyParameters = {
       refresh: store.get('refresh_token')
    };

    axiosInstance.post(apiBaseUrl + '/token/refresh/', bodyParameters)
      .then((tokenRefreshResponse) => {
        const access_token = tokenRefreshResponse.data.access;
        store.set('access_token', access_token);
    }).catch(() => {
        console.log("Axios background token refresh catch error");
    });
}

// Get a new JWT token every 3 minutes
setInterval(getNewToken, 3 * 60 * 1000);

axiosInstance.interceptors.request.use((request) => {
    var access = store.get('access_token');
    if (access) {
        request.headers.Authorization = "JWT " + access;
    }
    return request;
});

const options = {
  statusCodes: [401, 403]
};

createAuthRefreshInterceptor(axiosInstance, refreshAuthLogic, options);

export default axiosInstance;