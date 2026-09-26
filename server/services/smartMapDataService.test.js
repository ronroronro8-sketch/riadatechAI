import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { createSmartMapDataService } from './smartMapDataService.js';
import { rankLocations } from '../utils/locationScoring.js';
import rentalSeedData from '../data/rentalSeedData.js';
import { buildSmartAssistantRequest } from '../utils/buildSmartAssistantRequest.js';
import { RIADATECH_SYSTEM_PROMPT } from '../prompts/riadaTechSystemPrompt.js';
const data = new URL('../data/', import.meta.url);
const json = async file => JSON.parse(await readFile(new URL(file, data), 'utf8'));
let service, features, pois, sourceHashes;
async function hashes() {
  const output = {};
  for (const folder of ['raw', 'processed']) for (const file of await readdir(new URL(`${folder}/`, data))) {
    output[`${folder}/${file}`] = createHash('sha256').update(await readFile(new URL(`${folder}/${file}`, data))).digest('hex');
  }
  return output;
}
before(async () => {
  sourceHashes = await hashes(); features = await json('processed/location_features.json'); pois = await json('processed/osm_pois_sohar.json');
  service = createSmartMapDataService({ readFeatures: async () => features, readPois: async () => pois,
    readLocations: async () => parse(await readFile(new URL('raw/oman_locations.csv', data)), { columns: true, bom: true }),
    loadRecommendations: async ({city, businessType}) => ({ recommendations: rankLocations(features, businessType, features).filter(r => r.wilayat === city) }),
    rentalExamples: rentalSeedData,
  });
});
after(async () => { assert.deepEqual(await hashes(), sourceHashes, 'all raw/processed files must remain byte-identical'); });
test('population has original year/source/unit and flags inconsistent source; no wilayat substitution', async () => {
  const r = await service.context('ما عدد السكان في محافظة مسقط عام 2025؟');
  assert.equal(r.facts[0].value, 1532486); assert.equal(r.facts[0].unit, 'persons');
  assert.equal(r.facts[0].provenance.observationPeriod, '2025'); assert.equal(r.facts[0].provenance.publisher, null);
  assert.match(r.facts[0].quality, /source_inconsistency/);
  assert.equal((await service.context('عدد السكان في صحار')).status, 'insufficient_data');
  assert.equal((await service.context('عدد السكان في محافظة مسقط عام 2026')).facts.length, 0);
  assert.equal((await service.context('عدد السكان في دبي')).status, 'needs_location');
});
test('labour lookup separates region, gender, metric and years without changing numeric precision', async () => {
  const r = await service.context('معدل البطالة في محافظة مسقط 2024');
  assert.equal(r.facts[0].value, 1.50413225029108); assert.equal(r.facts[0].provenance.observationPeriod, '2024');
  const female = await service.context('female unemployment in Oman 2025');
  assert.equal(female.facts[0].value, 7.72409541884356);
  assert.equal((await service.context('عدد العاملين في محافظة مسقط 2025')).facts.length, 0);
});
test('OSM competition is bounded, scoped to Sohar and not treated as an official census', async () => {
  const r = await service.context('كم عدد المنافسين لمقهى في صحار؟');
  assert.equal(r.status, 'available'); assert.equal(r.facts[0].provenance.publisher, 'OpenStreetMap / Overpass API');
  assert.equal(r.facts[0].provenance.observationPeriod, null); assert.ok(r.facts[0].examples.length <= 3);
  assert.equal(r.facts[0].value, pois.filter(p => p.category === 'cafe').length);
  assert.equal((await service.context('منافسة المطاعم في صحار')).facts[0].category, 'Restaurant');
  assert.equal((await service.context('منافسين لمقهى في صلالة')).facts.length, 0);
  assert.equal((await service.context('منافسين لمقهى في صحار 2025')).facts.length, 0);
  assert.equal((await service.context('منافسين لمقهى في صحار على بعد 2 كم')).facts.length, 0);
});
test('shared score preserves map behavior but withholds duplicated official counts and placeholder zeros', async () => {
  const original = JSON.stringify(features);
  const r = await service.context('هل موقع صحار مناسب لمقهى؟');
  const expected = rankLocations(features, 'Coffee Shop', features).find(r => r.wilayat === 'Sohar');
  assert.equal(r.facts[0].value, expected.score); assert.match(r.facts[0].quality, /estimate/);
  assert.equal(JSON.stringify(features), original);
  assert.equal(JSON.stringify(r).includes('startup_count'), false);
  assert.equal(JSON.stringify(r).includes('cafe_competitors'), false);
  assert.match(r.sourcePolicy, /Do not add/);
});
test('rental fixtures and geographic examples stay bounded, labeled and separate from official statistics', async () => {
  const rentals = await service.context('ما أسعار الإيجار في صحار؟');
  assert.equal(rentals.facts[0].provenance.file, 'data/rentalSeedData.js');
  assert.match(rentals.facts[0].quality, /synthetic/); assert.ok(rentals.facts[0].examples.length <= 3);
  const geography = await service.context('إحداثيات قرى صحار');
  assert.ok(geography.facts[0].examples.length <= 4); assert.match(geography.facts[0].quality, /not precise/);
  assert.ok(JSON.stringify(geography).length < 11000);
});
test('context isolation, irrelevant questions, ambiguity and unavailable storage', async () => {
  assert.equal(await service.context('احسب هامش الربح'), null);
  assert.equal((await service.context('عدد السكان في مسقط وصلالة')).status, 'ambiguous_locations');
  const r = await service.context('عدد السكان في مسقط 2025');
  const body = buildSmartAssistantRequest('السؤال', [{ role: 'user', text: 'تاريخ' }], [], null, [], {status:'available'}, r);
  assert.equal(body.systemInstruction.parts[0].text, RIADATECH_SYSTEM_PROMPT);
  assert.equal(body.contents.filter(c => c.parts[0].text.startsWith('[SMART_MAP_DATA_CONTEXT]')).length, 1);
  assert.equal(body.contents.filter(c => c.parts[0].text.startsWith('[STRUCTURED_OMAN_DATA_CONTEXT]')).length, 1);
  assert.equal(body.contents.at(-1).parts[0].text, 'السؤال');
  const down = createSmartMapDataService({ readFeatures: async () => { throw new Error('private path'); } });
  assert.deepEqual(await down.context('عدد السكان في مسقط'), { status: 'unavailable', facts: [] });
});
