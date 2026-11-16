import zipcodes from "zipcodes";

const TAXJAR_API_URL = "https://api.taxjar.com/v2";
const GROCERY_TAX_CODE = "40030";
const MAX_ITEMS = 100;
const MAX_QUANTITY = 10_000;

// Offline statewide grocery estimates; ZIP-specific local add-ons are not included.
const STATE_GROCERY_TAX_RATES: Record<string, number> = {
  AL: 0.02,
  AK: 0,
  AZ: 0,
  AR: 0,
  CA: 0,
  CO: 0,
  CT: 0,
  DE: 0,
  DC: 0,
  FL: 0,
  GA: 0,
  HI: 0.04,
  ID: 0.06,
  IL: 0,
  IN: 0,
  IA: 0,
  KS: 0,
  KY: 0,
  LA: 0,
  ME: 0,
  MD: 0,
  MA: 0,
  MI: 0,
  MN: 0,
  MS: 0.05,
  MO: 0.01225,
  MT: 0,
  NE: 0,
  NV: 0,
  NH: 0,
  NJ: 0,
  NM: 0.04875,
  NY: 0,
  NC: 0.02,
  ND: 0,
  OH: 0,
  OK: 0,
  OR: 0,
  PA: 0,
  RI: 0,
  SC: 0,
  SD: 0,
  TN: 0.04,
  TX: 0,
  UT: 0.03,
  VT: 0,
  VA: 0.01,
  WA: 0,
  WV: 0,
  WI: 0,
  WY: 0,
};

export type TaxEstimateInput = {
  zip: string;
  items: Array<{
    id: string;
    price: number;
    quantity: number;
  }>;
};

export type TaxEstimate = {
  zip: string;
  jurisdiction: {
    city: string | null;
    state: string;
  };
  rate: number;
  subtotal: number;
  tax: number;
  total: number;
  rateBasis: "taxjar" | "state_estimate";
  items: Array<{
    id: string;
    rate: number;
    subtotal: number;
    tax: number;
    total: number;
  }>;
};

export class TaxLocationNotFoundError extends Error {
  constructor() {
    super("Could not determine a grocery tax rate for this ZIP code.");
    this.name = "TaxLocationNotFoundError";
  }
}

export class TaxProviderRequestError extends Error {
  constructor() {
    super("Tax estimate provider request failed.");
    this.name = "TaxProviderRequestError";
  }
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseTaxEstimateInput(body: unknown): string | TaxEstimateInput {
  if (!body || typeof body !== "object") {
    return "Request body is required.";
  }

  const raw = body as Record<string, unknown>;
  const zip = typeof raw.zip === "string" ? raw.zip.trim() : "";
  if (!/^\d{5}$/.test(zip)) {
    return "A 5-digit ZIP code is required.";
  }

  if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > MAX_ITEMS) {
    return `Between 1 and ${MAX_ITEMS} items are required.`;
  }

  const ids = new Set<string>();
  const items: TaxEstimateInput["items"] = [];
  for (const value of raw.items) {
    if (!value || typeof value !== "object") {
      return "Each item must be an object.";
    }

    const item = value as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id || id.length > 64 || ids.has(id)) {
      return "Item IDs must be unique non-empty strings of at most 64 characters.";
    }
    ids.add(id);

    if (
      typeof item.price !== "number" ||
      !Number.isFinite(item.price) ||
      item.price < 0 ||
      item.price > 99_999_999.99
    ) {
      return "Item prices must be valid non-negative amounts.";
    }

    if (
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 0 ||
      item.quantity > MAX_QUANTITY
    ) {
      return `Item quantities must be whole numbers from 0 to ${MAX_QUANTITY}.`;
    }

    items.push({ id, price: money(item.price), quantity: item.quantity });
  }

  return { zip, items };
}

type TaxProviderFetch = typeof fetch;

async function providerJson(
  url: string,
  apiKey: string,
  fetcher: TaxProviderFetch,
  init?: RequestInit
): Promise<unknown> {
  const response = await fetcher(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new TaxProviderRequestError();
  }
  return response.json();
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function requiredMoney(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? money(value)
    : null;
}

function calculateStateEstimate(input: TaxEstimateInput): TaxEstimate {
  const location = zipcodes.lookup(input.zip);
  const state = location?.state;
  const rate = state ? STATE_GROCERY_TAX_RATES[state] : undefined;
  if (!location || !state || rate === undefined) {
    throw new TaxLocationNotFoundError();
  }

  const items = input.items.map((item) => {
    const subtotal = money(item.price * item.quantity);
    const tax = money(subtotal * rate);
    return {
      id: item.id,
      rate,
      subtotal,
      tax,
      total: money(subtotal + tax),
    };
  });
  const subtotal = money(items.reduce((sum, item) => sum + item.subtotal, 0));
  const tax = money(items.reduce((sum, item) => sum + item.tax, 0));

  return {
    zip: input.zip,
    jurisdiction: { city: location.city || null, state },
    rate,
    subtotal,
    tax,
    total: money(subtotal + tax),
    rateBasis: "state_estimate",
    items,
  };
}

export async function calculateTaxEstimate(
  input: TaxEstimateInput,
  apiKey = process.env.TAXJAR_API_KEY,
  fetcher: TaxProviderFetch = fetch
): Promise<TaxEstimate> {
  if (!apiKey?.trim()) {
    return calculateStateEstimate(input);
  }

  const subtotal = money(
    input.items.reduce(
      (sum, item) => sum + money(item.price * item.quantity),
      0
    )
  );
  const items = input.items.map((item) => ({
    id: item.id,
    rate: 0,
    subtotal: money(item.price * item.quantity),
    tax: 0,
    total: money(item.price * item.quantity),
  }));
  const taxableItems = input.items.filter(
    (item) => item.quantity > 0 && item.price > 0
  );

  if (taxableItems.length === 0) {
    return {
      zip: input.zip,
      jurisdiction: { city: null, state: "" },
      rate: 0,
      subtotal,
      tax: 0,
      total: subtotal,
      rateBasis: "taxjar",
      items,
    };
  }

  const rateResult = objectValue(
    await providerJson(
      `${TAXJAR_API_URL}/rates/${input.zip}`,
      apiKey,
      fetcher
    )
  );
  const rate = objectValue(rateResult?.rate);
  const state = typeof rate?.state === "string" ? rate.state : "";
  const city = typeof rate?.city === "string" ? rate.city : null;
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new TaxProviderRequestError();
  }

  const taxResult = objectValue(
    await providerJson(`${TAXJAR_API_URL}/taxes`, apiKey, fetcher, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_country: "US",
        from_zip: input.zip,
        from_state: state,
        to_country: "US",
        to_zip: input.zip,
        to_state: state,
        amount: subtotal,
        shipping: 0,
        nexus_addresses: [
          { id: "Grocery store", country: "US", zip: input.zip, state },
        ],
        line_items: taxableItems.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unit_price: item.price,
          discount: 0,
          product_tax_code: GROCERY_TAX_CODE,
        })),
      }),
    })
  );
  const tax = objectValue(taxResult?.tax);
  const breakdown = objectValue(tax?.breakdown);
  const providerRate =
    typeof tax?.rate === "number" &&
    Number.isFinite(tax.rate) &&
    tax.rate >= 0 &&
    tax.rate <= 1
      ? tax.rate
      : null;
  const providerTax = requiredMoney(tax?.amount_to_collect);
  const providerItems = breakdown?.line_items;
  if (providerRate === null || providerTax === null || !Array.isArray(providerItems)) {
    throw new TaxProviderRequestError();
  }

  const taxesById = new Map<string, { tax: number; rate: number }>();
  for (const value of providerItems) {
    const line = objectValue(value);
    const id = typeof line?.id === "string" ? line.id : "";
    const lineTax = requiredMoney(line?.tax_collectable);
    const lineRate =
      typeof line?.combined_tax_rate === "number" &&
      Number.isFinite(line.combined_tax_rate) &&
      line.combined_tax_rate >= 0 &&
      line.combined_tax_rate <= 1
        ? line.combined_tax_rate
        : null;
    if (!id || lineTax === null || lineRate === null || taxesById.has(id)) {
      throw new TaxProviderRequestError();
    }
    taxesById.set(id, { tax: lineTax, rate: lineRate });
  }
  if (taxesById.size !== taxableItems.length) {
    throw new TaxProviderRequestError();
  }

  for (const item of items) {
    if (item.subtotal === 0) continue;
    const lineTax = taxesById.get(item.id);
    if (lineTax === undefined) {
      throw new TaxProviderRequestError();
    }
    item.tax = lineTax.tax;
    item.rate = lineTax.rate;
    item.total = money(item.subtotal + lineTax.tax);
  }

  const lineTaxTotal = money(items.reduce((sum, item) => sum + item.tax, 0));
  const roundingAdjustment = money(providerTax - lineTaxTotal);
  const adjustmentItem = [...items]
    .reverse()
    .find(
      (item) =>
        item.subtotal > 0 &&
        money(item.tax + roundingAdjustment) >= 0
    );
  if (
    Math.abs(roundingAdjustment) > 0.01 ||
    (roundingAdjustment !== 0 && !adjustmentItem)
  ) {
    throw new TaxProviderRequestError();
  }
  if (adjustmentItem && roundingAdjustment !== 0) {
    adjustmentItem.tax = money(adjustmentItem.tax + roundingAdjustment);
    adjustmentItem.total = money(adjustmentItem.subtotal + adjustmentItem.tax);
  }

  return {
    zip: input.zip,
    jurisdiction: { city, state },
    rate: providerRate,
    subtotal,
    tax: providerTax,
    total: money(subtotal + providerTax),
    rateBasis: "taxjar",
    items,
  };
}
