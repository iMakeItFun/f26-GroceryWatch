import test from "node:test";
import assert from "node:assert/strict";

import { searchProducts } from "../src/kroger";

test("searchProducts retries a temporary Kroger 503", async () => {
  const previousFetch = globalThis.fetch;
  const previousClientId = process.env.KROGER_CLIENT_ID;
  const previousClientSecret = process.env.KROGER_CLIENT_SECRET;
  let productRequests = 0;

  process.env.KROGER_CLIENT_ID = "test-client";
  process.env.KROGER_CLIENT_SECRET = "test-secret";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/connect/oauth2/token")) {
      return new Response(
        JSON.stringify({ access_token: "test-token", expires_in: 1800 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    productRequests += 1;
    if (productRequests === 1) return new Response(null, { status: 503 });

    return new Response(
      JSON.stringify({
        data: [
          {
            upc: "0123456789012",
            description: "Milk",
            items: [{ size: "1 gal", price: { regular: 3.99 } }],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const products = await searchProducts("milk", "12345");
    assert.equal(productRequests, 2);
    assert.equal(products.length, 1);
    assert.equal(products[0].name, "Milk");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousClientId === undefined) delete process.env.KROGER_CLIENT_ID;
    else process.env.KROGER_CLIENT_ID = previousClientId;
    if (previousClientSecret === undefined) delete process.env.KROGER_CLIENT_SECRET;
    else process.env.KROGER_CLIENT_SECRET = previousClientSecret;
  }
});
