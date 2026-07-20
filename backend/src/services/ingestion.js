/**
 * Document Ingestion Pipeline
 * Handles PDF parsing, chunking, and indexing for RAG
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import { addBatchToVectorStore, deleteByDocumentId } from './vectorStore.js';

// Chunking configuration
const DEFAULT_CHUNK_SIZE = 1000; // characters
const DEFAULT_CHUNK_OVERLAP = 200; // characters
const MIN_CHUNK_SIZE = 100;

/**
 * Generate unique document ID
 */
function generateDocId(filename, content) {
  const hash = crypto.createHash('md5').update(content.slice(0, 1000)).digest('hex').slice(0, 8);
  return `doc_${Date.now()}_${hash}`;
}

/**
 * Extract text from PDF buffer
 */
export async function extractTextFromPDF(buffer, filename = 'document.pdf') {
  try {
    const data = await pdfParse(buffer);
    
    return {
      text: data.text,
      numPages: data.numpages,
      metadata: {
        filename,
        numPages: data.numpages,
        info: data.info || {}
      }
    };
  } catch (err) {
    console.error('[Ingestion] PDF extraction failed:', err.message);
    throw new Error(`PDF extraction failed: ${err.message}`);
  }
}

/**
 * Extract text from plain text file
 */
export async function extractTextFromTxt(buffer, filename = 'document.txt') {
  const text = buffer.toString('utf-8');
  return {
    text,
    numPages: 1,
    metadata: { filename, numPages: 1 }
  };
}

/**
 * Smart text chunking with overlap
 * Tries to split on sentence/paragraph boundaries
 */
export function chunkText(text, options = {}) {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    chunkOverlap = DEFAULT_CHUNK_OVERLAP,
    metadata = {}
  } = options;
  
  if (!text || text.length < MIN_CHUNK_SIZE) {
    return text ? [{ text, metadata }] : [];
  }
  
  const chunks = [];
  let startIdx = 0;
  let chunkNum = 1;
  
  while (startIdx < text.length) {
    let endIdx = Math.min(startIdx + chunkSize, text.length);
    
    // Try to find a good break point (sentence end, paragraph)
    if (endIdx < text.length) {
      const searchWindow = text.slice(endIdx - 100, endIdx + 100);
      
      // Look for paragraph break
      const paragraphBreak = searchWindow.lastIndexOf('\n\n');
      if (paragraphBreak !== -1 && paragraphBreak > 50) {
        endIdx = endIdx - 100 + paragraphBreak + 2;
      } else {
        // Look for sentence end
        const sentenceEnd = searchWindow.search(/[.!?]\s/);
        if (sentenceEnd !== -1 && sentenceEnd > 50) {
          endIdx = endIdx - 100 + sentenceEnd + 2;
        }
      }
    }
    
    const chunkText = text.slice(startIdx, endIdx).trim();
    
    if (chunkText.length >= MIN_CHUNK_SIZE) {
      chunks.push({
        text: chunkText,
        metadata: {
          ...metadata,
          chunkIndex: chunkNum,
          startChar: startIdx,
          endChar: endIdx
        }
      });
      chunkNum++;
    }

    if (endIdx >= text.length) {
      break;
    }
    
    // Move start position with overlap
    const nextStartIdx = endIdx - chunkOverlap;
    if (nextStartIdx <= startIdx) {
      break;
    }
    startIdx = nextStartIdx;
    if (startIdx >= text.length - MIN_CHUNK_SIZE) break;
  }
  
  return chunks;
}

/**
 * Legal document section extraction
 * Identifies sections, articles, chapters for better chunking
 */
export function extractLegalSections(text) {
  const sections = [];
  
  // Patterns for legal document structure
  const patterns = [
    { type: 'chapter', regex: /chapter\s+(\d+|[ivxlcdm]+)[.:]\s*([^\n]+)/gi },
    { type: 'section', regex: /section\s+(\d+[a-z]?)[.:]\s*([^\n]+)/gi },
    { type: 'article', regex: /article\s+(\d+)[.:]\s*([^\n]+)/gi },
    { type: 'clause', regex: /clause\s+(\d+)[.:]\s*([^\n]+)/gi },
    { type: 'rule', regex: /rule\s+(\d+)[.:]\s*([^\n]+)/gi }
  ];
  
  patterns.forEach(({ type, regex }) => {
    let match;
    while ((match = regex.exec(text)) !== null) {
      sections.push({
        type,
        number: match[1],
        title: match[2]?.trim() || '',
        position: match.index
      });
    }
  });
  
  // Sort by position
  sections.sort((a, b) => a.position - b.position);
  
  return sections;
}

/**
 * Ingest a document (PDF or TXT)
 */
export async function ingestDocument(buffer, filename, options = {}) {
  const ext = path.extname(filename).toLowerCase();
  
  let extracted;
  if (ext === '.pdf') {
    extracted = await extractTextFromPDF(buffer, filename);
  } else if (ext === '.txt') {
    extracted = await extractTextFromTxt(buffer, filename);
  } else {
    throw new Error(`Unsupported file type: ${ext}. Supported: .pdf, .txt`);
  }
  
  const documentId = generateDocId(filename, extracted.text);
  
  // Extract legal sections for metadata
  const legalSections = extractLegalSections(extracted.text);
  
  // Chunk the document
  const chunks = chunkText(extracted.text, {
    chunkSize: options.chunkSize || DEFAULT_CHUNK_SIZE,
    chunkOverlap: options.chunkOverlap || DEFAULT_CHUNK_OVERLAP,
    metadata: {
      documentId,
      source: filename,
      numPages: extracted.numPages,
      ...extracted.metadata
    }
  });
  
  // Add chunk IDs and section info
  const chunksWithIds = chunks.map((chunk, idx) => {
    // Find which section this chunk belongs to
    const relevantSection = legalSections.find(s => 
      s.position <= chunk.metadata.startChar && 
      (legalSections[legalSections.indexOf(s) + 1]?.position || Infinity) > chunk.metadata.startChar
    );
    
    return {
      id: `${documentId}_chunk_${idx + 1}`,
      text: chunk.text,
      metadata: {
        ...chunk.metadata,
        section: relevantSection ? `${relevantSection.type} ${relevantSection.number}: ${relevantSection.title}` : null
      }
    };
  });
  
  // Index in vector store
  console.log(`[Ingestion] Indexing ${chunksWithIds.length} chunks for ${filename}`);
  const indexed = await addBatchToVectorStore(chunksWithIds);
  
  return {
    documentId,
    filename,
    numPages: extracted.numPages,
    numChunks: indexed.length,
    legalSections: legalSections.length,
    success: true
  };
}

/**
 * Remove document from index
 */
export async function removeDocument(documentId) {
  const deleted = deleteByDocumentId(documentId);
  return { documentId, chunksDeleted: deleted };
}

/**
 * Batch ingest multiple documents
 */
export async function batchIngest(documents) {
  const results = [];
  
  for (const { buffer, filename, options } of documents) {
    try {
      const result = await ingestDocument(buffer, filename, options);
      results.push(result);
    } catch (err) {
      results.push({
        filename,
        success: false,
        error: err.message
      });
    }
  }
  
  return results;
}

export default {
  ingestDocument,
  removeDocument,
  batchIngest,
  extractTextFromPDF,
  extractTextFromTxt,
  chunkText,
  extractLegalSections
};
