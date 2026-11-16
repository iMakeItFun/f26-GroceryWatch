import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCartComparisonInput,
  calculateStoreComparison,
  rankStoreComparisons,
  CartItem,
  StoreQuote,
  ComparisonStore,
  CalculatedStoreComparison,
} from "../src/cartComparison";

test("parseCartComparisonInput validates 5-digit zip code and item array", () => {
  assert.equal(typeof parseCartComparisonInput(null), "string");
  assert.equal(typeof parseCartComparisonInput({}), "string");
  assert.equal(
    parseCartComparisonInput({ zip: "123", items: [{ name: "Milk" }] }),
    "A 5-digit zip code is required."
  );
  assert.equal(
    parseCartComparisonInput({ zip: "23508", items: [] }),
    "Shopping list items are required to compare."
  );

  const parsed = parseCartComparisonInput({
    zip: " 23508 ",
    items: [
      { id: "1", name: "Milk", barcode: "12345", quantity: 2 },
      { name: "Bread", quantity: -1 },
    ],
  });

  assert.notEqual(typeof parsed, "string");
  if (typeof parsed !== "string") {
    assert.equal(parsed.zip, "23508");
    assert.equal(parsed.items.length, 2);
    assert.equal(parsed.items[0].quantity, 2);
    assert.equal(parsed.items[1].quantity, 1); // Defaults invalid quantity to 1
  }
});

test("calculateStoreComparison calculates totals, quantities, and selects promo prices", () => {
  const store: ComparisonStore = {
    locationId: "store-1",
    name: "Kroger Portsmouth",
    address: "1301 Frederick Blvd",
  };

  const items: CartItem[] = [
    { id: "1", name: "Whole Milk", barcode: "0001", quantity: 2 },
    { id: "2", name: "Eggs", barcode: "0002", quantity: 1 },
    { id: "3", name: "Custom Apple", barcode: null, quantity: 4 },
    { id: "4", name: "Missing Quote Bread", barcode: "0004", quantity: 1 },
  ];

  const quotes = new Map<string, StoreQuote>([
    // Whole Milk: regular 4.00, promo 3.50 (should pick promo 3.50 * 2 = 7.00)
    ["0001", { barcode: "0001", price: 4.0, promoPrice: 3.5 }],
    // Eggs: regular 2.99, promo null (should pick regular 2.99 * 1 = 2.99)
    ["0002", { barcode: "0002", price: 2.99, promoPrice: null }],
  ]);

  const result = calculateStoreComparison(store, items, quotes);

  assert.equal(result.id, "store-1");
  assert.equal(result.name, "Kroger Portsmouth");
  assert.equal(result.total, 9.99); // 7.00 + 2.99
  assert.equal(result.pricedItems, 2);
  assert.equal(result.items.length, 4);

  // Check milk item
  assert.deepEqual(result.items[0], {
    id: "1",
    name: "Whole Milk",
    quantity: 2,
    price: 3.5,
  });

  // Check custom apple item (no barcode)
  assert.deepEqual(result.items[2], {
    id: "3",
    name: "Custom Apple",
    quantity: 4,
    price: null,
  });

  // Check missing quote item
  assert.deepEqual(result.items[3], {
    id: "4",
    name: "Missing Quote Bread",
    quantity: 1,
    price: null,
  });
});

test("rankStoreComparisons ranks by most priced items first, then lowest total cost", () => {
  const comparisons: CalculatedStoreComparison[] = [
    {
      id: "store-a",
      name: "Store A (More items, higher total)",
      address: "Address A",
      total: 30.0,
      pricedItems: 3,
      items: [],
    },
    {
      id: "store-b",
      name: "Store B (Cheaper total, fewer items)",
      address: "Address B",
      total: 15.0,
      pricedItems: 2,
      items: [],
    },
    {
      id: "store-c",
      name: "Store C (More items, lower total)",
      address: "Address C",
      total: 25.0,
      pricedItems: 3,
      items: [],
    },
  ];

  const ranked = rankStoreComparisons(comparisons);

  assert.equal(ranked[0].id, "store-c"); // 3 items, 25.00
  assert.equal(ranked[1].id, "store-a"); // 3 items, 30.00
  assert.equal(ranked[2].id, "store-b"); // 2 items, 15.00
});

test("parseCartComparisonInput rejects missing or empty item list", () => {
  assert.equal(
    parseCartComparisonInput({ zip: "23508", items: [] }),
    "Shopping list items are required to compare."
  );
  assert.equal(
    parseCartComparisonInput({ zip: "23508", items: [{ name: "   " }] }),
    "Shopping list must contain valid items."
  );
});

