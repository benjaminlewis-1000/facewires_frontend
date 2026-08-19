import React from 'react';
import './App.css';
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Redirect
} from "react-router-dom";
import MainApp from "./components/mainApp";

// A quick helper component that handles bouncing logged-out users to SSO
const RedirectToSSO = () => {
  // We tell Django: "Once Authelia authenticates me, send me straight back to the frontend dashboard"
  const returnUrl = "https://facewire.exploretheworld.tech/faces";
  window.location.href = `https://picasa.exploretheworld.tech/accounts/oidc/authelia/login/?next=${encodeURIComponent(returnUrl)}`;
  
  return <div style={{ padding: '20px', textAlign: 'center' }}>Redirecting to secure login...</div>;
};

const App = () => {
  return (
    <Router>
      <div className="app-routes">
        <main>
          <Switch>
            {/* 1. Your primary dashboard view */}
            <Route exact path="/faces" component={MainApp} />

            {/* 2. If they land on the root "/" or an old "/login" path, send them to /faces */}
            <Route exact path="/">
              <Redirect to="/faces" />
            </Route>
            <Route exact path="/login">
              <Redirect to="/faces" />
            </Route>

            {/* 3. Catch-all: If any API auth check fails down the line, we send them to the SSO bounce */}
            <Route component={RedirectToSSO} />
          </Switch>
        </main>
      </div>
    </Router>
  );
};

export default App;
