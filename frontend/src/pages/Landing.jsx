import React from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="landing">
      <h2>AI-Powered Legal Assistant</h2>
      <p>Analyze documents, search cases, and chat with an AI legal assistant.</p>
      <div className="cta">
        <Link to="/signup" className="btn">Get started</Link>
        <Link to="/login" className="btn btn-ghost">Sign in</Link>
      </div>
    </div>
  );
}
