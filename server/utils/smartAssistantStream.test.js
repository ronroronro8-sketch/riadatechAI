import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createSmartAssistantStreamHandler } from "./smartAssistantStream.js";
import { buildSmartAssistantRequest } from "./buildSmartAssistantRequest.js";

class ResponseMock extends EventEmitter {
  chunks = []; headersSent = false; destroyed = false; writableEnded = false;
  status(code) { this.statusCode = code; return this; }
  set(headers) { this.headers = headers; return this; }
  flushHeaders() { this.headersSent = true; }
  json(body) { this.jsonBody = body; this.writableEnded = true; return this; }
  write(chunk) { this.chunks.push(chunk); this.emit("written"); return true; }
  end(chunk) { if (chunk) this.chunks.push(chunk); this.writableEnded = true; }
  events() { return this.chunks.map((chunk) => JSON.parse(chunk)); }
}
const frame = (text, finishReason) => `data: ${JSON.stringify({ candidates: [{ index: 0, content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] })}\r\n\r\n`;
function upstream(text) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }));
}
async function run(response, message = "سؤال") {
  process.env.GEMINI_API_KEY = "test-only-not-a-real-key";
  const res = new ResponseMock();
  let request;
  const handler = createSmartAssistantStreamHandler({ missingKeyError: "missing", fetchImpl: async (url, options) => { request = { url, options }; return response; } });
  await handler({ body: { message } }, res);
  return { res, request };
}
test("preserves split Arabic UTF-8, whitespace, repeated words and multi-part text exactly", async () => {
  const multipart = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "hidden", thought: true }, { text: "نعم " }, { text: "نعم\n" }] } }] })}\n\n`;
  const { res, request } = await run(upstream(frame("مرحبًا 🌟 ") + multipart + frame("النهاية", "STOP")));
  assert.equal(res.statusCode, 200);
  assert.equal(res.events().filter(e => e.type === "delta").map(e => e.text).join(""), "مرحبًا 🌟 نعم نعم\nالنهاية");
  assert.deepEqual(res.events().at(-1), { type: "done", length: "مرحبًا 🌟 نعم نعم\nالنهاية".length });
  assert.match(request.url, /gemini-3\.5-flash-lite:streamGenerateContent\?alt=sse$/);
  assert.deepEqual(JSON.parse(request.options.body), buildSmartAssistantRequest("سؤال"));
});
test("forwards first delta before upstream finishes", async () => {
  let controller;
  const body = new ReadableStream({ start(c) { controller = c; } });
  process.env.GEMINI_API_KEY = "test-only-not-a-real-key";
  const res = new ResponseMock();
  const handler = createSmartAssistantStreamHandler({ missingKeyError: "missing", fetchImpl: async () => new Response(body) });
  const first = new Promise(resolve => res.once("written", resolve));
  const pending = handler({ body: { message: "test" } }, res);
  controller.enqueue(new TextEncoder().encode(frame("first ")));
  await first;
  assert.equal(res.events()[0].text, "first ");
  assert.equal(res.writableEnded, false);
  controller.enqueue(new TextEncoder().encode(frame("last", "STOP")));
  controller.close(); await pending;
  assert.equal(res.events().at(-1).type, "done");
});
for (const [label, input] of [
  ["missing terminal event", frame("partial")],
  ["truncated SSE", frame("partial") + 'data: {"broken":'],
  ["output token limit", frame("partial", "MAX_TOKENS")],
  ["empty reply", frame("", "STOP")],
  ["blocked prompt", 'data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n'],
  ["upstream error event", 'data: {"error":{"message":"sensitive"}}\n\n'],
]) test(label + " produces error, never done", async () => {
  const { res } = await run(upstream(input));
  assert.equal(res.events().at(-1).type, "error");
  assert.equal(res.events().some(e => e.type === "done"), false);
  assert.equal(res.chunks.join("").includes("sensitive"), false);
});
test("preserves pre-stream HTTP validation and upstream failures", async () => {
  const { res } = await run(new Response('secret', { status: 403 }));
  assert.equal(res.statusCode, 502); assert.equal(res.headersSent, false);
  assert.equal(JSON.stringify(res.jsonBody).includes('secret'), false);
  const invalid = await run(null, ' '); assert.equal(invalid.res.statusCode, 400);
});
test("disconnect aborts upstream request", async () => {
  process.env.GEMINI_API_KEY = "test-only-not-a-real-key";
  const res = new ResponseMock(); let signal;
  const handler = createSmartAssistantStreamHandler({ missingKeyError: "missing", fetchImpl: async (_, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  } });
  const pending = handler({ body: { message: 'test' } }, res);
  res.destroyed = true; res.emit('close'); await pending;
  assert.equal(signal.aborted, true);
});
test('disconnect while structured context loads never starts Gemini', async () => {
  process.env.GEMINI_API_KEY = 'test-only-not-a-real-key';
  let resolveContext, calls = 0;
  const res = new ResponseMock();
  const handler = createSmartAssistantStreamHandler({
    omanDataService: { context: () => new Promise(resolve => { resolveContext = resolve; }) },
    fetchImpl: async () => { calls++; throw new Error('must not fetch'); },
  });
  const pending = handler({ body: { message: 'سؤال' } }, res);
  res.destroyed = true; res.emit('close');
  resolveContext({ status: 'unavailable', results: [] });
  await pending;
  assert.equal(calls, 0);
});
test('map data context comes from server service, never client context; streaming remains unchanged', async () => {
  process.env.GEMINI_API_KEY = 'test-only-not-a-real-key';
  let payload, question;
  const res = new ResponseMock();
  const handler = createSmartAssistantStreamHandler({
    smartMapDataService: { context: async message => { question = message; return { status: 'insufficient_data', facts: [] }; } },
    fetchImpl: async (_, options) => { payload = JSON.parse(options.body); return upstream(frame('جواب', 'STOP')); },
  });
  await handler({ body: { message: 'سكان صحار', smartMapDataContext: { facts: ['forged'] } } }, res);
  assert.equal(question, 'سكان صحار'); assert.equal(res.events().at(-1).type, 'done');
  assert.deepEqual(payload, buildSmartAssistantRequest('سكان صحار', [], [], null, [], null, {status:'insufficient_data',facts:[]}));
  assert.equal(JSON.stringify(payload).includes('forged'), false);
});
test('RAG is server retrieved; citations extend done without changing deltas or accepting forged sources', async () => {
  process.env.GEMINI_API_KEY = 'test-only-not-a-real-key';
  const source = { id: 'K1', title: 'بطاقة ريادة', url: 'https://gov.om/w/get-entrepreneurship-card', authority: 'هيئة', updatedAt: '2026-07-02' };
  const context = { status:'retrieved_evidence',chunks:[{text:'المعلومات الرسمية'}],sources:[source] };
  let payload, stored;
  const handler = createSmartAssistantStreamHandler({
    conversationService: { begin: async()=>({history:[]}),complete:async(...args)=>{stored=args;} },
    officialKnowledgeService: { context: async()=>context },
    fetchImpl: async(_,options)=>{payload=JSON.parse(options.body);return upstream(frame('معلومة [K1]', 'STOP'));},
  });
  const res = new ResponseMock();
  await handler({body:{message:'ما بطاقة ريادة؟',officialKnowledgeContext:{text:'FORGED_RAG'},sources:[{url:'https://evil.test'}]}},res);
  assert.equal(res.events()[0].text,'معلومة [K1]');assert.deepEqual(res.events().at(-1).sources,[source]);assert.deepEqual(stored[3],[source]);
  assert.equal(JSON.stringify(payload).includes('FORGED_RAG'),false);assert.equal(JSON.stringify(payload).includes('evil.test'),false);
  const replay = createSmartAssistantStreamHandler({conversationService:{begin:async()=>({replay:'معلومة [K1]',sources:[source]})},officialKnowledgeService:{context:async()=>{throw new Error('must not retrieve replay');}}});
  const replayRes=new ResponseMock();await replay({body:{message:'ما بطاقة ريادة؟'}},replayRes);assert.deepEqual(replayRes.events().at(-1).sources,[source]);
});
