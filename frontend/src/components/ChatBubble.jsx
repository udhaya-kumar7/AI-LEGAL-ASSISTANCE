import React from 'react';

function Initials({ role }){
  if(role === 'user') return 'You';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" opacity="0.08"/>
      <path d="M12 7a3 3 0 100 6 3 3 0 000-6zm0 10c-3.33 0-6 1.67-6 3v1h12v-1c0-1.33-2.67-3-6-3z" fill="currentColor"/>
    </svg>
  );
}

export default function ChatBubble({ role = 'assistant', text, time }) {
  const isUser = role === 'user';

  return (
    <div className={`chat-bubble ${isUser ? 'user' : 'assistant'}`} role="article" aria-label={`${role} message`}>
      <div className="bubble-left" aria-hidden>
        {!isUser && <div className="avatar">{<Initials role={role} />}</div>}
      </div>

      <div className="bubble-content">
        <div className="bubble-text">{text}</div>
        {time && <div className="bubble-time">{time}</div>}
      </div>

      <div className="bubble-right" aria-hidden>
        {isUser && <div className="avatar user-avatar">{<Initials role={role} />}</div>}
      </div>
    </div>
  );
}
