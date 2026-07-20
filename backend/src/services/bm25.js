/**
 * BM25 Search Implementation
 * Sparse retrieval for keyword matching
 */

// Stopwords for legal texts
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't',
  'can', 'will', 'just', 'don', 'should', 'now', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'this', 'that', 'these', 'those', 'am', 'it', 'its', 'as', 'if', 'which', 'who', 'whom'
]);

/**
 * Tokenize and clean text
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
}

/**
 * Build inverted index for BM25
 */
function buildInvertedIndex(documents) {
  const index = {};
  const docLengths = [];
  let totalLength = 0;
  
  documents.forEach((doc, docIdx) => {
    const tokens = tokenize(doc.text);
    docLengths[docIdx] = tokens.length;
    totalLength += tokens.length;
    
    const termFreq = {};
    tokens.forEach(token => {
      termFreq[token] = (termFreq[token] || 0) + 1;
    });
    
    Object.entries(termFreq).forEach(([term, freq]) => {
      if (!index[term]) {
        index[term] = [];
      }
      index[term].push({ docIdx, freq });
    });
  });
  
  return {
    index,
    docLengths,
    avgDocLength: totalLength / documents.length,
    numDocs: documents.length
  };
}

/**
 * BM25 scoring function
 */
function bm25Score(termData, docLength, avgDocLength, numDocs, k1 = 1.5, b = 0.75) {
  const { docIdx, freq } = termData;
  const df = termData.df || 1;
  
  // IDF component
  const idf = Math.log((numDocs - df + 0.5) / (df + 0.5) + 1);
  
  // TF component with length normalization
  const tfNorm = (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (docLength / avgDocLength)));
  
  return idf * tfNorm;
}

/**
 * BM25 Search
 */
export function bm25Search(query, documents, topK = 5) {
  if (!documents || documents.length === 0) {
    return [];
  }
  
  const { index, docLengths, avgDocLength, numDocs } = buildInvertedIndex(documents);
  const queryTokens = tokenize(query);
  
  // Calculate document frequencies
  Object.keys(index).forEach(term => {
    index[term].forEach(entry => {
      entry.df = index[term].length;
    });
  });
  
  // Score each document
  const scores = new Array(numDocs).fill(0);
  
  queryTokens.forEach(token => {
    if (index[token]) {
      index[token].forEach(({ docIdx, freq, df }) => {
        scores[docIdx] += bm25Score(
          { docIdx, freq, df },
          docLengths[docIdx],
          avgDocLength,
          numDocs
        );
      });
    }
  });
  
  // Get top K results
  const results = scores
    .map((score, idx) => ({ ...documents[idx], bm25Score: score }))
    .filter(doc => doc.bm25Score > 0)
    .sort((a, b) => b.bm25Score - a.bm25Score)
    .slice(0, topK);
  
  return results;
}

/**
 * Extract legal terms from query (enhanced for legal domain)
 */
export function extractLegalTerms(query) {
  const legalPatterns = [
    /section\s*\d+[a-z]?/gi,
    /article\s*\d+[a-z]?/gi,
    /rule\s*\d+/gi,
    /ipc|cpc|crpc|it\s*act|contract\s*act/gi,
    /supreme\s*court|high\s*court|district\s*court/gi,
    /plaintiff|defendant|appellant|respondent/gi,
    /writ|petition|appeal|suit|complaint/gi,
    /bail|custody|arrest|warrant/gi,
    /damages|compensation|injunction|decree/gi
  ];
  
  const terms = [];
  legalPatterns.forEach(pattern => {
    const matches = query.match(pattern);
    if (matches) {
      terms.push(...matches.map(m => m.toLowerCase().trim()));
    }
  });
  
  return [...new Set(terms)];
}

export default {
  bm25Search,
  tokenize,
  extractLegalTerms
};
