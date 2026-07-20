import React, { useEffect, useRef, useState } from 'react';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';
import DocumentUpload from '../components/DocumentUpload';
import { motion, AnimatePresence } from 'framer-motion';

const QUICK_ACTIONS = [
  {
    icon: '⚖️',
    title: 'Legal Advice',
    description: 'IPC sections, constitutional rights & civil procedures',
    prompt: 'I need legal advice on my situation',
  },
  {
    icon: '📄',
    title: 'Document Review',
    description: 'Analyze contracts, FIRs, notices and legal documents',
    prompt: 'I want to analyze a legal document',
  },
  {
    icon: '🔍',
    title: 'Case Research',
    description: 'Search relevant precedents and landmark judgements',
    prompt: 'Find relevant case law and precedents for my issue',
  },
  {
    icon: '🛡️',
    title: 'Know Your Rights',
    description: 'Understand your fundamental rights and legal options',
    prompt: 'What are my legal rights in this situation?',
  },
];

export default function ChatWindow({
  messages,
  onSend,
  loading,
  autoFocusInput = true,
  heroVariant = 0,
  isDocumentAnalyzer = false,
  onDocumentUpload,
}) {
  const timelineRef = useRef(null);
  const [inputAutoFocus, setInputAutoFocus] = useState(false);
  const [selectedLang, setSelectedLang] = useState('en-IN');

  // Auto-scroll on new messages
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (text, lang) => {
    if (!text) return;
    setInputAutoFocus(true);
    onSend(text, lang || selectedLang);
  };

  const handleQuickAction = (prompt) => {
    handleSend(prompt, selectedLang);
  };

  return (
    <div className="chat-card">
      <div className="chat-timeline" ref={timelineRef}>
        <AnimatePresence mode="wait">
          {messages.length === 0 ? (
            <motion.div
              key={`hero-${heroVariant}`}
              className="landing-hero"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              {/* Live badge */}
              <div className="hero-badge">
                <span className="dot" />
                AI-Powered Legal Assistant
              </div>

              <h1>How can I help you today?</h1>
              <p className="hero-subtitle">
                Expert guidance on Indian law — IPC, Constitution, civil rights and more. Ask anything.
              </p>

              {/* Quick action cards */}
              <div className="hero-cards">
                {QUICK_ACTIONS.map((qa, i) => (
                  <motion.button
                    key={qa.title}
                    className="hero-card"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.12 + i * 0.07 }}
                    onClick={() => handleQuickAction(qa.prompt)}
                  >
                    <div className="hero-card-icon">{qa.icon}</div>
                    <div className="hero-card-title">{qa.title}</div>
                    <div className="hero-card-desc">{qa.description}</div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="messages"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {messages.map((m, i) => (
                <MessageBubble key={i} role={m.role} text={m.text} />
              ))}
              {loading && <MessageBubble role="ai" loading={true} text="" />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <InputBar
        onSend={handleSend}
        loading={loading}
        autoFocus={messages.length === 0 || inputAutoFocus}
        lang={selectedLang}
        onLangChange={setSelectedLang}
      />

      {messages.length > 0 && isDocumentAnalyzer && onDocumentUpload && (
        <div style={{ padding: '0 20px 16px' }}>
          <DocumentUpload onAnalysisComplete={onDocumentUpload} />
        </div>
      )}
    </div>
  );
}
