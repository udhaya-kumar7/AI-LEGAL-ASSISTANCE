/**
 * Vector Store Service
 * Handles document embeddings storage and similarity search
 * Using in-memory storage with option to persist to MongoDB
 */

import axios from 'axios';

// In-memory vector store (can be upgraded to Pinecone/Weaviate/Milvus)
let vectorIndex = [];
let documentChunks = [];

/**
 * Generate embeddings using Gemini API
 */
export async function generateEmbedding(text) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`;
    
    const response = await axios.post(url, {
      model: "models/gemini-embedding-2",
      content: {
        parts: [{
          text: text.slice(0, 8000) // gemini-embedding-2 limit
        }]
      }
    }, { timeout: 30000 });
    
    return response.data.embedding.values;
  } catch (err) {
    console.error('[VectorStore] Embedding generation failed:', err.message);
    throw new Error(`Embedding failed: ${err.message}`);
  }
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Add document chunk to vector store
 */
export async function addToVectorStore(chunk) {
  const { id, text, metadata } = chunk;
  
  try {
    const embedding = await generateEmbedding(text);
    
    const entry = {
      id,
      text,
      metadata,
      embedding,
      createdAt: new Date()
    };
    
    vectorIndex.push(entry);
    documentChunks.push({ id, text, metadata });
    
    console.log(`[VectorStore] Added chunk ${id}, total: ${vectorIndex.length}`);
    return entry;
  } catch (err) {
    console.error('[VectorStore] Failed to add chunk:', err.message);
    throw err;
  }
}

/**
 * Batch add multiple chunks (with rate limit throttling)
 */
export async function addBatchToVectorStore(chunks) {
  const results = [];
  // Gemini free tier allows 15 RPM (1 request every 4 seconds).
  // We add a 4.1-second delay between requests to avoid quota exceeded errors.
  const delay = ms => new Promise(res => setTimeout(res, ms));

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const result = await addToVectorStore(chunk);
      results.push(result);
    } catch (err) {
      console.error(`[VectorStore] Failed to add chunk ${chunk.id}:`, err.message);
    }
    
    // Throttle if there are more chunks to process
    if (i < chunks.length - 1) {
      console.log(`[VectorStore] Throttling for 4.1 seconds to respect API limits...`);
      await delay(4100);
    }
  }
  return results;
}

/**
 * Dense vector similarity search
 */
export async function denseSearch(query, topK = 5) {
  if (vectorIndex.length === 0) {
    return [];
  }
  
  try {
    const queryEmbedding = await generateEmbedding(query);
    
    const scored = vectorIndex.map(entry => ({
      ...entry,
      score: cosineSimilarity(queryEmbedding, entry.embedding)
    }));
    
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, topK).map(({ embedding, ...rest }) => rest);
  } catch (err) {
    console.error('[VectorStore] Dense search failed:', err.message);
    return [];
  }
}

/**
 * Get all chunks (for BM25)
 */
export function getAllChunks() {
  return documentChunks;
}

/**
 * Get vector store stats
 */
export function getVectorStoreStats() {
  return {
    totalChunks: vectorIndex.length,
    totalDocuments: new Set(documentChunks.map(c => c.metadata?.documentId)).size
  };
}

/**
 * Clear vector store (for testing)
 */
export function clearVectorStore() {
  vectorIndex = [];
  documentChunks = [];
  console.log('[VectorStore] Cleared');
}

/**
 * Delete chunks by document ID
 */
export function deleteByDocumentId(documentId) {
  const before = vectorIndex.length;
  vectorIndex = vectorIndex.filter(e => e.metadata?.documentId !== documentId);
  documentChunks = documentChunks.filter(c => c.metadata?.documentId !== documentId);
  const deleted = before - vectorIndex.length;
  console.log(`[VectorStore] Deleted ${deleted} chunks for document ${documentId}`);
  return deleted;
}

export default {
  generateEmbedding,
  addToVectorStore,
  addBatchToVectorStore,
  denseSearch,
  getAllChunks,
  getVectorStoreStats,
  clearVectorStore,
  deleteByDocumentId
};
