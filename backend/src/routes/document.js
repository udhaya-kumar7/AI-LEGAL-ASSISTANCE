import express from 'express';
import multer from 'multer';
import { analyzeDocument } from '../services/documentAnalyzer.js';

const router = express.Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images (JPG, PNG) and PDFs are allowed'));
    }
  }
});

// POST /api/documents/analyze - Analyze a legal document
router.post('/analyze', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No document uploaded' });
    }

    const result = await analyzeDocument(req.file);
    res.json(result);
  } catch (error) {
    console.error('[Document Analyzer] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
