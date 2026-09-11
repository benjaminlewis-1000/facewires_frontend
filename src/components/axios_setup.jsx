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

// Every real API endpoint in this app returns JSON. Getting back HTML
// instead - with a plain 200 status, not an error - means Authelia
// intercepted the request server-side (forward-auth at the reverse
// proxy) and served its own login page because the session had expired,
// most likely after the tab sat idle a while (isLoggedIn.jsx's own check
// already detects exactly this for its one call). Without this
// interceptor, axios sees a "successful" response and every .then() down
// the line tries to treat that HTML string as JSON - picasaScreen.jsx's
// three initial-load fetches (compile_api_list's `[...firstPageData.results]`)
// crash with a plain TypeError, which isAuthFailure() (status-code based)
// doesn't recognize as an auth problem either, so it fell through to the
// generic "Something went wrong" error screen instead of quietly leaving
// MainApp's own background isLoggedIn() check to redirect to login -
// reported by the user 2026-09-11 as exactly that, after the tab had been
// idle a while. Synthesizing a 401 here means every existing
// isAuthFailure() check (and any future one) recognizes this the same
// way it already recognizes a real 401/403, with no per-call-site changes
// needed.
axiosInstance.interceptors.response.use(
    (response) => {
        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('text/html')) {
            const authError = new Error('Received HTML instead of JSON - session likely expired (Authelia SSO redirect).');
            authError.response = { ...response, status: 401 };
            return Promise.reject(authError);
        }
        return response;
    },
    (error) => Promise.reject(error),
);

export default axiosInstance;