import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFinalPrice,
  calculateShoppingListTotal,
  calculateTax,
} from "./tax.ts";

test("calculates tax and final price using the estimated rate", () => {
  assert.equal(calculateTax(10), 0.6);
  assert.equal(calculateFinalPrice(10), 10.6);
  assert.equal(calculateFinalPrice(10, 0), 10);
});

test("rounds tax to cents and rejects invalid amounts or rates", () => {
  assert.equal(calculateTax(1.05), 0.06);
  assert.throws(() => calculateTax(-1), RangeError);
  assert.throws(() => calculateTax(Number.NaN), RangeError);
  assert.throws(() => calculateTax(1, 1.1), RangeError);
});

test("adds tax consistently to each shopping-list line and total", () => {
  const items = [
    { price: 2.5, quantity: 2 },
    { price: 1.25, quantity: null },
  ];

  assert.equal(calculateFinalPrice(items[0].price * items[0].quantity), 5.3);
  assert.equal(calculateFinalPrice(items[1].price), 1.33);
  assert.equal(calculateShoppingListTotal(items), 6.63);
  assert.equal(calculateShoppingListTotal([]), 0);
});
