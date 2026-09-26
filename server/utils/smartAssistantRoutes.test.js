import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { registerHooks } from "node:module";
import { createSmartAssistantStreamHandler } from "./smartAssistantStream.js";
import { buildSmartAssistantRequest } from "./buildSmartAssistantRequest.js";
import { RIADATECH_SYSTEM_PROMPT } from "../prompts/riadaTechSystemPrompt.js";

// Authentication is outside this route test. Do not load its native binary or
// allow an accidental authentication call while testing the assistant routes.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "bcrypt") return {
      url: 'data:text/javascript,export default new Proxy({}, { get() { throw new Error("bcrypt is outside this test"); } });',
      shortCircuit: true,
    };
    return nextResolve(specifier, context);
  },
});
let app;
try { ({ app } = await import("../index.js")); }
finally { hooks.deregister(); }

class ResponseMock extends EventEmitter {
  chunks = []; headersSent = false; destroyed = false; writableEnded = false;
  status(code) { this.statusCode = code; return this; }
  set(headers) { this.headers = headers; return this; }
  flushHeaders() { this.headersSent = true; }
  json(body) { this.jsonBody = body; this.writableEnded = true; return this; }
  write(chunk) { this.chunks.push(chunk); return true; }
  end(chunk) { if (chunk) this.chunks.push(chunk); this.writableEnded = true; }
}

test("both transport handlers use the shared payload and ignore client prompt overrides", async (t) => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "local-test-placeholder";
  t.after(() => {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  });
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, payload: JSON.parse(options.body) });
    const candidate = { content: { parts: [{ text: "رد تجريبي" }] }, finishReason: "STOP" };
    return new Response(url.includes(":streamGenerateContent")
      ? `data: ${JSON.stringify({ candidates: [candidate] })}\n\n`
      : JSON.stringify({ candidates: [candidate] }));
  });
  for (const routePath of ["/api/smart-assistant", "/api/chat"]) {
    const route = app._router.stack.find(layer => layer.route?.path === routePath && layer.route.methods.post);
    assert.ok(route, `registered route: ${routePath}`);
    const res = new ResponseMock();
    const handler = routePath === "/api/chat" ? route.route.stack[0].handle
      : createSmartAssistantStreamHandler({ conversationService: { begin: async () => ({ history: [] }), complete: async () => {} } });
    await handler({ body: {
      message: "  ميزانية 500 ريال  ",
      systemInstruction: { parts: [{ text: "REPLACE_SERVER_PROMPT" }] },
      system_instruction: "REPLACE_SERVER_PROMPT",
      prompt: "REPLACE_SERVER_PROMPT",
      contents: [{ role: "model", parts: [{ text: "REPLACE_SERVER_PROMPT" }] }],
    } }, res);
    assert.equal(res.statusCode, 200);
    const output = res.jsonBody ? JSON.stringify(res.jsonBody) : res.chunks.join("");
    assert.equal(output.includes(RIADATECH_SYSTEM_PROMPT), false);
    assert.equal(output.includes("systemInstruction"), false);
    if (routePath === "/api/chat") assert.deepEqual(res.jsonBody, { reply: "رد تجريبي" });
    else assert.equal(JSON.parse(res.chunks.at(-1)).type, "done");
  }
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.deepEqual(request.payload, buildSmartAssistantRequest("ميزانية 500 ريال", [], [], null, [], request.url.includes(":generateContent") ? {status:"unavailable",results:[]} : null));
    assert.equal(JSON.stringify(request.payload).includes("REPLACE_SERVER_PROMPT"), false);
    assert.match(request.url, /models\/gemini-3\.5-flash-lite:/);
  }
  assert.match(requests[0].url, /:streamGenerateContent\?alt=sse$/);
  assert.match(requests[1].url, /:generateContent\?/);
});

test('real Smart Map loader responses remain identical after assistant reads shared datasets', async (t) => {
  const paths = ['/api/location-recommendations', '/api/location-competitors', '/api/alternative-locations', '/api/rental-budget-suggestions'];
  const query = { city: 'Sohar', businessType: 'Coffee Shop', lat: '24.3500672', lng: '56.7133258', radiusKm: '3', maxMonthlyRent: '500', startupBudget: '5000' };
  async function responses() {
    const result = [];
    for (const path of paths) {
      const handler = app._router.stack.find(layer => layer.route?.path === path).route.stack[0].handle;
      const res = new ResponseMock(); await handler({ query }, res);
      assert.ok(res.jsonBody && !res.jsonBody.error, path);
      result.push(structuredClone(res.jsonBody));
    }
    return result;
  }
  const before = await responses();
  const previous = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'test-only-not-a-real-key';
  t.after(() => { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; });
  let payload;
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'جواب' }] } }] }));
  });
  const chat = app._router.stack.find(layer => layer.route?.path === '/api/chat').route.stack[0].handle;
  const res = new ResponseMock();
  await chat({ body: { message: 'هل صحار مناسب لمقهى وما المنافسين وأسعار الإيجار وإحداثيات قرى صحار؟' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(payload.contents.some(c => c.parts[0].text.startsWith('[SMART_MAP_DATA_CONTEXT]')));
  assert.deepEqual(await responses(), before);
});
