import React, { useEffect, useState } from 'react';
import { getJSON } from '../utils/api';

export default function Settings() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getJSON('/api/auth/me');
        setUser(res.user || null);
      } catch (err) {
        // ignore
      }
    })();
  }, []);

  return (
    <div className="page settings">
      <h2>Settings</h2>
      {user ? (
        <div>
          <p><strong>Name:</strong> {user.name || '(not set)'}</p>
          <p><strong>Email:</strong> {user.email}</p>
          <button className="btn" onClick={() => { localStorage.removeItem('token'); window.location.href = '/login'; }}>Logout</button>
        </div>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}
