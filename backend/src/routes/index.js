import { Router } from 'express';
import messages from './messages.js';
import chats from './chats.js';
import document from './document.js';
import knowledge from './knowledge.js';

import auth from './auth.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

router.use('/auth', auth);
router.use('/messages', messages);
router.use('/chats', chats);
router.use('/documents', document);
router.use('/knowledge', knowledge);

export default router;
