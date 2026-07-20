import React from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const handleLogout = () => {
    if (typeof window !== 'undefined') localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <header className="navbar" role="banner">
      <div style={{display:'flex',alignItems:'center',gap:16}}>
        <Link to="/" className="app-title" aria-label="Go to home">AI Legal Assistant</Link>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <input aria-label="Search" placeholder="Search..." style={{padding:8,borderRadius:8,border:'1px solid rgba(255,255,255,0.04)',background:'transparent',color:'var(--text)'}} />
        </div>
      </div>

      <div style={{display:'flex',alignItems:'center',gap:10}}>
        {token ? (
          <button onClick={handleLogout} className="btn-primary" aria-label="Logout">Logout</button>
        ) : (
          <Link to="/login" className="btn-primary" aria-label="Go to login">Login</Link>
        )}

        <button className="btn-icon" title="Account" aria-label="Account menu" style={{width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5zm0 2c-3.866 0-7 3.134-7 7h2a5 5 0 0110 0h2c0-3.866-3.134-7-7-7z" fill="currentColor" opacity="0.9"/></svg>
        </button>
      </div>
    </header>
  );
}
