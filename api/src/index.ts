import "dotenv/config";
import Fastify from "fastify";
import type { FastifyReply } from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { pool } from "./db";
import {
  buildSessionToken,
  hashPassword,
  normalizeEmail,
  parseBearerToken,
  parseLoginInput,
  parseRegistrationInput,
  SESSION_TTL_MS,
  verifyPassword,
} from "./auth";
import {
  KrogerNotConfiguredError,
  KrogerRequestError,
  pricesForBarcodes,
  searchProducts,
  searchStores,
  padBarcode,
} from "./kroger";
import { trackKrogerPrice } from "./priceHistory";
import { parseReviewInput } from "./reviews";
import {
  DEMO_STORE_ID,
  demoEnabled,
  isDemoStore,
  demoStore,
  demoProducts,
  demoPrices,
  demoHistory,
} from "./seededFallback";


const PLACEHOLDER_USER_ID = "00000000-0000-0000-0000-000000000001";
const MAX_PRICE = 99_999_999.99;
const DEMO_ZIP = "00000";

const app = Fastify({ logger: true });
app.register(cors, { methods: ["GET", "HEAD", "POST", "DELETE"] });

function sendAuthDatabaseError(reply: FastifyReply, err: unknown, message: string) {
  app.log.error(err);

  const code =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;

  if (code === "42P01" || code === "42703") {
    return reply.code(503).send({
      error: "Account database setup is incomplete. Apply the latest Supabase migration with `npx supabase db push`.",
    });
  }

  if (code === "23505") {
    return reply.code(409).send({ error: "An account with that email already exists." });
  }

  return reply.code(500).send({ error: message });
}

type ProductInput = {
  name: string;
  price: number;
  location: string;
  quantity: number | null;
  barcode: string | null;
  externalStoreId: string | null;
};

type ProductRow = {
  id: string;
  user_id: string;
  name: string;
  price: string;
  location: string;
  quantity: number | null;
  barcode: string | null;
  external_store_id: string | null;
  created_at: Date;
};



function parseProductBody(body: unknown): string | ProductInput {
  if (!body || typeof body !== "object") {
    return "Request body is required.";
  }

  const raw = body as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const location = typeof raw.location === "string" ? raw.location.trim() : "";

  if (!name) return "Name is required.";
  if (!location) return "Location is required.";

  if (raw.price === undefined || raw.price === null || raw.price === "") {
    return "Price is required.";
  }

  const price =
    typeof raw.price === "number"
      ? raw.price
      : typeof raw.price === "string"
        ? Number(raw.price)
        : Number.NaN;

  if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
    return "Price must be a number zero or greater.";
  }

  let quantity: number | null = null;
  if (raw.quantity !== undefined && raw.quantity !== null && raw.quantity !== "") {
    const parsed =
      typeof raw.quantity === "number"
        ? raw.quantity
        : typeof raw.quantity === "string"
          ? Number(raw.quantity)
          : Number.NaN;

    if (!Number.isInteger(parsed) || parsed < 0) {
      return "Quantity must be a whole number zero or greater.";
    }
    quantity = parsed;
  }

  const barcode =
    typeof raw.barcode === "string"
      ? raw.barcode.trim() || null
      : null;

  const externalStoreId =
    typeof raw.externalStoreId === "string"
      ? raw.externalStoreId.trim() || null
      : null;

  if ((barcode === null) !== (externalStoreId === null)) {
    return "Barcode and store ID must be provided together.";
  }

  if (barcode !== null && !/^\d{8,14}$/.test(barcode)) {
    return "Invalid barcode.";
  }

  if (
    externalStoreId !== null &&
    !/^[a-zA-Z0-9_-]{1,40}$/.test(externalStoreId)
  ) {
    return "Invalid store ID.";
  }

  return {
    name,
    price: Math.round(price * 100) / 100,
    location,
    quantity,
    barcode,
    externalStoreId,
  };
}

function toProduct(row: ProductRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    price: Number(row.price),
    location: row.location,
    quantity: row.quantity,
    barcode: row.barcode,
    external_store_id: row.external_store_id,
    created_at: row.created_at,
  };
}

async function getSessionUserId(req: { headers: Record<string, string | string[] | undefined> }, reply: any) {
  const authorization = req.headers.authorization;
  const token = typeof authorization === "string" ? parseBearerToken(authorization) : null;

  if (!token) {
    reply.code(401).send({
      error: "Authentication is required to manage your list."
    });

    return null;
  }

  try {
    const result = await pool.query<{ user_id: string }>(
      "select user_id from user_sessions where token = $1 and expires_at > now()",
      [token]
    );

    const userId = result.rows[0]?.user_id;
    if (!userId) {
      reply.code(401).send({ error: "Session expired or invalid." });
      return null;
    }

    return { userId, isAuthenticated: true };
  } catch (err) {
    app.log.error(err);
    reply.code(500).send({ error: "Could not validate session." });
    return null;
  }
}

const OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";

type CatalogProduct = {
  barcode: string | null;
  name: string;
  brand: string | null;
  packageSize: string | null;
};

function textOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

app.get("/catalog/search", async (req, reply) => {
  const query = req.query as { q?: unknown };
  const q = typeof query.q === "string" ? query.q.trim() : "";
  if (!q) {
    return reply.code(400).send({ error: "Search text is required." });
  }

  const url = new URL(OFF_SEARCH_URL);
  url.searchParams.set("search_terms", q);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "20");
  url.searchParams.set("fields", "code,product_name,brands,quantity");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "GroceryWatch/1.0",
      },
    });
    if (!response.ok) {
      return reply.code(502).send({ error: "Product search failed." });
    }

    const data = (await response.json()) as {
      products?: Array<{
        code?: unknown;
        product_name?: unknown;
        brands?: unknown;
        quantity?: unknown;
      }>;
    };

    const products: CatalogProduct[] = [];
    for (const product of data.products ?? []) {
      const name = textOrNull(product.product_name);
      if (!name) continue;
      products.push({
        barcode: textOrNull(product.code),
        name,
        brand: textOrNull(product.brands),
        packageSize: textOrNull(product.quantity),
      });
    }
    return products;
  } catch (err) {
    app.log.error(err);
    return reply.code(502).send({ error: "Product search failed." });
  }
});

function krogerError(err: unknown, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) {
  if (err instanceof KrogerNotConfiguredError) {
    return reply.code(503).send({ error: err.message });
  }
  if (err instanceof KrogerRequestError) {
    return reply.code(502).send({ error: err.message });
  }
  return reply.code(502).send({ error: "Kroger request failed." });
}

app.get("/stores", async (req, reply) => {
    const query = req.query as { zip?: unknown };
    const zip = typeof query.zip === "string"
        ? query.zip.trim()
        : "";

    if (!/^\d{5}$/.test(zip)) {
        return reply.code(400).send({
            error: "A 5-digit zip code is required."
        });
    }

    try {
        if (zip === DEMO_ZIP) {
            if (!demoEnabled) {
                return reply.code(404).send({
                    error: "Demo mode is disabled."
                });
            }

            const store = await demoStore();

            if (!store) {
                return reply.code(404).send({
                    error: "Demo store was not found in the database."
                });
            }

            return [store];
        }
        
        return await searchStores(zip);

    } catch (error) {
        app.log.error(error);
        return krogerError(error, reply);
    }
});


app.get("/catalog/store-search", async (req, reply) => {
  const query = req.query as {
    q?: unknown;
    locationId?: unknown;
  };

  const q =
    typeof query.q === "string"
      ? query.q.trim()
      : "";

  const locationId =
    typeof query.locationId === "string"
      ? query.locationId.trim()
      : "";

  if (!q || !locationId) {
    return reply.code(400).send({
      error: "A search and a store are required.",
    });
  }

  const searchTerm = q.slice(0, 80);

  try {
    if (isDemoStore(locationId)) {
      return await demoProducts(
        searchTerm,
        locationId
      );
    }

    return await searchProducts(
      searchTerm,
      locationId
    );

  } catch (error) {
    if (
      demoEnabled &&
      error instanceof KrogerRequestError &&
      error.status === 503
    ) {
      return reply.code(503).send({
        error:
          "Kroger is temporarily unavailable. Demo data is available.",
        demoLocationId: DEMO_STORE_ID,
      });
    }

    app.log.error(error);

    return krogerError(error, reply);
  }
});

app.get("/catalog/prices", async (req, reply) => {
  const query = req.query as {
    locationId?: unknown;
    barcodes?: unknown;
  };

  const locationId =
    typeof query.locationId === "string"
      ? query.locationId.trim()
      : "";

  const barcodes =
    typeof query.barcodes === "string"
      ? query.barcodes
          .split(",")
          .map((barcode) => barcode.trim())
          .filter(Boolean)
          .slice(0, 20)
      : [];

  if (!locationId || barcodes.length === 0) {
    return reply.code(400).send({
      error: "A store and at least one barcode are required.",
    });
  }

  try {
    if (isDemoStore(locationId)) {
      return await demoPrices(locationId, barcodes);
    }

    return await pricesForBarcodes(locationId, barcodes);

  } catch (error) {
    if (
      demoEnabled &&
      error instanceof KrogerRequestError &&
      error.status === 503
    ) {
      return reply.code(503).send({
        error: "Kroger is unavailable. Demo data is available.",
        demoLocationId: DEMO_STORE_ID,
      });
    }

    app.log.error(error);
    return krogerError(error, reply);
  }
});

app.post("/catalog/price-history", async (req, reply) => {
  const input = req.body as Record<string, unknown> | null;

  if (
    !input ||
    typeof input.locationId !== "string" ||
    typeof input.barcode !== "string" ||
    typeof input.name !== "string"
  ) {
    return reply.code(400).send({
      error: "Store, barcode, and name are required.",
    });
  }

  try {
    const result = isDemoStore(input.locationId)
      ? await demoHistory(
          padBarcode(input.barcode),
          input.locationId
        )
      : await trackKrogerPrice({
          locationId: input.locationId,
          barcode: input.barcode,
          name: input.name,
        });

    if (!result) {
      return reply.code(404).send({
        error: "Product or price was not found at this store.",
      });
    }

    return result;

  } catch (error) {
    if (error instanceof RangeError) {
      return reply.code(400).send({
        error: error.message,
      });
    }

    app.log.error(error);

    if (
      error instanceof KrogerNotConfiguredError ||
      error instanceof KrogerRequestError
    ) {
      return krogerError(error, reply);
    }

    return reply.code(500).send({
      error: "Could not retrieve price history.",
    });
  }
});

app.get("/health", async (_req, reply) => {
  try {
    await pool.query("SELECT 1");
    return { status: "ok", db: "connected" };
  } catch (err) {
    app.log.error(err);
    return reply.code(500).send({ status: "error", db: "unreachable" });
  }
});

app.post("/auth/signup", async (req, reply) => {
  const parsed = parseRegistrationInput(req.body);
  if (typeof parsed === "string") {
    return reply.code(400).send({ error: parsed });
  }

  const email = normalizeEmail(parsed.email);

  try {
    const existing = await pool.query<{ id: string }>(
      "select id from profiles where lower(email) = lower($1)",
      [email]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      return reply.code(409).send({ error: "An account with that email already exists." });
    }

    const userId = randomUUID();
    const password = hashPassword(parsed.password);
    const profile = await pool.query<{ id: string; display_name: string; email: string }>(
      `insert into profiles (id, display_name, email, password_hash, password_salt)
       values ($1, $2, $3, $4, $5)
       returning id, display_name, email`,
      [userId, parsed.displayName, email, password.hash, password.salt]
    );

    const profileRow = profile.rows[0];
    if (!profileRow) {
      return reply.code(500).send({ error: "Could not create profile." });
    }

    const token = buildSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await pool.query(
      "insert into user_sessions (id, user_id, token, expires_at) values ($1, $2, $3, $4)",
      [randomUUID(), profileRow.id, token, expiresAt]
    );

    return {
      user: {
        id: profileRow.id,
        display_name: profileRow.display_name,
        email: profileRow.email,
      },
      token,
      expires_at: expiresAt,
    };
  } catch (err) {
    return sendAuthDatabaseError(reply, err, "Could not create account.");
  }
});

app.post("/auth/login", async (req, reply) => {
  const parsed = parseLoginInput(req.body);
  if (typeof parsed === "string") {
    return reply.code(400).send({ error: parsed });
  }

  const email = normalizeEmail(parsed.email);

  try {
    const result = await pool.query<{ id: string; display_name: string; email: string; password_hash: string; password_salt: string }>(
      "select id, display_name, email, password_hash, password_salt from profiles where lower(email) = lower($1)",
      [email]
    );

    const profile = result.rows[0];
    if (!profile || !profile.password_hash || !profile.password_salt) {
      return reply.code(401).send({ error: "Invalid email or password." });
    }

    if (!verifyPassword(parsed.password, profile.password_hash, profile.password_salt)) {
      return reply.code(401).send({ error: "Invalid email or password." });
    }

    const token = buildSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await pool.query(
      "insert into user_sessions (id, user_id, token, expires_at) values ($1, $2, $3, $4)",
      [randomUUID(), profile.id, token, expiresAt]
    );

    return {
      user: {
        id: profile.id,
        display_name: profile.display_name,
        email: profile.email,
      },
      token,
      expires_at: expiresAt,
    };
  } catch (err) {
    return sendAuthDatabaseError(reply, err, "Could not log in.");
  }
});

app.post("/auth/logout", async (req, reply) => {
  const token = parseBearerToken(
    typeof req.headers.authorization === "string" ? req.headers.authorization : undefined
  );

  if (!token) {
    return reply.code(401).send({ error: "You are not signed in." });
  }

  try {
    await pool.query("delete from user_sessions where token = $1", [token]);
    return { ok: true };
  } catch (err) {
    app.log.error(err);
    return reply.code(500).send({ error: "Could not log out." });
  }
});

app.get("/profile", async (req, reply) => {
  const session = await getSessionUserId(req as any, reply);
  if (!session) return;

  try {
    const result = await pool.query<{ id: string; display_name: string; email: string }>(
      "select id, display_name, email from profiles where id = $1",
      [session.userId]
    );
    const profile = result.rows[0];
    if (!profile) {
      return reply.code(404).send({ error: "Profile not found." });
    }
    return profile;
  } catch (err) {
    app.log.error(err);
    return reply.code(500).send({ error: "Could not load profile." });
  }
});

app.get("/products", async (req, reply) => {
  const session = await getSessionUserId(req as any, reply);
  if (!session) return;

  try {
    const result = await pool.query<ProductRow>(
      `SELECT
          id,
          user_id,
          name,
          price,
          location,
          quantity,
          barcode,
          external_store_id,
          created_at
      FROM public.spotted_products
      WHERE user_id = $1
      ORDER BY created_at DESC`,
      [session.userId]
    );
    return result.rows.map(toProduct);
  } catch (err) {
    app.log.error(err);
    return reply.code(500).send({ error: "Could not load products." });
  }
});

app.post("/products", async (req, reply) => {
  const session = await getSessionUserId(req as any, reply);
  if (!session) return;

  const parsed = parseProductBody(req.body);
  if (typeof parsed === "string") {
    return reply.code(400).send({ error: parsed });
  }

  try {
    const result = await pool.query<ProductRow>(
      `INSERT INTO public.spotted_products (
          user_id,
          name,
          price,
          location,
          quantity,
          barcode,
          external_store_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        session.userId,
        parsed.name,
        parsed.price,
        parsed.location,
        parsed.quantity,
        parsed.barcode,
        parsed.externalStoreId,
      ]
    );
    const saved = result.rows[0];
    if (!saved) {
      return reply.code(500).send({ error: "Could not save product." });
    }
    return reply.code(201).send(toProduct(saved));
  } catch (err) {
    app.log.error(err);
    return reply.code(500).send({ error: "Could not save product." });
  }
});

app.delete("/products/:id", async (req, reply) => {
  const session = await getSessionUserId(req as any, reply);
  if (!session) return;

  const id = (req.params as { id?: unknown }).id;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    return reply.code(400).send({ error: "A product id is required." });
  }

  try {
    const result = await pool.query(
      "delete from spotted_products where id = $1 and user_id = $2 returning id",
      [id, session.userId]
    );
    if (result.rowCount === 0) {
      return reply.code(404).send({ error: "Product not found." });
    }
    return reply.code(204).send();
  } catch (err) {
    app.log.error(err);
    return reply.code(500).send({ error: "Could not remove product." });
  }
});

app.post("/reviews", async (req, reply) => {
  const session = await getSessionUserId(req as any, reply);
  if (!session) return;

  const parsed = parseReviewInput(req.body);
  if (typeof parsed === "string") {
    return reply.code(400).send({ error: parsed });
  }

  try {
    const result = await pool.query<{
      id: string;
      created_at: Date;
    }>(
      `INSERT INTO public.store_reviews (
          user_id,
          store_provider,
          external_store_id,
          store_name,
          store_address,
          rating,
          comment
      )
      VALUES ($1, 'kroger', $2, $3, $4, $5, $6)
      RETURNING id, created_at`,
      [
        session.userId,
        parsed.locationId,
        parsed.storeName,
        parsed.storeAddress,
        parsed.rating,
        parsed.comment,
      ]
    );
    const saved = result.rows[0];
    if (!saved) {
      return reply.code(500).send({ error: "Could not save review." });
    }

    return reply.code(201).send({
      id: saved.id,
      storeName: parsed.storeName,
      rating: parsed.rating,
      createdAt: saved.created_at,
      message: "Review submitted. Thanks for sharing your shopping experience.",
    });
  } catch (err) {
    app.log.error(err);
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? (err as { code?: unknown }).code
        : undefined;
    if (code === "42P01" || code === "42703") {
      return reply.code(503).send({
        error: "Review database setup is incomplete. Apply the latest Supabase migration with `npx supabase db push`.",
      });
    }
    return reply.code(500).send({ error: "Could not save review." });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen({ port, host: "0.0.0.0" });
