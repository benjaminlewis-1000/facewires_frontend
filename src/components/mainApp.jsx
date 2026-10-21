/* eslint-disable arrow-body-style */
import isLoggedIn from './isLoggedIn';
import { checkAutheliaSession } from './autheliaCheck';
import PicasaScreen from './picasaScreen';
import React from 'react';
import store from 'store';
import axiosInstance from './axios_setup';
import { Helmet } from 'react-helmet';
import { FRONTEND_URL, AUTHELIA_LOGIN_URL } from './config';
import { bounceToLogin, captureBounceDiagnosticForLogout } from './authRedirect';

// How often to silently ping the backend to keep the session alive while the
// tab is open, regardless of mouse/keyboard activity - replaces the old
// react-idle-timer-driven forced logout (see CLAUDE.md's "idle timeout"
// entry). Well under both Django's 30-minute sliding SESSION_COOKIE_AGE and
// Authelia's 60-minute inactivity window, so a request from this heartbeat
// alone (SESSION_SAVE_EVERY_REQUEST=True on the Django side, and this
// request passing back through Authelia's forward-auth either way) is
// enough to keep both sliding windows from ever actually elapsing just from
// the tab sitting open and unattended.
const SESSION_HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;

class MainApp extends React.Component {
  constructor(props){
    super(props);

    // Track state to show a loading screen while we wait for the backend response
    this.state = {
      loading: true,
      authenticated: false,
    };

    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.sendHeartbeat = this.sendHeartbeat.bind(this);
    this.heartbeatInterval = null;
  }

  componentDidMount() {
    // csrftoken is a plain (non-httpOnly) cookie the Django backend sets,
    // so it's readable here as a cheap client-side "probably logged in"
    // signal. If present, skip the loading gate and render immediately -
    // but it's only a hint (it isn't cleared by logout), so the real
    // isLoggedIn() check below always still runs in the background and
    // will bounce us to login if it turns out we were wrong.
    const hasCsrfCookie = document.cookie
      .split('; ')
      .some(row => row.startsWith('csrftoken='));

    if (hasCsrfCookie) {
      this.setState({ authenticated: true, loading: false });
    }

    isLoggedIn().then(loggedIn => {
      if (loggedIn) {
        this.setState({ authenticated: true, loading: false });
        this.verifyAutheliaSession();
      } else {
        bounceToLogin('mount-isLoggedIn-false');
      }
    }).catch(err => {
      console.error("SSO check failed:", err);
      if (!hasCsrfCookie) {
        this.setState({ authenticated: false, loading: false });
      }
    });

    // isLoggedIn() above only ever runs once, at mount - a session that
    // dies later (tab backgrounded/laptop asleep long enough to outlast
    // Django's sliding window, or Authelia's) used to go undetected until
    // whatever the user happened to click next hit a silent failure deep
    // in ImageScreen/PicasaScreen with no redirect and no visible error.
    // Re-checking the moment the tab becomes visible again catches it right
    // at the point the user actually returns, instead of on their next
    // click. axios_setup.jsx's interceptor is the other half of this fix -
    // it now redirects on any confirmed auth failure wherever it's
    // discovered, not just here.
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    this.heartbeatInterval = setInterval(this.sendHeartbeat, SESSION_HEARTBEAT_INTERVAL_MS);
  }

  componentWillUnmount() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    clearInterval(this.heartbeatInterval);
  }

  // Silent - no loading state, no UI change on success. Only a confirmed
  // "actually logged out" (not a network hiccup) bounces to login, same as
  // every other isLoggedIn() call site in this file.
  sendHeartbeat() {
    if (!this.state.authenticated) return;
    isLoggedIn().then(loggedIn => {
      if (!loggedIn) bounceToLogin('heartbeat-check-false');
    }).catch(() => {});
  }

  handleVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    // Nothing established yet to re-check if the initial mount check
    // hasn't resolved (or failed) - that flow already owns this case.
    if (!this.state.authenticated) return;

    isLoggedIn().then(loggedIn => {
      if (!loggedIn) bounceToLogin('visibility-recheck-false');
    }).catch(() => {
      // A network hiccup on this opportunistic check isn't a reason to log
      // the user out - same reasoning as the mount-time check's own catch.
    });
  }

  // Fires after we've already optimistically rendered the app off the
  // csrftoken/Django-session check above. Confirms against Authelia's own
  // session state and bounces to login only on a definitive "logged out" -
  // a failed/ambiguous check (network, CORS) is left alone.
  verifyAutheliaSession() {
    checkAutheliaSession().then(stillLoggedIn => {
      if (stillLoggedIn === false) {
        console.log("Authelia session is logged out - bouncing to SSO login");
        bounceToLogin('authelia-session-check-false');
      }
    });
  }

  render() {
    const { loading, authenticated } = this.state;

    // 1. Show a clean placeholder while the background network ping is running
    if (loading) {
      return (
        <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif', color: '#666' }}>
          Verifying secure SSO session...
        </div>
      );
    }

    // 2. If loading finished but auth failed, render nothing while the browser finishes redirecting
    if (!authenticated) {
      return null;
    }

    // 3. Render your actual application once authenticated is confirmed true
    return (
        <div id="screenWrapper">
          <Helmet>
            <title>FaceWires</title>
          </Helmet>
          <div className='Mainbody'>
            <PicasaScreen onLogout={handleLogout(this.props.history)} />
          </div>
        </div>
    );
  }
}

const handleLogout = (history, reason) => () => {
  console.log("Logging out globally via Authelia portal");
  captureBounceDiagnosticForLogout(reason || 'manual-logout', null);
  store.remove('loggedIn');

  // /clean_logout/ kills both the Django session and the Authelia
  // session server-side (forwarding cookies to Authelia's /api/logout,
  // no CORS involved since it's a backend-to-backend call). That means
  // the frontend just needs one clean redirect to the login page instead
  // of bouncing through Authelia's own logout page with a chained rd.
  axiosInstance.post('/clean_logout/')
    .catch(err => console.warn("Clean logout request failed (redirecting to login anyway)", err))
    .finally(() => {
      // Without ?next=, Django falls back to LOGIN_REDIRECT_URL (the API
      // domain root) instead of sending the user back to the frontend.
      const returnUrl = `${FRONTEND_URL}/faces`;
      window.location.href = `${AUTHELIA_LOGIN_URL}?next=${encodeURIComponent(returnUrl)}`;
    });
};

export default MainApp;
