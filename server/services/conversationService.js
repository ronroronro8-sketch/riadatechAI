import { resolveCalculationTools } from "../tools/resolveCalculations.js";
import { randomUUID } from "node:crypto";

export class ConversationError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const pageSize = (value, fallback) => {
  const count = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(count) || count < 1) throw new ConversationError(400, "Invalid page size.");
  return Math.min(count, 100);
};
const validId = id => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
const publicConversation = c => ({
  _id: c._id, title: c.title, businessId: c.businessId, status: c.status,
  createdAt: c.createdAt, updatedAt: c.updatedAt, lastMessageAt: c.lastMessageAt,
  archivedAt: c.archivedAt, deletedAt: c.deletedAt,
});
const publicMessage = m => ({
  _id: m._id, sequence: m.sequence, role: m.role, text: m.text, requestId: m.requestId,
  ...(m.metadata?.officialKnowledgeSources ? { sources: m.metadata.officialKnowledgeSources } : {}),
  status: m.status, createdAt: m.createdAt, updatedAt: m.updatedAt, completedAt: m.completedAt,
});

export function createConversationService({ Conversation, Message, businessMemoryService, smartMapService, leaseMs = 300000 }) {
  async function owned(userId, conversationId) {
    if (!userId) throw new ConversationError(401, "Authentication required.");
    if (!validId(conversationId)) throw new ConversationError(404, "Conversation not found.");
    const c = await Conversation.findOne({ _id: conversationId, userId, status: { $ne: "deleted" } }).lean();
    if (!c) throw new ConversationError(404, "Conversation not found.");
    return c;
  }
  async function recoverExpired(c) {
    if (!c.activeTurn || c.activeTurn.expiresAt > new Date()) return;
    // Mark the abandoned attempt first, then release its lease. Token filters
    // prevent a stale writer from changing a newer retry of the same message.
    await Message.updateMany({ conversationId: c._id, attemptToken: c.activeTurn.token,
      role: "assistant", status: { $in: ["pending", "streaming"] } },
    { $set: { status: "interrupted", errorCode: "LEASE_EXPIRED" } });
    await Conversation.updateOne({ _id: c._id, "activeTurn.token": c.activeTurn.token,
      "activeTurn.expiresAt": { $lte: new Date() } }, { $set: { activeTurn: null } });
  }
  async function history(conversationId, beforeSequence) {
    // Only complete user/assistant pairs, not merely the last sixteen rows.
    const replies = await Message.find({ conversationId, role: "assistant", status: "completed",
      sequence: { $lt: beforeSequence } }).sort({ sequence: -1 }).limit(8).lean();
    const users = await Message.find({ conversationId, role: "user", status: "completed",
      requestId: { $in: replies.map(m => m.requestId) } }).lean();
    const byRequest = new Map(users.map(m => [m.requestId, m]));
    return replies.reverse().flatMap(reply => {
      const user = byRequest.get(reply.requestId);
      return user && user.sequence < reply.sequence ? [user, reply] : [];
    }).map(({ role, text }) => ({ role, text }));
  }
  async function release(turn) {
    await Conversation.updateOne({ _id: turn.conversationId, userId: turn.userId,
      "activeTurn.token": turn.token }, { $set: { activeTurn: null } });
  }
  return {
    async create(userId, title) {
      if (!userId) throw new ConversationError(401, "Authentication required.");
      if (title !== undefined && (typeof title !== "string" || !title.trim() || title.trim().length > 160)) {
        throw new ConversationError(400, "Invalid conversation title.");
      }
      return publicConversation(await Conversation.create({ userId, ...(title ? { title: title.trim() } : {}) }));
    },
    async list(userId, { status = "active", cursor, limit = 30 } = {}) {
      if (!["active", "archived"].includes(status)) throw new ConversationError(400, "Invalid status.");
      const query = { userId, status };
      if (cursor) {
        try {
          const { date, id } = JSON.parse(Buffer.from(cursor, "base64url").toString());
          if (!validId(id) || !Number.isFinite(Date.parse(date))) throw new Error();
          query.$or = [{ lastMessageAt: { $lt: new Date(date) } }, { lastMessageAt: new Date(date), _id: { $lt: id } }];
        } catch { throw new ConversationError(400, "Invalid cursor."); }
      }
      const count = pageSize(limit, 30);
      const rows = await Conversation.find(query).sort({ lastMessageAt: -1, _id: -1 }).limit(count + 1).lean();
      const page = rows.slice(0, count), last = page.at(-1);
      return { conversations: page.map(publicConversation), nextCursor: rows.length > count
        ? Buffer.from(JSON.stringify({ date: last.lastMessageAt, id: last._id })).toString("base64url") : null };
    },
    async get(userId, conversationId, { after = 0, limit = 100 } = {}) {
      const c = await owned(userId, conversationId);
      await recoverExpired(c);
      const sequence = Number(after);
      if (!Number.isSafeInteger(sequence) || sequence < 0) throw new ConversationError(400, "Invalid message cursor.");
      const count = pageSize(limit, 100);
      const rows = await Message.find({ conversationId, sequence: { $gt: sequence } }).sort({ sequence: 1 }).limit(count + 1).lean();
      const page = rows.slice(0, count);
      return { conversation: publicConversation(c), messages: page.map(publicMessage),
        nextAfter: rows.length > count ? page.at(-1).sequence : null };
    },
    async update(userId, conversationId, changes) {
      const c = await owned(userId, conversationId);
      await recoverExpired(c);
      const set = {};
      if (changes.title !== undefined) {
        if (typeof changes.title !== "string" || !changes.title.trim() || changes.title.trim().length > 160) {
          throw new ConversationError(400, "Invalid conversation title.");
        }
        set.title = changes.title.trim();
      }
      if (changes.status !== undefined) {
        if (!["active", "archived", "deleted"].includes(changes.status)) throw new ConversationError(400, "Invalid status.");
        set.status = changes.status;
        set.archivedAt = changes.status === "archived" ? new Date() : null;
        if (changes.status === "deleted") set.deletedAt = new Date();
      }
      const result = await Conversation.findOneAndUpdate({ _id: conversationId, userId, status: { $ne: "deleted" },
        activeTurn: null }, { $set: set }, { new: true }).lean();
      if (!result) throw new ConversationError(409, "A response is still in progress. Try again shortly.");
      return publicConversation(result);
    },
    async begin(userId, conversationId, requestId, message, mapAnalysisId) {
      if (typeof requestId !== "string" || !/^[\w-]{8,128}$/.test(requestId)) throw new ConversationError(400, "A valid requestId is required.");
      if (typeof message !== "string" || !message.trim() || message.length > 20000) throw new ConversationError(400, "Invalid message.");
      const c = await owned(userId, conversationId);
      if (c.status !== "active") throw new ConversationError(409, "Conversation is archived.");
      const smartMapContext = smartMapService ? await smartMapService.getContext(userId, mapAnalysisId) : null;
      await recoverExpired(c);
      const token = randomUUID();
      const locked = await Conversation.findOneAndUpdate({ _id: conversationId, userId, status: "active", activeTurn: null },
        { $set: { activeTurn: { requestId, token, expiresAt: new Date(Date.now() + leaseMs) } } }, { new: true }).lean();
      if (!locked) throw new ConversationError(409, "A response is still in progress. Try again shortly.");
      const turn = { conversationId, userId, token, requestId };
      try {
        let user = await Message.findOne({ conversationId, requestId, role: "user" }).lean();
        let assistant = await Message.findOne({ conversationId, requestId, role: "assistant" }).lean();
        if (user && user.text !== message) throw new ConversationError(409, "requestId already belongs to another message.");
        if (assistant?.status === "completed") {
          await release(turn);
          return { ...turn, replay: assistant.text, ...(assistant.metadata?.officialKnowledgeSources ? { sources: assistant.metadata.officialKnowledgeSources } : {}) };
        }
        if (user && locked.nextSequence > user.sequence + 1) {
          throw new ConversationError(409, "Cannot retry an older unfinished turn after newer messages.");
        }
        if (!user) {
          const reserved = await Conversation.findOneAndUpdate({ _id: conversationId, "activeTurn.token": token },
            { $inc: { nextSequence: 2 } }, { new: true }).lean();
          user = await Message.create({ conversationId, sequence: reserved.nextSequence - 1, role: "user", text: message,
            requestId, status: "completed", completedAt: new Date() });
        }
        assistant = await Message.findOneAndUpdate({ conversationId, requestId, role: "assistant" }, { $set: {
          text: "", status: "streaming", attemptToken: token, errorCode: null, completedAt: null,
          contextRefs: smartMapContext ? [{ type: "smart_map", analysisId: smartMapContext.analysisId, generatedAt: smartMapContext.provenance?.generatedAt }] : [],
        }, $setOnInsert: { sequence: user.sequence + 1, replyToMessageId: user._id } },
        { upsert: true, new: true, runValidators: true }).lean();
        await Conversation.updateOne({ _id: conversationId, "activeTurn.token": token }, { $set: { lastMessageAt: new Date() } });
        let businessMemory = [];
        if (businessMemoryService) {
          await businessMemoryService.rememberMessage(userId, conversationId, user._id);
          businessMemory = await businessMemoryService.getForUser(userId);
        }
        const previousAssistant = await Message.findOne({ conversationId, role: "assistant", status: "completed", sequence: { $lt: user.sequence } })
          .sort({ sequence: -1 }).select("metadata.calculationTools").lean();
        const toolResults = resolveCalculationTools(message, previousAssistant?.metadata?.calculationTools || []);
        await Message.updateOne({ _id: assistant._id, attemptToken: token }, { $set: { "metadata.calculationTools": toolResults } });
        return { ...turn, assistantId: assistant._id, toolResults, history: await history(conversationId, user.sequence), businessMemory, smartMapContext };
      } catch (error) {
        await Message.updateOne({ conversationId, requestId, attemptToken: token, status: "streaming" },
          { $set: { status: "failed", errorCode: "PREPARATION_FAILED" } }).catch(() => {});
        await release(turn).catch(() => {});
        throw error;
      }
    },
    async complete(turn, text, finishReason, officialKnowledgeSources) {
      const active = await Conversation.exists({ _id: turn.conversationId, userId: turn.userId, status: "active",
        "activeTurn.token": turn.token, "activeTurn.expiresAt": { $gt: new Date() } });
      if (!active) throw new ConversationError(409, "Response lease expired.");
      const saved = await Message.updateOne({ _id: turn.assistantId, attemptToken: turn.token, status: "streaming" },
        { $set: { text, status: "completed", completedAt: new Date(), errorCode: null,
          generation: { model: "gemini-3.5-flash-lite", finishReason },
          ...(officialKnowledgeSources ? { "metadata.officialKnowledgeSources": officialKnowledgeSources } : {}) } });
      if (saved.modifiedCount !== 1) throw new Error("Response could not be saved.");
      await Conversation.updateOne({ _id: turn.conversationId, userId: turn.userId, "activeTurn.token": turn.token },
        { $set: { lastMessageAt: new Date(), activeTurn: null } });
    },
    async interrupt(turn, text, interrupted) {
      // Never downgrade a completed response if the client missed the final done event.
      await Message.updateOne({ _id: turn.assistantId, attemptToken: turn.token, status: { $in: ["pending", "streaming"] } },
        { $set: { text, status: interrupted ? "interrupted" : "failed", errorCode: interrupted ? "STREAM_INTERRUPTED" : "GENERATION_FAILED" } });
      await release(turn);
    },
  };
}
