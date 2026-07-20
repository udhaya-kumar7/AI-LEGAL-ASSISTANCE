import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { AuthContext } from '../context/AuthContext';
import { postJSON } from '../utils/api';
import toast from 'react-hot-toast';

export default function Signup() {
  const [name, setName] = useState('');
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
        toast.success('Successfully signed up with Google!');
      }
    } catch (err) {
      toast.error('Google signup failed');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await postJSON('/api/auth/register', { name, email, password });
      if (data.token) {
        login(data);
        toast.success('Account created successfully!');
      }
    } catch (err) {
      toast.error(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <h2>Create an Account</h2>
        <p className="auth-subtitle">Join Legal AI today</p>

        <form className="auth-form" onSubmit={submit}>
          <div className="form-group">
            <label>Full Name</label>
            <input value={name} onChange={e => setName(e.target.value)} type="text" required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" required minLength={6} />
          </div>
          <button className="auth-btn" disabled={loading}>{loading ? 'Creating...' : 'Sign Up'}</button>
        </form>

        <div className="auth-divider">
          <span>OR</span>
        </div>

        <div className="google-btn-wrapper">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => toast.error('Google signup failed')}
            width="100%"
            theme="outline"
            text="signup_with"
          />
        </div>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
