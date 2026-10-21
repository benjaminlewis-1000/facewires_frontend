import store from 'store';
import { FRONTEND_URL, AUTHELIA_LOGIN_URL } from './config';

// Persisted (not just console.log'd) because bounceToLogin() navigates the
// whole page away immediately after - a console message would be gone
// before anyone could read it, and the user reported not always having
// devtools open anyway. picasaScreen.jsx reads this once on next mount and
// shows it as a dismissible banner, then clears it - see "authBounceBanner"
// there. Deliberately excludes cookie VALUES, only names/presence - this is
// shown back to the user in-app, not worth risking a session token leaking
// into a screenshot.
const LAST_BOUNCE_DIAGNOSTIC_KEY = 'lastAuthBounceDiagnostic';

export function captureBounceDiagnosticForLogout(reason, detail){
  captureBounceDiagnostic(reason, detail);
}

function captureBounceDiagnostic(reason, detail){
  try {
    const cookieNames = document.cookie
      .split('; ')
      .filter(Boolean)
      .map(row => row.split('=')[0]);
    store.set(LAST_BOUNCE_DIAGNOSTIC_KEY, {
      reason,
      detail: detail || null,
      readableCookieNames: cookieNames,
      path: window.location.pathname,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // store/localStorage can throw (private browsing, quota, etc.) - losing
    // this diagnostic isn't worth failing the actual redirect over.
    console.error('Failed to capture auth-bounce diagnostic', e);
  }
}

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
export function bounceToLogin(reason, detail){
  if (redirecting) return;
  redirecting = true;
  console.log("Not logged in - bouncing to Authelia SSO pipeline");
  captureBounceDiagnostic(reason || 'unknown', detail);
  const returnUrl = `${FRONTEND_URL}/faces`;
  window.location.href = `${AUTHELIA_LOGIN_URL}?next=${encodeURIComponent(returnUrl)}`;
}

// Read once (by picasaScreen.jsx on mount) and cleared immediately after -
// deliberately one-shot, so it doesn't keep re-showing the same stale
// diagnostic across every later reload.
export function takeLastBounceDiagnostic(){
  const diagnostic = store.get(LAST_BOUNCE_DIAGNOSTIC_KEY)
  if (diagnostic) store.remove(LAST_BOUNCE_DIAGNOSTIC_KEY)
  return diagnostic || null
}
