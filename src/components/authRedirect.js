import { FRONTEND_URL, AUTHELIA_LOGIN_URL } from './config';

// True for a 401/403 from axios - i.e. the Django/Authelia session actually
// expired or was invalid, not a network blip. Shared by axios_setup.jsx's
// global interceptor and picasaScreen.jsx's initial-fetch catch blocks, so
// both agree on exactly what counts as "this isn't a server-reachability
// problem, it's an auth problem".
export function isAuthFailure(error){
  return !!(error && error.response && (error.response.status === 401 || error.response.status === 403))
}

// Guards against firing the redirect twice - e.g. axios_setup.jsx's
// interceptor and MainApp's own visibility-triggered recheck both landing
// on the same dead session within the same tick. window.location.href
// navigation is async, so a second call before it completes would just be
// redundant, not harmful, but there's no reason to let it happen.
let redirecting = false;

// The one place that actually leaves the app for Authelia's login flow.
// Previously only ever called from MainApp's mount-time isLoggedIn() check
// - every other auth failure discovered later in the session's life (a
// person-switch fetch, the 10-minute people-list poll, a bulk action) used
// to just silently no-op, trusting a since-false assumption that "MainApp's
// own check will catch it momentarily". See CLAUDE.md's "background-tab
// bug" writeup for the full story.
export function bounceToLogin(){
  if (redirecting) return;
  redirecting = true;
  console.log("Not logged in - bouncing to Authelia SSO pipeline");
  const returnUrl = `${FRONTEND_URL}/faces`;
  window.location.href = `${AUTHELIA_LOGIN_URL}?next=${encodeURIComponent(returnUrl)}`;
}
