import { readFile } from 'node:fs/promises';
import { calculateDistanceKm } from '../utils/geoUtils.js';
import { getBusinessCategoryMapping } from '../utils/businessTypeMapping.js';

const dataUrl = new URL('../data/processed/', import.meta.url);
const read = name => readFile(new URL(name, dataUrl), 'utf8').then(JSON.parse);
export const isDuqm = city => /^(duqm|ad duqm|الدقم|دقم)$/i.test(String(city || '').trim());
export const DUQM_CENTER = { lat: 19.6230411, lng: 57.6340004 };
// Candidate search areas, not properties offered for lease. Anchored to cached OSM places.
export const candidates = [
  { id: 'town-north', area_name: 'Duqm — northern town shops', area_name_ar: 'الدقم — محيط المحلات شمال المدينة', latitude: 19.6271117, longitude: 57.6355571 },
  { id: 'town-south', area_name: 'Duqm — southern town services', area_name_ar: 'الدقم — محيط الخدمات جنوب المدينة', latitude: 19.6147868, longitude: 57.6299097 },
  { id: 'central-corridor', area_name: 'Duqm — central shopping corridor', area_name_ar: 'الدقم — محور التسوق الأوسط', latitude: 19.6069402, longitude: 57.6666000 },
  { id: 'cafe-corridor', area_name: 'Duqm — eastern service corridor', area_name_ar: 'الدقم — محور الخدمات الشرقي', latitude: 19.6002730, longitude: 57.6735951 },
  { id: 'hotel-coast', area_name: 'Duqm — coastal hotel vicinity', area_name_ar: 'الدقم — محيط الفنادق الساحلية', latitude: 19.5691930, longitude: 57.7012781 },
];
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function withinBoundary(lat, lng, geometry) {
  const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  return polygons.some(rings => inRing([lng, lat], rings[0]) && !rings.slice(1).some(r => inRing([lng, lat], r)));
}
const distance = (a, b) => calculateDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude);
const clamp = n => Math.max(0, Math.min(100, Math.round(n)));
function number(value, fallback, min, max) {
  const n = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw Object.assign(new Error('Invalid numeric analysis input.'), { status: 400 });
  return n;
}
function categories(business) {
  if (/logistics|لوجست/i.test(business)) return ['logistics', 'warehouse', 'transport'];
  if (/car maintenance|car repair|صيانة|سيارات/i.test(business)) return ['car_repair', 'tyres'];
  if (/supermarket|سوبرماركت/i.test(business)) return ['supermarket', 'convenience'];
  return getBusinessCategoryMapping(business).directCategories || ['shop'];
}
export function demoRecords() {
  const types = ['cafe', 'restaurant', 'supermarket', 'logistics', 'car_repair', 'hotel', 'school', 'fuel', 'warehouse', 'residential', 'commercial', 'road'];
  return candidates.flatMap((c, i) => types.flatMap((category, j) => {
    // Stable, varied activity profiles. No invented real business identities.
    const count = 1 + ((i * 3 + j * 2) % 4);
    return Array.from({length: count}, (_, k) => ({
      id: `demo-${i}-${j}-${k}`, name: `DEMO ${category} ${i + 1}.${k + 1}`,
      category, latitude: c.latitude + (j % 3 - 1) * .0015 + k * .0004,
      longitude: c.longitude + (j % 4 - 1.5) * .0012 + k * .0003,
      data_kind: 'DEMO', source: 'DEMO / SIMULATED — not a real establishment',
    }));
  }));
}
export async function loadDuqmData({ demo = false } = {}) {
  const boundary = (await read('duqm-geocoding.json')).results[0].geojson;
  let records = [], retrievedAt = null;
  if (!demo) {
    try {
      const cache = await read('duqm-places.json');
      retrievedAt = cache.retrievedAt;
      records = cache.records.map(p => ({id: `${p.osm_type}-${p.osm_id}`, name: p.name || `OSM ${p.type} ${p.osm_id}`,
        category: p.type, latitude: Number(p.lat), longitude: Number(p.lon), osm_id: p.osm_id, osm_type: p.osm_type,
        source: 'OpenStreetMap (cached; not independently verified)', source_url: `https://www.openstreetmap.org/${p.osm_type}/${p.osm_id}`, data_kind: 'REAL'}));
    } catch { /* Missing or corrupt cache uses explicit demo mode. */ }
  }
  records = [...new Map(records.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && withinBoundary(p.latitude, p.longitude, boundary)).map(p => [p.id, p])).values()];
  return { boundary, records, retrievedAt };
}
export async function analyzeDuqm(query = {}, suppliedData) {
  const businessType = String(query.businessType || 'Coffee Shop').slice(0, 300);
  const radius = number(query.radiusKm ?? query.searchRadiusKm, 3, .1, 30);
  const rent = number(query.maxMonthlyRent, 0, 0, 1e8);
  const startupBudget = number(query.startupBudget ?? query.estimatedBudget, 0, 0, 1e10);
  const data = suppliedData || await loadDuqmData({ demo: query.mode === 'demo' });
  const direct = categories(businessType);
  let records = data.records;
  const demo = demoRecords().filter(p => withinBoundary(p.latitude, p.longitude, data.boundary));
  if (!records.length) records = demo;
  else if (!records.some(p => direct.includes(p.category))) records = [...records, ...demo.filter(p => direct.includes(p.category))];
  const dataMode = records.every(p => p.data_kind === 'DEMO') ? 'DEMO' : records.some(p => p.data_kind === 'DEMO') ? 'MIXED' : 'REAL';
  const audienceCategories = { Tourists: ['hotel', 'restaurant'], Families: ['supermarket', 'school', 'residential'], Students: ['school', 'cafe'], 'Office Workers': ['office', 'commercial', 'restaurant'], 'General Public': ['supermarket', 'restaurant', 'hotel'] };
  const audience = audienceCategories[query.targetAudience] || audienceCategories['General Public'];
  const industrial = direct.includes('logistics') || direct.includes('car_repair');
  const relevant = industrial ? ['fuel', 'warehouse', 'logistics', 'car_repair', 'industrial'] : ['hotel', 'supermarket', 'restaurant', 'cafe', 'school'];
  const recommendations = candidates.filter(c => withinBoundary(c.latitude, c.longitude, data.boundary)).map((candidate, i) => {
    const nearby = records.filter(p => distance(candidate, p) <= radius);
    const competitors = nearby.filter(p => direct.includes(p.category));
    const services = nearby.filter(p => !direct.includes(p.category) && relevant.includes(p.category));
    const competition = clamp(100 / (1 + competitors.length * .3));
    const activity = clamp(Math.log1p(services.length) * 30);
    const audienceFit = clamp(nearby.filter(p => audience.includes(p.category)).length * 14);
    // A transparent proximity proxy, never a claim about road travel times or traffic.
    const nearestService = Math.min(20, ...records.filter(p => relevant.includes(p.category)).map(p => distance(candidate, p)));
    const accessibility = clamp(100 - nearestService * 20);
    const demoRent = 220 + i * 130;
    const budget = rent ? clamp(100 * Math.min(1, rent / demoRent)) : null;
    const score = clamp(competition * .3 + activity * .3 + audienceFit * .2 + accessibility * .2);
    const budgetAdjusted = budget === null ? score : clamp(score * .85 + budget * .15);
    const explanation_en = `ESTIMATED suitability: ${competitors.length} recorded competitors and ${services.length} related services within ${radius} km. Accessibility uses straight-line service proximity, not measured road access. ${rent ? 'Budget fit uses explicitly DEMO monthly rent, not a market quote.' : 'Rent is not scored without a budget.'} OSM coverage is incomplete; zero records does not prove zero competition.`;
    const explanation_ar = `ملاءمة تقديرية: ${competitors.length} منافسين مسجلين و${services.length} خدمات مرتبطة ضمن ${radius} كم. الوصول مؤشر للمسافة المباشرة إلى الخدمات وليس قياسًا للطرق. ${rent ? 'ملاءمة الميزانية تستخدم إيجارًا تجريبيًا وليس سعر السوق.' : 'لم يتم تقييم الإيجار دون ميزانية.'} بيانات الخرائط غير مكتملة؛ غياب السجلات لا يعني غياب المنافسة.`;
    return { ...candidate, governorate: 'Al Wusta', wilayat: 'Duqm', score: budgetAdjusted, data_kind: 'ESTIMATED', data_mode: dataMode,
      competitors: competitors.length, direct_competitors: competitors.length, complementary_pois: services.length,
      nearby_services: services.slice(0, 8), competitor_density: Number((competitors.length / (Math.PI * radius ** 2)).toFixed(3)),
      score_breakdown: { competition, activity, audience: audienceFit, accessibility, ...(budget === null ? {} : { demo_budget: budget }) },
      demo_monthly_rent: rent ? demoRent : null, budget_source: rent ? 'DEMO' : 'NOT_SCORED',
      score_weights: { competition: .3, activity: .3, audience: .2, accessibility: .2, demo_budget_share: rent ? .15 : 0 },
      data_source_notes: `${dataMode} records; ESTIMATED score. ${rent ? 'DEMO rent.' : 'No rent data.'}`,
      explanation_en, explanation_ar };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3);
  const primary = recommendations[0];
  const location = { latitude: number(query.lat, primary.latitude, -90, 90), longitude: number(query.lng, primary.longitude, -180, 180) };
  if (!withinBoundary(location.latitude, location.longitude, data.boundary)) throw Object.assign(new Error('Select a location inside Duqm. / اختر موقعًا داخل الدقم.'), {status: 400});
  const competitors = records.filter(p => direct.includes(p.category)).map(p => ({...p, distanceKm: Number(distance(location, p).toFixed(3))})).filter(p => p.distanceKm <= radius).sort((a,b) => a.distanceKm - b.distanceKm);
  return { city: 'Duqm', query: {...query, businessType, radiusKm: radius, startupBudget}, data_mode: dataMode, retrievedAt: data.retrievedAt,
    data_sources: ['https://www.openstreetmap.org/relation/19567693', 'https://nominatim.openstreetmap.org', 'https://duqm.gov.om/en/sezad/inside-sezad/profile'],
    records: records.map(p => ({...p, is_competitor: direct.includes(p.category)})), recommendations, count: recommendations.length, competitors, competitor_count: competitors.length,
    competitor_location: location, boundary: data.boundary,
    notice_en: `${dataMode} DATA · OSM records are cached and incomplete. DEMO records are invented examples. Scores are ESTIMATED, not investment forecasts. Rent figures, when shown, are DEMO only.`,
    notice_ar: `${dataMode} · سجلات الخرائط محفوظة وغير مكتملة. سجلات DEMO أمثلة مصطنعة. النتائج تقديرية وليست توقعات استثمارية. أرقام الإيجار المعروضة تجريبية فقط.`,
  };
}
