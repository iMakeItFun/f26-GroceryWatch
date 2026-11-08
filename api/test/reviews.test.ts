import test from "node:test";
import assert from "node:assert/strict";

import { parseReviewInput, parseReviewStoreId } from "../src/reviews";

test("review store IDs accept Kroger IDs and reject invalid values", () => {
  assert.equal(parseReviewStoreId(" 12345 "), "12345");
  assert.equal(parseReviewStoreId("invalid/store"), null);
  assert.equal(parseReviewStoreId(null), null);
});

test("review input trims text and validates store and rating", () => {
  assert.deepEqual(
    parseReviewInput({
      locationId: " 12345 ",
      storeName: " Kroger ",
      storeAddress: " 1 Main St ",
      rating: 5,
      comment: " Great experience ",
    }),
    {
      locationId: "12345",
      storeName: "Kroger",
      storeAddress: "1 Main St",
      rating: 5,
      comment: "Great experience",
    }
  );
});

test("review input rejects missing or invalid fields", () => {
  assert.equal(typeof parseReviewInput(null), "string");
  assert.equal(
    typeof parseReviewInput({
      locationId: "invalid/store",
      storeName: "Kroger",
      rating: 5,
      comment: "Great experience",
    }),
    "string"
  );
  assert.equal(
    typeof parseReviewInput({
      locationId: "12345",
      storeName: "Kroger",
      rating: 6,
      comment: "Great experience",
    }),
    "string"
  );
  assert.equal(
    typeof parseReviewInput({
      locationId: "12345",
      storeName: "Kroger",
      rating: 4,
      comment: "   ",
    }),
    "string"
  );
});
