import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateTaxEstimate,
  parseTaxEstimateInput,
  TaxLocationNotFoundError,
  TaxProviderRequestError,
} from "../src/tax";

test("tax estimate input validates ZIP codes, item IDs, prices, and quantities", () => {
  assert.deepEqual(
    parseTaxEstimateInput({
      zip: " 23529 ",
      items: [{ id: "apple", price: 1.25, quantity: 2 }],
    }),
    {
      zip: "23529",
      items: [{ id: "apple", price: 1.25, quantity: 2 }],
    }
  );
  assert.match(String(parseTaxEstimateInput({ zip: "1234", items: [] })), /ZIP code/);
  assert.match(
    String(
      parseTaxEstimateInput({
        zip: "23529",
        items: [
          { id: "same", price: 1, quantity: 1 },
          { id: "same", price: 2, quantity: 1 },
        ],
      })
    ),
    /unique/
  );
  assert.match(
    String(parseTaxEstimateInput({
      zip: "23529",
      items: [{ id: "apple", price: -1, quantity: 1 }],
    })),
    /prices/
  );
  assert.match(
    String(parseTaxEstimateInput({
      zip: "23529",
      items: [{ id: "apple", price: 1, quantity: 1.5 }],
    })),
    /quantities/
  );
});

test("tax estimate applies grocery tax codes and returns consistent item and cart totals", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith("/rates/23529")) {
      return Response.json({ rate: { state: "VA", city: "Norfolk" } });
    }

    return Response.json({
      tax: {
        rate: 0.0257,
        amount_to_collect: 0.18,
        breakdown: {
          line_items: [
            { id: "apple", tax_collectable: 0.12, combined_tax_rate: 0.03 },
            { id: "milk", tax_collectable: 0.06, combined_tax_rate: 0.02 },
          ],
        },
      },
    });
  };

  const estimate = await calculateTaxEstimate(
    {
      zip: "23529",
      items: [
        { id: "apple", price: 2, quantity: 2 },
        { id: "milk", price: 3, quantity: 1 },
      ],
    },
    "test-api-key",
    fetcher
  );

  assert.deepEqual(estimate, {
    zip: "23529",
    jurisdiction: { city: "Norfolk", state: "VA" },
    rate: 0.0257,
    subtotal: 7,
    tax: 0.18,
    total: 7.18,
    rateBasis: "taxjar",
    items: [
      { id: "apple", rate: 0.03, subtotal: 4, tax: 0.12, total: 4.12 },
      { id: "milk", rate: 0.02, subtotal: 3, tax: 0.06, total: 3.06 },
    ],
  });
  assert.equal(requests.length, 2);
  assert.equal(
    (requests[1]?.init?.headers as Record<string, string>).Authorization,
    "Bearer test-api-key"
  );
  const body = JSON.parse(String(requests[1]?.init?.body));
  assert.equal(body.from_zip, "23529");
  assert.equal(body.to_zip, "23529");
  assert.equal(body.nexus_addresses[0].state, "VA");
  assert.deepEqual(
    body.line_items.map((item: { product_tax_code: string }) => item.product_tax_code),
    ["40030", "40030"]
  );
});

test("tax estimate uses offline state grocery rates when TaxJar is not configured", async () => {
  const estimate = await calculateTaxEstimate(
    {
      zip: "23517",
      items: [
        { id: "banana", price: 0.59, quantity: 1 },
        { id: "milk", price: 2, quantity: 1 },
      ],
    },
    "",
    async () => {
      throw new Error("Offline estimates must not call a provider.");
    }
  );

  assert.deepEqual(estimate, {
    zip: "23517",
    jurisdiction: { city: "Norfolk", state: "VA" },
    rate: 0.01,
    subtotal: 2.59,
    tax: 0.03,
    total: 2.62,
    rateBasis: "state_estimate",
    items: [
      { id: "banana", rate: 0.01, subtotal: 0.59, tax: 0.01, total: 0.6 },
      { id: "milk", rate: 0.01, subtotal: 2, tax: 0.02, total: 2.02 },
    ],
  });
});

test("tax estimate rejects ZIP codes outside the offline state dataset", async () => {
  await assert.rejects(
    calculateTaxEstimate(
      { zip: "00000", items: [{ id: "apple", price: 1, quantity: 1 }] },
      ""
    ),
    TaxLocationNotFoundError
  );
});

test("tax estimate rejects inconsistent provider results", async () => {

  let responseNumber = 0;
  const invalidProvider: typeof fetch = async () => {
    responseNumber += 1;
    return responseNumber === 1
      ? Response.json({ rate: { state: "VA" } })
      : Response.json({
          tax: {
            rate: 0,
            amount_to_collect: 1,
            breakdown: {
              line_items: [
                { id: "apple", tax_collectable: 0, combined_tax_rate: 0 },
              ],
            },
          },
        });
  };

  await assert.rejects(
    calculateTaxEstimate(
      { zip: "23529", items: [{ id: "apple", price: 1, quantity: 1 }] },
      "test-api-key",
      invalidProvider
    ),
    TaxProviderRequestError
  );
});
