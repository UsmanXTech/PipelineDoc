const axios = require('axios');
const databaseConfig = require('../../config/database');
const { generateEmbedding, localVectors } = require('./knowledge-indexer');

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function retrieveSimilarIncidents(queryText, limit = 5) {
  const queryVector = generateEmbedding(queryText);
  const qdrantUrl = databaseConfig.vectorDbUrl;

  if (qdrantUrl && process.env.NODE_ENV === 'production') {
    try {
      const headers = {};
      if (process.env.QDRANT_API_KEY) {
        headers['api-key'] = process.env.QDRANT_API_KEY;
      }
      const response = await axios.post(`${qdrantUrl}/collections/incident_knowledge/points/search`, {
        vector: queryVector,
        limit,
        with_payload: true
      }, { headers });
      const points = response.data?.result || [];
      return {
        similar_incidents: points.map(pt => ({
          root_cause: pt.payload?.root_cause || '',
          resolution: pt.payload?.resolution || '',
          similarity_score: pt.score || 0
        }))
      };
    } catch (err) {
      console.warn('Qdrant search failed, falling back to local memory cache:', err.message);
    }
  }

  // Fallback to local memory cache using Cosine Similarity
  const similarities = localVectors.map(item => {
    const score = cosineSimilarity(queryVector, item.vector);
    return {
      root_cause: item.payload.root_cause || '',
      resolution: item.payload.resolution || '',
      similarity_score: score
    };
  });

  const topMatches = similarities
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, limit);

  return { similar_incidents: topMatches };
}

module.exports = {
  cosineSimilarity,
  retrieveSimilarIncidents
};
