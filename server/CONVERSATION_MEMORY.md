# Conversation Memory — phase 2B

Conversation ownership comes exclusively from the authenticated server session. The browser sends credentials and `X-RiadaTech-Request: 1` for writes. Client `userId`, `history`, `contents`, and system prompt overrides are not used.

## API

All routes below require the existing Mongo-backed session. Unknown, deleted, or foreign conversations return 404; no session returns 401. Storage failures return a generic error without database details.

| Method | Route | Body / query |
| --- | --- | --- |
| POST | `/api/conversations` | Optional `{ title }`; returns `{ conversation }` (201) |
| GET | `/api/conversations` | `status=active` or `archived`, optional `cursor`, `limit` (max 100); returns `{ conversations, nextCursor }` |
| GET | `/api/conversations/:id` | Optional `after` sequence and `limit` (max 100); returns `{ conversation, messages, nextAfter }` |
| PATCH | `/api/conversations/:id` | `{ title }` and/or `{ status: "active" | "archived" | "deleted" }` |
| POST | `/api/conversations/:id/archive` | Archives conversation |
| DELETE | `/api/conversations/:id` | Soft deletes conversation (204), retains stored messages |
| POST | `/api/smart-assistant` | `{ message, conversationId, requestId }`; existing NDJSON delta/done/error protocol |

The legacy `/api/chat` endpoint stays stateless. It rejects conversation/request IDs so it cannot silently bypass conversation persistence.

## Storage and context

`Conversation` stores owner, title, optional business ID, lifecycle timestamps, status, reserved summary fields, sequence counter and a short-lived generation lease. `ConversationMessage` stores ordered user/assistant messages, request ID, response status, timestamps, reserved contextRefs/metadata, and generation metadata. Unique compound indexes protect both sequence and `(conversationId, requestId, role)`.

Only the last **eight completed user/assistant pairs** preceding the current question go to Gemini. Failed, interrupted, pending, streaming and unpaired turns are excluded. The current question appears once, at the end. Stored assistant roles become Gemini `model` roles. The existing server `systemInstruction` stays separate. Summary and RAG are not implemented. Smart Map snapshots are described below. Business Memory V1 is supplied as a separate, labelled context entry before conversation history, never inside systemInstruction.

## Streaming and retry

The server claims an atomic per-conversation lease, reserves two sequence numbers, saves the user message and creates the streaming assistant record before contacting Gemini. Concurrent sends return 409. The response text is accumulated in server memory, with no MongoDB write per delta. `done` is emitted only after the complete response has been saved. Failed or disconnected attempts save available partial text as failed/interrupted; partial replies never enter model history.

Retrying an identical completed request ID replays its saved reply without calling Gemini. Retrying the latest interrupted/failed request reuses the same two records and replaces partial assistant text. Reusing the ID for different text, or retrying an unfinished old turn after newer turns, returns 409. Edits/archive/delete while a turn is running return 409.

Generation has a 180-second transport deadline, below the five-minute lease. A later read/send/edit recovers expired leases, marking abandoned responses interrupted. Attempt tokens prevent old writers from overwriting newer retries. A process crash or database outage can lose partial text still only in RAM; surviving records are recovered by lease expiry. This is not resumable streaming. No transactions or replica-set-only features are required.

## Frontend restoration

The page creates a conversation on first send and places its ID in the URL as `conversationId`. Revisiting/refreshing that URL fetches paginated messages from the server after authentication is restored. Messages are not authoritative in localStorage. Signing out clears displayed private messages. Latest unfinished questions retain their request ID for retry. A refresh during an active generation may briefly show an unfinished response; retry returns 409 while the previous lease remains active. The page has no sidebar or new visual layout; users can return through the conversation URL, and the list API supports a later sidebar.

## Validation

Run `npm test` in `server`; Mongo integration tests start a disposable local database and use mocked Gemini responses, never the configured project database. Run `npm test -- --run` and `npm run build` in `client`. The tests cover sessions/ownership, restoration, lifecycle operations, history limits/order, prompt isolation, deduplication, retry/lease recovery, interrupted text, and save-before-done.

## Business Memory V1

`BusinessMemory` stores one current value per `(userId, key)` with timestamps and source conversation/message IDs. Only owned, persisted user messages can supply facts. A conservative Arabic declaration parser recognizes project idea, location, budget, rent, capital, staff, audience, item prices/costs, goals and constraints. It preserves literal values and units, rejects uncertain/quoted/hypothetical input, and makes no additional model calls. Unrecognized phrasing is intentionally not saved; this is not general semantic extraction.

Newer explicit declarations replace older values. Source timestamps/ObjectIds prevent a retry of an older message from reverting newer memory. The server loads all core facts plus up to 91 recent item facts, ignores frontend memory fields, and exposes no memory mutation/read endpoint. Memory represents user statements, not independently verified facts or instructions. V1 assumes one project profile per user; it does not distinguish multiple businesses. Soft-deleting a conversation does not erase its separately stored Business Memory.

## Smart Map Integration V1

Authenticated map runs now save a server-recomputed snapshot automatically, without changing the map layout. `/api/map-analysis/save` accepts project `inputs`; client analysis results, user IDs and provenance are ignored. It reuses the current location recommendation/competitor/alternative/rental loaders, not the old Google Places mock fallback. `/api/map-analysis/analyze` previews the same server pipeline. Both require a session and the write header. `GET /api/map-analysis` lists the owner's latest 30 verified snapshots; `GET /api/map-analysis/:id` returns a bounded snapshot only to its owner.

Smart Assistant uses the latest verified snapshot belonging to the session user. An optional `mapAnalysisId` selects another owned snapshot; an invalid/foreign ID returns 404 before Gemini. No analysis produces no context entry. Old ownerless records and rows without server provenance are excluded; no ownership is guessed or migrated. Rerun the map to create a usable snapshot.

`SMART_MAP_CONTEXT` is a separate contents entry, after Business Memory and before conversation history. It includes actual inputs, selected location, calculated score and original score component names, up to five competitors, three alternatives and three rental suggestions, with source notes, quality, units and generation time. Counts are kept separately from the truncated lists. Stored numbers are never rounded/converted. Input budget/rent limits are distinguished from market rents; seeded rentals remain explicitly prototype data; calculated scores are not success probabilities. Generation time is not a source freshness date. No large map/POI dataset, client-supplied context, summary, RAG or tool execution is sent to Gemini.

This is a latest-analysis default, not automatic project matching. Project name/type/location accompany the context so the assistant can identify mismatches. Assistant records retain the selected analysis ID in contextRefs. The optional ID supports future selection UI without introducing it now.
