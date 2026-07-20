import { Router } from 'express';
import { Chat } from '../models/Chat.js';
import { Message } from '../models/Message.js';
import { generateResponse } from '../services/ai.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

// Protect all chat routes
router.use(protect);

// Helper to check chat ownership
const getChatIfOwned = async (chatId, userId) => {
  return await Chat.findOne({ _id: chatId, userId }).lean();
};

// GET /api/chats - list chats
router.get('/', async (req, res, next) => {
  try {
    const chats = await Chat.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ data: chats });
  } catch (err) { next(err); }
});

// POST /api/chats - create chat
router.post('/', async (req, res, next) => {
  try {
    const title = (req.body?.title || 'New chat').trim() || 'New chat';
    const chat = await Chat.create({ title, userId: req.user._id });
    res.status(201).json({ data: chat });
  } catch (err) { next(err); }
});

// PATCH /api/chats/:id - rename chat
router.patch('/:id', async (req, res, next) => {
  try {
    const title = (req.body?.title || '').trim();
    if(!title) return res.status(400).json({ error: 'title is required' });
    const chat = await Chat.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { title },
      { new: true, runValidators: true }
    ).lean();
    if(!chat) return res.status(404).json({ error: 'Chat not found or unauthorized' });
    res.json({ data: chat });
  } catch (err) { next(err); }
});

// DELETE /api/chats/:id - delete chat and its messages
router.delete('/:id', async (req, res, next) => {
  try {
    const chat = await Chat.findOneAndDelete({ _id: req.params.id, userId: req.user._id }).lean();
    if(!chat) return res.status(404).json({ error: 'Chat not found or unauthorized' });
    await Message.deleteMany({ chatId: req.params.id });
    res.json({ data: { deleted: true } });
  } catch (err) { next(err); }
});

// GET /api/chats/:id/messages - list messages for a chat
router.get('/:id/messages', async (req, res, next) => {
  try {
    const chat = await getChatIfOwned(req.params.id, req.user._id);
    if (!chat) return res.status(404).json({ error: 'Chat not found or unauthorized' });

    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const msgs = await Message.find({ chatId: req.params.id }).sort({ createdAt: 1 }).limit(limit).lean();
    res.json({ data: msgs });
  } catch (err) { next(err); }
});

// POST /api/chats/:id/messages - append a message
router.post('/:id/messages', async (req, res, next) => {
  try {
    const chat = await getChatIfOwned(req.params.id, req.user._id);
    if (!chat) return res.status(404).json({ error: 'Chat not found or unauthorized' });

    const { role, text } = req.body || {};
    if(!role || !text) return res.status(400).json({ error: 'role and text are required' });
    const msg = await Message.create({ chatId: req.params.id, role, text });
    res.status(201).json({ data: msg });
  } catch (err) { next(err); }
});

// POST /api/chats/:id/stream - stream AI response
router.post('/:id/stream', async (req, res, next) => {
  try {
    const chat = await getChatIfOwned(req.params.id, req.user._id);
    if (!chat) return res.status(404).json({ error: 'Chat not found or unauthorized' });

    const { message, lang } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message is required' });

    console.log('[Stream] User message:', message);

    // Save user message
    const userMsg = await Message.create({ chatId: req.params.id, role: 'user', text: message });
    console.log('[Stream] User message saved:', userMsg._id);

    // Get conversation history (last 10 messages for context)
    const history = await Message.find({ chatId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    // Reverse to get chronological order
    history.reverse();

    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let fullResponse = '';

    try {
      // Stream AI response
      await generateResponse(history, (chunk) => {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }, lang);
    } catch (aiError) {
      console.error('[Stream] AI generation error:', aiError.message);
      // Send error to frontend
      res.write(`data: ${JSON.stringify({ error: aiError.message })}\n\n`);
      
      // Save error message so chat history shows it
      await Message.create({ 
        chatId: req.params.id, 
        role: 'ai', 
        text: `Error: ${aiError.message}. Please try again or start a new chat if the issue persists.` 
      });
      
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return;
    }

    // Save AI response only if it has content
    if (fullResponse && fullResponse.trim()) {
      await Message.create({ chatId: req.params.id, role: 'ai', text: fullResponse.trim() });
    } else {
      console.warn('[Stream] AI returned empty response');
      const errorMsg = 'I apologize, but I encountered an error generating a response. Please try rephrasing your question.';
      await Message.create({ chatId: req.params.id, role: 'ai', text: errorMsg });
      res.write(`data: ${JSON.stringify({ chunk: errorMsg })}\n\n`);
    }

    // Send done signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Stream error:', err);
    if (!res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

export default router;
