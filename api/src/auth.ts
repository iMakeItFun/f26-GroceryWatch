import { randomBytes, randomUUID, pbkdf2Sync, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AccountRegistrationInput = {
  displayName: string;
  email: string;
  password: string;
};

export type AccountLoginInput = {
  email: string;
  password: string;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateDisplayName(value: unknown) {
  if (typeof value !== "string") return null;
  const displayName = value.trim();
  if (displayName.length < 2 || displayName.length > 80) {
    return null;
  }
  return displayName;
}

export function validateEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }

  return email;
}

export function validatePassword(value: unknown) {
  if (typeof value !== "string") return null;
  const password = value.trim();
  if (password.length < 8) {
    return null;
  }
  return password;
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hashBuffer = pbkdf2Sync(password, salt, 100_000, 64, "sha512");
  return {
    hash: hashBuffer.toString("hex"),
    salt,
  };
}

export function verifyPassword(password: string, storedHash: string, salt: string) {
  const computed = pbkdf2Sync(password, salt, 100_000, 64, "sha512");
  const expected = Buffer.from(storedHash, "hex");
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}

export function buildSessionToken() {
  return `${randomUUID()}.${randomBytes(24).toString("hex")}`;
}

export function parseBearerToken(header: string | undefined | null) {
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export function parseRegistrationInput(body: unknown): AccountRegistrationInput | string {
  if (!body || typeof body !== "object") {
    return "Request body is required.";
  }

  const raw = body as Record<string, unknown>;
  const displayName = validateDisplayName(raw.displayName);
  if (!displayName) {
    return "Display name must be between 2 and 80 characters.";
  }

  const email = validateEmail(raw.email);
  if (!email) {
    return "Enter a valid email address.";
  }

  const password = validatePassword(raw.password);
  if (!password) {
    return "Password must be at least 8 characters long.";
  }

  return {
    displayName,
    email,
    password,
  };
}

export function parseLoginInput(body: unknown): AccountLoginInput | string {
  if (!body || typeof body !== "object") {
    return "Request body is required.";
  }

  const raw = body as Record<string, unknown>;
  const email = validateEmail(raw.email);
  if (!email) {
    return "Enter a valid email address.";
  }

  const password = validatePassword(raw.password);
  if (!password) {
    return "Password must be at least 8 characters long.";
  }

  return { email, password };
}
