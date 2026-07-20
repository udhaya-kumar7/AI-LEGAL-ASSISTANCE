import React, { useState, useContext, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthContext } from '../context/AuthContext';

const NAV_ITEMS = [
  { icon: '＋', label: 'New chat',          action: 'new' },
  { icon: '📄', label: 'Document Analyzer', action: 'doc' },
  { icon: '⚖️',  label: 'Case Search',       action: 'case' },
];

export default function Sidebar({
  width = 264,
  collapsed = false,
  onToggleCollapse = () => {},
  sessions = [],
  activeId = null,
  onSelect = () => {},
  onNewChat = () => {},
  onDelete = () => {},
  onRename = () => {},
  onDocumentAnalyzer = () => {},
  onCaseSearch = () => {},
}) {
  const short = collapsed || width <= 80;
  const { user, logout } = useContext(AuthContext);
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [clickTimer, setClickTimer] = useState(null);

  const startEdit = (id, title) => { setEditingId(id); setEditingValue(title || ''); };

  const submitEdit = () => {
    if (!editingId) return;
    const next = editingValue.trim();
    if (next) onRename(editingId, next);
    setEditingId(null); setEditingValue('');
  };

  const handleContextMenu = (e, chatId, title) => {
    e.preventDefault();
    setContextMenu({ chatId, title, x: e.clientX, y: e.clientY });
  };

  const handleChatClick = (chatId, title) => {
    if (clickTimer) {
      clearTimeout(clickTimer); setClickTimer(null);
      setContextMenu({ chatId, title, x: 0, y: 0, centered: true });
    } else {
      const t = setTimeout(() => { setClickTimer(null); onSelect(chatId); }, 250);
      setClickTimer(t);
    }
  };

  const closeCtx = () => setContextMenu(null);
  React.useEffect(() => {
    if (contextMenu) {
      document.addEventListener('click', closeCtx);
      return () => document.removeEventListener('click', closeCtx);
    }
  }, [contextMenu]);

  const handleNav = (action) => {
    if (action === 'new')  { onNewChat(); }
    if (action === 'doc')  { onDocumentAnalyzer(); }
    if (action === 'case') { onCaseSearch(); }
  };

  return (
    <aside className={`chat-sidebar ${short ? 'collapsed' : ''}`} style={{ width }}>

      {/* ── Brand row ── */}
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </div>
        {!short && <span className="sidebar-brand-name">LegalAI</span>}
        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title={short ? 'Expand' : 'Collapse'}
          style={{ marginLeft: short ? 'auto' : 'auto' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {short
              ? <path d="M9 18l6-6-6-6" />
              : <path d="M15 18l-6-6 6-6" />}
          </svg>
        </button>
      </div>

      {/* ── Nav items ── */}
      <div className="menu-list">
        {NAV_ITEMS.map(item => (
          <button
            key={item.action}
            className="menu-item"
            onClick={() => handleNav(item.action)}
            title={short ? item.label : undefined}
          >
            <span className="icon">{item.icon}</span>
            {!short && <span>{item.label}</span>}
          </button>
        ))}
      </div>

      {/* ── Chat history ── */}
      {!short && (
        <>
          <div className="section-title">Your chats</div>
          <div className="convo-list">
            {sessions.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: '0.82rem', padding: '8px 12px' }}>
                No chats yet
              </div>
            )}
            <AnimatePresence initial={false}>
              {sessions.map(s => {
                const chatId = s._id || s.id;
                return (
                  <motion.div
                    key={chatId || s.title}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.18 }}
                    style={{ position: 'relative' }}
                  >
                    {editingId === chatId ? (
                      <input
                        className="chat-item-input"
                        value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        onBlur={submitEdit}
                        onKeyDown={e => {
                          if (e.key === 'Enter') submitEdit();
                          if (e.key === 'Escape') { setEditingId(null); setEditingValue(''); }
                        }}
                        autoFocus
                      />
                    ) : (
                      <button
                        className={`chat-item ${chatId === activeId ? 'active' : ''}`}
                        onClick={() => handleChatClick(chatId, s.title)}
                        onContextMenu={e => handleContextMenu(e, chatId, s.title)}
                        title={s.title || 'New chat'}
                      >
                        {s.title || 'New chat'}
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* ── Context menu ── */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.centered ? '50%' : contextMenu.x,
            top: contextMenu.centered ? '50%' : contextMenu.y,
            transform: contextMenu.centered ? 'translate(-50%,-50%)' : 'none',
            zIndex: 1000,
          }}
          onClick={e => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={() => { startEdit(contextMenu.chatId, contextMenu.title); closeCtx(); }}>
            ✏️ Rename
          </button>
          <button className="context-menu-item delete" onClick={() => { onDelete(contextMenu.chatId, contextMenu.title); closeCtx(); }}>
            🗑️ Delete
          </button>
        </div>
      )}

      {/* ── Profile ── */}
      <div className="sidebar-bottom">
        <div className="profile">
          <div className="avatar">{user?.name ? user.name.charAt(0).toUpperCase() : 'G'}</div>
          {!short && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || 'Guest User'}</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email || 'Local Session'}</span>
              </div>
              <button 
                onClick={logout}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px' }}
                title="Logout"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
