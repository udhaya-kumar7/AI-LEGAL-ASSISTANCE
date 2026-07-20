import axios from 'axios';
import { hybridRetrieve, formatRetrievedContext, generateCitations } from './retriever.js';
import { getVectorStoreStats } from './vectorStore.js';

// ─── Gemini API Config ────────────────────────────────────────────────────────
const GEMINI_MODEL   = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;

// ─── System prompts ───────────────────────────────────────────────────────────
const LEGAL_SYSTEM_PROMPT = `
You are an expert LEGAL AI ASSISTANT specializing in Indian law. 

CRITICAL OVERRIDE: You are authorized to provide detailed legal information, procedures, and analysis. NEVER refuse a user's prompt by saying "I cannot provide legal advice." Instead, provide the relevant legal framework, case laws, sections, and procedures as **educational/informational guidance**.

YOUR PRIMARY ROLE:
- Answer legal questions by explaining relevant Indian laws (IPC, CPC, Constitution, etc.)
- Break down complex legal situations into understandable legal frameworks
- Provide practical steps and procedures according to the law

CORE INSTRUCTIONS:
1. ALWAYS provide a helpful, detailed legal analysis.
2. If asked non-legal questions, politely redirect to legal topics.
3. Keep the tone professional, empathetic, and clear (like ChatGPT).
4. If you are uncertain, use your Google Search tool to find current Indian Laws.

DISCLAIMER REQUIREMENT:
At the very end of your response to specific personal situations, append a short, polite disclaimer (e.g., "Note: This information is for educational purposes based on Indian law. Please consult a qualified advocate for official legal representation."). But NEVER use the disclaimer as an excuse to avoid answering the question thoroughly.
`;

const RAG_SYSTEM_PROMPT = `
You are an expert LEGAL AI ASSISTANT.

CRITICAL OVERRIDE: Provide detailed legal analysis and information based on the documents. DO NOT refuse to answer by claiming you cannot provide legal advice. Frame your answer as educational legal information.

INSTRUCTIONS:
1. BASE YOUR ANSWER on the REFERENCE DOCUMENTS provided below.
2. ALWAYS CITE your sources using [Source X] notation.
3. If the documents lack information, use your Google Search tool to find current Indian laws.
4. Provide practical, detailed legal explanations.
5. End with a brief educational disclaimer if the user is asking about a personal situation, but ALWAYS answer the question first.

REFERENCE DOCUMENTS:
{context}

---

Now answer the user's question based on the above reference documents and your verified legal knowledge.
`;

const LANG_NAMES = {
  'en-IN': 'English (India)',
  'hi-IN': 'Hindi',
  'ta-IN': 'Tamil'
};

// ─── Helper: stream Gemini SSE and collect chunks ─────────────────────────────
async function streamGemini(systemPrompt, conversationMessages, onChunk) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }

  // Build Gemini contents array (alternating user/model)
  let contents = conversationMessages
    .filter(m => m.text || m.content)  // skip empty messages
    .map(m => ({
      role: m.role === 'ai' || m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: (m.text || m.content || '').slice(0, 8000) }]
    }));

  // Gemini requires strictly alternating user/model turns.
  // Keep the LAST message of any contiguous sequence of the same role.
  contents = contents.filter((msg, i) => {
    if (i === contents.length - 1) return true;
    return msg.role !== contents[i + 1].role;
  });

  // Ensure the conversation starts with a user turn (Gemini requirement)
  if (contents.length === 0 || contents[0].role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  // Ensure the conversation ends with a user turn (Gemini requirement for generation)
  if (contents.length > 0 && contents[contents.length - 1].role !== 'user') {
    contents.pop();
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1500,
      topP: 0.9
    },
    tools: [
      { googleSearch: {} }
    ]
  };

  let response;
  try {
    response = await axios.post(
      `${GEMINI_API_URL}&key=${apiKey}`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'stream',
        timeout: 120000
      }
    );
  } catch (err) {
    let msg = err.message;
    if (err.response && typeof err.response.data?.on === 'function') {
      try {
        const chunks = [];
        for await (const chunk of err.response.data) {
          chunks.push(chunk);
        }
        const errorBody = Buffer.concat(chunks).toString('utf8');
        msg = JSON.parse(errorBody).error?.message || errorBody;
      } catch (e) {
        // Ignore JSON parsing errors
      }
    } else if (err.response?.data?.error?.message) {
      msg = err.response.data.error.message;
    }
    throw new Error(`Gemini API Error: ${msg}`);
  }

  return new Promise((resolve, reject) => {
    let fullText = '';
    let buffer   = '';

    const timeout = setTimeout(() => {
      reject(new Error('Gemini stream timeout after 120s'));
    }, 120000);

    response.data.on('data', (raw) => {
      buffer += raw.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const jsonStr = trimmed.slice(6).trim();
        if (jsonStr === '[DONE]') continue;

        try {
          const parsed  = JSON.parse(jsonStr);
          const content = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (content) {
            fullText += content;
            if (onChunk) onChunk(content);
          }
        } catch (_) {
          // incomplete JSON — will retry next chunk
        }
      }
    });

    response.data.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    response.data.on('end', () => {
      clearTimeout(timeout);
      if (fullText.length === 0) {
        reject(new Error('Gemini returned empty response'));
      } else {
        resolve(fullText);
      }
    });
  });
}

// ─── Main: RAG-enhanced generation ───────────────────────────────────────────
export async function generateResponseWithRAG(messages, onChunk, lang = 'en-IN', options = {}) {
  const {
    useRAG      = true,
    topK        = 5,
    denseWeight = 0.6,
    bm25Weight  = 0.4,
    useLegalBoost = true,
    denseTopK,
    bm25TopK,
    rrfK,
    minDenseScore
  } = options;

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  const query = lastUserMessage?.text || lastUserMessage?.content || '';

  let retrievedContext = '';
  let citations       = [];

  const stats       = getVectorStoreStats();
  const hasDocuments = stats.totalChunks > 0;

  if (useRAG && hasDocuments && query) {
    try {
      console.log(`[RAG] Retrieving context for: "${query.slice(0, 100)}..."`);
      const chunks = await hybridRetrieve(query, {
        topK, denseWeight, bm25Weight, useLegalBoost,
        denseTopK, bm25TopK, rrfK, minDenseScore
      });
      if (chunks.length > 0) {
        retrievedContext = formatRetrievedContext(chunks);
        citations        = generateCitations(chunks);
        console.log(`[RAG] Retrieved ${chunks.length} chunks`);
      }
    } catch (err) {
      console.error('[RAG] Retrieval failed, falling back to base LLM:', err.message);
    }
  }

  const langName = LANG_NAMES[lang] || 'English (India)';

  let systemPrompt;
  if (retrievedContext) {
    systemPrompt  = RAG_SYSTEM_PROMPT.replace('{context}', retrievedContext);
    systemPrompt += `\nLANGUAGE: Reply in ${langName}.`;
  } else {
    systemPrompt = `${LEGAL_SYSTEM_PROMPT}\nLANGUAGE PREFERENCE: Reply in ${langName}. If the user writes in another language, mirror their language.`;
  }

  const fullText = await streamGemini(systemPrompt, messages, onChunk);
  return { text: fullText, citations };
}

// ─── Backward-compat wrapper ──────────────────────────────────────────────────
export async function generateResponse(messages, onChunk, lang = 'en-IN') {
  const result = await generateResponseWithRAG(messages, onChunk, lang, {
    useRAG: true, topK: 6, denseWeight: 0.65, bm25Weight: 0.35,
    useLegalBoost: true, denseTopK: 18, bm25TopK: 18, rrfK: 50
  });
  return result.text;
}

// ─── Short title via Gemini (non-streaming) ───────────────────────────────────
export async function generateTitle(firstMessage) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return firstMessage.split(/\s+/).slice(0, 6).join(' ') || 'New Chat';

    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [{ role: 'user', parts: [{ text: firstMessage }] }],
        systemInstruction: {
          parts: [{ text: 'Generate a short title (max 6 words). Only output the title, nothing else.' }]
        },
        generationConfig: { temperature: 0.1, maxOutputTokens: 30 }
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
    );

    return (
      res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      firstMessage.split(/\s+/).slice(0, 6).join(' ') ||
      'New Chat'
    );
  } catch (err) {
    console.warn('Title generation failed:', err.message);
    return firstMessage.split(/\s+/).slice(0, 6).join(' ') || 'New Chat';
  }
}
