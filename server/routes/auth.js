import { Router } from "express";
import bcrypt from "bcrypt";
import { clearSessionCookie, createMongoSessionMiddleware, establishSession } from "../config/session.js";
import { requireAuth } from "../middleware/requireAuth.js";

function publicUser(user) {
  // An allowlist also protects future private fields, not just today's password.
  return { _id: user._id, name: user.name, email: user.email, ...(user.profilePic ? { profilePic: user.profilePic } : {}) };
}
const validEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export function createAuthRouter({ UserModel, connection, allowedOrigins, env = process.env }) {
  const router = Router();
  router.use(["/api/auth", "/login", "/registerUser", "/logout"], (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("Origin");
      const sameOrigin = `${req.protocol}://${req.get("host")}`;
      // A custom header forces browser preflight. CORS alone does not block writes.
      if (req.get("X-RiadaTech-Request") !== "1" ||
          (origin && origin !== sameOrigin && !allowedOrigins.has(origin))) {
        return res.status(403).json({ error: "Request origin is not allowed." });
      }
    }
    next();
  }, createMongoSessionMiddleware({ connection, env }));

  const register = async (req, res) => {
    let accountCreated = false;
    try {
      const name = String(req.body?.name || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (!name) return res.status(400).json({ error: "Name is required." });
      if (!email) return res.status(400).json({ error: "Email is required." });
      if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
      if (!password) return res.status(400).json({ error: "Password is required." });
      if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters long." });
      if (await UserModel.findOne({ email }).lean()) return res.status(409).json({ error: "An account with this email already exists." });
      const user = await UserModel.create({ name, email, password: await bcrypt.hash(password, 10) });
      accountCreated = true;
      await establishSession(req, user._id);
      return res.status(201).json({ user: publicUser(user), msg: "Added.", message: "Account created successfully." });
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ error: "An account with this email already exists." });
      return res.status(503).json({ error: accountCreated
        ? "Account created, but sign-in failed. Please log in."
        : "Registration is temporarily unavailable." });
    }
  };

  const login = async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (!email) return res.status(400).json({ error: "Email is required." });
      if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
      if (!password) return res.status(400).json({ error: "Password is required." });
      const user = await UserModel.findOne({ email });
      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ error: "Authentication failed" });
      }
      await establishSession(req, user._id);
      return res.status(200).json({ user: publicUser(user), message: "Success." });
    } catch {
      return res.status(503).json({ error: "Login is temporarily unavailable." });
    }
  };

  const logout = (req, res) => {
    req.session.destroy(error => {
      if (error) return res.status(503).json({ error: "Logout failed. Please try again." });
      clearSessionCookie(res, env);
      return res.status(200).json({ message: "Logged out successfully" });
    });
  };

  router.post(["/api/auth/register", "/registerUser"], register);
  router.post(["/api/auth/login", "/login"], login);
  router.get("/api/auth/me", requireAuth(UserModel), (req, res) => res.json({ user: publicUser(req.user) }));
  router.post(["/api/auth/logout", "/logout"], logout);
  return router;
}
