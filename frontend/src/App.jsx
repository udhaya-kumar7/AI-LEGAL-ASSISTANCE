import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Chatbot from './pages/Chatbot';
import DocumentAnalyzer from './pages/DocumentAnalyzer';
import CaseSearch from './pages/CaseSearch';
import History from './pages/History';
import Settings from './pages/Settings';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

function AppShell({ children }) {
  const location = useLocation();
  // Always show the shell (Navbar + Sidebar) — auth is disabled for now.
  // Hide the default shell for pages that render their own full-layout UI
  const hideShell = location.pathname === '/chatbot' || location.pathname === '/' || location.pathname === '/login' || location.pathname === '/signup';

  if (hideShell) {
    return <>{children}</>;
  }

  return (
    <div className="app-root">
      <Navbar />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/chatbot" replace />} />
        
        {/* Auth routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/chatbot" element={<ProtectedRoute><Chatbot /></ProtectedRoute>} />
        <Route path="/document-analyzer" element={<ProtectedRoute><DocumentAnalyzer /></ProtectedRoute>} />
        <Route path="/case-search" element={<ProtectedRoute><CaseSearch /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
