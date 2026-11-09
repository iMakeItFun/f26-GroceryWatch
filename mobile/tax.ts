// Statewide base sales-tax rates; local taxes and grocery-specific exemptions are not included.
const STATE_TAX_RATES: Readonly<Record<string, number>> = {
  AL: 0.04,
  AK: 0,
  AZ: 0.056,
  AR: 0.065,
  CA: 0.0725,
  CO: 0.029,
  CT: 0.0635,
  DE: 0,
  FL: 0.06,
  GA: 0.04,
  HI: 0.04,
  ID: 0.06,
  IL: 0.0625,
  IN: 0.07,
  IA: 0.06,
  KS: 0.065,
  KY: 0.06,
  LA: 0.05,
  ME: 0.055,
  MD: 0.06,
  MA: 0.0625,
  MI: 0.06,
  MN: 0.06875,
  MS: 0.07,
  MO: 0.04225,
  MT: 0,
  NE: 0.055,
  NV: 0.0685,
  NH: 0,
  NJ: 0.06625,
  NM: 0.04875,
  NY: 0.04,
  NC: 0.0475,
  ND: 0.05,
  OH: 0.0575,
  OK: 0.045,
  OR: 0,
  PA: 0.06,
  RI: 0.07,
  SC: 0.06,
  SD: 0.042,
  TN: 0.07,
  TX: 0.0625,
  UT: 0.0485,
  VT: 0.06,
  VA: 0.043,
  WA: 0.065,
  WV: 0.06,
  WI: 0.05,
  WY: 0.04,
  DC: 0.06,
};

export function getStateTaxRate(state: string | null | undefined): number | null {
  if (!state) return null;
  return STATE_TAX_RATES[state.trim().toUpperCase()] ?? null;
}

export function calculateTax(subtotal: number, rate: number) {
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new RangeError("Subtotal must be a finite number zero or greater.");
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new RangeError("Tax rate must be between 0 and 1.");
  }
  const tax = subtotal * rate;
  return Math.round((tax + Number.EPSILON * Math.abs(tax)) * 100) / 100;
}

export function calculateFinalPrice(subtotal: number, rate: number) {
  const total = subtotal + calculateTax(subtotal, rate);
  return Math.round((total + Number.EPSILON * Math.abs(total)) * 100) / 100;
}

export function calculateShoppingListTotal(
  items: ReadonlyArray<{
    price: number;
    quantity?: number | null;
    taxState: string | null;
  }>
): number | null {
  let totalCents = 0;
  for (const item of items) {
    const rate = getStateTaxRate(item.taxState);
    if (rate === null) return null;
    const quantity = item.quantity ?? 1;
    totalCents += Math.round(calculateFinalPrice(item.price * quantity, rate) * 100);
  }
  return totalCents / 100;
}
