import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { analyzeDuqm, loadDuqmData, withinBoundary, candidates } from '../services/duqmAnalysis.js';
import { app } from '../index.js';
import { createSmartMapService } from '../services/smartMapService.js';

const categories = ['Coffee Shop', 'Restaurant', 'Supermarket', 'Logistics Services', 'Car Maintenance'];
for (const mode of ['auto', 'demo']) for (const businessType of categories) {
  test(`${mode}: ${businessType} returns three bounded, scored, distinct locations`, async () => {
    const query = {city:'Duqm',businessType,mode,maxMonthlyRent:700,lat:19.6230411,lng:57.6340004};
    const response = await request(app).get('/api/city-analysis').query(query).expect(200);
    const result = response.body;
    assert.equal(result.recommendations.length, 3);
    assert.equal(new Set(result.recommendations.map(r=>r.id)).size,3);
    for (const r of result.recommendations) {
      assert.ok(withinBoundary(r.latitude,r.longitude,result.boundary));
      assert.ok(r.score >= 0 && r.score <= 100);
      assert.equal(r.data_kind,'ESTIMATED');
      assert.equal(r.budget_source,'DEMO');
    }
    assert.ok(result.records.every(p=>['REAL','DEMO'].includes(p.data_kind)));
    assert.ok(result.competitors.every(p=>p.distanceKm<=3));
    if(mode==='demo') { assert.equal(result.data_mode,'DEMO'); assert.ok(result.competitor_count>0); }
    assert.deepEqual(result.recommendations,(await analyzeDuqm(query)).recommendations);
  });
}
test('cache failure/empty records yields explicitly labeled deterministic demo', async()=>{
  const data=await loadDuqmData();
  const result=await analyzeDuqm({businessType:'Coffee Shop'},{...data,records:[],retrievedAt:null});
  assert.equal(result.data_mode,'DEMO');
  assert.equal(result.recommendations.length,3);
  assert.ok(result.records.every(r=>r.name.startsWith('DEMO')));
});
test('category, rent budget and audience alter results; no unsupported population numbers',async()=>{
  const coffee=await analyzeDuqm({businessType:'Coffee Shop',mode:'demo',maxMonthlyRent:100});
  const restaurant=await analyzeDuqm({businessType:'Restaurant',mode:'demo',maxMonthlyRent:900});
  const audience=await analyzeDuqm({businessType:'Coffee Shop',mode:'demo',targetAudience:'Tourists',maxMonthlyRent:100});
  assert.notDeepEqual(coffee.recommendations,restaurant.recommendations);
  assert.notDeepEqual(coffee.recommendations.map(r=>r.score),audience.recommendations.map(r=>r.score));
  assert.ok(coffee.recommendations.every(r=>r.population===undefined));
});
test('invalid inputs and coordinates outside Duqm are rejected',async()=>{
  await request(app).get('/api/city-analysis').query({city:'Duqm',lat:24.3476,lng:56.7093}).expect(400);
  await request(app).get('/api/city-analysis').query({city:'Duqm',maxMonthlyRent:'NaN'}).expect(400);
  await request(app).get('/api/city-analysis').query({city:'Duqm',radiusKm:-2}).expect(400);
});
test('all candidate anchors lie inside the downloaded OSM Duqm boundary',async()=>{
  const {boundary}=await loadDuqmData();
  assert.ok(candidates.every(c=>withinBoundary(c.latitude,c.longitude,boundary)));
});
test('legacy Duqm loaders and Sohar endpoints still respond',async()=>{
  for(const city of ['Duqm','Sohar']){
    const rec=await request(app).get('/api/location-recommendations').query({city,businessType:'Coffee Shop'}).expect(200);
    assert.ok(rec.body.recommendations.length);
    const first=rec.body.recommendations[0];
    const cmp=await request(app).get('/api/location-competitors').query({city,businessType:'Coffee Shop',lat:first.latitude,lng:first.longitude,radiusKm:3}).expect(200);
    assert.ok(Array.isArray(cmp.body.competitors));
    const alt=await request(app).get('/api/alternative-locations').query({city,businessType:'Coffee Shop'}).expect(200);
    assert.ok(Array.isArray(alt.body.alternatives));
  }
});
test('saved analysis preserves Duqm inputs and simulation provenance',async()=>{
  const service=createSmartMapService({MapAnalysis:{create:async row=>row},
    loadRecommendations:analyzeDuqm,
    loadCompetitors:async query=>{const r=await analyzeDuqm(query);return {...r,count:r.competitor_count,data_quality:r.data_mode};},
    loadAlternatives:async query=>({alternatives:(await analyzeDuqm(query)).recommendations.slice(1)}),
    loadRentals:async()=>({suggestions:[],data_source:'DEMO'})});
  const saved=await service.save('test-user',{projectName:'Coffee Shop',businessCategory:'Coffee Shop',city:'Duqm',targetAudience:'Tourists',estimatedBudget:15000,maxMonthlyRent:300,searchRadiusKm:5,mode:'demo',location:{lat:19.6230411,lng:57.6340004}});
  assert.equal(saved.city,'Duqm');
  assert.equal(saved.locationRecommendation.data_mode,'DEMO');
  assert.equal(saved.locationRecommendation.budget_source,'DEMO');
  assert.equal(saved.locationRecommendation.startup_score,undefined);
  assert.equal(saved.provenance.quality.competitors.data_quality,'DEMO');
});
