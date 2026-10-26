const { test, after } = require("node:test");
const assert = require("node:assert/strict");

// Keep these route/adapter tests independent of local credentials and services.
require.cache[require.resolve("../dist/user-env")] = {
  exports: { userEnv: (name) => name.startsWith("KROGER_") ? "test" : "" },
};
const { app } = require("../dist/index");
const originalFetch = global.fetch;
let locationRequests = [];
let upstreamStatus = 200;
let storeRows = [{
  locationId: "123", name: "Nearby Kroger",
  address: { city: "Norfolk", state: "VA" },
  geolocation: { latitude: 36.85, longitude: -76.29 },
}];
global.fetch = async (url) => {
  if (String(url).includes("/oauth2/token")) {
    return Response.json({ access_token: "test-token", expires_in: 1800 });
  }
  locationRequests.push(new URL(url));
  return Response.json({ data: storeRows }, { status: upstreamStatus });
};
after(async () => { global.fetch = originalFetch; await app.close(); });

test("ZIP and coordinate routes use the correct Kroger filters and normalize stores", async () => {
  for (const [query, expected] of [
    ["zip=23508", { "filter.zipCode.near": "23508" }],
    ["latitude=36.85&longitude=-76.29", { "filter.lat.near": "36.85", "filter.lon.near": "-76.29" }],
    ["latitude=0&longitude=0", { "filter.lat.near": "0", "filter.lon.near": "0" }],
    ["latitude=-90&longitude=180", { "filter.lat.near": "-90", "filter.lon.near": "180" }],
  ]) {
    const response = await app.inject({ url: `/stores?${query}` });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), [{ locationId: "123", name: "Nearby Kroger",
      address: "Norfolk, VA", latitude: 36.85, longitude: -76.29 }]);
    const params = Object.fromEntries(locationRequests.at(-1).searchParams);
    assert.deepEqual(params, { ...expected, "filter.limit": "5" });
  }
});

test("invalid and mixed inputs return 400 without calling Kroger", async () => {
  const before = locationRequests.length;
  for (const query of ["", "zip=1234", "latitude=1", "longitude=2", "latitude=&longitude=2",
    "latitude=NaN&longitude=2", "latitude=Infinity&longitude=2",
    "latitude=91&longitude=2", "latitude=1&longitude=-181",
    "zip=23508&latitude=1&longitude=2", "zip=&latitude=1&longitude=2",
    "zip=23508&zip=23509&latitude=1&longitude=2", "latitude=1&latitude=2&longitude=3"]) {
    const response = await app.inject({ url: `/stores?${query}` });
    assert.equal(response.statusCode, 400, query);
  }
  assert.equal(locationRequests.length, before);
});

test("empty store results and upstream failures are handled", async () => {
  storeRows = [];
  let response = await app.inject({ url: "/stores?latitude=36&longitude=-76" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), []);
  upstreamStatus = 503;
  response = await app.inject({ url: "/stores?latitude=36&longitude=-76" });
  assert.equal(response.statusCode, 502);
  assert.equal(response.json().error, "Kroger request failed.");
});
