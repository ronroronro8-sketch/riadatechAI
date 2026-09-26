# Chat Feasibility Study V1

Implemented inside the existing authenticated `/api/smart-assistant` stream. No new page, route for studies, frontend state, authentication changes, model changes or ingestion changes.

## State and ownership

`FeasibilityStudy` stores one study per authenticated user and conversation, with a unique index, revision, request ID, message sequence, original inputs, provenance, classifications, cached tool results and source metadata. The service checks the conversation's owner, active status and unexpired turn lease. It reads the saved user message itself; frontend study contexts are never accepted. Repeated request IDs reuse the study revision; optimistic updates reject stale turns. Existing completed-message replay remains unchanged.

Current inputs update existing study facts. On first use, recent saved user messages and this conversation's business memory supply missing facts. Assistant statements and memory belonging to other conversations are excluded. Switching the project clears previous financial inputs instead of silently mixing projects. Refresh and login resume through the existing conversation; studies have no unprotected read endpoint.

## Context and calculations

`FEASIBILITY_STUDY_CONTEXT` is a separate request block alongside existing history, memory, saved Smart Map, structured data, map data, RAG and calculation blocks. It carries compact inputs, explicit assumptions, missing basics/currencies, source classifications and presentation guidance. Source data is never treated as instructions.

The existing six calculation tools perform all supported calculations. A small deterministic composition derives monthly scenario revenue only when average ticket, daily customer/order volume and operating days are supplied. It assumes one paid average ticket per supplied customer/order and explicitly states this limitation. No default operating days, costs or sales are inserted. Budget never becomes investment; rent never becomes total costs. Dependencies fingerprint each tool result; unrelated budget changes reuse prior results. Missing or invalid inputs remain explicit. ROI is labelled monthly, non-annualized; ROAS requires advertising-attributed revenue and corresponding spend.

Source services remain read-only. Structured retrieval is limited to matching wilayat commercial-registration groups and is explicitly **not activity-specific competition or demand**. Map figures remain estimates with incomplete coverage. RAG retrieves existing official excerpts without ingestion. Contexts are bounded (structured/map 7 KB each, RAG 14 KB). Cited sources extend the existing `done.sources` field and are saved/replayed using the existing source metadata mechanism. Sources retrieved but not cited are retained on the study, not claimed as used in the answer.

## Executed example (2026-09-26)

`node postITapp/server/scripts/verifyFeasibilityStudy.js` created an isolated MongoDB study using real read-only source services. It did **not** call Gemini or write to the configured application database. Its report is `/tmp/riadatech-feasibility-real-example.json` (temporary local artifact).

1. “أريد دراسة جدوى لمقهى في صحار وميزانيتي 15000 ريال”. No missing basic fields.
2. Explicit scenario: average ticket OMR 3.5, variable unit cost OMR 1, monthly fixed costs OMR 1,200, 80 customers/day, 25 operating days/month, supplied total monthly costs OMR 5,000. Deterministic revenue: OMR 7,000/month; profit: OMR 2,000/month; break-even: 480 units/month. These are scenario results, not market forecasts.
3. “غير الميزانية إلى 20000 ريال”. Same study ID; budget updated; zero tools recomputed; profit remains OMR 2,000/month.

Actual evidence retrieved:
- Commercial-registration records for Sohar, 2026 Q1, Ministry of Commerce, Industry and Investment Promotion / Oman Business Platform, published May 2026. Eight matching source rows, **not eight businesses**.
- Existing Smart Map: 11 mapped OSM competitor candidates, observation date unknown and coverage incomplete; existing location score 12/100, an estimate, not probability of success.
- Gov.om RAG: commercial registration for a one-person company and a limited-liability company. These are alternative legal-form services, not a complete café licensing checklist.
- Conversation persistence and existing financial tools were exercised. This example had no prior Business Memory or saved personal Smart Map analysis to consume; those contexts remain available through their existing services.

## Files

Added:
- `Models/FeasibilityStudy.js`
- `services/feasibility/inputs.js`
- `services/feasibility/calculations.js`
- `services/feasibility/service.js`
- `tests/feasibility.test.js`
- `scripts/verifyFeasibilityStudy.js`
- `CHAT_FEASIBILITY.md`

Modified:
- `index.js` — inject service; legacy stateless chat directs study requests to authenticated saved chat.
- `utils/buildSmartAssistantRequest.js` — optional separate context block.
- `utils/smartAssistantStream.js` — prepare study and reuse targeted evidence/results; preserve delta/done/error protocol.

## V1 limits

Conservative labelled-input extraction supports common Arabic/English phrasing and known wilayat aliases. Ambiguous numbers, unspecified currency, unsupported activities/phrasing and missing periods require clarification; no LLM extraction or automatic exchange rates. One study per conversation, up to 40 prior user messages scanned at initialization. Same-conversation memory only, to prevent cross-project contamination. No scenario branching, licensing completeness guarantee or financial forecast. The legacy stateless endpoint cannot persist studies. Narrative correctness with a live Gemini call was not evaluated; automated streaming tests use a controlled upstream.

## Validation

- Backend: **80/80 passed**, including eight feasibility tests plus existing Smart Map, ownership, memory, ingestion, calculation and stream regressions.
- Frontend: **28/28 passed**; production build compiled successfully.
- SHA-256 comparison: **21 protected files unchanged**, including all 14 raw/processed files, System Prompt, Business Memory service, calculation implementations, Smart Map service and ingestion extractors.
