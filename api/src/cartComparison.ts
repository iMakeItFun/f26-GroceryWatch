export type CartItem = {
  id?: string;
  name: string;
  barcode?: string | null;
  quantity?: number | null;
};

export type StoreQuote = {
  barcode: string;
  price: number | null;
  promoPrice: number | null;
};

export type ComparisonStore = {
  locationId: string;
  name: string;
  address: string;
};

export type CalculatedStoreItem = {
  id?: string;
  name: string;
  quantity: number;
  price: number | null;
};

export type CalculatedStoreComparison = {
  id: string;
  name: string;
  address: string;
  total: number;
  pricedItems: number;
  items: CalculatedStoreItem[];
};

export type CartComparisonInput = {
  zip: string;
  items: CartItem[];
};

export function parseCartComparisonInput(
  body: unknown
): CartComparisonInput | string {
  if (!body || typeof body !== "object") {
    return "Request body is required.";
  }

  const raw = body as Record<string, unknown>;
  const zip = typeof raw.zip === "string" ? raw.zip.trim() : "";
  if (!/^\d{5}$/.test(zip)) {
    return "A 5-digit zip code is required.";
  }

  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    return "Shopping list items are required to compare.";
  }

  const items: CartItem[] = [];
  for (const rawItem of raw.items) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) continue;

    const id = typeof item.id === "string" ? item.id.trim() : undefined;
    const barcode =
      typeof item.barcode === "string" && item.barcode.trim()
        ? item.barcode.trim()
        : null;
    const quantity =
      typeof item.quantity === "number" && item.quantity > 0
        ? Math.floor(item.quantity)
        : 1;

    items.push({ id, name, barcode, quantity });
  }

  if (items.length === 0) {
    return "Shopping list must contain valid items.";
  }

  return { zip, items };
}

export function calculateStoreComparison(
  store: ComparisonStore,
  items: CartItem[],
  quotes: Map<string, StoreQuote>
): CalculatedStoreComparison {
  let total = 0;
  let pricedItems = 0;

  const computedItems: CalculatedStoreItem[] = items.map((item) => {
    const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
    if (!item.barcode) {
      return { id: item.id, name: item.name, quantity, price: null };
    }

    const quote = quotes.get(item.barcode);
    if (!quote) {
      return { id: item.id, name: item.name, quantity, price: null };
    }

    const unitPrice =
      quote.promoPrice !== null &&
      quote.promoPrice !== undefined &&
      (quote.price === null || quote.promoPrice < quote.price)
        ? quote.promoPrice
        : quote.price;

    if (unitPrice === null || unitPrice === undefined || unitPrice <= 0) {
      return { id: item.id, name: item.name, quantity, price: null };
    }

    total += unitPrice * quantity;
    pricedItems += 1;
    return { id: item.id, name: item.name, quantity, price: unitPrice };
  });

  return {
    id: store.locationId,
    name: store.name,
    address: store.address,
    total: Math.round(total * 100) / 100,
    pricedItems,
    items: computedItems,
  };
}

export function rankStoreComparisons(
  comparisons: CalculatedStoreComparison[]
): CalculatedStoreComparison[] {
  return [...comparisons].sort((a, b) => {
    if (a.pricedItems !== b.pricedItems) {
      return b.pricedItems - a.pricedItems;
    }
    return a.total - b.total;
  });
}
