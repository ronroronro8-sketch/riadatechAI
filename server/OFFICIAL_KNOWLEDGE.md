# RiadaTech Oman Official Knowledge RAG V1

## Operate

From `postITapp/server`:

```sh
npm run ingest:official-knowledge
npm run verify:official-knowledge
```

Uses existing `MONGO_URI` and optional existing `DNS_SERVERS` from server `.env`. No new secret or environment variable is required. Ingestion is local administrator CLI only; there is no ingestion HTTP endpoint. Edit the reviewed list in `services/officialKnowledge/sources.js` to add narrowly scoped public HTML pages. No website crawl, external vector DB, embeddings or paid retrieval service is used.

A Mongo lock prevents concurrent imports. On a killed process, confirm no ingestion is running before an administrator removes the `ingest` document in `officialknowledgelocks`. Errors are reported in `OFFICIAL_KNOWLEDGE_REPORT.json`; exit 2 means per-source failures, exit 1 means a fatal error.

## Storage and retrieval

Separate `officialknowledgedocuments`, `officialknowledgechunks`, `officialknowledgelocks` collections. No Structured Oman Data collections were imported or modified. Documents store canonical/requested URL, authority/domain, actual title, language/topics, selected raw visible text, cleaned text, content hash, version, last verified retrieval date, and separately the official published/updated dates and their original strings. Absent official dates stay null.

HTML is parsed with `parse5` (already used by the client dependency tree; now an explicit server dependency). It never executes JavaScript. Navigation, forms, scripts, footers and repetitive UI text are removed; email addresses are omitted. Only reviewed HTTPS hosts are accepted, including the public `tms.taxoman.gov.om` portal. Every redirect and canonical URL is validated. Login URLs, other domains, credentials, nonstandard ports, non-HTML responses, oversized responses and excessive redirects fail closed. Requests carry no session cookies or credentials. No links are recursively fetched.

Chunks follow headings, paragraphs and sentence/word boundaries. Short requirements such as a single document name are retained. Arabic source text is kept intact; normalization/stemming is applied only to search tokens. Chunk IDs are stable by canonical document/version/ordinal, and original source lineage remains attached for future hybrid/vector retrieval.

Unchanged pages update verification time without adding chunks. Changed pages write an immutable chunk version, then atomically switch the document's active version. Old versions are retained for audit and excluded from retrieval. Removing a curated URL retires the document; failed refreshes make prior evidence unavailable until verification succeeds. Documents not verified in 90 days are withheld. That policy does not assert that a retrieved page is legally current; official update dates and remaining uncertainty stay visible.

Retrieval classifies government-procedure intent, then ranks a bounded set of active topic-matched chunks with Arabic/English lexical overlap, heading match, source preference and official recency. At most five chunks, three per source and 10,500 serialized chunk characters are selected, with a relevance cutoff to avoid filling the context with weak matches. Statistics and business calculations stay with the existing services. This can be upgraded by replacing ranking without changing document lineage.

## Assistant/API contract

`OMAN_OFFICIAL_KNOWLEDGE_CONTEXT` is a separate data message. It is never accepted from the frontend. Source text is explicitly untrusted as instructions. Rules require citations, source-supported requirements/fees/deadlines only, distinct business advice, appropriate scope and explicit insufficient evidence instead of guessing. Tax registration without a specified tax type still needs scope clarification. Licensing material for Madayn must not be generalized to all localities or business categories. This is grounded retrieval plus instructions, not a post-generation legal/factual validation engine.

Gemini remains `gemini-3.5-flash-lite` on `v1beta`; model configuration, thinking, delta parsing, stream event types, timing of forwarded deltas, UI and the system prompt are unchanged.

- Each retrieved source receives an ID such as `K1`; the assistant is instructed to cite `[K1]` and the source URL.
- The existing NDJSON `done` event gains optional `sources` when government knowledge was requested. No new event type is added, so the existing client parser continues unchanged.
- Non-streaming `/api/chat` gains optional `sources` beside `reply`.
- `sources` contains only the sources whose IDs or exact URLs appeared in the final answer, not every retrieved candidate. No citation means an empty array. Citation detection indicates an emitted reference, not proof of entailment.
- Source fields: `id`, `title`, `url`, `authority`, `domain`, `updatedAt`, `publishedAt`, `retrievedAt`. `updatedAt` is the official date, not ingestion time.
- Citation metadata is saved under `ConversationMessage.metadata.officialKnowledgeSources`, returned with owner-scoped history and preserved on replay. Existing conversation authorization and business memory are unchanged.

## Verified deployment

2026-09-26: 14 active official pages and 87 active chunks. Domains: `gov.om`, `tms.taxoman.gov.om`, `www.sme.gov.om`. No failed sources. Gov.om covers the Ministry of Commerce services, so a second tejarah copy was unnecessary. The initial `starting-a-business` page proved to be a directory, was retired, and was replaced with the detailed limited-liability company registration service.

A final real reimport marked all 14 pages `unchanged`. Stored chunks remained 179 before and after (87 active; the remainder are isolated prior versions/retired content from extraction refinement). No old revision participates in retrieval. The attached report records exact URLs and the four successful retrieval probes:

- Starting a business → one-person company and limited-liability company registration, with scope clarification required.
- Tax registration → Gov.om income-tax registration and VAT registration; income-tax portal evidence where relevant.
- VAT requirements → Gov.om documents, conditions and registration description.
- Entrepreneurship card → Gov.om card service and SME Authority card service.

These are live database retrieval checks, not paid Gemini answer-quality benchmarks.

All backend tests: **72/72**. All frontend tests: **28/28**, including acceptance of optional sources in `done`. Tests cover Unicode, page parsing, domain/redirect restrictions, unchanged import, version update, stale/failed refresh, citations, injection isolation, client-forged context rejection, persistence/replay/ownership and streaming. Existing Smart Map regression tests passed. All 14 raw/processed files, the system prompt, location scoring and Business Memory service match their pre-task hashes.

## Files

Added:
- `Models/OfficialKnowledge.js`
- `services/officialKnowledge/sources.js`
- `services/officialKnowledge/extract.js`
- `services/officialKnowledge/retrieval.js`
- `services/officialKnowledge/service.js`
- `services/officialKnowledge/officialKnowledge.test.js`
- `scripts/ingestOfficialKnowledge.js`
- `OFFICIAL_KNOWLEDGE.md`
- `OFFICIAL_KNOWLEDGE_REPORT.json`

Modified:
- `index.js`
- `utils/buildSmartAssistantRequest.js`
- `utils/smartAssistantStream.js`
- `services/conversationService.js` (optional citation metadata only)
- `utils/smartAssistantStream.test.js`
- `tests/conversations.test.js`
- `../client/Tests/SmartAssistant.test.jsx` (test only; no UI code change)
- `package.json`
- `package-lock.json`

## Focused coverage expansion — 2026-09-26

Expanded the existing curated import from **14 pages / 87 active chunks** to
**35 pages / 175 active chunks**, with no failed imports. Stored historical chunks
remain separate from active evidence. No crawler or new retrieval infrastructure
was added; only explicitly reviewed service URLs are ingested.

New coverage includes individual-trader and partnership registration, street
vendors, commercial ownership transfer and amendment, representation offices,
e-commerce licenses for companies and freelancers, scoped municipal vehicle and
advertising permits, startup cards and card renewal, incubation, training,
consulting, craft support, franchising and marketing. Tejarah's company-registration
roadmap supplies the general Oman Business Platform steps. The Tax Authority's
registration explanation distinguishes income tax, VAT and excise registration.
Municipal examples retain their actual governorate/service scope; they do not
establish a nationwide permit fee.

Colloquial Arabic permits, licenses, shop/business setup and cost questions now
match the existing topics, with small lexical synonym expansion. Broad setup
retrieval keeps a general roadmap and, for cost questions, a scoped official fee
excerpt rather than allowing repeated service titles or specialized Madayn fees
to crowd them out. Specific tax registration does not match commercial registration
merely because Arabic “أسجل” contains “سجل”.

Only the official-knowledge context instructions in the request builder changed:
provide useful supported facts first, published service-specific fees next, and
one necessary clarification last. Government fees cannot be estimated. The
system prompt, Gemini model, streaming protocol and other context systems are
unchanged. Official dates remain distinct from verification timestamps.

Validation: 9 focused tests in `services/officialKnowledge/officialKnowledge.test.js`
and `utils/buildSmartAssistantRequest.test.js`; four real Mongo retrieval probes;
live API/Gemini answer checks recorded in `OFFICIAL_KNOWLEDGE_REPORT.json`.
No full backend suite or benchmark was run for this expansion.
