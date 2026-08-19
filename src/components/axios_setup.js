import store from 'store';
import axios from 'axios';
import axiosRetry from 'axios-retry';

// Grab the base API url from your config store
const apiBaseUrl = store.get('api_url') || 'https://picasa.exploretheworld.tech/api';

// const axiosInstance = axios.create({
//     baseURL: apiBaseUrl,
//     timeout: 15000,
//     withCredentials: true,  // <-- CRUCIAL: Attaches your Django session cookie to cross-domain calls
//     headers: {
//         'Content-Type': 'application/json',
//         'accept': 'application/json',
//     }
// });

const axiosInstance = axios.create({
    baseURL: apiBaseUrl,
    timeout: 15000,
    withCredentials: true,  
    // Add these two lines:
    xsrfCookieName: 'csrftoken',      // The name of the cookie Django sets
    xsrfHeaderName: 'X-CSRFToken',    // The header Django expects to receive
    headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json',
    }
});

// Solves random network glitches / CORS blips by retrying
axiosRetry(axiosInstance, { retries: 3 });

export default axiosInstance;