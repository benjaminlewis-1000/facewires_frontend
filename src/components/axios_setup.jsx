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

// Solves random network glitches / CORS blips by retrying. Also covers a
// backend/reverse-proxy that's still warming up right after a restart
// (502/503, or a slow first request) - the default retryDelay is
// axios-retry's own `noDelay` (always 0ms), so without this all 3
// retries used to fire back-to-back within milliseconds of the original
// failure, giving a genuinely slow-to-recover backend no real time to
// come back before the caller gave up. exponentialDelay with a 1000ms
// factor spaces retries roughly 1s/2s/4s apart instead - still fast for
// an actual transient blip, but enough breathing room for a real cold
// start. This is what picasaScreen.jsx's three initial-load fetches ride
// on for their "Something went wrong" fallback - see CLAUDE.md.
axiosRetry(axiosInstance, {
    retries: 3,
    retryDelay: (retryCount, error) => axiosRetry.exponentialDelay(retryCount, error, 1000),
});

export default axiosInstance;