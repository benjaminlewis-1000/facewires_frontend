import store from 'store';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { isAuthFailure, bounceToLogin } from './authRedirect';

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
// proxy) and served its own login page (isLoggedIn.jsx's own check
// already detects exactly this for its one call). Without this
// interceptor, axios sees a "successful" response and every .then() down
// the line tries to treat that HTML string as JSON - picasaScreen.jsx's
// three initial-load fetches (compile_api_list's `[...firstPageData.results]`)
// crash with a plain TypeError, which isAuthFailure() (status-code based)
// doesn't recognize as an auth problem either, so it fell through to the
// generic "Something went wrong" error screen.
//
// This isn't always a real logout, though - per the user (2026-09-11,
// after the reported bug): after the tab sits idle a while, the very
// first request back can hit this HTML response while Authelia is mid-
// refresh of the session cookie, and a moment later (or on a plain
// reload) the exact same request succeeds - the session was never
// actually dead. Bouncing straight to a fresh login screen for that
// window would "fix" the visible error at the cost of a needless re-
// login the user didn't actually need. So: retry the identical request a
// few times with a short, increasing delay first (HTML_RETRY_DELAYS_MS)
// - long enough to ride out a real refresh-in-progress, most of which
// resolve on the first or second retry with the user never noticing
// anything happened. Only once every retry still comes back HTML is it
// treated as a genuine expired session: synthesized as a 401 so every
// existing isAuthFailure() check (and any future one) recognizes it the
// same way it already recognizes a real 401/403.
//
// Correction to this comment's old claim: "MainApp's own background
// isLoggedIn() check is what actually redirects to a fresh login" is only
// true for the very first page load - that check runs exactly once, at
// mount. Any auth failure discovered later (this HTML-retry path, a plain
// 401/403 response, the 10-minute people-list poll, a person-switch fetch)
// used to just silently no-op at every call site, each trusting this same
// now-false assumption - see CLAUDE.md's "background-tab bug" writeup.
// bounceToLogin() below is the actual fix: called directly from both
// failure paths in this interceptor, so a confirmed auth failure redirects
// no matter when in the session's life it's discovered.
const HTML_RETRY_DELAYS_MS = [1000, 2000, 4000];

axiosInstance.interceptors.response.use(
    async (response) => {
        const contentType = response.headers['content-type'] || '';
        if (!contentType.includes('text/html')) return response;

        const config = response.config;
        // Tracked on the (reused, not cloned) config object across the
        // recursive retries below, rather than a closure variable - each
        // retry re-enters this same interceptor via axiosInstance.request,
        // so this is what keeps the count accurate instead of resetting
        // per attempt, and is what bounds the recursion to exactly
        // HTML_RETRY_DELAYS_MS.length attempts.
        config._htmlRetryCount = (config._htmlRetryCount || 0) + 1;
        if (config._htmlRetryCount > HTML_RETRY_DELAYS_MS.length) {
            bounceToLogin();
            const authError = new Error('Received HTML instead of JSON after retries - session expired (Authelia SSO redirect).');
            authError.response = { ...response, status: 401 };
            throw authError;
        }
        await new Promise(resolve => setTimeout(resolve, HTML_RETRY_DELAYS_MS[config._htmlRetryCount - 1]));
        return axiosInstance.request(config);
    },
    (error) => {
        // A real 401/403 straight from the server (not the synthesized-
        // from-HTML case above, which calls bounceToLogin() itself before
        // ever reaching here) - same redirect, same reasoning.
        if (isAuthFailure(error)) bounceToLogin();
        return Promise.reject(error);
    },
);

export default axiosInstance;