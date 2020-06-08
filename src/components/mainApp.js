/* eslint-disable arrow-body-style */
import React from 'react';
import { Sidebar, Menu } from 'semantic-ui-react';
import { Helmet } from 'react-helmet';
import store from 'store';
import { Redirect } from 'react-router-dom';
// import styles from './styles.css';
// import Users from '../Users';
import PicasaScreen from './picasaScreen'
// import FolderList from './folderList'
// import ImageScreen from './imageScreen'
import isLoggedIn from './isLoggedIn'
import IdleTimer from 'react-idle-timer'


class MainApp extends React.Component {

  constructor(props){
    super(props);
    console.log("Main app")

    if (!isLoggedIn()) {
      return <Redirect to="/login" />;
    }

    this.idleTimer = null
    this.onIdle = this._onIdle.bind(this)

    window.addEventListener('beforeunload', (event) => {
    //   var {history} = this.props;
    //   store.remove('loggedIn');
    //   history.push('/login');
    });
  }

  render() {

    var {history} = this.props
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
        <Sidebar as={Menu} inverted visible vertical width="thin" icon="labeled">
          <button name="logout" className="menuButton" onClick={handleLogout(history)}>
          Logout
          </button>
        </Sidebar>
        <div className='Mainbody'>
          
          <PicasaScreen />
        </div>

      </div>
    );
  }

  // _onAction(e) {
  //   console.log('user did something', e)
  // }
 
  // _onActive(e) {
  //   console.log('user is active', e)
  //   console.log('time remaining', this.idleTimer.getRemainingTime())
  // }
 
  _onIdle(e) {
    var {history} = this.props
    handleLogout(history)();
    console.log('user is idle')
    // console.log('last active', this.idleTimer.getLastActiveTime())
  }

};

const handleLogout = history => () => {
  console.log("Logging out")
  store.remove('loggedIn');
  history.push('/login');
};

/*
const MainApp = ({history}) => {
    
  if (!isLoggedIn()) {
    return <Redirect to="/login" />;
  }

  return (
    <div id="screenWrapper">
      <Helmet>
        <title>FaceWires</title>
      </Helmet>
      <Sidebar as={Menu} inverted visible vertical width="thin" icon="labeled">
        <button name="logout" className="menuButton" onClick={handleLogout(history)}>
        Logout
        </button>
      </Sidebar>
      <div className='Mainbody'>
        
        <PicasaScreen />
      </div>

    </div>
  );
};*/


export default MainApp;
