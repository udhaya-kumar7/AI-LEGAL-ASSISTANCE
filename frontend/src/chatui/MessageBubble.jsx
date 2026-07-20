import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { motion } from 'framer-motion';

const AI_AVATAR = (
  <div className="msg-avatar">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2">
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
      <circle cx="9" cy="13" r="1.5"/>
      <circle cx="15" cy="13" r="1.5"/>
    </svg>
  </div>
);

const USER_AVATAR = (
  <div className="msg-avatar">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#D4AF37" stroke="none">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
    </svg>
  </div>
);

export default function MessageBubble({ role = 'ai', text, loading = false }) {
  const isUser = role === 'user';

  return (
    <motion.div
      className={`msg ${isUser ? 'user' : 'ai'}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      {!isUser && AI_AVATAR}

      <div className="bubble" aria-live="polite">
        {loading ? (
          <div className="loading-dots">
            <span /><span /><span />
          </div>
        ) : (
          <div className="bubble-text">
            <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
              {text || ''}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {isUser && USER_AVATAR}
    </motion.div>
  );
}
