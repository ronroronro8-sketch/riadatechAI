import session from "express-session";
import MongoStore from "connect-mongo";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function getSessionCookie(env = process.env) {
  const production = env.NODE_ENV === "production";
  const sameSite = env.SESSION_COOKIE_SAME_SITE || "lax";
  if (!["lax", "strict", "none"].includes(sameSite) || (sameSite === "none" && !production)) {
    throw new Error("Invalid session cookie configuration.");
  }
  return {
    name: production ? "__Host-riadatach.sid" : "riadatach.sid",
    options: { httpOnly: true, secure: production, sameSite, path: "/", maxAge: SESSION_DURATION_MS },
  };
}

// Lazy initialization keeps importing the application free of database work.
// An unavailable database/configuration fails closed; never fall back to MemoryStore.
export function createMongoSessionMiddleware({ connection, env = process.env }) {
  let middleware;
  return (req, res, next) => {
    if (connection.readyState !== 1) {
      return res.status(503).json({ error: "Authentication storage is unavailable." });
    }
    try {
      if (!middleware) {
        if (!env.SESSION_SECRET || Buffer.byteLength(env.SESSION_SECRET) < 32) {
          return res.status(503).json({ error: "Authentication is not configured on the server." });
        }
        const cookie = getSessionCookie(env);
        const store = MongoStore.create({
          client: connection.getClient(),
          dbName: connection.name,
          collectionName: "sessions",
          ttl: SESSION_DURATION_MS / 1000,
          autoRemove: "native",
        });
        store.on("error", () => console.error("Authentication session storage failed."));
        middleware = session({
          name: cookie.name,
          secret: env.SESSION_SECRET,
          store,
          resave: false,
          saveUninitialized: false,
          rolling: true,
          cookie: cookie.options,
        });
      }
      middleware(req, res, (error) => error
        ? res.status(503).json({ error: "Authentication storage is unavailable." })
        : next());
    } catch {
      res.status(503).json({ error: "Authentication is unavailable." });
    }
  };
}

export function clearSessionCookie(res, env = process.env) {
  const { name, options: { maxAge, ...options } } = getSessionCookie(env);
  res.clearCookie(name, options);
}

export async function establishSession(req, userId) {
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.userId = String(userId);
  await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
}
