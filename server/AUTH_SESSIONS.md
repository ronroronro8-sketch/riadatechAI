# Authentication sessions (phase 2A)

The existing users and bcrypt hashes are unchanged. The application uses
`express-session` with `connect-mongo`, sharing the Mongoose MongoDB client and
database. Only the `sessions` collection is new; it has an expiry index. There is
no MemoryStore fallback and no conversation storage in this phase.

## Configuration

- `MONGO_URI`: existing database connection; authentication returns 503 if it is unavailable.
- `SESSION_SECRET`: persistent random secret, at least 32 bytes. Provision it through
  the environment/secret manager and keep the same value across backend instances
  and restarts. No hardcoded or process-random fallback. Changing it invalidates cookies.
- `NODE_ENV=production`: enables Secure cookies and the `__Host-riadatach.sid` name.
  Production requires HTTPS. Development uses `riadatach.sid` over local HTTP.
- `SESSION_COOKIE_SAME_SITE`: defaults to `lax`. Use `none` only for genuinely
  cross-site HTTPS deployments. Browser third-party-cookie policies can still
  block that configuration; a same-site API/reverse proxy is preferable.
- `CLIENT_URL`: comma-separated exact frontend origins for cross-origin requests.
  Development also allows `http://localhost:3000` and `http://127.0.0.1:3000`.
- `TRUST_PROXY_HOPS`: set only when behind a known reverse proxy, to its exact
  trusted hop count, so Express can recognize HTTPS. Unset for direct connections.

Cookies are HttpOnly, host-only, path `/`, with a rolling seven-day lifetime.
Use the same hostname for frontend and API in development (do not mix localhost
and 127.0.0.1). Configure allowed origins and HTTPS before production rollout.
Session-store errors are returned as generic failures without credentials.

## API and compatibility

- POST `/api/auth/login` and POST `/api/auth/register` save a regenerated session
  before returning success. Registration retains automatic sign-in.
- GET `/api/auth/me` returns a public user allowlist, or 401 without a valid session.
  The authenticated identity comes only from the session and current user record.
- POST `/api/auth/logout` destroys the stored session and clears the cookie.
- Existing `/login`, `/registerUser`, `/logout` aliases use the same handlers.
- Auth writes require `X-RiadaTech-Request: 1`. Origin checking plus the custom
  header protects browser writes against CSRF; CORS uses explicit origins and
  credentials. The supplied frontend sends the header and credentials automatically.
- Existing API clients using auth aliases must send the header and retain cookies.
- Old localStorage login records are no longer authentication. Existing users
  must sign in once after rollout; passwords and accounts need no migration.
- Redux waits for `/me` after refresh. A failed logout is not reported as success;
  the account menu remains signed in so the user can retry.
- Smart Assistant endpoints and generation settings remain unchanged. Future
  protected features must install the session middleware and `requireAuth`.

## Tests

Run `npm test` in `server`. Auth integration tests start a real disposable local
MongoDB through `mongodb-memory-server`, use real bcrypt, and never read the
project's MongoDB URI. The first run downloads the MongoDB test binary to the OS
temporary directory. Other assistant tests use mocked Gemini responses only.
Node 24 is the tested development runtime.

On this machine bcrypt 5.1.1 needed a native rebuild with the installed macOS
15.4 SDK because the downloaded binary was rejected and the default SDK/linker
combination failed. This changes only the local native dependency build, not
the bcrypt format or stored passwords.
