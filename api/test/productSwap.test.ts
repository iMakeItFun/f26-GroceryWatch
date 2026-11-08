import test from "node:test";
import assert from "node:assert/strict";

import {
  parseSingleProductSwapInput,
  parseStoreSwapInput,
} from "../src/productSwap";

const store = {
  locationId: "12345",
  name: "Kroger",
  address: "100 Main St",
};

test("whole-list swaps validate store and unique priced products", () => {
  const parsed = parseStoreSwapInput({
    store,
    items: [
      { id: "00000000-0000-0000-0000-000000000001", price: "2.49" },
      { id: "00000000-0000-0000-0000-000000000002", price: 4 },
    ],
  });

  assert.deepEqual(parsed, {
    store,
    items: [
      { id: "00000000-0000-0000-0000-000000000001", price: 2.49 },
      { id: "00000000-0000-0000-0000-000000000002", price: 4 },
    ],
  });
});

test("whole-list swaps reject missing, duplicate, or invalid products", () => {
  assert.equal(parseStoreSwapInput({ store, items: [] }), "Products are required for a whole-list swap.");
  assert.equal(
    typeof parseStoreSwapInput({
      store,
      items: [
        { id: "00000000-0000-0000-0000-000000000001", price: 2 },
        { id: "00000000-0000-0000-0000-000000000001", price: 3 },
      ],
    }),
    "string"
  );
  assert.equal(
    typeof parseStoreSwapInput({
      store,
      items: [{ id: "not-an-id", price: 2 }],
    }),
    "string"
  );
});

test("single-item swaps validate the selected price and store", () => {
  assert.deepEqual(
    parseSingleProductSwapInput({ store, price: "3.25" }),
    { store, price: 3.25 }
  );
  assert.equal(
    typeof parseSingleProductSwapInput({ store, price: -1 }),
    "string"
  );
  assert.equal(
    typeof parseSingleProductSwapInput({
      store: { ...store, locationId: "invalid/store" },
      price: 3,
    }),
    "string"
  );
});
