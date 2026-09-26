// Optional smoke check: real read-only data services, isolated study storage.
// Does not call Gemini, ingest sources or write to the configured application database.
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'node:dns';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';
import ConversationModel from '../Models/Conversation.js';
import MessageModel from '../Models/ConversationMessage.js';
import StudyModel from '../Models/FeasibilityStudy.js';
import { StructuredOmanRecord, StructuredOmanState } from '../Models/StructuredOmanData.js';
import { OfficialKnowledgeDocument, OfficialKnowledgeChunk, OfficialKnowledgeLock } from '../Models/OfficialKnowledge.js';
import { createOmanDataService } from '../services/omanData/service.js';
import { createOfficialKnowledgeService } from '../services/officialKnowledge/service.js';
import { createSmartMapDataService } from '../services/smartMapDataService.js';
import { rankLocations } from '../utils/locationScoring.js';
import { createConversationService } from '../services/conversationService.js';
import { createFeasibilityService } from '../services/feasibility/service.js';
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(',').map(v => v.trim()));
let mongo, db;
try {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000, autoIndex: false, autoCreate: false });
  mongo = await MongoMemoryServer.create(); db = await mongoose.createConnection(mongo.getUri()).asPromise();
  const Conversation = db.model('Conversation', ConversationModel.schema), Message = db.model('ConversationMessage', MessageModel.schema), Study = db.model('FeasibilityStudy', StudyModel.schema);
  const features = JSON.parse(await readFile(new URL('../data/processed/location_features.json', import.meta.url)));
  const smartMapDataService = createSmartMapDataService({ readFeatures: () => features,
    readPois: async () => JSON.parse(await readFile(new URL('../data/processed/osm_pois_sohar.json', import.meta.url))),
    loadRecommendations: async ({ businessType }) => ({ recommendations: rankLocations(features, businessType, features) }) });
  const service = createFeasibilityService({ Study, Conversation, Message, readLocations: () => features, smartMapDataService,
    omanDataService: createOmanDataService({ Record: StructuredOmanRecord, State: StructuredOmanState }),
    officialKnowledgeService: createOfficialKnowledgeService({ Document: OfficialKnowledgeDocument, Chunk: OfficialKnowledgeChunk, Lock: OfficialKnowledgeLock }) });
  const conversations = createConversationService({ Conversation, Message });
  const userId = new mongoose.Types.ObjectId(), conversationId = String((await Conversation.create({ userId, title: 'Isolated feasibility verification' }))._id);
  const rounds = [];
  for (const message of ['أريد دراسة جدوى لمقهى في صحار وميزانيتي 15000 ريال',
    'افترض متوسط الفاتورة 3.5 ريال، تكلفة الوحدة 1 ريال، التكاليف الثابتة الشهرية 1200 ريال، 80 عميل يوميًا، أيام العمل في الشهر 25، إجمالي التكاليف الشهرية 5000 ريال',
    'غير الميزانية إلى 20000 ريال']) {
    const turn = await conversations.begin(userId, conversationId, randomUUID(), message);
    const result = await service.prepare(turn);
    rounds.push({ message, study: result.context, tools: result.toolResults, structured: result.structuredContext, map: result.mapContext, knowledge: result.knowledgeContext });
    await conversations.complete(turn, 'Backend verification only; no Gemini answer generated.', 'STOP');
  }
  const output = { environment: 'Temporary MongoDB study; real existing source services read-only; no Gemini call; no application user data modified', rounds };
  await writeFile('/tmp/riadatech-feasibility-real-example.json', JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ studyId: rounds[0].study.id, sameStudy: rounds.every(r => r.study.id === rounds[0].study.id),
    evidence: rounds[0].study.evidence, structuredGroups: rounds[0].structured.results.length,
    mapMetrics: rounds[0].map.facts.map(f => f.metric), knowledgeSources: rounds[0].knowledge.sources.map(s => ({ title: s.title, url: s.url })),
    budgets: rounds.map(r => r.study.inputs.budget.value), recomputedOnBudgetEdit: rounds[2].study.recomputedTools,
    monthlyProfit: rounds[2].tools.find(t => t.tool === 'calculateMonthlyProfit')?.results?.profit,
    breakEven: rounds[2].tools.find(t => t.tool === 'calculateBreakEven')?.results?.breakEvenUnits }, null, 2));
} finally { await db?.close(); await mongo?.stop(); await mongoose.disconnect(); }
