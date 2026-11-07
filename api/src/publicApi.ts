import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from "fastify";
import { pool } from "./db";
import {
  KrogerNotConfiguredError,
  KrogerRequestError,
  padBarcode,
  pricesForBarcodes,
  searchProducts,
  searchStores,
} from "./kroger";
import { trackKrogerPrice } from "./priceHistory";
import {
  DEMO_STORE_ID,
  demoEnabled,
  demoHistory,
  demoPrices,
  demoProducts,
  demoStore,
  isDemoStore,
} from "./seededFallback";
import {
  errorEnvelope,
  okEnvelope,
  requirePublicApiKey,
  type PublicApiErrorCode,
} from "./publicApiAuth";

const OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const DEMO_ZIP = "00000";

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

function sendPublicError(
  reply: FastifyReply,
  status: number,
  code: PublicApiErrorCode,
  message: string,
  extra?: Record<string, unknown>
) {
  return reply.code(status).send({
    ...errorEnvelope(code, message),
    ...(extra ?? {}),
  });
}

function krogerPublicError(err: unknown, reply: FastifyReply) {
  if (err instanceof KrogerNotConfiguredError) {
    return sendPublicError(reply, 503, "SERVICE_UNAVAILABLE", err.message);
  }
  if (err instanceof KrogerRequestError) {
    return sendPublicError(reply, 502, "UPSTREAM_ERROR", err.message);
  }
  return sendPublicError(reply, 502, "UPSTREAM_ERROR", "Kroger request failed.");
}

async function requireKey(
  req: { headers: Parameters<typeof requirePublicApiKey>[0]["headers"] },
  reply: FastifyReply
) {
  return requirePublicApiKey(req as Parameters<typeof requirePublicApiKey>[0], reply);
}

export async function publicApiRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  app.get("/health", async (_req, reply) => {
    try {
      await pool.query("SELECT 1");
      return okEnvelope({ status: "ok", db: "connected" });
    } catch (err) {
      app.log.error(err);
      return sendPublicError(reply, 500, "UPSTREAM_ERROR", "Database unreachable.");
    }
  });

  app.get("/stores", async (req, reply) => {
    if (!(await requireKey(req, reply))) return;

    const query = req.query as { zip?: unknown };
    const zip = typeof query.zip === "string" ? query.zip.trim() : "";

    if (!/^\d{5}$/.test(zip)) {
      return sendPublicError(
        reply,
        400,
        "BAD_REQUEST",
        "A 5-digit zip code is required."
      );
    }

    try {
      if (zip === DEMO_ZIP) {
        if (!demoEnabled) {
          return sendPublicError(reply, 404, "NOT_FOUND", "Demo mode is disabled.");
        }

        const store = await demoStore();
        if (!store) {
          return sendPublicError(
            reply,
            404,
            "NOT_FOUND",
            "Demo store was not found in the database."
          );
        }

        return okEnvelope([store]);
      }

      return okEnvelope(await searchStores(zip));
    } catch (error) {
      app.log.error(error);
      return krogerPublicError(error, reply);
    }
  });

  app.get("/catalog/search", async (req, reply) => {
    if (!(await requireKey(req, reply))) return;

    const query = req.query as { q?: unknown };
    const q = typeof query.q === "string" ? query.q.trim() : "";
    if (!q) {
      return sendPublicError(reply, 400, "BAD_REQUEST", "Search text is required.");
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
        return sendPublicError(reply, 502, "UPSTREAM_ERROR", "Product search failed.");
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
      return okEnvelope(products);
    } catch (err) {
      app.log.error(err);
      return sendPublicError(reply, 502, "UPSTREAM_ERROR", "Product search failed.");
    }
  });

  app.get("/catalog/store-search", async (req, reply) => {
    if (!(await requireKey(req, reply))) return;

    const query = req.query as { q?: unknown; locationId?: unknown };
    const q = typeof query.q === "string" ? query.q.trim() : "";
    const locationId =
      typeof query.locationId === "string" ? query.locationId.trim() : "";

    if (!q || !locationId) {
      return sendPublicError(
        reply,
        400,
        "BAD_REQUEST",
        "A search and a store are required."
      );
    }

    const searchTerm = q.slice(0, 80);

    try {
      if (isDemoStore(locationId)) {
        return okEnvelope(await demoProducts(searchTerm, locationId));
      }

      return okEnvelope(await searchProducts(searchTerm, locationId));
    } catch (error) {
      if (
        demoEnabled &&
        error instanceof KrogerRequestError &&
        error.status === 503
      ) {
        return sendPublicError(
          reply,
          503,
          "SERVICE_UNAVAILABLE",
          "Kroger is temporarily unavailable. Demo data is available.",
          { demoLocationId: DEMO_STORE_ID }
        );
      }

      app.log.error(error);
      return krogerPublicError(error, reply);
    }
  });

  app.get("/catalog/prices", async (req, reply) => {
    if (!(await requireKey(req, reply))) return;

    const query = req.query as { locationId?: unknown; barcodes?: unknown };
    const locationId =
      typeof query.locationId === "string" ? query.locationId.trim() : "";
    const barcodes =
      typeof query.barcodes === "string"
        ? query.barcodes
            .split(",")
            .map((barcode) => barcode.trim())
            .filter(Boolean)
            .slice(0, 20)
        : [];

    if (!locationId || barcodes.length === 0) {
      return sendPublicError(
        reply,
        400,
        "BAD_REQUEST",
        "A store and at least one barcode are required."
      );
    }

    try {
      if (isDemoStore(locationId)) {
        return okEnvelope(await demoPrices(locationId, barcodes));
      }

      return okEnvelope(await pricesForBarcodes(locationId, barcodes));
    } catch (error) {
      if (
        demoEnabled &&
        error instanceof KrogerRequestError &&
        error.status === 503
      ) {
        return sendPublicError(
          reply,
          503,
          "SERVICE_UNAVAILABLE",
          "Kroger is unavailable. Demo data is available.",
          { demoLocationId: DEMO_STORE_ID }
        );
      }

      app.log.error(error);
      return krogerPublicError(error, reply);
    }
  });

  app.get("/price-history", async (req, reply) => {
    if (!(await requireKey(req, reply))) return;

    const query = req.query as {
      locationId?: unknown;
      barcode?: unknown;
      name?: unknown;
    };

    const locationId =
      typeof query.locationId === "string" ? query.locationId.trim() : "";
    const barcode =
      typeof query.barcode === "string" ? query.barcode.trim() : "";
    const name = typeof query.name === "string" ? query.name.trim() : "";

    if (!locationId || !barcode || !name) {
      return sendPublicError(
        reply,
        400,
        "BAD_REQUEST",
        "Store, barcode, and name are required."
      );
    }

    try {
      const result = isDemoStore(locationId)
        ? await demoHistory(padBarcode(barcode), locationId)
        : await trackKrogerPrice({ locationId, barcode, name });

      if (!result) {
        return sendPublicError(
          reply,
          404,
          "NOT_FOUND",
          "Product or price was not found at this store."
        );
      }

      return okEnvelope(result);
    } catch (error) {
      if (error instanceof RangeError) {
        return sendPublicError(reply, 400, "BAD_REQUEST", error.message);
      }

      app.log.error(error);

      if (
        error instanceof KrogerNotConfiguredError ||
        error instanceof KrogerRequestError
      ) {
        return krogerPublicError(error, reply);
      }

      return sendPublicError(
        reply,
        500,
        "UPSTREAM_ERROR",
        "Could not retrieve price history."
      );
    }
  });
}
