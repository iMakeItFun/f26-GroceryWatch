# GroceryWatch Public API

The public `/v1` API is demoed locally. Start the API with `npm run dev` from `api/`, then call endpoints at `http://localhost:3000`.

External clients can read store locations, catalog search results, live prices, and price history through these routes.

## Base URL

`http://localhost:3000`

## Authentication

Most `/v1` endpoints require an API key in the `X-API-Key` header.

```http
X-API-Key: your-api-key
```

Set `PUBLIC_API_KEYS=dev-public-key` in `api/.env` (see `api/.env.example`). Use that key in the header for demos.

| Situation | HTTP status | Error code |
|-----------|-------------|------------|
| Missing or invalid key | `401` | `UNAUTHORIZED` |
| No keys configured on the server | `503` | `SERVICE_UNAVAILABLE` |

`GET /v1/health` does **not** require an API key.

## Response format

Success:

```json
{
  "ok": true,
  "data": {}
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "A valid X-API-Key header is required."
  }
}
```

Common error codes: `UNAUTHORIZED`, `BAD_REQUEST`, `NOT_FOUND`, `UPSTREAM_ERROR`, `SERVICE_UNAVAILABLE`.

## Endpoints

### `GET /v1/health`

Health check. No API key required.

```bash
curl http://localhost:3000/v1/health
```

```json
{
  "ok": true,
  "data": { "status": "ok", "db": "connected" }
}
```

### `GET /v1/stores`

Find nearby Kroger stores by ZIP code.

| Query | Required | Description |
|-------|----------|-------------|
| `zip` | yes | 5-digit US ZIP |

```bash
curl -H "X-API-Key: dev-public-key" "http://localhost:3000/v1/stores?zip=23529"
```

```json
{
  "ok": true,
  "data": [
    {
      "locationId": "01400376",
      "name": "Kroger",
      "address": { "addressLine1": "...", "city": "...", "state": "...", "zipCode": "23529" },
      "latitude": 36.88,
      "longitude": -76.3
    }
  ]
}
```

### `GET /v1/catalog/search`

Search the Open Food Facts catalog.

| Query | Required | Description |
|-------|----------|-------------|
| `q` | yes | Search text |

```bash
curl -H "X-API-Key: dev-public-key" "http://localhost:3000/v1/catalog/search?q=oat%20milk"
```

```json
{
  "ok": true,
  "data": [
    {
      "barcode": "0078742357016",
      "name": "Oat Milk",
      "brand": "Example Brand",
      "packageSize": "64 fl oz"
    }
  ]
}
```

### `GET /v1/catalog/store-search`

Search products available at a specific Kroger store.

| Query | Required | Description |
|-------|----------|-------------|
| `q` | yes | Search text |
| `locationId` | yes | Kroger location ID from `/v1/stores` |

```bash
curl -H "X-API-Key: dev-public-key" "http://localhost:3000/v1/catalog/store-search?q=milk&locationId=01400376"
```

### `GET /v1/catalog/prices`

Fetch current prices for barcodes at a store (max 20 barcodes).

| Query | Required | Description |
|-------|----------|-------------|
| `locationId` | yes | Kroger location ID |
| `barcodes` | yes | Comma-separated barcodes |

```bash
curl -H "X-API-Key: dev-public-key" "http://localhost:3000/v1/catalog/prices?locationId=01400376&barcodes=0001111041700,0001111041701"
```

```json
{
  "ok": true,
  "data": [
    { "barcode": "0001111041700", "price": 3.49, "promoPrice": 2.99 }
  ]
}
```

### `GET /v1/price-history`

Return (and refresh when stale) tracked price history for a product at a store.

| Query | Required | Description |
|-------|----------|-------------|
| `locationId` | yes | Kroger location ID |
| `barcode` | yes | Product barcode / UPC |
| `name` | yes | Product display name |

```bash
curl -H "X-API-Key: dev-public-key" "http://localhost:3000/v1/price-history?locationId=01400376&barcode=0001111041700&name=Milk"
```

```json
{
  "ok": true,
  "data": {
    "listingId": "...",
    "trackingStartedAt": "2026-01-01T00:00:00.000Z",
    "lastCheckedAt": "2026-03-01T12:00:00.000Z",
    "refreshed": true,
    "history": [
      {
        "id": "...",
        "price": 3.49,
        "kind": "regular",
        "observedAt": "2026-03-01T12:00:00.000Z"
      }
    ]
  }
}
```

## Notes

- Store search, in-store catalog, live prices, and price history need Kroger credentials configured on the API.
- Catalog search via Open Food Facts works without Kroger.
- User shopping lists, profiles, auth, and reviews are **not** part of the public API. Use the mobile/session endpoints for those.
