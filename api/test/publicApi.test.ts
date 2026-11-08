import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";

import {
  errorEnvelope,
  getConfiguredApiKeys,
  isValidApiKey,
  okEnvelope,
  parsePublicApiKeys,
  readApiKeyHeader,
  requirePublicApiKey,
} from "../src/publicApiAuth";
import { publicApiRoutes } from "../src/publicApi";

test("parsePublicApiKeys splits and trims comma-separated keys", () => {
  assert.deepEqual(parsePublicApiKeys(undefined), []);
  assert.deepEqual(parsePublicApiKeys(""), []);
  assert.deepEqual(parsePublicApiKeys(" a ,b,  c "), ["a", "b", "c"]);
});

test("isValidApiKey accepts only configured keys", () => {
  const allowed = ["dev-public-key", "other-key"];
  assert.equal(isValidApiKey("dev-public-key", allowed), true);
  assert.equal(isValidApiKey("other-key", allowed), true);
  assert.equal(isValidApiKey("wrong", allowed), false);
  assert.equal(isValidApiKey("", allowed), false);
  assert.equal(isValidApiKey("dev-public-key", []), false);
});

test("response envelopes are consistent", () => {
  assert.deepEqual(okEnvelope({ status: "ok" }), {
    ok: true,
    data: { status: "ok" },
  });
  assert.deepEqual(errorEnvelope("UNAUTHORIZED", "Nope"), {
    ok: false,
    error: { code: "UNAUTHORIZED", message: "Nope" },
  });
});

test("readApiKeyHeader reads X-API-Key", () => {
  assert.equal(readApiKeyHeader({ "x-api-key": "  abc  " }), "abc");
  assert.equal(readApiKeyHeader({ "x-api-key": ["first", "second"] }), "first");
  assert.equal(readApiKeyHeader({}), null);
});

test("GET /v1/health does not require an API key", async () => {
  const previous = process.env.PUBLIC_API_KEYS;
  process.env.PUBLIC_API_KEYS = "dev-public-key";

  const app = Fastify({ logger: false });
  await app.register(publicApiRoutes, { prefix: "/v1" });
  await app.ready();

  const response = await app.inject({ method: "GET", url: "/v1/health" });
  // Health never returns 401; DB may be up (200) or down (500 envelope).
  assert.notEqual(response.statusCode, 401);
  const body = response.json();
  assert.equal(typeof body.ok, "boolean");
  if (response.statusCode === 200) {
    assert.equal(body.ok, true);
    assert.equal(body.data.status, "ok");
  } else {
    assert.equal(body.ok, false);
  }

  await app.close();
  if (previous === undefined) delete process.env.PUBLIC_API_KEYS;
  else process.env.PUBLIC_API_KEYS = previous;
});

test("requirePublicApiKey rejects missing and invalid keys", async () => {
  const previous = process.env.PUBLIC_API_KEYS;
  process.env.PUBLIC_API_KEYS = "dev-public-key";

  const app = Fastify({ logger: false });
  app.addHook("preHandler", async (req, reply) => {
    const allowed = await requirePublicApiKey(req, reply);
    if (!allowed) return;
  });
  app.get("/protected", async () => okEnvelope({ ok: true }));
  await app.ready();

  const missing = await app.inject({ method: "GET", url: "/protected" });
  assert.equal(missing.statusCode, 401);
  assert.deepEqual(missing.json().error.code, "UNAUTHORIZED");

  const invalid = await app.inject({
    method: "GET",
    url: "/protected",
    headers: { "x-api-key": "wrong-key" },
  });
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.json().ok, false);

  const valid = await app.inject({
    method: "GET",
    url: "/protected",
    headers: { "x-api-key": "dev-public-key" },
  });
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.json().ok, true);

  await app.close();
  if (previous === undefined) delete process.env.PUBLIC_API_KEYS;
  else process.env.PUBLIC_API_KEYS = previous;
});

test("GET /v1/stores returns BAD_REQUEST envelope for invalid zip", async () => {
  const previous = process.env.PUBLIC_API_KEYS;
  process.env.PUBLIC_API_KEYS = "dev-public-key";

  const app = Fastify({ logger: false });
  await app.register(publicApiRoutes, { prefix: "/v1" });
  await app.ready();

  const missingKey = await app.inject({
    method: "GET",
    url: "/v1/stores?zip=23529",
  });
  assert.equal(missingKey.statusCode, 401);
  assert.equal(missingKey.json().error.code, "UNAUTHORIZED");

  const badZip = await app.inject({
    method: "GET",
    url: "/v1/stores?zip=abc",
    headers: { "x-api-key": "dev-public-key" },
  });
  assert.equal(badZip.statusCode, 400);
  const body = badZip.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "BAD_REQUEST");
  assert.match(body.error.message, /zip/i);

  await app.close();
  if (previous === undefined) delete process.env.PUBLIC_API_KEYS;
  else process.env.PUBLIC_API_KEYS = previous;
});

test("getConfiguredApiKeys reads PUBLIC_API_KEYS", () => {
  const previous = process.env.PUBLIC_API_KEYS;
  process.env.PUBLIC_API_KEYS = "one,two";
  assert.deepEqual(getConfiguredApiKeys(), ["one", "two"]);
  if (previous === undefined) delete process.env.PUBLIC_API_KEYS;
  else process.env.PUBLIC_API_KEYS = previous;
});
