import { Router } from 'express';
import { ConversationError } from '../services/conversationService.js';

export function createMapAnalysisRouter(service) {
  const router = Router();
  const handle = action => async (req, res) => {
    try { await action(req, res); }
    catch (error) {
      const status = error instanceof ConversationError ? error.status : (error.status === 503 ? 503 : 500);
      res.status(status).json({ error: error instanceof ConversationError ? error.message : 'Map analysis is unavailable.' });
    }
  };
  router.post('/save', handle(async (req, res) => {
    const saved = await service.save(req.user._id, req.body?.inputs || req.body);
    res.status(201).json({ message: 'Analysis saved successfully.', id: saved._id, createdAt: saved.createdAt });
  }));
  router.post('/analyze', handle(async (req, res) => res.json({ analysis: await service.preview(req.user._id, req.body?.inputs || req.body) })));
  router.get('/', handle(async (req, res) => res.json({ analyses: await service.list(req.user._id) })));
  router.get('/:id', handle(async (req, res) => res.json({ analysis: await service.getContext(req.user._id, req.params.id) })));
  return router;
}
