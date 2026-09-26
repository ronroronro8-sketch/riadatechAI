import { readFile } from 'node:fs/promises';
import XLSX from 'xlsx';
import { normalize, locationKey } from './omanData/importer.js';
import { BUSINESS_CATEGORY_MAPPINGS, resolveDirectCompetitorPois } from '../utils/businessTypeMapping.js';

const rawDir = new URL('../data/raw/', import.meta.url);
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const has = (text, words) => words.some(word => text.includes(normalize(word)));
const mentions = (text, value) => value && ['', 'و', 'ب'].some(prefix => (` ${text} `).includes(` ${prefix}${locationKey(value)} `));
const source = (file, extra = {}) => ({ file, publisher: null, observationPeriod: null, publication: null, ...extra });
const categoryQueryAliases = { 'Coffee Shop': ['مقاهي', 'قهاوي'], Restaurant: ['مطاعم'], Bakery: ['مخابز'] };
const regionalAliases = {
  'al buraymi': 'البريمي', 'ad dakhliyah': 'الداخلية', 'adh dhahirah': 'الظاهرة',
  'ash sharqiyah south': 'جنوب الشرقية', 'ash sharqiyah north': 'شمال الشرقية',
};
export async function readMapWorkbook(file) {
  // Fixed filenames supplied by this module only. No user-selected paths or writes.
  const book = XLSX.read(await readFile(new URL(file, rawDir)), { type: 'buffer' });
  return Object.fromEntries(book.SheetNames.map(name => [name,
    XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: null })]));
}
function resolvePlace(text, features, demographic) {
  const governors = [...new Map(features.map(f => [f.governorate, { en: f.governorate, ar: f.governorate_ar }])).values()];
  const gov = governors.filter(g => mentions(text, g.en) || mentions(text, g.ar) ||
    Object.entries(regionalAliases).some(([alias, ar]) => locationKey(g.ar) === ar && mentions(text, alias)));
  const cities = features.filter(f => mentions(text, f.wilayat) || mentions(text, f.wilayat_ar));
  if (gov.length > 1 || cities.length > 1) return { error: 'ambiguous_locations' };
  const explicitGovernorate = has(text, ['محافظة', 'governorate']);
  const explicitWilayat = has(text, ['ولاية', 'wilayat']);
  if (gov.length && cities.length && gov[0].en !== cities[0].governorate) return { error: 'ambiguous_locations' };
  if (gov.length && (explicitGovernorate || (demographic && !explicitWilayat))) return { level: 'governorate', ...gov[0] };
  if (cities.length) return { level: 'wilayat', en: cities[0].wilayat, ar: cities[0].wilayat_ar, feature: cities[0] };
  if (gov.length) return { level: 'governorate', ...gov[0] };
  if (has(text, ['سلطنة عمان', 'السلطنة', 'oman', 'عمان'])) return { level: 'national', en: 'Oman', ar: 'سلطنة عمان' };
  return { error: 'needs_location' };
}
function regionalRow(rows, place) {
  return rows.slice(1).find(row => locationKey(row[0]) === locationKey(place.en) ||
    regionalAliases[locationKey(row[0])] === locationKey(place.ar));
}
function demographicFacts(sheets, file, text, place, years, population) {
  const facts = [], unavailable = [];
  const male = has(text, ['ذكور', 'الرجال', 'male', 'men']);
  const female = has(text, ['اناث', 'النساء', 'female', 'women']);
  // Female contains "male" in English; use token-boundary selection here.
  const sex = /\bfemale\b/.test(text) || female ? 'Female' : male ? 'Male' : 'Total';
  const requests = population ? ['population'] : [
    ...(has(text, ['بطالة', 'unemployment']) ? ['unemployment'] : []),
    ...(has(text, ['عدد العاملين', 'عمالة', 'workers', 'workforce']) ? ['workers'] : []),
    ...(has(text, ['توظيف', 'تشغيل', 'employment rate']) && !has(text, ['unemployment']) ? ['employment'] : []),
  ];
  if (!requests.length) requests.push('unemployment', 'workers');
  for (const metric of requests) {
    let sheet, label = sex;
    if (place.level === 'wilayat') { unavailable.push(`${metric}: no wilayat observations`); continue; }
    if (place.level === 'governorate') {
      if (population && has(text, ['وافدين', 'غير العمانيين', 'expatriate', 'العمانيين', 'العمانيون', 'omani nationals'])) { unavailable.push('population: regional nationality breakdown unavailable'); continue; }
      if (sex !== 'Total') { unavailable.push(`${metric}: regional gender breakdown unavailable`); continue; }
      sheet = metric === 'population' ? 'Data - Population by Governorat' : metric === 'unemployment' ? 'Data - Unemployment rate-1' : null;
    } else if (metric === 'population') {
      sheet = sex !== 'Total' ? 'Data - Population by Gender' : 'Data - Population by Nationalit';
      if (has(text, ['وافدين', 'غير العمانيين', 'expatriate'])) label = 'Expatriate/ Non Omani';
      else if (has(text, ['العمانيين', 'العمانيون', 'omani nationals'])) label = 'Omani';
    } else sheet = { unemployment: 'Data - Unemployment rate', employment: 'Data - Employment rate', workers: 'Data - number of workers' }[metric];
    if (population && has(text, ['عمر', 'age', 'سنوات', 'اطفال'])) { unavailable.push('age breakdown requires an explicit supported age band; no inferred demographic total'); continue; }
    if (!sheet || !sheets[sheet]) { unavailable.push(`${metric}: unsupported geographic scope`); continue; }
    const rows = sheets[sheet];
    const row = place.level === 'governorate' ? regionalRow(rows, place) : rows.slice(1).find(r => r[0] === label);
    const availableYears = rows[0].slice(1).map(String).filter(y => /^20\d{2}$/.test(y));
    const selectedYears = years.length ? years : availableYears.slice(-1);
    for (const year of selectedYears) {
      const column = rows[0].findIndex(h => String(h) === year);
      const value = row && column >= 0 ? finite(row[column]) : null;
      if (value === null) { unavailable.push(`${metric}: ${year} unavailable`); continue; }
      facts.push({ metric, value, unit: ['unemployment', 'employment'].includes(metric) ? 'percent (inferred from rate label)' : 'persons',
        geography: { level: place.level, name: place.en }, subgroup: row[0],
        provenance: source(`data/raw/${file}`, { sheet, sourceRow: rows.indexOf(row) + 1, sourceColumn: column + 1, observationPeriod: year }),
        quality: 'local workbook; publisher and methodology not recorded; not independently verified' });
    }
  }
  if (population) {
    const regional = sheets['Data - Population by Governorat'];
    const national = sheets['Data - Population by Nationalit'];
    const total = national?.find(row => row[0] === 'Total');
    if (regional && total) {
      const year = String(regional[0][1]);
      const n = total[national[0].findIndex(h => String(h) === year)];
      const sum = regional.slice(1).reduce((acc, row) => acc + (finite(row[1]) ?? 0), 0);
      if (sum !== n) for (const fact of facts) fact.quality = 'source_inconsistency: governorate values do not reconcile with national total; do not treat as verified official population';
    }
  }
  return { facts, unavailable };
}

async function scoringSources(readWorkbook) {
  const files = ['Startups Data in the Sultanate of Oman.xlsx', 'Registered Companies - Category and Governorate.xlsx',
    'Tourism Activities Establishments Data in the Sultanate of Oman.xlsx', 'Craft Enterprises Data in the Sultanate of Oman.xlsx'];
  return Promise.all(files.map(async file => {
    try {
      const sheets = await readWorkbook(file);
      const rows = Object.entries(sheets).filter(([name]) => name.includes('وصف')).flatMap(([, rows]) => rows);
      const pairs = rows.flatMap(row => { const p = []; for (let i = 0; i + 1 < row.length; i += 2) p.push([normalize(row[i]), row[i + 1]]); return p; });
      const get = key => pairs.find(([label]) => label === normalize(key))?.[1] ?? null;
      return source(`data/raw/${file}`, { publisher: get('المصدر'), observationPeriod: get('الفترة المرجعية للبيانات'), publication: get('تاريخ النشر') });
    } catch { return source(`data/raw/${file}`, { metadataStatus: 'unavailable' }); }
  }));
}

// A new read-only consumer. Existing map loaders and their outputs are never modified.
export function createSmartMapDataService({ readFeatures, readPois, readLocations, loadRecommendations,
  readWorkbook = readMapWorkbook, rentalExamples = [] }) {
  async function context(message) {
    const text = normalize(message);
    const intents = {
      population: has(text, ['سكان', 'population', 'demograph']),
      labour: has(text, ['بطالة', 'عمالة', 'العاملين', 'سوق العمل', 'توظيف', 'تشغيل', 'unemployment', 'employment', 'workers', 'workforce', 'labour']),
      competition: has(text, ['منافس', 'competition', 'competitor', 'nearby', 'قريبة']),
      rentals: has(text, ['ايجار', 'rent', 'استئجار']),
      geography: has(text, ['احداثيات', 'قرى', 'coordinates', 'villages']),
      suitability: has(text, ['اختيار موقع', 'افضل موقع', 'انسب موقع', 'تقييم موقع', 'تقييم مشروع', 'مناسب', 'location', 'suitable', 'market', 'السوق', 'افضل مكان', 'افضل منطقة', 'انسب مكان', 'افتح', 'افتتاح']),
    };
    if (!Object.values(intents).some(Boolean)) return null;
    try {
      const features = await readFeatures();
      const place = resolvePlace(text, features, intents.population || intents.labour);
      if (place.error) return { status: place.error, facts: [], policy: 'Ask for a supported governorate or wilayat; do not assume Sohar or a saved project.' };
      if ((intents.population || intents.labour) && has(text, ['ربع', 'نصف', 'شهري', 'quarter', 'monthly'])) return { status: 'insufficient_data', facts: [], unavailable: ['Only annual demographic observations are available'] };
      const years = [...new Set(text.match(/\b20\d{2}\b/g) ?? [])];
      if (years.length > 3) return { status: 'needs_narrower_period', facts: [] };
      const result = { status: 'available', resolvedScope: { place: { level: place.level, en: place.en, ar: place.ar }, years }, facts: [], unavailable: [],
        sourcePolicy: 'Separate from Structured Oman Data. Prefer relevant official observations with matching definition, geography and coverage and newer publication for official statistics. Do not add, average or reconcile map indicators with official totals. Map scores are estimates, not official counts. No current/live coverage is implied.',
        scopeWarning: 'Only the resolved filters apply. Unresolved subgroups, areas, radii or periods require clarification; never generalize examples to a whole market.' };
      const add = part => { result.facts.push(...part.facts); result.unavailable.push(...part.unavailable); };
      for (const [intent, file] of [['population', 'population.xlsx'], ['labour', 'labour_market.xlsx']]) if (intents[intent]) {
        try { add(demographicFacts(await readWorkbook(file), file, text, place, years, intent === 'population')); }
        catch { result.unavailable.push(`${intent}: source unavailable`); }
      }
      const categories = BUSINESS_CATEGORY_MAPPINGS.filter(m => [...m.matches, ...(categoryQueryAliases[m.canonicalType] ?? [])].some(v => has(text, [v])));
      const mapping = categories.length === 1 ? categories[0] : null;
      if (intents.competition) {
        if (place.level !== 'wilayat' || locationKey(place.en) !== 'sohar') result.unavailable.push('OSM competition coverage is Sohar only');
        else if (!mapping) result.unavailable.push('competition: specify one supported business category');
        else if (years.length || (/\d+\s*(?:كم|km|كيلومتر)/.test(text) || has(text, ['حول', 'near me', 'بالقرب مني']))) result.unavailable.push('competition: dated or radius-specific observations unavailable; specify an exact location through Smart Map');
        else {
          const pois = await readPois('Sohar');
          const resolved = resolveDirectCompetitorPois(pois, mapping);
          const unique = [...new Map(resolved.directPois.map(p => [`${p.osm_type}:${p.osm_id}`, p])).values()];
          result.facts.push({ metric: 'mapped_competitor_candidates', value: unique.length, unit: 'OSM features', geography: 'Sohar stored extract', category: mapping.canonicalType,
            quality: resolved.data_quality, warning: 'Incomplete community mapping, not a business census. Zero mapped matches does not mean no competitors. Proxy matches are not confirmed direct competitors.',
            notes: resolved.data_source_notes_ar, provenance: source('data/processed/osm_pois_sohar.json', { publisher: 'OpenStreetMap / Overpass API' }),
            examples: unique.slice(0, 3).map(p => ({ name: String(p.name).slice(0, 160), category: p.category, latitude: p.latitude, longitude: p.longitude, coordinateUnit: 'degrees', osmType: p.osm_type, osmId: String(p.osm_id) })), examplesTruncated: unique.length > 3 });
        }
      }
      if (intents.suitability) {
        if (!mapping || place.level !== 'wilayat') result.unavailable.push('location scoring: specify one wilayat and business category');
        else if (years.length) result.unavailable.push('location scoring: no dated score history available');
        else {
          const output = await loadRecommendations({ city: place.en, businessType: mapping.canonicalType });
          const row = output.recommendations?.find(r => locationKey(r.wilayat) === locationKey(place.en));
          if (row && finite(row.score) !== null) result.facts.push({ metric: 'map_location_score', value: row.score, unit: 'points out of 100', geography: { level: 'wilayat', name: place.en }, category: mapping.canonicalType,
            provenance: source('data/processed/location_features.json', { derivedBy: 'existing Smart Map recommendation loader', inputSources: await scoringSources(readWorkbook), lineageWarning: 'Current upstream metadata; processed build date not recorded. Procurement period in metadata is stale; the processed source notes identify the selected worksheet year.' }),
            quality: 'derived estimate; not probability of success or verified local demand', warning: 'Some inputs are governorate-level proxies repeated across wilayats. Raw counts and placeholder competitor/population fields intentionally withheld. Procurement registrations are not all commercial registrations.', notes: row.data_source_notes });
          else result.unavailable.push('location score unavailable');
        }
      }
      if (intents.geography) {
        if (place.level !== 'wilayat') result.unavailable.push('geography: specify a wilayat for village references');
        else {
          const rows = (await readLocations()).filter(r => locationKey(r.Wallyat_Name_English) === locationKey(place.en) || locationKey(r.Wallyat_Name_Arabic) === locationKey(place.ar));
          const unique = [...new Map(rows.map(r => [r.Village_Name_English, r])).values()];
          result.facts.push({ metric: 'village_reference_examples', geography: place.en, provenance: source('data/raw/oman_locations.csv'),
            quality: 'map reference, unknown observation date; many village coordinates repeat wilayat coordinates, not precise premises',
            examples: unique.slice(0, 4).map(r => ({ name: r.Village_Name_Arabic, nameEnglish: r.Village_Name_English,
              latitude: r.Village_Latitude?.trim() ? finite(Number(r.Village_Latitude)) : null,
              longitude: r.Village_Longitude?.trim() ? finite(Number(r.Village_Longitude)) : null, coordinateUnit: 'degrees' })), examplesTruncated: unique.length > 4 });
        }
      }
      if (intents.rentals) {
        if (years.length) result.unavailable.push('rentals: no historical or live market rent observations');
        else {
          const examples = rentalExamples.filter(r => locationKey(r.city) === locationKey(place.en)).slice(0, 3);
          if (examples.length) result.facts.push({ metric: 'rental_demo_examples', geography: place.en,
            provenance: source('data/rentalSeedData.js', { publisher: 'RiadaTech prototype fixtures' }),
            quality: 'synthetic/sample, not real verified listings or market prices', warning: 'Not an estimate of average rent, availability or a quotation. No budget-fit or category-fit claim is made.',
            examples: examples.map(r => ({ title: r.title, neighborhood: r.neighborhood, monthlyRent: { value: r.monthlyRent, unit: 'OMR/month' }, size: { value: r.sizeSqm, unit: 'm²' } })) });
          else result.unavailable.push('rentals: no examples for this location');
        }
      }
      // Whole facts are removed, never truncated into invalid JSON or orphaned numbers.
      while (JSON.stringify(result).length > 11000 && result.facts.length) { result.facts.pop(); result.truncated = true; }
      if (!result.facts.length) result.status = 'insufficient_data';
      else if (result.unavailable.length || result.truncated) result.status = 'partial';
      return result;
    } catch { return { status: 'unavailable', facts: [] }; }
  }
  return { context };
}
