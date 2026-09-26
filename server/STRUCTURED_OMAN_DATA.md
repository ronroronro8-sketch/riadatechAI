# Structured Oman Data V1

Run from `postITapp/server`:

- `node scripts/importOmanData.js --inspect`: inspect all XLSX sheets / UTF-8 CSV files without database writes.
- `node scripts/importOmanData.js`: import into configured MONGO_URI and write `data/oman-data-import-report.json`.
- `POST /api/internal/oman-data/reimport`: same fixed-directory importer. Requires `Authorization: Bearer <OMAN_DATA_IMPORT_TOKEN>`. Configure a separate random secret of at least 32 characters on the server; never expose it in client code. Disabled when absent. Request bodies cannot select paths or databases.

Official records are global public source data, not user-owned records. No public mutation/query endpoint was added. Existing assistant session and conversation ownership protections remain in place.

`StructuredOmanRecord` stores all dataset types, original labeled cells, normalized dimensions, numeric projections, source row/sheet, source files, publisher, coverage/publication evidence and first import time. Numeric strings are projected separately; original values remain unchanged. Missing values are never converted to zero. Metadata and dictionaries are classified from content rather than filenames. The active catalog keeps original metadata; dictionaries are excluded from observation rows. Unknown tables are reported for mapping, never guessed.

Identity hashes content and metadata, not filenames. Exact duplicate workbooks share a dataset and list all source filenames. Repeated identical rows within a source remain separate observations. Changed data makes a new immutable revision. An atomic active catalog selects fully written revisions; unsuccessful imports leave the previous catalog visible. Old revisions remain for audit and are excluded from queries. A database-wide import lock rejects concurrent imports. If the process is killed, an operator must confirm no importer is running before removing the `import-lock` state document. No automatic lock expiry allows an old writer to publish concurrently.

`createOmanDataService().query(filters)` supports governorate, wilayat, activity, domain, legalForm, datasetType, datasetId, coverage period, and row-provided year/quarter. English/Arabic location aliases come from the geography workbook and RegionId joins. Filters use exact normalized strings, not arbitrary Mongo operators. Aggregates remain separated by dataset, sheet and period. Source totals are retained but excluded from aggregates. Only documented count measures are summed; a missing/non-numeric measure makes the complete sum unavailable, with any known partial sum labeled. Row counts describe source rows, not distinct establishments or people. Never sum overlapping datasets (notably the women's subsets).

Assistant retrieval uses deterministic dataset keywords and known dimension values, not textual RAG or Gemini selection. Ambiguous/unrecognized dataset requests request clarification. Only up to four source groups and two example rows per group reach Gemini, with a 12,000-character cap. Explicit periods must match coverage: 2022–2026 cannot answer an annual 2026 question. Unknown filters and rankings must be clarified; sample rows cannot answer full rankings. The separate context instructs citation of source and coverage for every number, and explicit uncertainty when unavailable. This is contextual grounding, not a post-generation factual verification engine.

The supplied English “Our Entrepreneurs…” file is tourism data according to its metadata and headers. The two home-license files are identical. News data includes 11 governorates plus one source total. SME publication quarter is not used as the observation quarter; coverage is 2022–2026. Source filenames, dates and conflicting descriptive statements remain visible in the import report.

## Delivered files and verification

Added:
- `Models/StructuredOmanData.js`
- `services/omanData/importer.js`
- `services/omanData/service.js`
- `services/omanData/omanData.test.js`
- `routes/omanData.js`
- `scripts/importOmanData.js`
- `STRUCTURED_OMAN_DATA.md`
- `data/oman-data-import-report.json`
- `data/oman-data-verification.json`

Modified:
- `index.js`
- `utils/buildSmartAssistantRequest.js`
- `utils/smartAssistantStream.js`
- `utils/smartAssistantRoutes.test.js`
- `utils/smartAssistantStream.test.js`

Verified on 2026-09-26: server 58/58; client 27/27. Two successful imports into configured MongoDB left 64,945 active and total stored records. SHA-256 comparison confirmed all 11 original files unchanged. A Muscat commercial-registration query for 2026-Q1 matched 48 source rows; its complete count sum was 4,270 with source/period preserved. The assistant context for that query contained 2,713 characters. Source totals remain stored but excluded from aggregate queries.
