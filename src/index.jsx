import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import store from 'store';
import { API_URL } from './config';

store.set('api_url', API_URL);

createRoot(document.getElementById('root')).render(<App />);
