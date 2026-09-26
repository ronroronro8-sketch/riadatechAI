import { Router } from "express";
import { ConversationError } from "../services/conversationService.js";

export function createConversationRouter(service) {
  const router = Router();
  const handle = action => async (req, res) => {
    try { await action(req, res); }
    catch (error) {
      res.status(error instanceof ConversationError ? error.status : 503).json({
        error: error instanceof ConversationError ? error.message : "Conversation storage is unavailable.",
      });
    }
  };
  router.post("/", handle(async (req, res) => res.status(201).json({ conversation: await service.create(req.user._id, req.body?.title) })));
  router.get("/", handle(async (req, res) => res.json(await service.list(req.user._id, req.query))));
  router.get("/:id", handle(async (req, res) => res.json(await service.get(req.user._id, req.params.id, req.query))));
  router.patch("/:id", handle(async (req, res) => res.json({ conversation: await service.update(req.user._id, req.params.id, {
    title: req.body?.title, status: req.body?.status,
  }) })));
  router.post("/:id/archive", handle(async (req, res) => res.json({ conversation: await service.update(req.user._id, req.params.id, { status: "archived" }) })));
  router.delete("/:id", handle(async (req, res) => {
    await service.update(req.user._id, req.params.id, { status: "deleted" });
    res.status(204).end();
  }));
  return router;
}
