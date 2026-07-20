import React, { useState, useRef, useEffect, Suspense, lazy, useContext } from 'react';
import ThemeProvider from './ThemeProvider';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';
import DocumentUpload from '../components/DocumentUpload';
import { chatApi } from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import './chatui.css';

const ThreeBackground = lazy(() => import('./ThreeBackground'));

export default function Layout() {
  const [sidebarWidth, setSidebarWidth] = useState(264);
  const [collapsed, setCollapsed] = useState(false);
  const prevWidth = useRef(sidebarWidth);

  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messagesBySession, setMessagesBySession] = useState({});
  const [loadingSession, setLoadingSession] = useState(null);
  const [heroVariant, setHeroVariant] = useState(0);
  const [documentAnalyzerSessions, setDocumentAnalyzerSessions] = useState(new Set());
  const [showToolPanel, setShowToolPanel] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({ open: false, chatId: null, title: '' });

  // Mobile sidebar state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const streamRef = useRef(null);
  const { user, logout } = useContext(AuthContext);

  // Detect mobile
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close mobile sidebar on route/session change
  useEffect(() => { setMobileSidebarOpen(false); }, [activeId]);

  // ── Hydrate sidebar prefs + fetch chats ──────────────────
  useEffect(() => {
    try {
      const w = parseInt(localStorage.getItem('sidebar_width') || '264', 10);
      const c = localStorage.getItem('sidebar_collapsed') === 'true';
      if (Number.isFinite(w)) setSidebarWidth(w);
      setCollapsed(c);
    } catch (e) {}

    chatApi.listChats()
      .then(res => {
        const chats = res.data || [];
        setSessions(chats);
        const draftId = `draft-${Date.now()}`;
        setActiveId(draftId);
        setMessagesBySession({ [draftId]: [] });
      })
      .catch(err => console.error('failed to load chats', err));
  }, []);

  useEffect(() => {
    if (activeId && !messagesBySession[activeId]) loadMessages(activeId);
  }, [activeId]);

  useEffect(() => { localStorage.setItem('sidebar_width', String(sidebarWidth)); }, [sidebarWidth]);
  useEffect(() => { localStorage.setItem('sidebar_collapsed', String(collapsed)); }, [collapsed]);

  const toggleCollapse = () => {
    setCollapsed(c => {
      if (!c) { prevWidth.current = sidebarWidth; setSidebarWidth(72); return true; }
      else { setSidebarWidth(prevWidth.current || 264); return false; }
    });
  };

  useEffect(() => {
    if (sidebarWidth <= 80 && !collapsed) setCollapsed(true);
    else if (sidebarWidth > 80 && collapsed) setCollapsed(false);
  }, [sidebarWidth]);

  useEffect(() => () => { if (streamRef.current) { clearInterval(streamRef.current); streamRef.current = null; } }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const isMeta = e.metaKey || e.ctrlKey;
      const tag = (e.target?.tagName || '').toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea';
      if (isMeta && e.key.toLowerCase() === 'k') { e.preventDefault(); focusInput(); }
      if (isMeta && e.key.toLowerCase() === 'n' && !isInput) { e.preventDefault(); startDraft(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sessions, activeId]);

  const focusInput = () => {
    const t = document.querySelector('.chat-input-area textarea');
    if (t) t.focus();
  };

  // ── Session management ────────────────────────────────────
  const createSession = async (title = 'New chat', draftId = null) => {
    if (streamRef.current) { clearInterval(streamRef.current); streamRef.current = null; }
    try {
      const res = await chatApi.createChat(title);
      const chat = res.data;
      const newId = chat._id || chat.id;
      setSessions(prev => [chat, ...prev]);
      setMessagesBySession(prev => {
        const next = { ...prev };
        if (draftId) delete next[draftId];
        next[newId] = [];
        return next;
      });
      setActiveId(newId);
      setLoadingSession(null);
      if (draftId && documentAnalyzerSessions.has(draftId)) {
        setDocumentAnalyzerSessions(prev => { const n = new Set(prev); n.delete(draftId); n.add(newId); return n; });
      }
      return newId;
    } catch (err) { console.error('create chat failed', err); return null; }
  };

  const startDraft = () => {
    const draftId = `draft-${Date.now()}`;
    if (streamRef.current) { clearInterval(streamRef.current); streamRef.current = null; }
    setActiveId(draftId);
    setMessagesBySession(prev => ({ ...prev, [draftId]: [] }));
    setLoadingSession(null);
    setHeroVariant(v => v + 1);
    return draftId;
  };

  const updateSessionTitle = async (sessionId, text) => {
    const title = text.trim().split(/\s+/).slice(0, 6).join(' ');
    if (!title) return;
    try {
      await chatApi.patchChat(sessionId, title);
      setSessions(prev => prev.map(s => (s._id || s.id) === sessionId ? { ...s, title } : s));
    } catch (err) { console.error('rename failed', err); }
  };

  const ensureActive = async (titleHint = 'New chat') => {
    if (activeId && !String(activeId).startsWith('draft-')) return activeId;
    const draftId = activeId && String(activeId).startsWith('draft-') ? activeId : null;
    return await createSession(titleHint || 'New chat', draftId);
  };

  const loadMessages = async (chatId) => {
    if (!chatId) return;
    try {
      const res = await chatApi.listMessages(chatId, 500);
      setMessagesBySession(prev => ({ ...prev, [chatId]: res.data || [] }));
    } catch (err) { console.error('load messages failed', err); }
  };

  const onSend = async (text, lang = 'en-IN') => {
    const sessionId = await ensureActive(text);
    if (!sessionId) return;
    if (streamRef.current) { clearInterval(streamRef.current); streamRef.current = null; }

    const currentMessages = messagesBySession[sessionId] || [];
    const isFirstMessage = currentMessages.length === 0;

    setMessagesBySession(prev => {
      const current = prev[sessionId] || [];
      return { ...prev, [sessionId]: [...current, { role: 'user', text }, { role: 'ai', text: '' }] };
    });
    setLoadingSession(sessionId);
    if (isFirstMessage) updateSessionTitle(sessionId, text);

    chatApi.streamResponse(
      sessionId, text, lang,
      (chunk) => {
        setMessagesBySession(prev => {
          const current = prev[sessionId] || [];
          const copy = current.slice();
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === 'ai') { copy[i] = { ...copy[i], text: (copy[i].text || '') + chunk }; break; }
          }
          return { ...prev, [sessionId]: copy };
        });
      },
      () => { setLoadingSession(null); },
      (err) => {
        console.error('AI stream error:', err);
        setLoadingSession(null);
        setMessagesBySession(prev => {
          const current = prev[sessionId] || [];
          const copy = current.slice();
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === 'ai') { copy[i] = { ...copy[i], text: `⚠️ Error: ${err.message || 'Request failed. Check API key configuration.'}` }; break; }
          }
          return { ...prev, [sessionId]: copy };
        });
      }
    );
  };

  const messages = activeId ? (messagesBySession[activeId] || []) : [];
  const loading = activeId && loadingSession === activeId;

  const handleDocumentAnalysis = (analysis) => onSend(`Document Analysis Result:\n\n${analysis}`);

  return (
    <ThemeProvider>
      <Suspense fallback={null}>
        <ThreeBackground />
      </Suspense>

      <div className="chat-layout">

        {/* ── Mobile overlay backdrop ── */}
        <AnimatePresence>
          {isMobile && mobileSidebarOpen && (
            <motion.div
              className="mobile-sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* ── Sidebar (desktop: fixed left | mobile: slide-in drawer) ── */}
        <div
          className={`chat-sidebar-wrapper ${isMobile ? (mobileSidebarOpen ? 'mobile-open' : 'mobile-closed') : ''}`}
          style={!isMobile ? { width: sidebarWidth } : {}}
        >
          <Sidebar
            width={isMobile ? 280 : sidebarWidth}
            collapsed={!isMobile && collapsed}
            onToggleCollapse={isMobile ? () => setMobileSidebarOpen(false) : toggleCollapse}
            sessions={sessions}
            activeId={activeId}
            onSelect={(id) => {
              setActiveId(id);
              if (!messagesBySession[id]) loadMessages(id);
              if (isMobile) setMobileSidebarOpen(false);
            }}
            onNewChat={() => { startDraft(); setShowToolPanel(false); setActiveTool(null); if (isMobile) setMobileSidebarOpen(false); }}
            onDocumentAnalyzer={() => {
              const draftId = startDraft();
              setDocumentAnalyzerSessions(prev => new Set(prev).add(draftId));
              setActiveTool('document');
              setShowToolPanel(true);
              if (isMobile) setMobileSidebarOpen(false);
            }}
            onCaseSearch={() => { startDraft(); setActiveTool('case-search'); setShowToolPanel(true); if (isMobile) setMobileSidebarOpen(false); }}
            onDelete={(id, title) => setConfirmDelete({ open: true, chatId: id, title: title || 'this chat' })}
            onRename={(id, title) => updateSessionTitle(id, title)}
          />
        </div>

        {/* ── Main content ── */}
        <main
          className="chat-main"
          style={!isMobile ? {
            marginLeft: sidebarWidth,
            marginRight: showToolPanel ? 360 : 0
          } : {}}
        >
          {/* ── Mobile top bar ── */}
          {isMobile && (
            <div className="mobile-topbar">
              <button className="mobile-menu-btn" onClick={() => setMobileSidebarOpen(true)} aria-label="Open menu">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <div className="mobile-topbar-brand">
                <span>⚖️</span>
                <span>LegalAI</span>
              </div>
              <div className="mobile-topbar-avatar" onClick={logout} title="Logout">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'G'}
              </div>
            </div>
          )}

          <div className="chat-main-inner">
            <ChatWindow
              messages={messages}
              onSend={onSend}
              loading={!!loading}
              autoFocusInput={true}
              heroVariant={heroVariant}
              isDocumentAnalyzer={documentAnalyzerSessions.has(activeId)}
              onDocumentUpload={handleDocumentAnalysis}
            />
          </div>
        </main>

        {/* ── Tool panel ── */}
        <AnimatePresence>
          {showToolPanel && (
            <motion.aside
              className="tool-panel"
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            >
              <div className="tool-panel-header">
                <h3>{activeTool === 'document' ? '📄 Document Analyzer' : '⚖️ Case Search'}</h3>
                <button className="tool-panel-close" onClick={() => setShowToolPanel(false)}>✕</button>
              </div>
              <div className="tool-panel-content">
                {activeTool === 'document' && (
                  <div className="document-tool">
                    <p className="tool-description">Upload legal documents for instant AI analysis and extraction of key clauses.</p>
                    <DocumentUpload onAnalysisComplete={handleDocumentAnalysis} />
                    <div className="tool-features">
                      <div className="feature-item">✓ Contract review & clause extraction</div>
                      <div className="feature-item">✓ Compliance check against Indian law</div>
                      <div className="feature-item">✓ Risk assessment summary</div>
                      <div className="feature-item">✓ Actionable legal recommendations</div>
                    </div>
                  </div>
                )}
                {activeTool === 'case-search' && (
                  <div className="case-search-tool">
                    <p className="tool-description">Search Indian case law, precedents and legal citations.</p>
                    <div className="search-form">
                      <input id="case-search-input" type="text" placeholder="Search keywords…" className="search-input" />
                      <select className="search-select">
                        <option>All Jurisdictions</option>
                        <option>Supreme Court</option>
                        <option>High Court</option>
                        <option>District Court</option>
                      </select>
                      <button className="search-btn" onClick={() => onSend('Search for relevant case law')}>Search Cases</button>
                    </div>
                    <div className="tool-features">
                      <div className="feature-item">✓ IPC & CrPC sections</div>
                      <div className="feature-item">✓ Landmark judgements</div>
                      <div className="feature-item">✓ Recent precedents</div>
                      <div className="feature-item">✓ Legal citations</div>
                    </div>
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── Confirm delete modal ── */}
        <AnimatePresence>
          {confirmDelete.open && (
            <motion.div
              className="confirm-modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="confirm-modal"
                initial={{ scale: 0.88, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.88, y: 20, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              >
                <div className="confirm-title">Delete chat?</div>
                <div className="confirm-message">
                  This will permanently delete <strong>{confirmDelete.title}</strong> and all its messages.
                </div>
                <div className="confirm-actions">
                  <button className="btn-ghost" onClick={() => setConfirmDelete({ open: false, chatId: null, title: '' })}>
                    Cancel
                  </button>
                  <button
                    className="btn-danger"
                    onClick={async () => {
                      const id = confirmDelete.chatId;
                      setConfirmDelete({ open: false, chatId: null, title: '' });
                      try { await chatApi.deleteChat(id); } catch (err) { console.error('delete failed', err); }
                      setSessions(prev => prev.filter(s => (s._id || s.id) !== id));
                      setMessagesBySession(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
                      if (activeId === id) {
                        const next = sessions.find(s => (s._id || s.id) !== id);
                        const nextId = next ? (next._id || next.id) : null;
                        setActiveId(nextId);
                        if (nextId && !messagesBySession[nextId]) loadMessages(nextId);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ThemeProvider>
  );
}
