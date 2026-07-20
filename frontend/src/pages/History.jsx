import React, { useEffect, useState } from 'react';
import { getJSON } from '../utils/api';

export default function History() {
  const [chats, setChats] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await getJSON('/api/chat/history');
        setChats(res.chats || []);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  return (
    <div className="page history">
      <h2>Chat History</h2>
      {chats.length === 0 && <p>No history yet.</p>}
      {chats.map(c => (
        <div key={c._id} className="chat-item">
          <h3>{c.title || 'Chat'}</h3>
          <div className="messages">
            {c.messages.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.role}: {m.text}</div>)}
          </div>
        </div>
      ))}
    </div>
  );
}
