import test from "node:test";
import assert from "node:assert/strict";

import {
  hashPassword,
  normalizeEmail,
  parseLoginInput,
  parseRegistrationInput,
  verifyPassword,
} from "../src/auth";

test("hashPassword verifies the original password and rejects mismatches", () => {
  const result = hashPassword("super-secret-password");

  assert.equal(verifyPassword("super-secret-password", result.hash, result.salt), true);
  assert.equal(verifyPassword("wrong-password", result.hash, result.salt), false);
});

test("registration and login inputs validate required accounts fields", () => {
  const signUp = parseRegistrationInput({
    displayName: "  Sam  ",
    email: " Sam@Example.com ",
    password: "securepass",
  });

  assert.equal(typeof signUp, "object");
  if (typeof signUp === "object") {
    assert.equal(signUp.displayName, "Sam");
    assert.equal(signUp.email, "sam@example.com");
    assert.equal(signUp.password, "securepass");
  }

  const login = parseLoginInput({ email: "user@example.com", password: "longer-pass" });
  assert.equal(typeof login, "object");
  if (typeof login === "object") {
    assert.deepEqual(login, { email: "user@example.com", password: "longer-pass" });
  }

  assert.equal(typeof parseLoginInput({ email: "user@example.com", password: "short" }), "string");
  assert.equal(normalizeEmail(" Sam@Example.com "), "sam@example.com");
});
