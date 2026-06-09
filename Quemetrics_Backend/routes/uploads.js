const express = require('express');
const router = express.Router();
const cache = require('../utils/cache');
const { v4: uuidv4 } = require('uuid');

// POST /api/uploads/wizard
// Stores a large wizard payload in in-memory cache and returns an uploadId
router.post('/wizard', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload) return res.status(400).json({ success: false, error: 'No payload provided' });

    const id = uuidv4();
    const key = `wizard_upload:${id}`;
    // store payload as string; set TTL to 1 hour
    await cache.set(key, JSON.stringify({ payload, createdAt: Date.now() }), 'EX', 60 * 60);

    return res.json({ success: true, uploadId: id });
  } catch (err) {
    console.error('Upload store error', err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// GET /api/uploads/wizard/:id
// Retrieve stored payload by uploadId
router.get('/wizard/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const key = `wizard_upload:${id}`;
    const raw = await cache.get(key);
    if (!raw) return res.status(404).json({ success: false, error: 'Upload not found or expired' });
    const parsed = JSON.parse(raw);
    return res.json({ success: true, payload: parsed.payload });
  } catch (err) {
    console.error('Upload retrieve error', err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
});

module.exports = router;
