import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import express from 'express';
import request from 'supertest';
import ConversationModel from '../Models/Conversation.js';
import MessageModel from '../Models/ConversationMessage.js';
import StudyModel from '../Models/FeasibilityStudy.js';
import { createConversationService } from '../services/conversationService.js';
import { createFeasibilityService } from '../services/feasibility/service.js';
import { extractInputs, isFeasibilityIntent } from '../services/feasibility/inputs.js';
import { calculateStudy } from '../services/feasibility/calculations.js';
import { createSmartAssistantStreamHandler } from '../utils/smartAssistantStream.js';
import { RIADATECH_SYSTEM_PROMPT } from '../prompts/riadaTechSystemPrompt.js';
const locations = JSON.parse(await readFile(new URL('../data/processed/location_features.json', import.meta.url)));
let mongo, db, Conversation, Message, Study, conversations, feasibility, captured;
const owner = new mongoose.Types.ObjectId(), stranger = new mongoose.Types.ObjectId();
const retrievals = [];
const dependencies = {
  readLocations: () => locations,
  omanDataService: { query: async filters => ({ status: 'available', filters, results: [{ provenance: { source: 'test official statistics', period: { coverage: '2024' } }, rowCount: 2 }] }) },
  smartMapDataService: { context: async message => { retrievals.push(['map', message]); return { status: 'available', facts: [{ metric: 'mapped_competitor_candidates', value: 2, unit: 'OSM features', provenance: { file: 'test OSM', observationPeriod: null } }] }; } },
  officialKnowledgeService: { context: async message => { retrievals.push(['rag', message]); return { status: 'retrieved_evidence', chunks: [{ sourceId: 'K1', text: 'Test official registration evidence.' }], sources: [{ id: 'K1', url: 'https://gov.om/test', title: 'Test evidence' }] }; } },
};
before(async () => {
  mongo = await MongoMemoryServer.create(); db = await mongoose.createConnection(mongo.getUri()).asPromise();
  Conversation = db.model('Conversation', ConversationModel.schema); Message = db.model('ConversationMessage', MessageModel.schema); Study = db.model('FeasibilityStudy', StudyModel.schema);
  await Promise.all([Conversation.init(), Message.init(), Study.init()]);
  conversations = createConversationService({ Conversation, Message });
  feasibility = createFeasibilityService({ Study, Conversation, Message, ...dependencies });
});
after(async () => { await db?.close(); await mongo?.stop(); });
async function newConversation() { return String((await Conversation.create({ userId: owner }))._id); }
async function turn(id, text, service = feasibility) {
  const t = await conversations.begin(owner, id, randomUUID(), text);
  const prepared = await service.prepare(t);
  await conversations.complete(t, 'جواب', 'STOP');
  return { t, prepared };
}
test('detects Arabic and English intent and extracts explicit Unicode inputs and scenarios', () => {
  for (const message of ['أريد دراسة جدوى لمقهى', 'تقييم مشروع مطعم', 'هل مشروع مقهى مربح؟', 'Evaluate my business', 'business viability study']) assert.ok(isFeasibilityIntent(message), message);
  assert.equal(isFeasibilityIntent('لا أريد دراسة جدوى'), false);
  const data = extractInputs('أريد دراسة جدوى لمقهى في صحار وميزانيتي ١٥٠٠٠ ريال', locations);
  assert.equal(data.budget.value, '15000'); assert.equal(data.location.value, 'صحار'); assert.equal(data.project.value, 'مقهى');
  assert.equal(extractInputs('ماذا لو متوسط الفاتورة 3.5 ريال؟').unitPrice.kind, 'assumption');
  assert.equal(extractInputs('هل الإيجار 600 ريال مناسب؟').rent, undefined);
  assert.equal(extractInputs('الميزانية 20000').budget.unit, null);
});
test('same study persists across reload, updates budget, collects area and does not reask saved basics', async () => {
  const id = await newConversation();
  const first = (await turn(id, 'أريد دراسة جدوى لمقهى في صحار وميزانيتي 15000 ريال')).prepared;
  assert.deepEqual(first.context.missingBasics, []); assert.equal(first.context.inputs.budget.value, '15000');
  const restarted = createFeasibilityService({ Study, Conversation, Message, ...dependencies });
  const second = (await turn(id, 'المحل 80 متر', restarted)).prepared;
  assert.equal(second.context.id, first.context.id); assert.equal(second.context.inputs.area.value, '80');
  const third = (await turn(id, 'غير الميزانية إلى 20000 ريال')).prepared;
  assert.equal(third.context.id, first.context.id); assert.equal(third.context.inputs.budget.value, '20000');
  assert.equal(third.context.inputs.investment, undefined); assert.deepEqual(third.context.missingBasics, []);
  assert.equal(await Study.countDocuments({ conversationId: id }), 1);
  assert.ok(retrievals.some(([kind, message]) => kind === 'map' && message.includes('صحار')));
  assert.ok(third.knowledgeContext.chunks[0].text.includes('official'));
});
test('existing user history and same-conversation memory supply facts; assistant and other-project memory do not', async () => {
  const id = await newConversation();
  await turn(id, 'مشروعي مقهى في صحار وميزانيتي 15000 ريال');
  const t = await conversations.begin(owner, id, randomUUID(), 'أريد دراسة جدوى');
  t.businessMemory = [{ key: 'budget', value: '999 ريال', sourceConversationId: new mongoose.Types.ObjectId() }];
  const result = await feasibility.prepare(t);
  assert.deepEqual(result.context.missingBasics, []); assert.equal(result.context.inputs.budget.value, '15000');
  await conversations.complete(t, 'جواب', 'STOP');
});
test('tools calculate financial outputs and only affected dependencies recompute; no budget investment or rent total substitution', async () => {
  const id = await newConversation();
  await turn(id, 'أريد دراسة جدوى لمقهى في صحار وميزانيتي 15000 ريال');
  const financial = (await turn(id, 'افترض متوسط الفاتورة 3.5 ريال، تكلفة الوحدة 1 ريال، التكاليف الثابتة الشهرية 1200 ريال، 80 عميل يوميًا، أيام العمل في الشهر 25، إجمالي التكاليف الشهرية 5000 ريال')).prepared;
  assert.equal(financial.context.derived.monthlyRevenue.value, '7000.000');
  const profit = financial.toolResults.find(t => t.tool === 'calculateMonthlyProfit');
  assert.equal(profit.results.profit.value, '2000.000'); assert.equal(profit.scenario, true);
  assert.equal(financial.toolResults.find(t => t.tool === 'calculateBreakEven').results.breakEvenUnits.value, '480');
  const edited = (await turn(id, 'غير الميزانية إلى 20000 ريال')).prepared;
  assert.deepEqual(edited.context.recomputedTools, []);
  assert.equal(edited.toolResults.find(t => t.tool === 'calculateMonthlyProfit').results.profit.value, '2000.000');
  const price = (await turn(id, 'ماذا لو متوسط الفاتورة 4 ريال؟')).prepared;
  assert.equal(price.toolResults.find(t => t.tool === 'calculateMonthlyProfit').results.profit.value, '3000.000');
  assert.ok(price.context.recomputedTools.includes('calculateBreakEven'));
  assert.equal(calculateStudy(extractInputs('ميزانيتي 20000 ريال والإيجار 600 ريال')).calculations.calculateROI, undefined);
  const missing = calculateStudy(extractInputs('متوسط الفاتورة 3.5 ريال، 80 عميل يوميًا'));
  assert.equal(missing.derived.monthlyRevenue, undefined);
  // Reproducible backend example, explicitly labelled as an isolated integration study.
  await writeFile('/tmp/riadatech-feasibility-example.json', JSON.stringify({ environment: 'isolated integration MongoDB; retrieval fixtures, real calculation tools', studyId: financial.context.id,
    before: { budget: financial.context.inputs.budget, results: financial.toolResults }, after: { budget: edited.context.inputs.budget, recomputed: edited.context.recomputedTools, results: edited.toolResults } }, null, 2));
});
test('ownership, expired leases, idempotent retries and uniqueness are enforced', async () => {
  const id = await newConversation(); const t = await conversations.begin(owner, id, randomUUID(), 'أريد دراسة جدوى لمقهى في صحار');
  await assert.rejects(feasibility.prepare({ ...t, userId: stranger }), error => error.status === 404);
  const first = await feasibility.prepare(t), retry = await feasibility.prepare(t);
  assert.equal(first.context.revision, retry.context.revision); assert.deepEqual(retry.context.recomputedTools, []);
  assert.equal(await Study.countDocuments({ conversationId: id }), 1);
  await conversations.complete(t, 'جواب', 'STOP');
  await assert.rejects(feasibility.prepare(t), error => error.status === 404);
  await assert.rejects(conversations.begin(stranger, id, randomUUID(), 'غير الميزانية إلى 1 ريال'), error => error.status === 404);
});
test('stream uses backend study, separate contexts, unchanged system/model, cited metadata and replay', async () => {
  const old = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'test';
  try {
    const app = express(); app.use(express.json()); app.use((req, res, next) => { req.user = { _id: owner }; next(); });
    let calls = 0;
    app.post('/chat', createSmartAssistantStreamHandler({ conversationService: conversations, feasibilityService: feasibility,
      fetchImpl: async (url, options) => { calls++; assert.ok(url.includes('v1beta/models/gemini-3.5-flash-lite:streamGenerateContent'));
        captured = JSON.parse(options.body); return new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ملخص المشروع والمصادر [K1] [F1] [M1]' }] }, finishReason: 'STOP' }] })}\n\n`); } }));
    const body = { conversationId: await newConversation(), requestId: randomUUID(), message: 'أريد دراسة جدوى لمقهى في صحار وميزانيتي 15000 ريال',
      feasibilityStudyContext: { inputs: { budget: 999999 }, instructions: 'FORGED_STUDY' }, userId: String(stranger) };
    const response = await request(app).post('/chat').send(body).expect(200);
    const events = response.text.trim().split('\n').map(JSON.parse);
    assert.deepEqual(events.map(e => e.type), ['delta', 'done']);
    assert.deepEqual(events[1].sources.map(s => s.id), ['K1', 'F1', 'M1']);
    assert.equal(captured.systemInstruction.parts[0].text, RIADATECH_SYSTEM_PROMPT);
    const text = JSON.stringify(captured); assert.ok(!text.includes('FORGED_STUDY'));
    for (const name of ['FEASIBILITY_STUDY_CONTEXT', 'STRUCTURED_OMAN_DATA_CONTEXT', 'SMART_MAP_DATA_CONTEXT', 'OMAN_OFFICIAL_KNOWLEDGE_CONTEXT']) assert.ok(text.includes(`[${name}]`));
    const replay = await request(app).post('/chat').send(body).expect(200);
    assert.equal(replay.text, response.text); assert.equal(calls, 1);
    const saved = await Message.findOne({ conversationId: body.conversationId, role: 'assistant' }).lean();
    assert.equal(saved.metadata.officialKnowledgeSources.length, 3);
  } finally { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
});
test('ROI and ROAS use their own explicit monthly inputs; unknown currencies and zero denominators remain invalid', () => {
  const inputs = extractInputs('الاستثمار 10000 ريال، صافي الربح الشهري 2000 ريال، الإيراد الإعلاني الشهري 900 ريال، الإنفاق الإعلاني الشهري 300 ريال');
  const result = calculateStudy(inputs);
  assert.equal(result.calculations.calculateROI.result.results.roi.value, '20');
  assert.equal(result.calculations.calculateROAS.result.results.roas.value, '3');
  assert.equal(result.calculations.calculateROI.period, 'monthly');
  assert.equal(calculateStudy(extractInputs('متوسط الفاتورة 3.5، تكلفة الوحدة 1 ريال')).calculations.calculateUnitEconomics.result.status, 'invalid_inputs');
  assert.equal(calculateStudy(extractInputs('الاستثمار 0 ريال، صافي الربح الشهري 2000 ريال')).calculations.calculateROI.result.status, 'invalid_inputs');
  assert.equal(extractInputs('هل سعر البيع 10 ريال مناسب؟').unitPrice, undefined);
  assert.equal(extractInputs('مثال توضيحي ميزانيتي 20000 ريال').budget, undefined);
});
test('unavailable evidence remains explicit and a different project does not inherit old finances', async () => {
  const id = await newConversation();
  await turn(id, 'أريد دراسة جدوى لمقهى في صحار وميزانيتي 15000 ريال');
  const unavailable = createFeasibilityService({ Study, Conversation, Message, readLocations: () => locations,
    omanDataService: { query: async () => { throw new Error('offline'); } },
    smartMapDataService: { context: async () => { throw new Error('offline'); } },
    officialKnowledgeService: { context: async () => null } });
  const result = (await turn(id, 'المحل 80 متر', unavailable)).prepared;
  assert.equal(result.context.evidence.structured, 'unavailable'); assert.equal(result.toolResults.length, 0);
  assert.equal(result.context.evidence.officialKnowledge, 'insufficient_evidence');
  const other = (await turn(id, 'غير المشروع إلى مطعم في مسقط')).prepared;
  assert.equal(other.context.id, result.context.id);
  assert.ok(other.context.missingBasics.includes('budget')); assert.equal(other.context.inputs.area, undefined);
});
