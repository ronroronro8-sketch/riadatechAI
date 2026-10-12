import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { mountProductionFrontend, validateProductionEnvironment } from '../config/deployment.js';
import { createAuthRouter } from '../routes/auth.js';

test('production serves SPA routes and assets without swallowing API errors or exposing files', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'riadatach-deploy-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'static'));
  await writeFile(path.join(directory, 'index.html'), '<!doctype html><div id="root"></div>');
  await writeFile(path.join(directory, 'static/main.123.js'), 'window.appLoaded=true;');
  const app = express();
  app.use(createAuthRouter({ UserModel: {}, connection: { readyState: 0 }, allowedOrigins: new Set() }));
  mountProductionFrontend(app, directory);
  for (const route of ['/', '/login', '/register', '/profile', '/assistant', '/map-analysis', '/duqm-connect', '/data-sources']) {
    const response = await request(app).get(route).expect(200).expect('Content-Type', /html/);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  await request(app).get('/static/main.123.js').expect(200).expect('Cache-Control', /immutable/);
  await request(app).get('/api/missing').expect(404).expect('Content-Type', /json/);
  await request(app).get('/api/auth/me').expect(503);
  for (const route of ['/.env', '/server/.env', '/static/missing.js']) await request(app).get(route).expect(404);
});

test('production rejects missing secrets without including their values in errors', () => {
  assert.doesNotThrow(() => validateProductionEnvironment({ NODE_ENV: 'development' }));
  const env = { NODE_ENV: 'production', MONGO_URI: 'configured', GEMINI_API_KEY: 'configured', SESSION_SECRET: 's'.repeat(48) };
  assert.doesNotThrow(() => validateProductionEnvironment(env));
  for (const name of ['MONGO_URI', 'GEMINI_API_KEY', 'SESSION_SECRET']) {
    assert.throws(() => validateProductionEnvironment({ ...env, [name]: '' }), new RegExp(name));
  }
});
