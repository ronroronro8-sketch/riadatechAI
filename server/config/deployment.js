import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function validateProductionEnvironment(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  for (const name of ['MONGO_URI', 'GEMINI_API_KEY']) {
    if (!env[name]?.trim()) throw new Error(`Missing production environment variable: ${name}`);
  }
  if (Buffer.byteLength(env.SESSION_SECRET || '') < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes.');
  }
}

export function mountProductionFrontend(app, buildDirectory) {
  const index = path.join(buildDirectory, 'index.html');
  if (!existsSync(index)) throw new Error('Frontend build missing. Run the production build before starting.');
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use(express.static(buildDirectory, {
    index: false,
    dotfiles: 'deny',
    setHeaders(res, file) {
      res.set('Cache-Control', file.includes(`${path.sep}static${path.sep}`)
        ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));
  app.get('*', (req, res, next) => {
    if (path.extname(req.path) || req.path.split('/').some(part => part.startsWith('.'))) {
      return res.status(404).end();
    }
    res.set('Cache-Control', 'no-store');
    res.sendFile(index, error => error && next(error));
  });
}
