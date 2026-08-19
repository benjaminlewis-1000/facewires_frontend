import React from 'react';
import './App.css';
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Redirect
} from "react-router-dom";
import MainApp from "./components/mainApp";
import { FRONTEND_URL, AUTHELIA_LOGIN_URL } from './config';

const RedirectToSSO = () => {
  const returnUrl = `${FRONTEND_URL}/faces`;
  window.location.href = `${AUTHELIA_LOGIN_URL}?next=${encodeURIComponent(returnUrl)}`;
  
  return <div style={{ padding: '20px', textAlign: 'center' }}>Redirecting to secure login...</div>;
};

const App = () => {
  return (
    <Router>
      <div className="app-routes">
        <main>
          <Switch>
            <Route exact path="/faces" component={MainApp} />
            <Route exact path="/">
              <Redirect to="/faces" />
            </Route>
            <Route exact path="/login">
              <Redirect to="/faces" />
            </Route>
            <Route component={RedirectToSSO} />
          </Switch>
        </main>
      </div>
    </Router>
  );
};

export default App;