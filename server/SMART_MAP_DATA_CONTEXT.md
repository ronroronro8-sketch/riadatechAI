# Smart Map Data Context — read-only consumer

Implemented on 2026-09-26. No file in `data/raw/` or `data/processed/` was modified, moved, regenerated or imported into MongoDB. All 14 SHA-256 hashes match the initial snapshot. No map path, build pipeline, model, generation settings, system prompt or UI was changed.

## Inventory and decisions

The adjacent `SMART_MAP_DATA_INVENTORY.json` inventories every file, every workbook sheet, headers, nonempty row counts, metadata and SHA-256 hashes. Row counts in that inventory include headings/totals where present. Blank workbook sheets are empty/chart-only, not missing observations converted to zero.

| Files | Structure / period / provenance | Current map usage | New assistant usage |
|---|---|---|---|
| `processed/location_features.json`, `location_features.csv` | 63 wilayat feature rows; Arabic/English geography, coordinates, category buckets, counts and notes. CSV is a reduced export of the same features. Derived from raw workbooks; processed observation/build timestamp unavailable. | JSON consumed by recommendations, alternatives and data-source audit. CSV is a pipeline output, not runtime input. | Existing recommendation loader provides only bounded score/context. Raw counts, null population/workforce, fabricated zero competitor placeholders and misleading complementary-POI count withheld. |
| `processed/osm_pois_sohar.json`, `osm_pois_sohar.csv` | 142 POIs: name, category, coordinates, OSM type/id, source OpenStreetMap. No observation/extraction date in files. | JSON used for competitors/alternatives; CSV is another representation. | Sohar-only category filtering through existing competitor resolver. At most three examples, mapped feature count, proxy/incomplete-coverage labels. No official market totals or inferred absence. |
| `raw/oman_locations.csv` | 7,172 village rows; Arabic/English governorate/wilayat/village names and coordinates. Publisher and observation date not recorded in file. | Alternative candidates and coordinate fallback. | Wilayat-filtered geography, maximum four village examples. Repeated wilayat coordinates are not treated as precise premises. |
| `raw/population.xlsx` | Four data sheets + four empty/chart sheets. Nationality/gender 2023–2025; age bands and governorates 2025. Publisher/methodology missing. | Not read by current build/runtime; processed population is null. | National total/nationality/gender or governorate annual observations, exact source cell, person unit, year. No wilayat estimates. Age-band questions request clarification rather than substitute a total. |
| `raw/labour_market.xlsx` | Four data sheets + four empty/chart sheets. National unemployment/workers 2021–2025; employment 2019–2023; regional unemployment 2021–2025. Publisher/methodology missing. | Not read by current build/runtime. | Annual national gender/total and regional unemployment lookup. Workers = persons; rate percent interpretation explicitly labeled. Unsupported regional workers/employment requests return insufficient data. |
| `raw/Startups Data in the Sultanate of Oman.xlsx`, `startups.xlsx` | Byte-identical copies: 260 rows, project activity + governorate, metadata/dictionary. SME Authority, Planning & Studies; coverage 2022–2026; publication Q1 2026. | Named English workbook feeds feature build; alias unused. Governorate-level values repeated across wilayats. | Existing derived score only, never another official startup count. Structured Oman Data has newer Q2 publication with 330 rows. |
| `raw/Tourism Activities Establishments Data in the Sultanate of Oman.xlsx` | 5,336 activity/governorate/wilayat observations + metadata/dictionary. SME Authority, coverage 2022–2026, publication Q1 2026. | Feature build. | Existing score only. Newer Structured Oman Data snapshot has 5,681 rows; no combining snapshots. |
| `raw/Craft Enterprises Data in the Sultanate of Oman.xlsx` | 11,559 activity/governorate/wilayat observations + metadata/dictionary. SME Authority, coverage 2022–2026, publication Q1 2026. | Feature build. | Existing score only; not mixed with women's enterprise subsets in Structured Oman Data. |
| `raw/Registered Companies - Category and Governorate.xlsx` | Six year sheets, 2020–2025: procurement categories by governorate with total rows. Projects, Tenders and Local Content Authority / Esnad. Published 2026-04-01. Metadata coverage says 2020–2023 but sheets extend to 2025. | Builder selects 2025; governorate proxy repeated across wilayats. | Source lineage for derived scores, not the universe of commercial registrations. Never combined with the commercial-registry dataset. |
| `raw/The names of the governorates in the Sultanate of Oman and the wilayats under each governorate.xlsx` | 11 governorates, 63 wilayats, RegionId links; Ministry of Interior; coverage 2021–2025, publication October 2025; metadata/dictionary. | Build joins and Arabic/English names. | Reuse names already in processed features; no duplicate location import. |
| `raw/google_places.csv` | 15,203 rows with business/contact/category/rating/opening fields; mixed countries, only seven labeled Oman. Publisher/extraction date unverified. | No references in current map code/build. | Excluded: unverified provenance, mixed geographic scope and insufficient Oman coverage. No merging with OSM or exposing contact fields. |

There are no rent datasets in these two directories. Existing `data/rentalSeedData.js` is reused for at most three clearly labeled synthetic examples. It is not a real listing feed, a rent average, category suitability or availability evidence. There is no new rental data copy or database query.

## Data quality and conflicts

Population governorate figures sum to 6,775,959 for 2025, but the same workbook's national total is 5,361,118. Retrieved population values carry `source_inconsistency`; no attempt was made to repair source files or invent an authoritative reconciliation. Unknown publishers remain null. Workbook filesystem timestamps are never presented as observation dates.

The new context is `[SMART_MAP_DATA_CONTEXT]`, distinct from the saved owner-scoped `[SMART_MAP_CONTEXT]`, system instruction, business memory, history, structured official data and calculation tools. Retrieval consumes only the current message and fixed server loaders, never client-supplied context or another user's saved analysis.

Official count overlap is prevented by withholding the processed startup/business/tourism/craft counts. Scores remain estimates with current upstream metadata and the absence of a processed build date stated explicitly. For official statistics, the context requires the matching official definition/geography/period and newer appropriate publication. It prohibits summing, averaging or treating different definitions/snapshots as one fact. This is context grounding, not a post-generation factual verification engine.

Queries resolve one explicit governorate/wilayat or national Oman scope and known activity terms. Ambiguous/missing places, unavailable annual periods, finer geographic scope and radius-specific OSM questions return explicit limitations. No default city, budget, coordinates or current year is invented. Multi-location comparison and age-band selection are intentionally not inferred. Full datasets never enter the Gemini request; the final JSON has an 11,000-character cap and removes whole facts when necessary.

## Integration and tests

Added:
- `services/smartMapDataService.js`
- `services/smartMapDataService.test.js`
- `scripts/auditSmartMapData.js` (read-only source audit, outputs outside protected directories)
- `SMART_MAP_DATA_INVENTORY.json`
- `SMART_MAP_DATA_CONTEXT.md`

Modified:
- `index.js`: inject existing read-only map loaders; attach new context to legacy and streaming assistant requests.
- `utils/buildSmartAssistantRequest.js`: append independent context block; original system prompt unchanged.
- `utils/smartAssistantStream.js`: retrieve optional new context before generation; original streaming transport/model unchanged.
- `utils/smartAssistantStream.test.js`: server-origin context, client forgery rejection and unchanged streamed response.
- `utils/smartAssistantRoutes.test.js`: real recommendation, competitor, alternative and rental route outputs identical before/after assistant reads.

Validation: 66/66 server tests and 27/27 client tests passed, including current Smart Map ownership/context and UI tests. All 14 protected source files match their pre-task hashes. Neither Structured Oman Data schema, importer nor collections were changed.
