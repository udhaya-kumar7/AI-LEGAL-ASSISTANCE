/**
 * Knowledge Base API Routes
 * Handles document upload, ingestion, and knowledge base management
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { ingestDocument, removeDocument, batchIngest } from '../services/ingestion.js';
import { getVectorStoreStats, clearVectorStore } from '../services/vectorStore.js';
import { LegalDocument } from '../models/LegalDocument.js';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not supported. Allowed: ${allowedTypes.join(', ')}`));
    }
  }
});

/**
 * GET /api/knowledge/stats
 * Get knowledge base statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const vectorStats = getVectorStoreStats();
    const docCount = await LegalDocument.countDocuments({ status: 'indexed' });
    const pendingCount = await LegalDocument.countDocuments({ status: 'pending' });
    
    res.json({
      success: true,
      data: {
        totalChunks: vectorStats.totalChunks,
        totalDocuments: vectorStats.totalDocuments,
        dbDocuments: docCount,
        pendingDocuments: pendingCount
      }
    });
  } catch (err) {
    console.error('[Knowledge API] Stats error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/knowledge/documents
 * List all indexed documents
 */
router.get('/documents', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, jurisdiction } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (type) query.documentType = type;
    if (jurisdiction) query.jurisdiction = jurisdiction;
    
    const documents = await LegalDocument.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('-fullText') // Exclude full text for listing
      .lean();
    
    const total = await LegalDocument.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        documents,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (err) {
    console.error('[Knowledge API] List documents error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/knowledge/upload
 * Upload and ingest a legal document
 */
router.post('/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    const { documentType, jurisdiction, tags } = req.body;
    
    console.log(`[Knowledge API] Uploading: ${req.file.originalname}`);
    
    // Create document record
    const ext = path.extname(req.file.originalname).toLowerCase().slice(1);
    const docRecord = new LegalDocument({
      filename: req.file.originalname,
      originalName: req.file.originalname,
      fileType: ext,
      fileSize: req.file.size,
      documentType: documentType || 'other',
      jurisdiction: jurisdiction || 'india',
      tags: tags ? tags.split(',').map(t => t.trim()) : [],
      status: 'processing'
    });
    
    await docRecord.save();
    
    // Ingest the document
    const result = await ingestDocument(req.file.buffer, req.file.originalname, {
      chunkSize: parseInt(req.body.chunkSize) || 1000,
      chunkOverlap: parseInt(req.body.chunkOverlap) || 200
    });
    
    // Update document record
    docRecord.documentId = result.documentId;
    docRecord.numPages = result.numPages;
    docRecord.numChunks = result.numChunks;
    docRecord.status = 'indexed';
    docRecord.indexedAt = new Date();
    await docRecord.save();
    
    console.log(`[Knowledge API] Indexed: ${result.documentId} with ${result.numChunks} chunks`);
    
    res.json({
      success: true,
      data: {
        documentId: result.documentId,
        filename: result.filename,
        numPages: result.numPages,
        numChunks: result.numChunks,
        legalSections: result.legalSections
      }
    });
  } catch (err) {
    console.error('[Knowledge API] Upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/knowledge/upload-batch
 * Upload multiple documents at once
 */
router.post('/upload-batch', upload.array('documents', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }
    
    const documents = req.files.map(file => ({
      buffer: file.buffer,
      filename: file.originalname,
      options: {
        chunkSize: parseInt(req.body.chunkSize) || 1000,
        chunkOverlap: parseInt(req.body.chunkOverlap) || 200
      }
    }));
    
    const results = await batchIngest(documents);
    
    // Save records for successful ingestions
    for (const result of results) {
      if (result.success) {
        const ext = path.extname(result.filename).toLowerCase().slice(1);
        await LegalDocument.create({
          documentId: result.documentId,
          filename: result.filename,
          originalName: result.filename,
          fileType: ext,
          fileSize: 0, // Not available in batch
          numPages: result.numPages,
          numChunks: result.numChunks,
          status: 'indexed',
          indexedAt: new Date()
        });
      }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    res.json({
      success: true,
      data: {
        total: results.length,
        successful,
        failed,
        results
      }
    });
  } catch (err) {
    console.error('[Knowledge API] Batch upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/knowledge/documents/:documentId
 * Remove a document from the knowledge base
 */
router.delete('/documents/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    // Remove from vector store
    const result = removeDocument(documentId);
    
    // Remove from database
    await LegalDocument.deleteOne({ documentId });
    
    res.json({
      success: true,
      data: {
        documentId,
        chunksDeleted: result.chunksDeleted
      }
    });
  } catch (err) {
    console.error('[Knowledge API] Delete error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/knowledge/documents/:documentId
 * Get document details
 */
router.get('/documents/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const document = await LegalDocument.findOne({ documentId }).lean();
    
    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    
    res.json({ success: true, data: document });
  } catch (err) {
    console.error('[Knowledge API] Get document error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/knowledge/clear
 * Clear entire knowledge base (admin only)
 */
router.post('/clear', async (req, res) => {
  try {
    const { confirm } = req.body;
    
    if (confirm !== 'DELETE_ALL') {
      return res.status(400).json({ 
        success: false, 
        error: 'Confirmation required. Send { confirm: "DELETE_ALL" }' 
      });
    }
    
    clearVectorStore();
    await LegalDocument.deleteMany({});
    
    res.json({
      success: true,
      message: 'Knowledge base cleared'
    });
  } catch (err) {
    console.error('[Knowledge API] Clear error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
