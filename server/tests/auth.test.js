import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import UserModel from "../Models/UserModel.js";
import { createAuthRouter } from "../routes/auth.js";
import { getSessionCookie } from "../config/session.js";

// A real, disposable local mongod; never use the project's configured database.
let mongo, connection, Users, app, originalUser;
const password = "Local-test-password-42";
const env = { NODE_ENV: "test", SESSION_SECRET: randomBytes(48).toString("hex") };
const origin = "http://localhost:3000";
function makeApp(options = env) {
  const instance = express();
  instance.use(express.json());
  instance.use(createAuthRouter({ UserModel: Users, connection, allowedOrigins: new Set([origin]), env: options }));
  return instance;
}
function post(client, route, body = {}) {
  return client.post(route).set("Origin", origin).set("X-RiadaTech-Request", "1").send(body);
}
function assertPublic(response) {
  assert.equal(Object.hasOwn(response.body.user, "password"), false);
  assert.equal(JSON.stringify(response.body).includes(password), false);
  assert.equal(JSON.stringify(response.body).includes(originalUser.password), false);
  assert.equal(Object.hasOwn(response.body, "session"), false);
}

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: path.join(os.tmpdir(), "riadatach-auth-mongodb") } });
  connection = await mongoose.createConnection(mongo.getUri(), { dbName: "riadatach_auth_test" }).asPromise();
  Users = connection.model("userInfos", UserModel.schema);
  originalUser = await Users.create({ name: "Session Test", email: "session@example.test", password: await bcrypt.hash(password, 10) });
  app = makeApp();
}, { timeout: 180000 });
after(async () => { await connection?.close(); await mongo?.stop(); });

test("login creates an HttpOnly Mongo-backed session; /me restores it after server recreation", async () => {
  const response = await post(request(app), "/api/auth/login", { email: originalUser.email, password, userId: "forged" }).expect(200);
  assertPublic(response);
  const setCookie = response.headers["set-cookie"][0];
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.equal(/; Secure/i.test(setCookie), false);
  const cookie = setCookie.split(";")[0];
  const records = await connection.db.collection("sessions").find({}).toArray();
  assert.ok(records.length > 0);
  assert.ok(records.some(record => JSON.parse(record.session).userId === String(originalUser._id)));
  assert.equal(JSON.stringify(records).includes(originalUser.password), false);
  const restored = await request(makeApp()).get("/api/auth/me?userId=forged").set("Cookie", cookie).expect(200);
  assert.equal(restored.body.user._id, String(originalUser._id));
  assert.equal(restored.headers["cache-control"], "no-store");
  assertPublic(restored);
  assert.equal((await Users.findById(originalUser._id)).password === originalUser.password, true);
});

test("/me rejects requests without a session even when a userId is supplied", async () => {
  await request(app).get(`/api/auth/me?userId=${originalUser._id}`).expect(401);
});

test("logout destroys the stored session; replaying the old cookie is rejected", async () => {
  const login = await post(request(app), "/api/auth/login", { email: originalUser.email, password }).expect(200);
  const cookie = login.headers["set-cookie"][0].split(";")[0];
  const logout = await post(request(app), "/api/auth/logout").set("Cookie", cookie).expect(200);
  assert.match(logout.headers["set-cookie"][0], /Expires=Thu, 01 Jan 1970/i);
  await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);
});

test("register signs in automatically without exposing the new password/hash", async () => {
  const client = request.agent(app);
  const registered = await post(client, "/api/auth/register", { name: "New User", email: "new@example.test", password }).expect(201);
  assertPublic(registered);
  const stored = await Users.findOne({ email: "new@example.test" });
  assert.equal(await bcrypt.compare(password, stored.password), true);
  assert.equal(JSON.stringify(registered.body).includes(stored.password), false);
  const me = await client.get("/api/auth/me").expect(200);
  assert.equal(me.body.user._id, registered.body.user._id);
  assertPublic(me);
});

test("logging in again rotates the session; old session cannot be replayed", async () => {
  const first = await post(request(app), "/login", { email: originalUser.email, password }).expect(200);
  const oldCookie = first.headers["set-cookie"][0].split(";")[0];
  const second = await post(request(app), "/login", { email: originalUser.email, password }).set("Cookie", oldCookie).expect(200);
  assert.equal(second.headers["set-cookie"][0].split(";")[0] === oldCookie, false);
  await request(app).get("/api/auth/me").set("Cookie", oldCookie).expect(401);
  await post(request(app), "/logout").set("Cookie", second.headers["set-cookie"][0].split(";")[0]).expect(200);
});

test("invalid credentials do not authenticate or reveal stored credentials", async () => {
  const response = await post(request(app), "/api/auth/login", { email: originalUser.email, password: "incorrect" }).expect(401);
  assert.equal(response.headers["set-cookie"], undefined);
  assert.equal(JSON.stringify(response.body).includes(originalUser.password), false);
});

test("browser cross-origin writes and requests without the CSRF header are rejected", async () => {
  await request(app).post("/api/auth/logout").set("Origin", "https://untrusted.example").set("X-RiadaTech-Request", "1").send({}).expect(403);
  await request(app).post("/api/auth/login").set("Origin", origin).send({ email: originalUser.email, password }).expect(403);
});

test("missing configuration fails closed instead of using MemoryStore", async () => {
  await request(makeApp({ NODE_ENV: "test" })).get("/api/auth/me").expect(503);
});

test("production cookies are host-only, secure and HttpOnly; cross-site requires HTTPS", () => {
  const cookie = getSessionCookie({ NODE_ENV: "production" });
  assert.equal(cookie.name, "__Host-riadatach.sid");
  assert.equal(cookie.options.secure, true);
  assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.options.sameSite, "lax");
  assert.equal(cookie.options.domain, undefined);
  assert.equal(getSessionCookie({ NODE_ENV: "production", SESSION_COOKIE_SAME_SITE: "none" }).options.secure, true);
  assert.throws(() => getSessionCookie({ NODE_ENV: "development", SESSION_COOKIE_SAME_SITE: "none" }));
});
