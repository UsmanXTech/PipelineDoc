const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey && process.env.NODE_ENV !== 'test') {
  console.warn('Warning: GEMINI_API_KEY is not defined in the environment.');
}

// In standard production environments, the client can read GEMINI_API_KEY directly from env.
const gemini = new GoogleGenAI({
  apiKey: apiKey || 'dummy-key',
});

module.exports = gemini;
