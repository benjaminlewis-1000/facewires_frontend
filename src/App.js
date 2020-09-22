import React from 'react';
import './App.css';
// import { Switch, Route, Router } from 'react-router-dom';
import {
  BrowserRouter as Router,
  Switch,
  Route,
  // Link,
  // Redirect
} from "react-router-dom";
// import PicasaScreen from './components/picasaScreen';
import Login from './components/login';
import MainApp from "./components/mainApp";
// import isLoggedIn from './components/isLoggedIn'
// import Login from './Login';

const App = () => {

  return(
    <Router>
      <div className="app-routes">
        <main>
          <Switch>
            <Route exact path="/login" component={Login} />
            <Route exact path="/faces" component={MainApp} />
            <Route component={Login} />
          </Switch>
        </main>
      </div>
    </Router>
  );
};

export default App;
