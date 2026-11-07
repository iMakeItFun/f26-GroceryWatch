/** Default sales tax estimate. Replace with a location-specific rate when available. */
export const ESTIMATED_TAX_RATE = 0.06;

export function calculateTax(subtotal: number, rate = ESTIMATED_TAX_RATE) {
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new RangeError("Subtotal must be a finite number zero or greater.");
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new RangeError("Tax rate must be between 0 and 1.");
  }
  return Math.round(subtotal * rate * 100) / 100;
}

export function calculateFinalPrice(subtotal: number, rate = ESTIMATED_TAX_RATE) {
  return Math.round((subtotal + calculateTax(subtotal, rate)) * 100) / 100;
}

export function calculateShoppingListTotal(
  items: ReadonlyArray<{ price: number; quantity?: number | null }>,
  rate = ESTIMATED_TAX_RATE
) {
  const totalCents = items.reduce((sum, item) => {
    const quantity = item.quantity ?? 1;
    return sum + Math.round(calculateFinalPrice(item.price * quantity, rate) * 100);
  }, 0);
  return totalCents / 100;
}
