// server.js — Express backend for "My Midjourney"
// Role: serve index.html and proxy image-generation requests to fal.ai Z-Image Turbo.
// The API key stays on the server (loaded from .env via dotenv) so it never leaks to the browser.

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5858;

// --- Config ---------------------------------------------------------------
// Read FAL_KEY from env; trim to strip any trailing newline that some hosts add.
const FAL_KEY = (process.env.FAL_KEY || '').trim();

const FAL_ENDPOINT = 'https://fal.run/fal-ai/z-image/turbo';

// --- Middleware -----------------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// --- API routes -----------------------------------------------------------

// POST /api/generate
// Body: { prompt: string, width?: number, height?: number, num_images?: number }
// Returns: { success: true, data: { imageUrl, images } }
app.post('/api/generate', async (req, res) => {
  try {
    const {
      prompt,
      width = 1024,
      height = 1024,
      num_images = 1,
    } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        message: 'prompt is required and must be a non-empty string',
      });
    }

    if (!FAL_KEY) {
      return res.status(500).json({
        success: false,
        message: 'FAL_KEY is not configured on the server',
      });
    }

    const falBody = {
      prompt: prompt.trim(),
      image_size: {
        width: Number(width) || 1024,
        height: Number(height) || 1024,
      },
      num_inference_steps: 4,
      num_images: Math.min(Math.max(Number(num_images) || 1, 1), 4),
      output_format: 'png',
    };

    const falRes = await fetch(FAL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${FAL_KEY}`,
      },
      body: JSON.stringify(falBody),
    });

    // fal.ai returns JSON on both success and error paths.
    const payload = await falRes.json().catch(() => ({}));

    if (!falRes.ok) {
      return res.status(falRes.status).json({
        success: false,
        message: payload?.detail || payload?.message || 'fal.ai request failed',
        data: payload,
      });
    }

    const images = Array.isArray(payload?.images) ? payload.images : [];
    const imageUrl = images[0]?.url || null;

    if (!imageUrl) {
      return res.status(502).json({
        success: false,
        message: 'fal.ai returned no image',
        data: payload,
      });
    }

    return res.json({
      success: true,
      data: {
        imageUrl,
        images,
        seed: payload?.seed,
      },
    });
  } catch (err) {
    console.error('[/api/generate] error:', err);
    return res.status(500).json({
      success: false,
      message: err?.message || 'Internal server error',
    });
  }
});

// Lightweight health check — handy while debugging from the browser/devtools.
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: { ok: true, hasKey: !!FAL_KEY },
  });
});

// --- SPA fallback ---------------------------------------------------------
// Any non-API GET falls back to index.html so deep links still work.
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Error handler --------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('[unhandled error]', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// --- Startup --------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`My Midjourney server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
