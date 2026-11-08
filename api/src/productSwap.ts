export type StoreChoice = {
  locationId: string;
  name: string;
  address: string;
};

export type ProductSwap = {
  id: string;
  price: number;
};

export type StoreSwapInput = {
  store: StoreChoice;
  items: ProductSwap[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function parseStoreChoice(value: unknown): StoreChoice | string {
  if (!value || typeof value !== "object") return "A store is required.";

  const raw = value as Record<string, unknown>;
  const locationId =
    typeof raw.locationId === "string" ? raw.locationId.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const address = typeof raw.address === "string" ? raw.address.trim() : "";

  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(locationId)) {
    return "Invalid store ID.";
  }
  if (!name) return "Store name is required.";

  return { locationId, name, address };
}

function parsePrice(value: unknown): number | string {
  const price =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(price) || price < 0 || price > 99_999_999.99) {
    return "Price must be a number zero or greater.";
  }

  return Math.round(price * 100) / 100;
}

function parseProductSwap(value: unknown): ProductSwap | string {
  if (!value || typeof value !== "object") return "A product swap is invalid.";

  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!UUID_PATTERN.test(id)) return "Invalid product ID.";

  const price = parsePrice(raw.price);
  if (typeof price === "string") return price;
  return { id, price };
}

export function parseStoreSwapInput(body: unknown): StoreSwapInput | string {
  if (!body || typeof body !== "object") return "Request body is required.";

  const raw = body as Record<string, unknown>;
  const store = parseStoreChoice(raw.store);
  if (typeof store === "string") return store;
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    return "Products are required for a whole-list swap.";
  }

  const items: ProductSwap[] = [];
  const ids = new Set<string>();
  for (const value of raw.items) {
    const item = parseProductSwap(value);
    if (typeof item === "string") return item;
    if (ids.has(item.id)) return "Duplicate product IDs are not allowed.";
    ids.add(item.id);
    items.push(item);
  }

  return { store, items };
}

export function parseSingleProductSwapInput(
  body: unknown
): { store: StoreChoice; price: number } | string {
  if (!body || typeof body !== "object") return "Request body is required.";

  const raw = body as Record<string, unknown>;
  const store = parseStoreChoice(raw.store);
  if (typeof store === "string") return store;
  const price = parsePrice(raw.price);
  if (typeof price === "string") return price;

  return { store, price };
}
