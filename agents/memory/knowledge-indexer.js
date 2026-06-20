const axios = require('axios');
const crypto = require('crypto');
const databaseConfig = require('../../config/database');

// Pseudo-embedding function of size 1536
function generateEmbedding(text) {
  const hash = crypto.createHash('sha256').update(text).digest();
  const vector = [];
  for (let i = 0; i < 1536; i++) {
    const val = (hash[i % hash.length] / 255.0) * 2 - 1;
    const offset = Math.sin(i * text.length) * 0.1;
    vector.push(val + offset);
  }
  return vector;
}

// Memory cache for test runs or fallback
const localVectors = [];

async function indexIncident(incidentId, rootCause, resolution, metadata = {}) {
  const text = `${rootCause || ''} ${resolution || ''}`;
  const vector = generateEmbedding(text);

  const payload = {
    incident_id: incidentId,
    root_cause: rootCause,
    resolution,
    failure_type: metadata.failure_type || 'unknown',
    repo: metadata.repo || 'unknown-repo',
    resolution_time_minutes: metadata.resolution_time_minutes || 0,
    success: metadata.success !== undefined ? metadata.success : true
  };

  // Add to local fallback cache
  localVectors.push({ id: incidentId, vector, payload });

  const qdrantUrl = databaseConfig.vectorDbUrl;
  if (qdrantUrl && process.env.NODE_ENV === 'production') {
    try {
      // 1. Ensure collection exists
      await axios.put(`${qdrantUrl}/collections/incident_knowledge`, {
        vectors: {
          size: 1536,
          distance: 'Cosine'
        }
      }).catch(err => {
        // If collection already exists, it might return 400 or 409, which is fine
      });

      // 2. Upsert point
      await axios.put(`${qdrantUrl}/collections/incident_knowledge/points`, {
        points: [
          {
            id: incidentId,
            vector,
            payload
          }
        ]
      });
      console.log(`Successfully indexed incident ${incidentId} in Qdrant.`);
    } catch (err) {
      console.warn('Qdrant indexing failed, using local memory cache:', err.message);
    }
  }

  return { incidentId, success: true };
}

module.exports = {
  generateEmbedding,
  indexIncident,
  localVectors
};
