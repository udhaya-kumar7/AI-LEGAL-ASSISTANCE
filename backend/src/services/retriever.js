/**
 * Hybrid Retriever Service
 * Combines BM25 (sparse) + Dense embeddings for optimal retrieval
 * Uses Reciprocal Rank Fusion (RRF) for score combination
 */

import { denseSearch, getAllChunks } from './vectorStore.js';
import { bm25Search, extractLegalTerms } from './bm25.js';

/**
 * Reciprocal Rank Fusion
 * Combines rankings from multiple retrieval methods
 */
function reciprocalRankFusion(rankings, k = 60) {
  const fusedScores = {};
  
  rankings.forEach(({ results, weight = 1 }) => {
    results.forEach((doc, rank) => {
      const id = doc.id;
      if (!fusedScores[id]) {
        fusedScores[id] = { doc, score: 0 };
      }
      fusedScores[id].score += weight / (k + rank + 1);
    });
  });
  
  return Object.values(fusedScores)
    .sort((a, b) => b.score - a.score)
    .map(({ doc, score }) => ({ ...doc, rrfScore: score }));
}

/**
 * Hybrid retrieval combining BM25 + Dense search
 */
export async function hybridRetrieve(query, options = {}) {
  const {
    topK = 5,
    bm25Weight = 0.4,
    denseWeight = 0.6,
    useLegalBoost = true,
    rrfK = 60,
    denseTopK = topK * 3,
    bm25TopK = topK * 3,
    minDenseScore = -1
  } = options;

  const totalWeight = bm25Weight + denseWeight;
  const normalizedBm25Weight = totalWeight > 0 ? bm25Weight / totalWeight : 0.4;
  const normalizedDenseWeight = totalWeight > 0 ? denseWeight / totalWeight : 0.6;
  
  const allChunks = getAllChunks();
  
  if (allChunks.length === 0) {
    console.log('[Retriever] No documents indexed');
    return [];
  }
  
  try {
    const legalTerms = useLegalBoost ? extractLegalTerms(query) : [];
    const bm25Query = legalTerms.length > 0
      ? `${query} ${legalTerms.join(' ')}`
      : query;

    // Run both retrievers in parallel
    const [denseResults, bm25Results] = await Promise.all([
      denseSearch(query, denseTopK),
      Promise.resolve(bm25Search(bm25Query, allChunks, bm25TopK))
    ]);

    const filteredDenseResults = denseResults.filter(doc => (doc.score ?? 0) >= minDenseScore);
    
    // Apply weighted RRF fusion
    let fusedResults = reciprocalRankFusion([
      { results: filteredDenseResults, weight: normalizedDenseWeight },
      { results: bm25Results, weight: normalizedBm25Weight }
    ], rrfK);
    
    // Boost documents containing legal terms from query
    if (useLegalBoost && legalTerms.length > 0) {
      fusedResults = fusedResults.map(doc => {
        const textLower = doc.text.toLowerCase();
        const matchCount = legalTerms.filter(term => textLower.includes(term)).length;
        const boost = 1 + (matchCount * 0.1);
        return { ...doc, rrfScore: doc.rrfScore * boost, legalTermMatches: matchCount };
      });
      fusedResults.sort((a, b) => b.rrfScore - a.rrfScore);
    }
    
    console.log(
      `[Retriever] Hybrid search: ${filteredDenseResults.length} dense, ${bm25Results.length} BM25, ` +
      `${fusedResults.length} fused (weights dense=${normalizedDenseWeight.toFixed(2)}, bm25=${normalizedBm25Weight.toFixed(2)})`
    );
    
    return fusedResults.slice(0, topK);
  } catch (err) {
    console.error('[Retriever] Hybrid retrieval failed:', err.message);
    // Fallback to BM25 only
    return bm25Search(query, allChunks, topK);
  }
}

/**
 * Retrieve with context expansion
 * Gets neighboring chunks for better context
 */
export async function retrieveWithContext(query, options = {}) {
  const { topK = 5, contextWindow = 1 } = options;
  
  const results = await hybridRetrieve(query, { ...options, topK });
  
  // For now, return as-is. Context expansion would require chunk ordering metadata.
  // TODO: Implement context window expansion when chunk ordering is tracked
  
  return results;
}

/**
 * Format retrieved chunks for LLM context
 */
export function formatRetrievedContext(chunks) {
  if (!chunks || chunks.length === 0) {
    return '';
  }
  
  return chunks.map((chunk, idx) => {
    const source = chunk.metadata?.source || 'Unknown';
    const page = chunk.metadata?.page ? ` (Page ${chunk.metadata.page})` : '';
    const section = chunk.metadata?.section ? ` - ${chunk.metadata.section}` : '';
    
    return `[Source ${idx + 1}: ${source}${page}${section}]\n${chunk.text}`;
  }).join('\n\n---\n\n');
}

/**
 * Generate citations from retrieved chunks
 */
export function generateCitations(chunks) {
  if (!chunks || chunks.length === 0) {
    return [];
  }
  
  return chunks.map((chunk, idx) => ({
    id: idx + 1,
    source: chunk.metadata?.source || 'Unknown Document',
    page: chunk.metadata?.page || null,
    section: chunk.metadata?.section || null,
    documentId: chunk.metadata?.documentId || null,
    relevanceScore: chunk.rrfScore || chunk.score || 0,
    excerpt: chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : '')
  }));
}

export default {
  hybridRetrieve,
  retrieveWithContext,
  formatRetrievedContext,
  generateCitations
};
