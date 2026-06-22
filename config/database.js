const { Pool } = require('pg');
const Redis = require('ioredis');
require('dotenv').config();

const postgresUrl = process.env.POSTGRES_URL;
const redisUrl = process.env.REDIS_URL;
const vectorDbUrl = process.env.VECTOR_DB_URL;

// Initialize Postgres Pool if URL is provided
let pool = null;
if (postgresUrl) {
  pool = new Pool({
    connectionString: postgresUrl,
  });
} else {
  console.warn('Warning: POSTGRES_URL is not defined in the environment.');
}

// Initialize Redis Client if URL is provided
let redis = null;
if (redisUrl) {
  redis = new Redis(redisUrl, {
    lazyConnect: true
  });
} else {
  console.warn('Warning: REDIS_URL is not defined in the environment.');
}

module.exports = {
  postgresUrl,
  redisUrl,
  vectorDbUrl,
  pgPool: pool,
  redisClient: redis,
};
