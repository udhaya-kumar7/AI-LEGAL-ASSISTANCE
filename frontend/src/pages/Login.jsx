import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { AuthContext } from '../context/AuthContext';
import { postJSON } from '../utils/api';
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const data = await postJSON('/api/auth/google', { credential: credentialResponse.credential });
      if (data.token) {
        login(data);
        toast.success('Successfully logged in with Google!');
      }
    } catch (err) {
      toast.error('Google login failed');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await postJSON('/api/auth/login', { email, password });
      if (data.token) {
        login(data);
        toast.success('Welcome back!');
      }
    } catch (err) {
      toast.error(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <h2>Welcome Back</h2>
        <p className="auth-subtitle">Sign in to access your Legal AI</p>

        <form className="auth-form" onSubmit={submit}>
          <div className="form-group">
            <label>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" required />
          </div>
          <button className="auth-btn" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
        </form>

        <div className="auth-divider">
          <span>OR</span>
        </div>

        <div className="google-btn-wrapper">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => toast.error('Google login failed')}
            width="100%"
            theme="outline"
          />
        </div>

        <p className="auth-footer">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
