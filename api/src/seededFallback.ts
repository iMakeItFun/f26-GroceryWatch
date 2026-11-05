import { pool } from "./db";

import "dotenv/config";

import type {
    KrogerPrice,
    KrogerStore,
    KrogerCatalogItem,
} from "./kroger";

import type {
    PriceHistoryResponse,
} from "./priceHistory";

export const DEMO_STORE_ID = "GW-DEMO-001";

export const demoEnabled = process.env.ENABLE_KROGER_DEMO_FALLBACK === "true";

export function isDemoStore(locationId: string) {
    return demoEnabled && locationId === DEMO_STORE_ID;
}

export async function demoStore(): Promise<KrogerStore | null> {
  const { rows } = await pool.query<{
    external_store_id: string;
  }>(
    `SELECT external_store_id
     FROM public.external_store_refs
     WHERE provider = 'kroger'
       AND external_store_id = $1`,
    [DEMO_STORE_ID]
  );

  if (rows.length === 0) return null;

  return {
    locationId: DEMO_STORE_ID,
    name: "GroceryWatch DEMO (sample prices)",
    address: "Synthetic sample data - not a real Kroger store",
    latitude: null,
    longitude: null,
  };
}

type DemoProductRow = {
  barcode: string;
  name: string;
  brand: string | null;
  package_size: string | null;
  current_price: string;
  last_price_kind: "regular" | "promo" | null;
};

export async function demoProducts(
  search: string,
  locationId = DEMO_STORE_ID
): Promise<KrogerCatalogItem[]> {
  const { rows } = await pool.query<DemoProductRow>(
    `SELECT
        i.upc AS barcode,
        i.name,
        NULL::text AS brand,
        CASE
          WHEN i.size IS NOT NULL
           AND i.unit_of_measure IS NOT NULL
          THEN i.size::text || ' ' || i.unit_of_measure
          ELSE NULL
        END AS package_size,
        l.last_observed_price::text AS current_price,
        l.last_price_kind
     FROM public.external_listings l
     JOIN public.inventory inv
       ON inv.inventory_id = l.inventory_id
     JOIN public.items i
       ON i.item_id = inv.item_id
     WHERE l.provider = 'kroger'
       AND l.external_store_id = $1
       AND i.name ILIKE '%' || $2 || '%'
       AND l.last_observed_price IS NOT NULL
     ORDER BY i.name
     LIMIT 20`,
    [locationId, search]
  );

  return rows.map((row) => ({
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    packageSize: row.package_size,
    price:
      row.last_price_kind === "promo"
        ? null
        : Number(row.current_price),
    promoPrice:
      row.last_price_kind === "promo"
        ? Number(row.current_price)
        : null,
  }));
}

export async function demoPrices(
  locationId: string,
  barcodes: string[]
): Promise<KrogerPrice[]> {
  const { rows } = await pool.query<{
    barcode: string;
    current_price: string;
    last_price_kind: "regular" | "promo" | null;
  }>(
    `SELECT
        external_product_id AS barcode,
        last_observed_price::text AS current_price,
        last_price_kind
     FROM public.external_listings
     WHERE provider = 'kroger'
       AND external_store_id = $1
       AND external_product_id = ANY($2::text[])
       AND last_observed_price IS NOT NULL`,
    [locationId, barcodes]
  );

  const byBarcode = new Map(
    rows.map((row) => [row.barcode, row])
  );

  return barcodes.map((barcode) => {
    const found = byBarcode.get(barcode);

    return {
      barcode,
      price:
        found && found.last_price_kind !== "promo"
          ? Number(found.current_price)
          : null,
      promoPrice:
        found?.last_price_kind === "promo"
          ? Number(found.current_price)
          : null,
    };
  });
}


export async function demoHistory(
  barcode: string,
  locationId = DEMO_STORE_ID
): Promise<PriceHistoryResponse | null> {
  const listing = await pool.query<{
    listing_id: string;
    tracking_started_at: Date;
    last_checked_at: Date | null;
  }>(
    `SELECT
        listing_id,
        tracking_started_at,
        last_checked_at
     FROM public.external_listings
     WHERE provider = 'kroger'
       AND external_product_id = $1
       AND external_store_id = $2`,
    [barcode, locationId]
  );

  const item = listing.rows[0];

  if (!item) return null;

  const { rows } = await pool.query<{
    price_history_id: string;
    price: string;
    price_kind: "regular" | "promo";
    creation_time: Date;
  }>(
    `SELECT
        price_history_id,
        price,
        price_kind,
        creation_time
     FROM public.price_history
     WHERE listing_id = $1
     ORDER BY creation_time DESC,
              price_history_id DESC
     LIMIT 100`,
    [item.listing_id]
  );

  return {
    listingId: item.listing_id,
    trackingStartedAt: item.tracking_started_at,
    lastCheckedAt: item.last_checked_at,
    refreshed: false,
    history: rows.map((row) => ({
      id: row.price_history_id,
      price: Number(row.price),
      kind: row.price_kind,
      observedAt: row.creation_time,
    })),
  };
}