import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import XLSX from "xlsx";

import { BUSINESS_CATEGORY_MAPPINGS } from "../utils/businessTypeMapping.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, "..");
const RAW_DIR = path.join(SERVER_DIR, "data", "raw");
const PROCESSED_DIR = path.join(SERVER_DIR, "data", "processed");

const RAW_PATHS = {
  locations: path.join(
    RAW_DIR,
    "The names of the governorates in the Sultanate of Oman and the wilayats under each governorate.xlsx"
  ),
  startups: path.join(RAW_DIR, "Startups Data in the Sultanate of Oman.xlsx"),
  registeredCompanies: path.join(
    RAW_DIR,
    "Registered Companies - Category and Governorate.xlsx"
  ),
  tourism: path.join(
    RAW_DIR,
    "Tourism Activities Establishments Data in the Sultanate of Oman.xlsx"
  ),
  craft: path.join(RAW_DIR, "Craft Enterprises Data in the Sultanate of Oman.xlsx"),
  coordinateFallback: path.join(RAW_DIR, "oman_locations.csv"),
};

const DATASET_SOURCES = {
  startups: "Startups Data in the Sultanate of Oman",
  business: "Registered Companies - Category and Governorate",
  tourism: "Tourism Activities Establishments Data in the Sultanate of Oman",
  craft: "Craft Enterprises Data in the Sultanate of Oman",
  locations:
    "The names of the governorates in the Sultanate of Oman and the wilayats under each governorate",
};

const OUTPUT_COLUMNS = [
  "area_id",
  "area_name",
  "governorate",
  "wilayat",
  "latitude",
  "longitude",
  "startup_count",
  "business_activity_count",
  "tourism_activity_count",
  "craft_activity_count",
  "startup_category_counts",
  "business_category_counts",
  "tourism_category_counts",
  "craft_category_counts",
  "startups_count",
  "total_businesses",
  "complementary_pois",
  "data_source_notes",
];

const GOVERNORATE_LEVEL_NOTE =
  "Governorate-level data used when wilayat-level data is unavailable.";
const COORDINATE_FALLBACK_NOTE =
  "Coordinates are retained from the existing oman_locations.csv map reference because the official governorate/wilayat workbook does not include latitude or longitude.";

const BUSINESS_TYPES = BUSINESS_CATEGORY_MAPPINGS.map((mapping) => mapping.canonicalType);

const CATEGORY_KEYWORDS = {
  "Coffee Shop": [
    "coffee",
    "cafe",
    "cafeteria",
    "\u0645\u0642\u0647\u0649",
    "\u0645\u0642\u0627\u0647\u064a",
    "\u0643\u0627\u0641\u064a\u0647",
    "\u0642\u0647\u0648\u0629",
  ],
  Restaurant: [
    "restaurant",
    "food",
    "dining",
    "\u0645\u0637\u0639\u0645",
    "\u0645\u0637\u0627\u0639\u0645",
    "\u0627\u0644\u0645\u0637\u0627\u0639\u0645",
    "\u0627\u0644\u0627\u063a\u0630\u064a\u0629",
    "\u0627\u0644\u0623\u063a\u0630\u064a\u0629",
  ],
  Bakery: [
    "bakery",
    "pastry",
    "\u0645\u062e\u0628\u0632",
    "\u0645\u062e\u0627\u0628\u0632",
    "\u062d\u0644\u0648\u064a\u0627\u062a",
  ],
  "Abaya Store": [
    "abaya",
    "\u0639\u0628\u0627\u064a\u0629",
    "\u0639\u0628\u0627\u064a\u0627\u062a",
    "\u062c\u0644\u0627\u0628\u064a\u0629",
    "\u062e\u064a\u0627\u0637\u0629",
  ],
  "Clothes Store": [
    "clothes",
    "clothing",
    "fashion",
    "boutique",
    "\u0645\u0644\u0627\u0628\u0633",
    "\u0627\u0632\u064a\u0627\u0621",
    "\u0623\u0632\u064a\u0627\u0621",
    "\u062e\u064a\u0627\u0637\u0629",
    "\u0646\u0633\u064a\u062c",
  ],
  "Perfume Store": [
    "perfume",
    "cosmetic",
    "\u0639\u0637\u0648\u0631",
    "\u0639\u0637\u0631",
    "\u062a\u062c\u0645\u064a\u0644",
    "\u0645\u0633\u062a\u062d\u0636\u0631\u0627\u062a",
  ],
  Salon: [
    "salon",
    "beauty",
    "hair",
    "\u0635\u0627\u0644\u0648\u0646",
    "\u062a\u062c\u0645\u064a\u0644",
    "\u062d\u0644\u0627\u0642\u0629",
  ],
  Grocery: [
    "grocery",
    "supermarket",
    "retail",
    "\u0628\u0642\u0627\u0644\u0629",
    "\u062a\u062c\u0632\u0626\u0629",
    "\u0645\u0648\u0627\u062f\u0020\u063a\u0630\u0627\u0626\u064a\u0629",
    "\u063a\u0630\u0627\u0626\u064a\u0629",
  ],
  "Flower Shop": [
    "flower",
    "florist",
    "\u0648\u0631\u062f",
    "\u0632\u0647\u0648\u0631",
    "\u0627\u0632\u0647\u0627\u0631",
    "\u0623\u0632\u0647\u0627\u0631",
  ],
  Pharmacy: [
    "pharmacy",
    "medical",
    "\u0635\u064a\u062f\u0644\u064a\u0629",
    "\u0635\u064a\u062f\u0644\u064a\u0627\u062a",
    "\u062f\u0648\u0627\u0621",
  ],
  Bank: ["bank", "finance", "\u0628\u0646\u0643", "\u0628\u0646\u0648\u0643", "\u0645\u0627\u0644\u064a"],
  "Electronics Store": [
    "electronics",
    "technology",
    "information technology",
    "\u0627\u0644\u0643\u062a\u0631\u0648\u0646",
    "\u0625\u0644\u0643\u062a\u0631\u0648\u0646",
    "\u062a\u0642\u0646\u064a\u0629",
    "\u062a\u0642\u0646\u064a\u0627\u062a",
    "\u0645\u0639\u0644\u0648\u0645\u0627\u062a",
  ],
};

const HEADER_KEYWORDS = {
  governorate: [
    "governorate",
    "governorates",
    "regionname",
    "\u0627\u0644\u0645\u062d\u0627\u0641\u0638",
  ],
  wilayat: ["wilayat", "wilayatname", "\u0627\u0644\u0648\u0644\u0627\u064a"],
  activity: ["activity", "\u0627\u0644\u0646\u0634\u0627\u0637", "\u0646\u0634\u0627\u0637"],
  total: ["total", "\u0627\u0644\u0645\u062c\u0645\u0648\u0639"],
};

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeLookupKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/\bgovernorate of\b/g, "")
    .replace(/\bgovernorate\b/g, "")
    .replace(/\u0645\u062d\u0627\u0641\u0638\u0629/g, "")
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "");
}

function normalizeHeaderKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "");
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cleanEnglishLocationName(value) {
  return normalizeText(value)
    .replace(/^governorate of\s+/i, "")
    .replace(/\s+governorate$/i, "")
    .trim();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function addNote(notes, note) {
  if (note && !notes.includes(note)) {
    notes.push(note);
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

function readWorkbook(filePath) {
  return XLSX.readFile(filePath, {
    cellDates: false,
  });
}

function readRowsWithHeaders(filePath, requiredColumns = []) {
  const workbook = readWorkbook(filePath);

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: null,
    });
    const firstRow = rows[0] || {};
    const columns = Object.keys(firstRow);

    if (requiredColumns.every((column) => columns.includes(column))) {
      return rows;
    }
  }

  return [];
}

function readSheetAsArrays(workbook, sheetName) {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    blankrows: false,
  });
}

async function readCsvRows(filePath) {
  const csvText = await readFile(filePath, "utf8");

  return parse(csvText, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

function headerMatchesRole(header, role) {
  const key = normalizeHeaderKey(header);
  const keywords = HEADER_KEYWORDS[role] || [];

  return keywords.some((keyword) => key.includes(normalizeHeaderKey(keyword)));
}

function findColumnByRole(columns, role) {
  return columns.find((column) => headerMatchesRole(column, role));
}

function findRowsByRoles(filePath, roles) {
  const workbook = readWorkbook(filePath);

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: null,
    });
    const columns = Object.keys(rows[0] || {});

    if (roles.every((role) => findColumnByRole(columns, role))) {
      return {
        sheetName,
        rows,
        columns,
      };
    }
  }

  return {
    sheetName: "",
    rows: [],
    columns: [],
  };
}

function createCategoryCounts() {
  return BUSINESS_TYPES.reduce((counts, type) => {
    counts[type] = 0;
    return counts;
  }, {});
}

function createMetricBucket() {
  return {
    total: 0,
    categoryCounts: createCategoryCounts(),
  };
}

function getMetricBucket(map, key) {
  if (!map.has(key)) {
    map.set(key, createMetricBucket());
  }

  return map.get(key);
}

function matchBusinessTypes(activity) {
  const activityKey = normalizeLookupKey(activity);

  if (!activityKey) {
    return [];
  }

  return BUSINESS_TYPES.filter((type) =>
    (CATEGORY_KEYWORDS[type] || []).some((keyword) =>
      activityKey.includes(normalizeLookupKey(keyword))
    )
  );
}

function addMetricRecord(map, key, activity, count = 1) {
  if (!key || !Number.isFinite(count) || count <= 0) {
    return;
  }

  const bucket = getMetricBucket(map, key);
  bucket.total += count;

  for (const type of matchBusinessTypes(activity)) {
    bucket.categoryCounts[type] += count;
  }
}

function addMetricBucket(target, source) {
  if (!source) {
    return;
  }

  target.total += source.total || 0;

  for (const type of BUSINESS_TYPES) {
    target.categoryCounts[type] += source.categoryCounts?.[type] || 0;
  }
}

function getEmptyBucket() {
  return createMetricBucket();
}

function getBucketByKey(map, key) {
  return map.get(key) || getEmptyBucket();
}

function makeAreaKey(governorate, wilayat) {
  return `${normalizeLookupKey(governorate)}:${normalizeLookupKey(wilayat)}`;
}

function makeGovernorateKey(governorate) {
  return normalizeLookupKey(governorate);
}

function readOfficialLocationMapping() {
  const governorateRows = readRowsWithHeaders(RAW_PATHS.locations, [
    "RegionId",
    "RegionName",
    "RegionNameEN",
  ]);
  const wilayatRows = readRowsWithHeaders(RAW_PATHS.locations, [
    "WilayatId",
    "WilayatName",
    "WilayatNameEN",
    "RegionId",
  ]);
  const governoratesById = new Map();
  const governorateAliases = new Map();
  const wilayatAliases = new Map();
  const globalWilayatAliases = new Map();

  for (const row of governorateRows) {
    const regionId = String(row.RegionId ?? "").trim();
    const governorate = cleanEnglishLocationName(row.RegionNameEN || row.RegionName);

    if (!regionId || !governorate) {
      continue;
    }

    const record = {
      id: regionId,
      governorate,
      governorate_ar: normalizeText(row.RegionName),
      governorate_en: governorate,
    };

    governoratesById.set(regionId, record);
    governorateAliases.set(normalizeLookupKey(row.RegionName), governorate);
    governorateAliases.set(normalizeLookupKey(row.RegionNameEN), governorate);
    governorateAliases.set(normalizeLookupKey(governorate), governorate);
  }

  const wilayats = [];

  for (const row of wilayatRows) {
    const regionId = String(row.RegionId ?? "").trim();
    const governorateRecord = governoratesById.get(regionId);
    const wilayat = cleanEnglishLocationName(row.WilayatNameEN || row.WilayatName);

    if (!governorateRecord || !wilayat) {
      continue;
    }

    const record = {
      area_id: slugify(`${governorateRecord.governorate}_${wilayat}`),
      area_name: wilayat,
      governorate: governorateRecord.governorate,
      governorate_ar: governorateRecord.governorate_ar,
      wilayat,
      wilayat_ar: normalizeText(row.WilayatName),
      key: makeAreaKey(governorateRecord.governorate, wilayat),
    };
    const scopedAliases = [
      row.WilayatName,
      row.WilayatNameEN,
      wilayat,
    ].map((value) => makeAreaKey(governorateRecord.governorate, value));
    const globalAliases = [row.WilayatName, row.WilayatNameEN, wilayat].map(
      normalizeLookupKey
    );

    for (const alias of scopedAliases) {
      wilayatAliases.set(alias, record);
    }

    for (const alias of globalAliases) {
      const records = globalWilayatAliases.get(alias) || new Set();
      records.add(record);
      globalWilayatAliases.set(alias, records);
    }

    wilayats.push(record);
  }

  return {
    governorateAliases,
    governoratesById,
    globalWilayatAliases,
    wilayatAliases,
    wilayats,
  };
}

function resolveGovernorate(value, mapping) {
  const key = normalizeLookupKey(value);

  return mapping.governorateAliases.get(key) || "";
}

function resolveWilayat(value, governorate, mapping) {
  const wilayatKey = normalizeLookupKey(value);

  if (!wilayatKey) {
    return null;
  }

  if (governorate) {
    const scoped = mapping.wilayatAliases.get(makeAreaKey(governorate, value));

    if (scoped) {
      return scoped;
    }
  }

  const globalMatches = mapping.globalWilayatAliases.get(wilayatKey);

  if (globalMatches?.size === 1) {
    return Array.from(globalMatches)[0];
  }

  return null;
}

async function readCoordinateFallback(mapping) {
  const coordinates = new Map();

  if (!(await fileExists(RAW_PATHS.coordinateFallback))) {
    return coordinates;
  }

  const rows = await readCsvRows(RAW_PATHS.coordinateFallback);

  for (const row of rows) {
    const rawGovernorate = row.Governate_Name_English || row.Governorate_Name_English;
    const rawWilayat = row.Wallyat_Name_English || row.Wilayat_Name_English;
    const governorate = resolveGovernorate(rawGovernorate, mapping);
    const officialWilayat =
      resolveWilayat(rawWilayat, governorate, mapping) ||
      resolveWilayat(rawWilayat, "", mapping);
    const latitude = toNumber(row.Wallyat_Latitude || row.Wilayat_Latitude);
    const longitude = toNumber(row.Wallyat_Longitude || row.Wilayat_Longitude);

    if (!officialWilayat || latitude === null || longitude === null) {
      continue;
    }

    if (!coordinates.has(officialWilayat.key)) {
      coordinates.set(officialWilayat.key, {
        latitude,
        longitude,
      });
    }
  }

  return coordinates;
}

function readStartupsByGovernorate(mapping) {
  const { rows, columns } = findRowsByRoles(RAW_PATHS.startups, [
    "activity",
    "governorate",
  ]);
  const activityColumn = findColumnByRole(columns, "activity");
  const governorateColumn = findColumnByRole(columns, "governorate");
  const startupsByGovernorate = new Map();

  for (const row of rows) {
    const governorate = resolveGovernorate(row[governorateColumn], mapping);

    if (!governorate) {
      continue;
    }

    addMetricRecord(
      startupsByGovernorate,
      makeGovernorateKey(governorate),
      row[activityColumn],
      1
    );
  }

  return startupsByGovernorate;
}

function parseYearFromSheetName(sheetName) {
  const match = String(sheetName).match(/20\d{2}/);

  return match ? Number(match[0]) : 0;
}

function readRegisteredCompaniesByGovernorate(mapping) {
  const workbook = readWorkbook(RAW_PATHS.registeredCompanies);
  const dataSheets = workbook.SheetNames.map((sheetName) => ({
    sheetName,
    year: parseYearFromSheetName(sheetName),
  }))
    .filter((sheet) => sheet.year > 0)
    .sort((first, second) => second.year - first.year);
  const latestSheetName = dataSheets[0]?.sheetName || workbook.SheetNames[0];
  const rows = readSheetAsArrays(workbook, latestSheetName);
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => headerMatchesRole(cell, "governorate"))
  );
  const businessByGovernorate = new Map();

  if (headerIndex === -1) {
    return {
      businessByGovernorate,
      latestYear: dataSheets[0]?.year || null,
    };
  }

  const headers = rows[headerIndex];
  const governorateIndex = headers.findIndex((header) =>
    headerMatchesRole(header, "governorate")
  );
  const totalIndex = headers.findIndex((header) => headerMatchesRole(header, "total"));
  const categoryIndices = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => {
      if (!header || index === governorateIndex || index === totalIndex || index === 0) {
        return false;
      }

      return !headerMatchesRole(header, "governorate");
    });

  for (const row of rows.slice(headerIndex + 1)) {
    const governorate = resolveGovernorate(row[governorateIndex], mapping);

    if (!governorate) {
      continue;
    }

    const key = makeGovernorateKey(governorate);
    const totalFromColumn = toNumber(row[totalIndex]);
    const total =
      totalFromColumn ??
      categoryIndices.reduce((sum, { index }) => sum + (toNumber(row[index]) || 0), 0);

    addMetricRecord(businessByGovernorate, key, "", total || 0);

    const bucket = getMetricBucket(businessByGovernorate, key);

    for (const { header, index } of categoryIndices) {
      const count = toNumber(row[index]) || 0;

      if (count <= 0) {
        continue;
      }

      for (const type of matchBusinessTypes(header)) {
        bucket.categoryCounts[type] += count;
      }
    }
  }

  return {
    businessByGovernorate,
    latestYear: dataSheets[0]?.year || null,
  };
}

function readWilayatActivityDataset(filePath, mapping) {
  const { rows, columns, sheetName } = findRowsByRoles(filePath, [
    "activity",
    "governorate",
    "wilayat",
  ]);
  const activityColumn = findColumnByRole(columns, "activity");
  const governorateColumn = findColumnByRole(columns, "governorate");
  const wilayatColumn = findColumnByRole(columns, "wilayat");
  const byWilayat = new Map();
  const byGovernorate = new Map();

  for (const row of rows) {
    const governorate = resolveGovernorate(row[governorateColumn], mapping);
    const officialWilayat = resolveWilayat(row[wilayatColumn], governorate, mapping);
    const activity = row[activityColumn];

    if (officialWilayat) {
      addMetricRecord(byWilayat, officialWilayat.key, activity, 1);
    } else if (!wilayatColumn && governorate) {
      addMetricRecord(byGovernorate, makeGovernorateKey(governorate), activity, 1);
    }
  }

  return {
    byGovernorate,
    byWilayat,
    sheetName,
  };
}

function cloneCounts(counts) {
  return BUSINESS_TYPES.reduce((nextCounts, type) => {
    nextCounts[type] = counts?.[type] || 0;
    return nextCounts;
  }, {});
}

function createCsvRow(feature) {
  return {
    ...feature,
    startup_category_counts: JSON.stringify(feature.startup_category_counts),
    business_category_counts: JSON.stringify(feature.business_category_counts),
    tourism_category_counts: JSON.stringify(feature.tourism_category_counts),
    craft_category_counts: JSON.stringify(feature.craft_category_counts),
  };
}

async function buildLocationFeatures() {
  await mkdir(PROCESSED_DIR, { recursive: true });

  const mapping = readOfficialLocationMapping();
  const coordinates = await readCoordinateFallback(mapping);
  const startupsByGovernorate = readStartupsByGovernorate(mapping);
  const { businessByGovernorate, latestYear } =
    readRegisteredCompaniesByGovernorate(mapping);
  const tourism = readWilayatActivityDataset(RAW_PATHS.tourism, mapping);
  const craft = readWilayatActivityDataset(RAW_PATHS.craft, mapping);

  return mapping.wilayats
    .map((area) => {
      const notes = [];
      const coordinate = coordinates.get(area.key) || {};
      // Governorate-level data used when wilayat-level data is unavailable.
      const startupBucket = getBucketByKey(
        startupsByGovernorate,
        makeGovernorateKey(area.governorate)
      );
      const businessBucket = getBucketByKey(
        businessByGovernorate,
        makeGovernorateKey(area.governorate)
      );
      const tourismBucket = createMetricBucket();
      const craftBucket = createMetricBucket();

      addMetricBucket(tourismBucket, tourism.byWilayat.get(area.key));
      addMetricBucket(
        tourismBucket,
        tourism.byGovernorate.get(makeGovernorateKey(area.governorate))
      );
      addMetricBucket(craftBucket, craft.byWilayat.get(area.key));
      addMetricBucket(
        craftBucket,
        craft.byGovernorate.get(makeGovernorateKey(area.governorate))
      );

      addNote(notes, GOVERNORATE_LEVEL_NOTE);

      if (coordinate.latitude !== undefined && coordinate.longitude !== undefined) {
        addNote(notes, COORDINATE_FALLBACK_NOTE);
      }

      if (latestYear) {
        addNote(
          notes,
          `${DATASET_SOURCES.business} uses the latest detected worksheet: ${latestYear}.`
        );
      }

      const startupCount = startupBucket.total || 0;
      const businessCount = businessBucket.total || 0;
      const tourismCount = tourismBucket.total || 0;
      const craftCount = craftBucket.total || 0;

      return {
        area_id: area.area_id,
        area_name: area.area_name,
        governorate: area.governorate,
        governorate_ar: area.governorate_ar,
        wilayat: area.wilayat,
        wilayat_ar: area.wilayat_ar,
        latitude: coordinate.latitude ?? null,
        longitude: coordinate.longitude ?? null,
        startup_count: startupCount,
        business_activity_count: businessCount,
        tourism_activity_count: tourismCount,
        craft_activity_count: craftCount,
        startup_category_counts: cloneCounts(startupBucket.categoryCounts),
        business_category_counts: cloneCounts(businessBucket.categoryCounts),
        tourism_category_counts: cloneCounts(tourismBucket.categoryCounts),
        craft_category_counts: cloneCounts(craftBucket.categoryCounts),
        startups_count: startupCount,
        total_businesses: businessCount,
        population: null,
        workforce: null,
        business_competitors: 0,
        cafe_competitors: 0,
        restaurant_competitors: 0,
        bakery_competitors: 0,
        abaya_competitors: 0,
        clothes_competitors: 0,
        perfume_competitors: 0,
        salon_competitors: 0,
        grocery_competitors: 0,
        flower_competitors: 0,
        pharmacy_competitors: 0,
        bank_competitors: 0,
        electronics_competitors: 0,
        complementary_pois: tourismCount + craftCount,
        data_source_notes: notes.join(" "),
      };
    })
    .sort((first, second) => {
      const governorateCompare = first.governorate.localeCompare(second.governorate);

      if (governorateCompare !== 0) {
        return governorateCompare;
      }

      return first.wilayat.localeCompare(second.wilayat);
    });
}

async function main() {
  const features = await buildLocationFeatures();
  const jsonPath = path.join(PROCESSED_DIR, "location_features.json");
  const csvPath = path.join(PROCESSED_DIR, "location_features.csv");

  await writeFile(jsonPath, `${JSON.stringify(features, null, 2)}\n`, "utf8");
  await writeFile(
    csvPath,
    stringify(features.map(createCsvRow), {
      header: true,
      columns: OUTPUT_COLUMNS,
    }),
    "utf8"
  );

  console.log(`Built ${features.length} official open-data location feature rows.`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`CSV: ${csvPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
