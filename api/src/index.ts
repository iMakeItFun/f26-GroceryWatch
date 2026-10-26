import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { pool } from "./db";
import {
  KrogerNotConfiguredError,
  KrogerRequestError,
  pricesForBarcodes,
  searchProducts,
  searchStoresByCoordinates,
  searchStores,
} from "./kroger";

const PLACEHOLDER_USER_ID = "00000000-0000-0000-0000-000000000001";
const MAX_PRICE = 99_999_999.99;

export const app = Fastify({ logger: true });
app.register(cors, { methods: ["GET", "HEAD", "POST", "DELETE"] });

type ProductInput = {
  name: string;
  price: number;
  location: string;
  quantity: number | null;
};

type ProductRow = {
  id: string;
  user_id: string;
  name: string;
  price: string;
  location: string;
  quantity: number | null;
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

  return {
    name,
    price: Math.round(price * 100) / 100,
    location,
    quantity,
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
    created_at: row.created_at,
  };
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
  const query = req.query as {
    zip?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  };
  const zip = typeof query.zip === "string" ? query.zip.trim() : "";
  // Search by ZIP or coordinates, but don't mix the two.
  const hasCoordinates = query.latitude !== undefined || query.longitude !== undefined;

  if (hasCoordinates) {
    const latitude =
      typeof query.latitude === "string" && query.latitude.trim() !== ""
        ? Number(query.latitude)
        : Number.NaN;
    const longitude =
      typeof query.longitude === "string" && query.longitude.trim() !== ""
        ? Number(query.longitude)
        : Number.NaN;

    if (query.zip !== undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return reply.code(400).send({
        error: "Provide either a 5-digit zip code or valid latitude and longitude.",
      });
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return reply.code(400).send({ error: "Coordinates are out of range." });
    }

    try {
      return await searchStoresByCoordinates(latitude, longitude);
    } catch (err) {
      app.log.error(err instanceof KrogerRequestError ? err.message : err);
      return krogerError(err, reply);
    }
  }

  if (!/^\d{5}$/.test(zip)) {
    return reply.code(400).send({ error: "A 5-digit zip code is required." });
  }
  try {
    return await searchStores(zip);
  } catch (err) {
    app.log.error(err instanceof KrogerRequestError ? err.message : err);
    return krogerError(err, reply);
  }
});

app.get("/catalog/store-search", async (req, reply) => {
  const query = req.query as { q?: unknown; locationId?: unknown };
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const locationId = typeof query.locationId === "string" ? query.locationId.trim() : "";
  if (!q || !locationId) {
    return reply.code(400).send({ error: "A search and a store are required." });
  }
  try {
    return await searchProducts(q.slice(0, 80), locationId);
  } catch (err) {
    app.log.error(err instanceof KrogerRequestError ? err.message : err);
    return krogerError(err, reply);
  }
});

app.get("/catalog/prices", async (req, reply) => {
  const query = req.query as { locationId?: unknown; barcodes?: unknown };
  const locationId = typeof query.locationId === "string" ? query.locationId.trim() : "";
  const barcodes =
    typeof query.barcodes === "string"
      ? query.barcodes
          .split(",")
          .map((barcode) => barcode.trim())
          .filter((barcode) => barcode.length > 0)
          .slice(0, 20)
      : [];
  if (!locationId || barcodes.length === 0) {
    return reply.code(400).send({ error: "A store and at least one barcode are required." });
  }
  try {
    return await pricesForBarcodes(locationId, barcodes);
  } catch (err) {
    app.log.error(err instanceof KrogerRequestError ? err.message : err);
    return krogerError(err, reply);
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

app.get("/profile", async (_req, reply) => {
  try {
    const result = await pool.query<{ id: string; display_name: string }>(
      "select id, display_name from profiles where id = $1",
      [PLACEHOLDER_USER_ID]
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

app.get("/products", async (_req, reply) => {
  try {
    const result = await pool.query<ProductRow>(
      `select id, user_id, name, price, location, quantity, created_at
       from spotted_products
       where user_id = $1
       order by created_at desc`,
      [PLACEHOLDER_USER_ID]
    );
    return result.rows.map(toProduct);
  } catch (err) {
    app.log.error(err);
    return reply.code(500).send({ error: "Could not load products." });
  }
});

app.post("/products", async (req, reply) => {
  const parsed = parseProductBody(req.body);
  if (typeof parsed === "string") {
    return reply.code(400).send({ error: parsed });
  }

  try {
    const result = await pool.query<ProductRow>(
      `insert into spotted_products (user_id, name, price, location, quantity)
       values ($1, $2, $3, $4, $5)
       returning id, user_id, name, price, location, quantity, created_at`,
      [
        PLACEHOLDER_USER_ID,
        parsed.name,
        parsed.price,
        parsed.location,
        parsed.quantity,
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
  const id = (req.params as { id?: unknown }).id;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    return reply.code(400).send({ error: "A product id is required." });
  }

  try {
    const result = await pool.query(
      "delete from spotted_products where id = $1 and user_id = $2 returning id",
      [id, PLACEHOLDER_USER_ID]
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

// Let tests load the routes without starting the server.
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen({ port, host: "0.0.0.0" });
}
