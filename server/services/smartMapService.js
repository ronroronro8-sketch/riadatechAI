import { normalizeAnalysisInput } from '../utils/mapAnalysis.js';
import { ConversationError } from './conversationService.js';

export const SMART_MAP_PIPELINE = 'server-location-recommendations-v1';
const idPattern = /^[a-f\d]{24}$/i;
const topFields = ['projectName', 'businessCategory', 'customBusinessCategory', 'city', 'targetAudience',
  'estimatedBudget', 'maxMonthlyRent', 'searchRadiusKm', 'areaName'];
const itemFields = ['name', 'area_name', 'address', 'distanceKm', 'monthlyRent', 'sizeSqm', 'level', 'score',
  'reason', 'lat', 'lng', 'latitude', 'longitude', 'category', 'source', 'osm_type', 'osm_id',
  'data_quality', 'category_confidence', 'direct_competitors', 'complementary_pois',
  'data_source_notes', 'data_source_notes_ar', 'data_source_notes_en', 'explanation_ar', 'explanation_en'];
const recommendationFields = ['area_name', 'governorate', 'wilayat', 'latitude', 'longitude', 'score',
  'startup_score', 'business_score', 'tourism_score', 'craft_score', 'score_breakdown',
  'metric_counts', 'category_match_used', 'open_data_weights', 'startup_count', 'business_activity_count',
  'tourism_activity_count', 'craft_activity_count', 'data_source_notes', 'explanation_ar', 'explanation_en'];
const rentalFields = ['title', 'city', 'neighborhood', 'address', 'monthlyRent', 'sizeSqm',
  'latitude', 'longitude', 'budgetScore', 'budgetStatus_ar', 'budgetStatus_en', 'data_source', 'warning_ar', 'warning_en'];
const pick = (source, fields) => Object.fromEntries(fields.filter(k => source?.[k] !== undefined).map(k => [k, source[k]]));
// Bound lists and prose only. Numbers and units are never rounded or converted.
function compact(value, depth = 0) {
  if (depth > 6) return undefined;
  if (typeof value === 'string') return value.length > 600 ? value.slice(0, 600) + '…' : value;
  if (Array.isArray(value)) return value.slice(0, 5).map(v => compact(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 40)
    .map(([k, v]) => [k, compact(v, depth + 1)]));
  return value;
}
export function buildSmartMapContext(row) {
  if (!row) return null;
  return compact({ analysisId: String(row._id), createdAt: row.createdAt, updatedAt: row.updatedAt,
    inputs: pick(row, topFields),
    selectedLocation: pick(row.selectedLocation, ['lat', 'lng', 'label', 'city']),
    locationScore: row.locationScore,
    locationRecommendation: pick(row.locationRecommendation, recommendationFields),
    competitorSummary: { ...pick(row.competitorSummary, ['count', 'level', 'data_quality', 'category_confidence', 'message_ar', 'message_en']),
      items: row.competitorSummary?.items?.slice(0, 5).map(m => pick(m, itemFields)) },
    rentalSummary: { ...pick(row.rentalSummary, ['totalAvailable', 'withinBudget', 'suitabilityLabel']),
      bestOptions: row.rentalSummary?.bestOptions?.slice(0, 3).map(m => pick(m, itemFields)) },
    rentalBudgetSuggestions: row.rentalBudgetSuggestions?.slice(0, 3).map(m => pick(m, rentalFields)),
    alternatives: row.alternatives?.slice(0, 3).map(m => pick(m, itemFields)),
    provenance: row.provenance,
  });
}

export function createSmartMapService({ MapAnalysis, loadRecommendations, loadCompetitors, loadAlternatives, loadRentals }) {
  function requireUser(userId) { if (!userId) throw new ConversationError(401, 'Authentication required.'); }
  async function analyze(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ConversationError(400, 'Project inputs are required.');
    for (const key of ['projectName', 'businessCategory', 'customBusinessCategory', 'city', 'targetAudience', 'areaName']) {
      if (raw[key] !== undefined && (typeof raw[key] !== 'string' || raw[key].length > 300)) throw new ConversationError(400, 'Invalid project inputs.');
    }
    for (const key of ['projectName', 'businessCategory', 'city', 'targetAudience']) {
      if (typeof raw[key] !== 'string' || !raw[key].trim()) throw new ConversationError(400, 'Project inputs are required.');
    }
    for (const key of ['estimatedBudget', 'maxMonthlyRent', 'searchRadiusKm']) {
      if (!['number', 'string'].includes(typeof raw[key]) || String(raw[key]).trim() === '') {
        throw new ConversationError(400, 'Numeric project inputs are required.');
      }
    }
    const input = normalizeAnalysisInput(raw);
    if (!(input.searchRadiusKm > 0) || Number(raw.searchRadiusKm) <= 0) throw new ConversationError(400, 'Invalid search radius.');
    for (const key of ['estimatedBudget', 'maxMonthlyRent', 'searchRadiusKm']) {
      if (!Number.isFinite(input[key]) || input[key] < 0) throw new ConversationError(400, 'Invalid numeric project input.');
    }
    const query = { city: input.city, businessType: input.businessCategoryLabel };
    const recommendations = await loadRecommendations(query);
    const primary = recommendations.recommendations?.[0];
    if (!primary) throw new ConversationError(404, 'No location recommendations are available.');
    const [competitors, alternatives, rentals] = await Promise.all([
      loadCompetitors({ ...query, lat: primary.latitude, lng: primary.longitude, radiusKm: input.searchRadiusKm }),
      loadAlternatives(query),
      input.maxMonthlyRent > 0 ? loadRentals({ ...query, maxMonthlyRent: input.maxMonthlyRent, startupBudget: input.estimatedBudget }) : null,
    ]);
    // Every result below comes from the same server loaders used by the current
    // map page. req.body.analysis and any client provenance are deliberately ignored.
    return { ...pick(input, topFields),
      selectedLocation: { lat: primary.latitude, lng: primary.longitude, label: primary.area_name, city: primary.wilayat },
      locationScore: primary.score,
      locationRecommendation: pick(primary, recommendationFields),
      competitorSummary: { ...pick(competitors, ['count', 'data_quality', 'category_confidence', 'message_ar', 'message_en']),
        items: (competitors.competitors || []).slice(0, 12).map(m => ({ ...pick(m, itemFields), lat: m.latitude, lng: m.longitude })) },
      alternatives: (alternatives.alternatives || []).slice(0, 5).map(m => pick(m, itemFields)),
      ...(rentals ? { rentalBudgetSuggestions: (rentals.suggestions || []).slice(0, 5).map(m => pick(m, rentalFields)) } : {}),
      provenance: { pipeline: SMART_MAP_PIPELINE, generatedAt: new Date(),
        units: { money: 'OMR', distance: 'km', area: 'sqm', locationScore: '0–100' },
        dataSources: recommendations.data_sources || [],
        quality: {
          inputs: 'User-supplied project inputs, not independently verified; budget and rent are limits/estimates, not a signed lease.',
          locationScore: 'Calculated recommendation score, not a probability of business success.',
          competitors: pick(competitors, ['data_quality', 'category_confidence', 'data_source_notes_ar', 'data_source_notes_en']),
          alternatives: pick(alternatives, ['data_quality', 'message_ar', 'message_en']),
          ...(rentals ? { rentals: pick(rentals, ['data_source', 'warning', 'warning_ar', 'warning_en']) } : {}),
          freshness: 'GeneratedAt is the analysis time, not the source observation date. Source dates are unavailable; these are stored datasets, not live market verification.',
        },
      },
    };
  }
  return {
    async preview(userId, raw) { requireUser(userId); return analyze(raw); },
    async save(userId, raw) {
      requireUser(userId);
      const result = await analyze(raw);
      return MapAnalysis.create({ ...result, userId });
    },
    async getContext(userId, analysisId) {
      requireUser(userId);
      const query = { userId, 'provenance.pipeline': SMART_MAP_PIPELINE };
      if (analysisId !== undefined && analysisId !== null) {
        if (typeof analysisId !== 'string' || !idPattern.test(analysisId)) throw new ConversationError(404, 'Map analysis not found.');
        query._id = analysisId;
      }
      const row = await MapAnalysis.findOne(query).sort({ createdAt: -1, _id: -1 }).lean();
      if (!row && analysisId != null) throw new ConversationError(404, 'Map analysis not found.');
      return buildSmartMapContext(row);
    },
    async list(userId) {
      requireUser(userId);
      return MapAnalysis.find({ userId, 'provenance.pipeline': SMART_MAP_PIPELINE }).sort({ createdAt: -1, _id: -1 })
        .limit(30).select('_id projectName city businessCategory locationScore createdAt').lean();
    },
  };
}
