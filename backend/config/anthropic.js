const { Anthropic } = require('@anthropic-ai/sdk');
require('dotenv').config();

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey && process.env.NODE_ENV !== 'test') {
  console.warn('Warning: ANTHROPIC_API_KEY is not defined in the environment.');
}

const anthropic = new Anthropic({
  apiKey: apiKey || 'dummy-key',
});

module.exports = anthropic;
