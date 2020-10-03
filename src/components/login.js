import React from 'react';
import { Grid, Form, Header, Message } from 'semantic-ui-react';
import { Redirect } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import store from 'store';
import '../css/login.css';
import isLoggedIn from './isLoggedIn'
// import axiosInstance from "../axiosApi";
import axios from 'axios';

class Login extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      username: '',
      password: '',
      error: false,
    };

    this.handleChange = this.handleChange.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
  }

  onSubmit(e) {
    e.preventDefault();

    const { username, password } = this.state;
    // const { history } = this.props;

    var api_url = store.get('api_url') + "/token/obtain/";

    const axiosInstance = axios.create({
        // baseURL: api_url,
        timeout: 5000,
        headers: {
            'Authorization': "JWT " + localStorage.getItem('access_token'),
            'Content-Type': 'application/json',
            'accept': 'application/json'
        }
    });

    axiosInstance.post(api_url, {
        username: username,
        password: password
    },{
      headers: {
        'content-type': 'application/json'
      }
    })
    .then(response => {
      console.debug("Access granted")

      store.set('loggedIn', true);
      store.set('refresh_token',  response.data.refresh)
      store.set('access_token',  response.data.access)
      store.set('username', username)
      // this.props.push('/faces')
      window.location = "/faces"
    }).catch(error => {
      console.debug("Not logged in:", error.response)
    })
    
  }

  handleChange(e, { name, value }) {
    this.setState({ [name]: value });
  }

  render() {
    const { error } = this.state;

    if (isLoggedIn()) {
      console.log("Logged in!")
      return <Redirect to="/faces" />;
    }

    return (
      <Grid>
        <Helmet>
          <title>Facewires Login</title>
        </Helmet>

        <Grid.Column width={6} />
        <Grid.Column width={4}>
          <Form className='loginForm' error={error} onSubmit={this.onSubmit}>
            <Header as="h1">Login</Header>
           {error && <Message
              error={error}
              content="That username/password is incorrect. Try again!"
            />}
            <Form.Input className="infield"
              inline
              autoFocus
              label="Username"
              name="username"
              onChange={this.handleChange}
            />
            <Form.Input className="infield"
              inline
              label="Password"
              type="password"
              name="password"
              onChange={this.handleChange}
            />
            <Form.Button type="submit">Go!</Form.Button>
          </Form>
        </Grid.Column>
      </Grid>
    );
  }
}

export default Login;
