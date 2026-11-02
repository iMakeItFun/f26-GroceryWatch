import { pool } from "./db";
import {
    getKrogerStoreDetails,
    padBarcode,
    pricesForBarcodes,
} from "./kroger";

type PriceKind = "regular" | "promo";

type ListingRow = {
    listing_id: string;
    inventory_id: string;
    tracking_started_at: Date;
    last_checked_at: Date | null;
    last_observed_price: string | null;
    last_price_kind: PriceKind | null;
}

type HistoryRow = {
    price_history_id: string;
    price: string;
    price_kind: PriceKind;
    creation_time: Date;
}

export type PriceHistoryResponse = {
    listingId: string;
    trackingStartedAt: Date;
    lastCheckedAt: Date | null;
    refreshed: boolean;
    refreshError?: string;
    history: Array<{
        id: string;
        price: number;
        kind: PriceKind;
        observedAt: Date;
    }>;
}

const PROVIDER = "kroger";
const REFRESH_MS = 24 * 60 * 60 * 1000;

function isFresh(lastCheckedAt: Date | null) {
    return (lastCheckedAt !== null && Date.now() - new Date(lastCheckedAt).getTime() < REFRESH_MS);
}

async function findListing(locationId: string, barcode: string): Promise<ListingRow | null> {
    const result = await pool.query<ListingRow>(
        
        `SELECT
            listing_id,
            inventory_id,
            tracking_started_at,
            last_checked_at,
            last_observed_price,
            last_price_kind
        FROM public.external_listings
        WHERE provider = $1
            AND external_product_id = $2
            AND external_store_id = $3`,
        [PROVIDER, barcode, locationId]
    );

    return result.rows[0] ?? null;
}

async function resultFor(listing: ListingRow, refreshed: boolean, refreshError?: string): Promise<PriceHistoryResponse> {
    const { rows} = await pool.query<HistoryRow>(
        `SELECT
            price_history_id,
            price,
            price_kind,
            creation_time
        FROM public.price_history
        WHERE listing_id = $1
        ORDER BY creation_time DESC, price_history_id DESC
        LIMIT 100`,
        [listing.listing_id]
    );

    return {
        listingId: listing.listing_id,
        trackingStartedAt: listing.tracking_started_at,
        lastCheckedAt: listing.last_checked_at,
        refreshed,
        ...(refreshError ? { refreshError} : {}),
        history: rows.map((row) => ({
            id: row.price_history_id,
            price: Number(row.price),
            kind: row.price_kind,
            observedAt: row.creation_time
        })),
    }
}

export async function trackKrogerPrice(input: {locationId: string; barcode: string; name: string;}): Promise<PriceHistoryResponse | null> {
    const locationId = input.locationId.trim();
    const barcode = padBarcode(input.barcode);
    const name = input.name.trim();

    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(locationId) || !/^\d{8,14}$/.test(barcode) || !name || name.length > 250) {
        throw new RangeError("A valid Kroger store, barcode, and product name are required.");
    }

    const existing = await findListing(locationId, barcode);

    if (existing && isFresh(existing.last_checked_at)) {
        return resultFor(existing, false);
    }

    let quote;

    try {
        quote =(await pricesForBarcodes(locationId, [barcode]))[0];
    } catch(error) {
        if (existing) { return resultFor(existing, false, "Could not refresh Kroger price."); }
        throw error;
    }

    const regular = quote?.price != null && Number.isFinite(quote.price) && quote.price > 0 ? quote.price : null;
    const promo = quote?.promoPrice != null && Number.isFinite(quote.promoPrice) && quote.promoPrice > 0 ? quote.promoPrice : null;

    const usePromo = promo != null && (regular == null || promo < regular);

    const amount = usePromo ? promo : regular;
    const kind: PriceKind = usePromo ? "promo" : "regular";

    if (amount == null) {
        if (existing) {
            return resultFor(existing, false, "No current price was provided by Kroger");
        }

        return null;
    }

    let storeDetails: Awaited<ReturnType<typeof getKrogerStoreDetails>> | null = null;

    if (!existing) {
        const registeredStore = await pool.query(`
            SELECT store_id
            FROM public.external_store_refs
            WHERE provider = $1
                AND external_store_id = $2`,
            [PROVIDER, locationId]
            );

        if (registeredStore.rowCount == 0) {
            storeDetails = await getKrogerStoreDetails(locationId);
            if (!storeDetails) return null;
        }
    }

    const client = await pool.connect();
    let committed = false;
    let listingId: string | null = null;
    let updated = false;

    try {
        await client.query("BEGIN");

        await client.query(
            "SELECT pg_advisory_xact_lock(hashtext($1))",
            [`grocerywatch:store:${PROVIDER}:${locationId}`]
        );

        await client.query(
            "SELECT pg_advisory_xact_lock(hashtext($1))",
            [`grocerywatch:item:${barcode}`]
        );

        const found = await client.query<ListingRow>(`
            SELECT
                listing_id,
                inventory_id,
                tracking_started_at,
                last_checked_at,
                last_observed_price,
                last_price_kind
            FROM public.external_listings
            WHERE provider = $1
                AND external_product_id = $2
                AND external_store_id = $3
            FOR UPDATE`,
            [PROVIDER, barcode, locationId]
        );

        const listing = found.rows[0] ?? null;
        if (listing && isFresh(listing.last_checked_at)) {
            listingId = listing.listing_id;
        } else {
            let inventoryId = listing?.inventory_id ?? null;

            if (!listing) {
                const mapped = await client.query<{
                    store_id: string;
                }>(
                    `SELECT store_id
                    FROM public.external_store_refs
                    WHERE provider = $1
                        AND external_store_id = $2`,
                    [PROVIDER, locationId]
                );

                let storeId = mapped.rows[0]?.store_id ?? null;
                if (!storeId) {
                    if (!storeDetails) {
                        throw new Error("New Kroger store details were unavailable");
                    }

                    const {
                        name: storeName,
                        address,
                    } = storeDetails;

                    if (
                        !address.street ||
                        !address.city ||
                        !address.state ||
                        !address.zip
                    ) { throw new Error("Kroger store addresss was incomplete"); }

                    const matches = await client.query<{store_id: string;}>(`
                            SELECT s.store_id
                            FROM public.stores s
                            JOIN public.address a
                                ON s.address_id = a.address_id
                            WHERE lower(s.name) = lower($1)
                                AND lower(a.street_address_1) = lower($2)
                                AND lower(a.city) = lower($3)
                                AND lower(a.state) = lower($4)
                                AND a.zip = $5
                            ORDER BY s.store_id
                            LIMIT 1`,
                            [storeName, address.street, address.city, address.state, address.zip]
                    );

                    storeId = matches.rows[0]?.store_id ?? null;

                    if (!storeId) {
                        const newAddress = await client.query<{address_id: string;}>(`
                            INSERT INTO public.address (
                                street_address_1,
                                city,
                                state,
                                zip
                            )
                            VALUES ($1, $2, $3, $4)
                            RETURNING address_id`,
                            [address.street, address.city, address.state, address.zip]
                        );

                        const newStore = await client.query<{store_id: string}>(`
                            INSERT INTO public.stores (
                                name,
                                address_id,
                                partner_status,
                                creation_date
                            )
                            VALUES ($1, $2, FALSE, NOW())
                            RETURNING store_id    
                            `,
                            [storeName, newAddress.rows[0].address_id]
                        );

                        storeId = newStore.rows[0].store_id;
                    }

                     await client.query(`
                        INSERT INTO public.external_store_refs (
                            provider,
                            external_store_id,
                            store_id
                        )
                        VALUES ($1, $2, $3)`,
                        [PROVIDER, locationId, storeId]
                    );
                }


                const matchedItems = await client.query<{item_id: string;}>(`
                    SELECT item_id
                    FROM public.items
                    WHERE ltrim(upc, '0') = ltrim($1, '0')
                    ORDER BY item_id
                    LIMIT 1`,
                    [barcode]
                );

                let itemId = matchedItems.rows[0]?.item_id ?? null;
                
                if (!itemId) {
                    const inserted = await client.query<{item_id: string}>(`
                        INSERT INTO public.items (
                            name,
                            upc,
                            creation_date
                        )
                        VALUES ($1, $2, NOW())
                        RETURNING item_id`,
                        [name, barcode]
                    );

                    itemId = inserted.rows[0].item_id;
                }

                const foundInventory = await client.query<{inventory_id: string;}>(`
                    SELECT inventory_id
                    FROM public.inventory
                    WHERE store_id = $1
                        AND item_id = $2
                    ORDER BY inventory_id
                    LIMIT 1`,
                    [storeId, itemId]
                );

                inventoryId = foundInventory.rows[0]?.inventory_id ?? null;

                if (!inventoryId) {
                    const insertedInventory = await client.query<{inventory_id: string;}>(`
                        INSERT INTO public.inventory (
                            store_id,
                            item_id,
                            current_price,
                            last_updated
                        )
                        VALUES ($1, $2, $3, NOW())
                        RETURNING inventory_id`,
                        [storeId, itemId, amount]
                    );

                    inventoryId = insertedInventory.rows[0].inventory_id;
                }

                const insertedListing = await client.query<{listing_id: string;}>(`
                    INSERT INTO public.external_listings (
                        inventory_id,
                        provider,
                        external_product_id,
                        external_store_id
                    )
                    VALUES ($1, $2, $3, $4)
                    RETURNING listing_id`,
                    [inventoryId, PROVIDER, barcode, locationId]
                );

                listingId = insertedListing.rows[0].listing_id;
            } else {
                listingId = listing.listing_id;
            }

            if (inventoryId == null || listingId == null) {
                throw new Error("No inventory or listing could be resolved.");
            }

            if (!listing || listing.last_observed_price == null || Number(listing.last_observed_price) !== amount || listing.last_price_kind !== kind) {
                await client.query(`
                    INSERT INTO public.price_history (
                        inventory_id,
                        listing_id,
                        price,
                        price_kind,
                        creation_time,
                        anomalous_flag,
                        last_updated
                    )
                    VALUES ($1, $2, $3, $4, NOW(), false, NOW()
                    )`,
                    [inventoryId, listingId, amount, kind]
                );
            }

            await client.query(`
                UPDATE public.external_listings
                SET
                    last_checked_at = NOW(),
                    last_observed_price = $2,
                    last_price_kind = $3
                WHERE listing_id = $1`,
                [listingId, amount, kind]
            );

            await client.query(`
                UPDATE public.inventory
                SET
                    current_price = $2,
                    last_updated = NOW()
                WHERE inventory_id = $1`,
                [inventoryId, amount]
            );

            updated = true;
        }

        await client.query("COMMIT");
        committed = true;
    } finally {
        if (!committed) {
            await client.query("ROLLBACK").catch(() => undefined);
        }

        client.release();
    }

    const resolved = await findListing(locationId, barcode);
    if (!resolved) {
        throw new Error (
            "Tracked product could not be loaded."
        );
    }

    return resultFor(resolved, updated)
}