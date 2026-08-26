/* eslint-disable arrow-body-style */
import IdleTimer from 'react-idle-timer';
import isLoggedIn from './isLoggedIn';
import { checkAutheliaSession } from './autheliaCheck';
import PicasaScreen from './picasaScreen';
import React from 'react';
import store from 'store';
import axiosInstance from './axios_setup';
import { Helmet } from 'react-helmet';
import { FRONTEND_URL, AUTHELIA_LOGIN_URL } from './config';

class MainApp extends React.Component {
  constructor(props){
    super(props);

    // Track state to show a loading screen while we wait for the backend response
    this.state = {
      loading: true,
      authenticated: false
    };

    this.idleTimer = null;
    this.onIdle = this.handleOnIdle.bind(this);
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
        this.bounceToLogin();
      }
    }).catch(err => {
      console.error("SSO check failed:", err);
      if (!hasCsrfCookie) {
        this.setState({ authenticated: false, loading: false });
      }
    });
  }

  bounceToLogin() {
    console.log("Not logged in - bouncing to Authelia SSO pipeline");
    const returnUrl = `${FRONTEND_URL}/faces`;
    window.location.href = `${AUTHELIA_LOGIN_URL}?next=${encodeURIComponent(returnUrl)}`;
  }

  // Fires after we've already optimistically rendered the app off the
  // csrftoken/Django-session check above. Confirms against Authelia's own
  // session state and bounces to login only on a definitive "logged out" -
  // a failed/ambiguous check (network, CORS) is left alone.
  verifyAutheliaSession() {
    checkAutheliaSession().then(stillLoggedIn => {
      if (stillLoggedIn === false) {
        console.log("Authelia session is logged out - bouncing to SSO login");
        this.bounceToLogin();
      }
    });
  }

  handleOnIdle(e) {
    const { history } = this.props;
    handleLogout(history)();
    console.log('user is idle');
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
          <IdleTimer
            ref={ref => { this.idleTimer = ref }}
            element={document}
            onIdle={this.onIdle}
            debounce={250}
            /* Set a timeout for an hour */
            timeout={1000 * 60 * 60 } /> 

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

const handleLogout = history => () => {
  console.log("Logging out globally via Authelia portal");
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
