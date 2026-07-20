import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export default function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="sidebar card" style={{padding:12}}>
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
        <button className="btn" style={{padding:'8px 10px'}}>＋ New chat</button>
      </div>

      <nav>
        <ul className="convo-list">
          <li>
            <NavLink to="/chatbot" className={({isActive}) => isActive ? 'convo-item active' : 'convo-item'}> Legal assistant</NavLink>
          </li>
          <li>
            <NavLink to="/document-analyzer" className={({isActive}) => isActive ? 'convo-item active' : 'convo-item'}> Document analyzer</NavLink>
          </li>
          <li>
            <NavLink to="/case-search" className={({isActive}) => isActive ? 'convo-item active' : 'convo-item'}>Case search</NavLink>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
