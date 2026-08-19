/* eslint-disable arrow-body-style */
import IdleTimer from 'react-idle-timer';
import isLoggedIn from './isLoggedIn';
import PicasaScreen from './picasaScreen';
import React from 'react';
import store from 'store';
import { Helmet } from 'react-helmet';

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
    // Run the async cookie validation as soon as the component loads
    isLoggedIn().then(loggedIn => {
      if (loggedIn) {
        this.setState({ authenticated: true, loading: false });
      } else {
        console.log("Not logged in - bouncing to Authelia SSO pipeline");
        
        // Construct the full destination loop path
        const returnUrl = "https://facewire.exploretheworld.tech/faces";
        window.location.href = `https://picasa.exploretheworld.tech/accounts/oidc/authelia/login/?next=${encodeURIComponent(returnUrl)}`;
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
            <PicasaScreen />
          </div>
        </div>
    );
  }
}

const handleLogout = history => () => {
  console.log("Logging out globally via Authelia portal");
  
  // Clean up any remaining legacy local items
  store.remove('loggedIn');
  
  // Send the browser to terminate BOTH the local Django session and global Authelia session
  window.location.href = 'https://picasa.exploretheworld.tech/accounts/logout/?next=https://auth.exploretheworld.tech/logout';
};

export default MainApp;