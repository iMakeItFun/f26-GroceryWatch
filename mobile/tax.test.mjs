import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFinalPrice,
  calculateShoppingListTotal,
  calculateTax,
  getStateTaxRate,
} from "./tax.ts";

test("uses the statewide rate for the item's state", () => {
  const states =
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(
      " "
    );
  for (const state of states) {
    assert.notEqual(
      getStateTaxRate(state),
      null,
      `${state} should have a configured statewide rate`
    );
  }
  assert.equal(getStateTaxRate("VA"), 0.043);
  assert.equal(getStateTaxRate("ca"), 0.0725);
  assert.equal(getStateTaxRate("OR"), 0);
  assert.equal(getStateTaxRate("??"), null);
  assert.equal(calculateTax(10, 0.043), 0.43);
  assert.equal(calculateFinalPrice(10, 0.043), 10.43);
});

test("rounds tax to cents and rejects invalid amounts or rates", () => {
  assert.equal(calculateTax(1.05, 0.06), 0.06);
  assert.throws(() => calculateTax(-1), RangeError);
  assert.throws(() => calculateTax(Number.NaN), RangeError);
  assert.throws(() => calculateTax(1, 1.1), RangeError);
});

test("adds each item's state tax consistently to list totals", () => {
  const items = [
    { price: 2.5, quantity: 2, taxState: "VA" },
    { price: 1.25, quantity: null, taxState: "CA" },
  ];

  assert.equal(calculateTax(items[0].price * items[0].quantity, 0.043), 0.22);
  assert.equal(calculateFinalPrice(items[0].price * items[0].quantity, 0.043), 5.22);
  assert.equal(calculateFinalPrice(items[1].price, 0.0725), 1.34);
  assert.equal(calculateShoppingListTotal(items), 6.56);
  assert.equal(calculateShoppingListTotal([]), 0);
  assert.equal(calculateShoppingListTotal([{ price: 10, taxState: null }]), null);
});
