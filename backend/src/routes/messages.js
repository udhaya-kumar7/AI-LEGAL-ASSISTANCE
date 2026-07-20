import { Router } from 'express';
import { Message } from '../models/Message.js';

const router = Router();

// GET /api/messages - list recent messages
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const items = await Message.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ data: items });
  } catch (err) {
    next(err);
  }
});

// POST /api/messages - create a message
router.post('/', async (req, res, next) => {
  try {
    const { role, text } = req.body || {};
    if(!role || !text){
      return res.status(400).json({ error: 'role and text are required' });
    }
    const msg = await Message.create({ role, text });
    res.status(201).json({ data: msg });
  } catch (err) {
    next(err);
  }
});

export default router;
