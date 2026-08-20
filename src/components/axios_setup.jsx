import store from 'store';
import axios from 'axios';
import axiosRetry from 'axios-retry';

// Grab the base API url from your config store with a reliable fallback
const apiBaseUrl = store.get('api_url') || 'https://picasa.exploretheworld.tech/api';

const axiosInstance = axios.create({
    baseURL: apiBaseUrl,
    timeout: 15000,
    withCredentials: true,   // Crucial for passing cookies across domains
    withXSRFToken: true,     // Needed so axios attaches X-CSRFToken on cross-subdomain requests
    xsrfCookieName: 'csrftoken',
    xsrfHeaderName: 'X-CSRFToken',
    headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json',
    }
});

// Solves random network glitches / CORS blips by retrying
axiosRetry(axiosInstance, { retries: 3 });

export default axiosInstance;