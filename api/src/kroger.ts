import { userEnv } from "./user-env";

const TOKEN_URL = "https://api-ce.kroger.com/v1/connect/oauth2/token";
const API_BASE = "https://api-ce.kroger.com/v1";
const LOOKUP_BATCH = 4;

export class KrogerNotConfiguredError extends Error {
  constructor() {
    super("Kroger is not configured.");
  }
}

export class KrogerRequestError extends Error {
  constructor(
    message = "Kroger request failed.",
    public readonly status?: number
  ) {
    super(message);
    this.name = "KrogerRequestError";
  }
}

export type KrogerStore = {
  locationId: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

export type KrogerPrice = {
  barcode: string;
  price: number | null;
  promoPrice: number | null;
};

export type KrogerCatalogItem = {
  barcode: string | null;
  name: string;
  brand: string | null;
  packageSize: string | null;
  price: number | null;
  promoPrice: number | null;
};

export type KrogerStoreDetails = {
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  }
};

type TokenCache = {
  token: string;
  expiresAt: number;
};

let cachedToken: TokenCache | null = null;

function credentials() {
  const id = userEnv("KROGER_CLIENT_ID");
  const secret = userEnv("KROGER_CLIENT_SECRET");
  if (!id || !secret) return null;
  return { id, secret };
}

export function padBarcode(barcode: string) {
  const digits = barcode.trim();
  if (!/^\d+$/.test(digits) || digits.length >= 13) return digits;
  return digits.padStart(13, "0");
}

async function accessToken() {
  const creds = credentials();
  if (!creds) throw new KrogerNotConfiguredError();

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "product.compact",
  });
  const basic = Buffer.from(`${creds.id}:${creds.secret}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (response.status === 401) {
    throw new KrogerRequestError("Kroger rejected the client credentials.");
  }
  if (!response.ok) {
    throw new KrogerRequestError(
      `Kroger authentication failed (HTTP ${response.status}).`,
      response.status
    );
  }

  const data = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof data.access_token !== "string" || data.access_token.length === 0) {
    throw new KrogerRequestError();
  }
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 1800;
  cachedToken = {
    token: data.access_token,
    expiresAt: now + Math.max(expiresIn - 60, 30) * 1000,
  };
  return data.access_token;
}

async function krogerGet(path: string) {
  const token = await accessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  return response;
}

function coordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function storeAddress(address: {
  addressLine1?: unknown;
  city?: unknown;
  state?: unknown;
  zipCode?: unknown;
}) {
  const parts = [address.addressLine1, address.city, address.state, address.zipCode]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim());
  return parts.join(", ");
}

export async function searchStores(zip: string): Promise<KrogerStore[]> {
  const response = await krogerGet(
    `/locations?filter.zipCode.near=${encodeURIComponent(zip)}&filter.limit=5`
  );
  if (!response.ok) {
    throw new KrogerRequestError(
      `Kroger store search failed (HTTP ${response.status}).`,
      response.status
    );
  }

  const data = (await response.json()) as {
    data?: Array<{
      locationId?: unknown;
      name?: unknown;
      address?: {
        addressLine1?: unknown;
        city?: unknown;
        state?: unknown;
        zipCode?: unknown;
      };
      geolocation?: {
        latitude?: unknown;
        longitude?: unknown;
      };
    }>;
  };

  const stores: KrogerStore[] = [];
  for (const store of data.data ?? []) {
    if (typeof store.locationId !== "string" || typeof store.name !== "string") continue;
    stores.push({
      locationId: store.locationId,
      name: store.name,
      address: storeAddress(store.address ?? {}),
      latitude: coordinate(store.geolocation?.latitude),
      longitude: coordinate(store.geolocation?.longitude),
    });
  }
  return stores;
}

function moneyOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function shelfPrice(value: unknown) {
  const amount = moneyOrNull(value);
  return amount !== null && amount > 0 ? amount : null;
}

function textOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function searchProducts(term: string, locationId: string) {
  const params = new URLSearchParams({
    "filter.term": term,
    "filter.locationId": locationId,
    "filter.limit": "20",
  });
  const response = await krogerGet(`/products?${params.toString()}`);

  if (!response.ok) {
    throw new KrogerRequestError(
      `Kroger product search failed (HTTP ${response.status}).`,
      response.status
    );
  }

  const data = (await response.json()) as {
    data?: Array<{
      upc?: unknown;
      brand?: unknown;
      description?: unknown;
      items?: Array<{ size?: unknown; price?: { regular?: unknown; promo?: unknown } }>;
    }>;
  };

  const products: KrogerCatalogItem[] = [];
  for (const product of data.data ?? []) {
    const name = textOrNull(product.description);
    if (!name) continue;
    const item = product.items?.[0];
    const price = shelfPrice(item?.price?.regular);
    const promoPrice = shelfPrice(item?.price?.promo);
    if (price === null && promoPrice === null) continue;
    products.push({
      barcode: textOrNull(product.upc),
      name,
      brand: textOrNull(product.brand),
      packageSize: textOrNull(item?.size),
      price,
      promoPrice,
    });
  }
  return products;
}

async function priceForBarcode(locationId: string, barcode: string): Promise<KrogerPrice> {
  const upc = padBarcode(barcode);
  const response = await krogerGet(
    `/products/${encodeURIComponent(upc)}?filter.locationId=${encodeURIComponent(locationId)}`
  );

  if (response.status == 404) {
    return {barcode, price: null, promoPrice: null}
  }
  
  if (!response.ok) {
    throw new KrogerRequestError(
      `Kroger product lookup failed (HTTP ${response.status}).`,
      response.status
    );
  }

  const body = (await response.json()) as {
    data?: {
      items?: Array<{ price?: { regular?: unknown; promo?: unknown } }>;
    };
  };
  const price = body.data?.items?.[0]?.price;
  return {
    barcode,
    price: moneyOrNull(price?.regular),
    promoPrice: moneyOrNull(price?.promo),
  };
}

export async function pricesForBarcodes(locationId: string, barcodes: string[]) {
  const prices: KrogerPrice[] = [];
  for (let index = 0; index < barcodes.length; index += LOOKUP_BATCH) {
    const batch = barcodes.slice(index, index + LOOKUP_BATCH);
    const found = await Promise.all(
      batch.map((barcode) => priceForBarcode(locationId, barcode))
    );
    prices.push(...found);
  }
  return prices;
}

export async function getKrogerStoreDetails(locationId: string): Promise<KrogerStoreDetails | null> {
  const response = await krogerGet(`/locations/${encodeURIComponent(locationId)}`);

  if (response.status == 404) return null;
  if (!response.ok) {
    throw new KrogerRequestError("Unable to retrieve Kroger store details.");
  }

  const payload = (await response.json()) as {
    data?: {
      name?: unknown;
      address?: {
        addressLine1?: unknown;
        city?: unknown;
        state?: unknown;
        zipCode?: unknown;
      }
    }
  }

  const data = payload.data;
  if (!data) return null;

  const name = textOrNull(data.name);
  if (!name) return null;

  return {
    name,
    address: {
      street: textOrNull(data.address?.addressLine1) ?? "",
      city: textOrNull(data.address?.city) ?? "",
      state: textOrNull(data.address?.state) ?? "",
      zip: textOrNull(data.address?.zipCode) ?? "",
    },
  }
}