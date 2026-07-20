export function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE)
  ? import.meta.env.VITE_API_BASE
  : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');

function buildUrl(path) {
  if (!path) return API_BASE;
  // If path already looks like an absolute URL, return as-is
  if (/^https?:\/\//i.test(path)) return path;
  // Ensure leading slash
  return `${API_BASE.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export async function postJSON(path, body) {
  const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
  const url = buildUrl(path);
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = 'Request failed';
    try { const err = await res.json(); msg = err.message || msg; } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}

export async function getJSON(path) {
  const headers = { ...getAuthHeaders() };
  const url = buildUrl(path);
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    let msg = 'Request failed';
    try { const err = await res.json(); msg = err.message || msg; } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}

// chat API helpers
export const chatApi = {
  listChats: () => getJSON('/api/chats'),
  createChat: (title='New chat') => postJSON('/api/chats', { title }),
  renameChat: (id, title) => postJSON(`/api/chats/${id}`, { title, _method: 'PATCH' }),
  // use fetch PATCH directly to avoid _method if desired
  patchChat: async (id, title) => {
    const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
    const url = buildUrl(`/api/chats/${id}`);
    const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ title }) });
    if(!res.ok){ let msg='Request failed'; try{ const err=await res.json(); msg=err.message||msg;}catch(e){} throw new Error(msg);} return res.json();
  },
  deleteChat: async (id) => {
    const headers = { ...getAuthHeaders() };
    const url = buildUrl(`/api/chats/${id}`);
    const res = await fetch(url, { method: 'DELETE', headers });
    if(!res.ok){ let msg='Request failed'; try{ const err=await res.json(); msg=err.message||msg;}catch(e){} throw new Error(msg);} return res.json();
  },
  listMessages: (id, limit=200) => getJSON(`/api/chats/${id}/messages?limit=${limit}`),
  postMessage: (id, role, text) => postJSON(`/api/chats/${id}/messages`, { role, text }),
  
  // Stream AI response with SSE
  streamResponse: async (chatId, message, lang, onChunk, onDone, onError) => {
    const url = buildUrl(`/api/chats/${chatId}/stream`);
    const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, lang })
      });

      if (!res.ok) {
        throw new Error('Stream request failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.chunk) {
                onChunk(data.chunk);
              } else if (data.done) {
                onDone();
              } else if (data.error) {
                onError(new Error(data.error));
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (err) {
      onError(err);
    }
  }
};

// Document analysis API
export async function analyzeDocument(file) {
  const formData = new FormData();
  formData.append('document', file);

  const headers = { ...getAuthHeaders() };
  const url = buildUrl('/api/documents/analyze');

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: formData
  });

  if (!res.ok) {
    let msg = 'Document analysis failed';
    try {
      const err = await res.json();
      msg = err.error || msg;
    } catch (e) {}
    throw new Error(msg);
  }

  return res.json();
}
