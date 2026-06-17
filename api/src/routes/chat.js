const express = require('express');
const router = express.Router();

// POST /api/chat - Chat with PipelineDoc assistant
router.post('/', (req, res) => {
  res.status(501).json({ error: 'Chat endpoint not implemented yet' });
});

module.exports = router;
