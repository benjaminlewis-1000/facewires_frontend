import React from 'react';
import './App.css';
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Redirect
} from "react-router-dom";
import MainApp from "./components/mainApp";

// Helper component that handles bouncing users to Authelia SSO
const RedirectToSSO = () => {
  // Dynamically captures whatever protocol and host/domain you are currently visiting
  const currentHost = window.location.host;
  const protocol = window.location.protocol; // 'http:' or 'https:'
  
  const frontendUrl = `${protocol}//${currentHost}`;
  const returnUrl = `${frontendUrl}/faces`;
  
  window.location.href = `https://picasa.exploretheworld.tech/accounts/oidc/authelia/login/?next=${encodeURIComponent(returnUrl)}`;
  
  return <div style={{ padding: '20px', textAlign: 'center' }}>Redirecting to secure login...</div>;
};
const App = () => {
  return (
    <Router>
      <div className="app-routes">
        <main>
          <Switch>
            {/* 1. Primary dashboard view */}
            <Route exact path="/faces" component={MainApp} />

            {/* 2. Redirect root or explicit login requests to /faces */}
            <Route exact path="/">
              <Redirect to="/faces" />
            </Route>
            <Route exact path="/login">
              <Redirect to="/faces" />
            </Route>

            {/* 3. Catch-all fallback triggers the SSO bounce */}
            <Route component={RedirectToSSO} />
          </Switch>
        </main>
      </div>
    </Router>
  );
};

export default App;