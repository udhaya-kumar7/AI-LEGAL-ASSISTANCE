import React from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';

import { AuthProvider } from './context/AuthContext.jsx';
import { GoogleOAuthProvider } from '@react-oauth/google';

// ensure axios sends cookies for protected endpoints
axios.defaults.withCredentials = true;
const envApiBase = import.meta.env.VITE_API_BASE;
const API_BASE = envApiBase && envApiBase !== ''
  ? envApiBase
  : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');
axios.defaults.baseURL = API_BASE;

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'placeholder-client-id';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster position="top-right" reverseOrder={false} />
        </AuthProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  </StrictMode>
);
