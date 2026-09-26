import { citedStudySources } from '../services/feasibility/service.js';
import { citedKnowledgeSources } from '../services/officialKnowledge/service.js';
import { buildSmartAssistantRequest } from "./buildSmartAssistantRequest.js";
import { ConversationError } from "../services/conversationService.js";

// Gemini REST streaming uses SSE; HTTP chunks can split UTF-8 and SSE frames.
export async function* readGeminiEvents(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary;
    while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, "")).join("\n");
      if (data && data !== "[DONE]") yield JSON.parse(data);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) throw new Error("Incomplete Gemini event.");
}

export function createSmartAssistantStreamHandler({ missingKeyError, conversationService, omanDataService, smartMapDataService, officialKnowledgeService, feasibilityService, fetchImpl = (...args) => fetch(...args) }) {
  return async function smartAssistantStreamHandler(req, res) {
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "message is required." });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "PUT_YOUR_KEY_HERE") {
      return res.status(500).json({ error: missingKeyError });
    }
    const controller = new AbortController();
    let turn, answer = "", saved = false;
    // Bound generation below the five-minute conversation lease, without changing model settings.
    const deadline = conversationService ? setTimeout(() => controller.abort(), 180000) : null;
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", disconnect);
    const send = async (event) => {
      if (controller.signal.aborted || res.destroyed) throw new Error("Client disconnected.");
      if (!res.write(`${JSON.stringify(event)}\n`)) {
        await new Promise((resolve, reject) => {
          const cleanup = () => {
            res.off("drain", drained); res.off("close", closed);
            controller.signal.removeEventListener("abort", closed);
          };
          const drained = () => { cleanup(); resolve(); };
          const closed = () => { cleanup(); reject(new Error("Client disconnected.")); };
          res.once("drain", drained);
          res.once("close", closed);
          controller.signal.addEventListener("abort", closed, { once: true });
        });
      }
    };
    const startStream = () => {
      res.status(200).set({
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
    };
    try {
      if (conversationService) {
        turn = await conversationService.begin(req.user?._id, req.body?.conversationId, req.body?.requestId, message, req.body?.mapAnalysisId);
        if (turn.replay !== undefined) {
          startStream();
          await send({ type: "delta", text: turn.replay });
          await send({ type: "done", length: turn.replay.length, ...(turn.sources ? { sources: turn.sources } : {}) });
          res.end();
          return;
        }
      }
      const study = feasibilityService && turn ? await feasibilityService.prepare(turn) : null;
      const structuredOmanContext = study ? study.structuredContext : omanDataService ? await omanDataService.context(message) : null;
      const smartMapDataContext = study ? study.mapContext : smartMapDataService ? await smartMapDataService.context(message) : null;
      const officialKnowledgeContext = study ? study.knowledgeContext : officialKnowledgeService ? await officialKnowledgeService.context(message) : null;
      if (controller.signal.aborted) throw new Error('Client disconnected.');
      const upstream = await fetchImpl(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(buildSmartAssistantRequest(message, turn?.history, turn?.businessMemory, turn?.smartMapContext, study ? study.toolResults : turn?.toolResults, structuredOmanContext, smartMapDataContext, officialKnowledgeContext, study?.context)),
          signal: controller.signal,
        }
      );
      if (!upstream.ok || !upstream.body) throw new Error("Gemini request failed.");
      startStream();
      let length = 0;
      let hasText = false;
      let finishReason;
      for await (const event of readGeminiEvents(upstream.body)) {
        if (event.error || event.promptFeedback?.blockReason) throw new Error("Gemini generation failed.");
        const candidate = event.candidates?.find((item) => !item.index) || event.candidates?.[0];
        const text = (candidate?.content?.parts || [])
          .filter((part) => typeof part.text === "string" && !part.thought)
          .map((part) => part.text).join("");
        if (text) {
          answer += text;
          length += text.length;
          hasText ||= Boolean(text.trim());
          await send({ type: "delta", text });
        }
        if (candidate?.finishReason) finishReason = candidate.finishReason;
      }
      // A clean transport EOF alone does not mean the model finished successfully.
      if (controller.signal.aborted || finishReason !== "STOP" || !hasText) throw new Error("Incomplete Gemini response.");
      const sources = study ? [...citedKnowledgeSources(answer, officialKnowledgeContext), ...citedStudySources(answer, study.sources)]
        : officialKnowledgeContext ? citedKnowledgeSources(answer, officialKnowledgeContext) : undefined;
      if (turn) {
        await conversationService.complete(turn, answer, finishReason, sources);
        saved = true;
      }
      await send({ type: "done", length, ...(sources ? { sources } : {}) });
      res.end();
    } catch (error) {
      if (turn?.assistantId && !saved) {
        await conversationService.interrupt(turn, answer, Boolean(answer) || controller.signal.aborted).catch(() => {
          // If storage is down, the lease recovery marks this attempt interrupted on next access.
          console.error("Could not finalize assistant attempt.");
        });
      }
      if (!res.destroyed) {
        if (!res.headersSent) res.status(error instanceof ConversationError ? error.status : 502).json({
          error: error instanceof ConversationError ? error.message : "Smart Assistant request failed. Please try again later.",
        });
        else res.end(`${JSON.stringify({ type: "error", error: "STREAM_INTERRUPTED" })}\n`);
      }
    } finally {
      if (deadline) clearTimeout(deadline);
      controller.abort();
      res.off("close", disconnect);
    }
  };
}
