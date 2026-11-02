import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScreenHeader } from "../components/Chrome";
import { colors } from "../theme";
import {
  PriceHistoryModal,
  type PriceHistoryResponse,
} from "../components/PriceHistoryModal"


const API_URL = process.env.EXPO_PUBLIC_API_URL;
const DEMO_STORE_ID = "GW-DEMO-001";

type CatalogProduct = {
  barcode: string | null;
  name: string;
  brand: string | null;
  packageSize: string | null;
};

type KrogerStore = {
  locationId: string;
  name: string;
  address: string;
};

type KrogerPrice = {
  barcode: string;
  price: number | null;
  promoPrice: number | null;
};

type Props = {
  onOpenSettings: () => void;
};


function getSessionToken(): string | null {
  const storage = globalThis as typeof globalThis & {
    "grocerywatch-session"?: string;
    localStorage?: {
      getItem: (key: string) => string | null;
    };
  };

  let raw: string | null | undefined;

  try {
    raw =
      storage["grocerywatch-session"] ??
      storage.localStorage?.getItem("grocerywatch-session");
  } catch {
    raw = storage["grocerywatch-session"];
  }

  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as {
      token?: unknown;
      expires_at?: unknown;
    };

    if (
      typeof session.token !== "string" ||
      !session.token
    ) {
      return null;
    }

    if (
      typeof session.expires_at === "string" &&
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      return null;
    }

    return session.token;
  } catch {
    return null;
  }
}


async function readError(res: Response) {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === "string") return data.error;
  } catch {
  }
  return "Search failed.";
}

async function getFallbackStoreId(
  response: Response
): Promise<string | null> {
  if (response.status !== 503) {
    return null;
  }

  try {
    const body = (await response.clone().json()) as {
      demoLocationId?: unknown;
    };

    return typeof body.demoLocationId === "string"
      ? body.demoLocationId
      : null;
  } catch {
    return null;
  }
}

export function SearchScreen({ onOpenSettings }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [zip, setZip] = useState("");
  const [stores, setStores] = useState<KrogerStore[]>([]);
  const [storeStatus, setStoreStatus] = useState<"idle" | "loading" | "error">("idle");
  const [storeError, setStoreError] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, KrogerPrice>>({});
  const [priceStatus, setPriceStatus] = useState<"idle" | "loading" | "error">("idle");
  const [priceError, setPriceError] = useState("");
  const [storesChecked, setStoresChecked] = useState(false);
  const [storeMatches, setStoreMatches] = useState<CatalogProduct[]>([]);
  const [addedKeys, setAddedKeys] = useState<Record<string, true>>({});
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addError, setAddError] = useState("");
  const [activeHistory, setActiveHistory] = useState<{
    productName: string;
  } | null>(null);
  const [historyData, setHistoryData] = useState<PriceHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const canSearch = query.trim().length > 0 && status !== "loading";

  async function onSearch() {
    setActiveHistory(null);
    setHistoryData(null);
    setHistoryError("");

    const q = query.trim();
    if (!q || status === "loading") return;

    if (!API_URL) {
      setStatus("error");
      setError("API URL not set");
      return;
    }

    setStatus("loading");
    setError("");
    setStores([]);
    setSelectedStoreId(null);
    setPrices({});
    setStoreStatus("idle");
    setStoreError("");
    setPriceStatus("idle");
    setPriceError("");
    setStoresChecked(false);
    setStoreMatches([]);
    setAddedKeys({});
    setAddingKey(null);
    setAddError("");

    try {
      const res = await fetch(`${API_URL}/catalog/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setResults([]);
        setStatus("ready");
        return;
      }
      setResults((await res.json()) as CatalogProduct[]);
      setStatus("ready");
    } catch {
      setStatus("error");
      setError("API unreachable");
    }
  }

  async function searchKrogerStore(locationId: string) {
    if (!API_URL) return;
    const params = new URLSearchParams({ q: query.trim(), locationId });
    const res = await fetch(`${API_URL}/catalog/store-search?${params.toString()}`);
    if (!res.ok) {
      const fallbackId = await getFallbackStoreId(res);

      if (fallbackId && fallbackId !== locationId) {
        setSelectedStoreId(fallbackId);
        setPriceError("");

        await searchKrogerStore(fallbackId);
        return;
      }

      setPriceStatus("error");
      setPriceError(await readError(res));
      return;
}
    const rows = (await res.json()) as Array<
      CatalogProduct & { price: number | null; promoPrice: number | null }
    >;
    const nextPrices: Record<string, KrogerPrice> = {};
    const products: CatalogProduct[] = [];
    for (const row of rows) {
      products.push({
        barcode: row.barcode,
        name: row.name,
        brand: row.brand,
        packageSize: row.packageSize,
      });
      if (row.barcode) {
        nextPrices[row.barcode] = {
          barcode: row.barcode,
          price: row.price,
          promoPrice: row.promoPrice,
        };
      }
    }
    setStoreMatches(products);
    setPrices(nextPrices);
    setPriceStatus("idle");
  }

  async function onFindStores() {
    setActiveHistory(null);
    setHistoryData(null);
    setHistoryError("");

    if (!/^\d{5}$/.test(zip.trim()) || !API_URL || storeStatus === "loading") return;
    setStoreStatus("loading");
    setStoreError("");
    setStoresChecked(false);
    setSelectedStoreId(null);
    setPrices({});
    setPriceStatus("idle");
    setPriceError("");
    setStoreMatches([]);
    try {
      const res = await fetch(`${API_URL}/stores?zip=${encodeURIComponent(zip.trim())}`);
      if (!res.ok) {
        setStoreStatus("error");
        setStoreError(await readError(res));
        setStores([]);
        return;
      }
      setStores((await res.json()) as KrogerStore[]);
      setStoresChecked(true);
      setStoreStatus("idle");
    } catch {
      setStoreStatus("error");
      setStoreError("API unreachable");
      setStores([]);
    }
  }

  async function onSelectStore(store: KrogerStore) {
    setActiveHistory(null);
    setHistoryData(null);
    setHistoryError("");

    if (!API_URL || priceStatus === "loading") return;
    const barcodes = results
      .map((product) => product.barcode)
      .filter((barcode): barcode is string => Boolean(barcode));
    setSelectedStoreId(store.locationId);
    setPrices({});
    setStoreMatches([]);
    setPriceStatus("loading");
    setPriceError("");
    try {
      if (store.locationId === DEMO_STORE_ID) {
          await searchKrogerStore(store.locationId);
          return;
      }

      if (barcodes.length === 0) {
          await searchKrogerStore(store.locationId);
          return;
      }
      const params = new URLSearchParams({
        locationId: store.locationId,
        barcodes: barcodes.join(","),
      });
      const res = await fetch(`${API_URL}/catalog/prices?${params.toString()}`);
      if (!res.ok) {
        const fallbackId = await getFallbackStoreId(res);

        if (fallbackId) {
          setSelectedStoreId(fallbackId);
          setPrices({});
          setStoreMatches([]);
          setPriceError("");

          await searchKrogerStore(fallbackId);
          return;
        }

        setPriceStatus("error");
        setPriceError(await readError(res));
        return;
      }
      const rows = (await res.json()) as KrogerPrice[];
      const carried = rows.some((row) => row.price !== null || row.promoPrice !== null);
      if (!carried) {
        await searchKrogerStore(store.locationId);
        return;
      }
      const next: Record<string, KrogerPrice> = {};
      for (const row of rows) next[row.barcode] = row;
      setPrices(next);
      setPriceStatus("idle");
    } catch {
      setPriceStatus("error");
      setPriceError("API unreachable");
    }
  }

  function formatMoney(value: number) {
    return `$${value.toFixed(2)}`;
  }

  function productKey(product: CatalogProduct) {
    return `${product.barcode ?? "none"}-${product.name}`;
  }

  function listPrice(quote: KrogerPrice | undefined) {
    if (!quote) return null;

    if (quote.promoPrice !== null && ( quote.price === null || quote.promoPrice < quote.price)) {
      return quote.promoPrice
    }

    return quote.price
  }

  
  async function onAdd(product: CatalogProduct) {
    const key = productKey(product);

    const quote = product.barcode
      ? prices[product.barcode]
      : undefined;

    const price = listPrice(quote);

    if (
      !API_URL ||
      price === null ||
      !selectedStoreId ||
      addingKey ||
      addedKeys[key]
    ) {
      return;
    }

    const token = getSessionToken();

    if (!token) {
      setAddError(
        "You must sign in to add products to your list."
      );
      return;
    }

    const store = stores.find(
      (item) => item.locationId === selectedStoreId
    );

    const location =
      selectedStoreId === DEMO_STORE_ID
        ? "GroceryWatch DEMO Store"
        : store
          ? store.address
            ? `${store.name}, ${store.address}`
            : store.name
          : null;

    if (!location) {
      setAddError("Please select a valid store.");
      return;
    }

    setAddingKey(key);
    setAddError("");

    try {
      const response = await fetch(
        `${API_URL}/products`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: product.name,
            price,
            location,
            barcode: product.barcode,
            externalStoreId: selectedStoreId,
          }),
        }
      );

      if (response.status === 401) {
        setAddError(
          "Your session has expired. Please sign in again."
        );
        return;
      }

      if (!response.ok) {
        setAddError(await readError(response));
        return;
      }

      setAddedKeys((current) => ({
        ...current,
        [key]: true,
      }));
    } catch {
      setAddError("Could not connect to the server.");
    } finally {
      setAddingKey(null);
    }
  }


  async function onHistory(product: CatalogProduct) {
    if(!API_URL || !selectedStoreId || !product.barcode || historyLoading) { return; }

    const locationId = selectedStoreId;

    setActiveHistory({
      productName: product.name,
    });

    setHistoryData(null);
    setHistoryError("");
    setHistoryLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/catalog/price-history`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            locationId,
            barcode: product.barcode,
            name: product.name,
          })
        }
      );

      if (!response.ok) {
        setHistoryError(await readError(response));
        return;
      }

      const data = (await response.json()) as PriceHistoryResponse;
      setHistoryData(data);
    } catch {
      setHistoryError("Could not connect to the price history service");
    } finally {
      setHistoryLoading(false);
    }
  }

  const canFindStores = /^\d{5}$/.test(zip.trim()) && storeStatus !== "loading";
  const storePricesReady = selectedStoreId !== null && priceStatus === "idle" && priceError === "";

  function isAtSelectedStore(product: CatalogProduct) {
    if (!product.barcode) return false;
    const quote = prices[product.barcode];
    if (!quote) return false;
    return quote.price !== null || quote.promoPrice !== null;
  }

  const visibleResults =
    selectedStoreId === DEMO_STORE_ID
        ? storeMatches
        : storeMatches.length > 0
            ? storeMatches
            : selectedStoreId !== null && priceStatus === "loading"
                ? []
                : storePricesReady
                    ? results.filter(isAtSelectedStore)
                    : results;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Search Products"
        onListPress={() =>
          Alert.alert("Shopping list", "Coming soon — shopping list is a deluxe feature.")
        }
        onSettingsPress={onOpenSettings}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchBar}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void onSearch()}
            placeholder="Search foods"
            placeholderTextColor={colors.muted}
            style={styles.input}
            accessibilityLabel="Search foods"
            returnKeyType="search"
          />
          <Pressable
            accessibilityRole="button"
            disabled={!canSearch}
            onPress={() => void onSearch()}
            style={[styles.searchBtn, !canSearch && styles.searchBtnDisabled]}
          >
            <Text style={styles.searchBtnText}>Search</Text>
          </Pressable>
        </View>

        {status === "loading" && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={colors.greenDark} />
            <Text style={styles.hint}>Searching...</Text>
          </View>
        )}

        {status === "error" && <Text style={styles.errorText}>{error}</Text>}

        {status === "ready" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Nearby Kroger</Text>
            <View style={styles.searchBar}>
              <TextInput
                value={zip}
                onChangeText={setZip}
                onSubmitEditing={() => void onFindStores()}
                placeholder="Zip code"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={styles.input}
                accessibilityLabel="Zip code"
                maxLength={5}
              />
              <Pressable
                accessibilityRole="button"
                disabled={!canFindStores}
                onPress={() => void onFindStores()}
                style={[styles.searchBtn, !canFindStores && styles.searchBtnDisabled]}
              >
                <Text style={styles.searchBtnText}>
                  {storeStatus === "loading" ? "Finding..." : "Find stores"}
                </Text>
              </Pressable>
            </View>
            {storeError ? <Text style={styles.errorText}>{storeError}</Text> : null}
            {!storesChecked && stores.length === 0 && storeError === "" && results.length > 0 ? (
              <Text style={styles.hint}>Enter a zip code to choose a Kroger.</Text>
            ) : null}
            {stores.map((store) => {
              const selected = store.locationId === selectedStoreId;
              return (
                <Pressable
                  key={store.locationId}
                  accessibilityRole="button"
                  onPress={() => void onSelectStore(store)}
                  style={[styles.store, selected && styles.storeSelected]}
                >
                  <Text style={styles.name}>{store.name}</Text>
                  {store.address ? <Text style={styles.meta}>{store.address}</Text> : null}
                </Pressable>
              );
            })}
            {storesChecked && stores.length === 0 && storeError === "" ? (
              <Text style={styles.hint}>No Kroger stores found for that zip.</Text>
            ) : null}
            {priceStatus === "loading" && (
              <View style={styles.statusRow}>
                <ActivityIndicator color={colors.greenDark} />
                <Text style={styles.hint}>Loading prices...</Text>
              </View>
            )}
            {priceError ? <Text style={styles.errorText}>{priceError}</Text> : null}
            {selectedStoreId === DEMO_STORE_ID ? (
              <Text style={styles.hint}>
                DEMO MODE: These products, prices, and historical
                observations are simulated and do not represent
                live Kroger pricing.
              </Text>
            ) : null}
          </View>
        )}

        {status === "ready" && results.length === 0 && selectedStoreId === null ? (
          <Text style={styles.hint}>
            Open Food Facts has no matches. Choose a store to search Kroger.
          </Text>
        ) : null}

        {storePricesReady && visibleResults.length === 0 ? (
          <Text style={styles.hint}>No products at this store.</Text>
        ) : null}

        {addError ? <Text style={styles.errorText}>{addError}</Text> : null}

        {visibleResults.map((product) => {
          const quote = product.barcode ? prices[product.barcode] : undefined;
          const key = productKey(product);
          const price = listPrice(quote);
          const canAdd = price !== null && selectedStoreId !== null && !addedKeys[key];
          return (
            <View key={key} style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.name}>{product.name}</Text>
                {product.brand ? <Text style={styles.meta}>{product.brand}</Text> : null}
                {product.packageSize ? (
                  <Text style={styles.meta}>{product.packageSize}</Text>
                ) : null}
                {product.barcode ? (
                  <Text style={styles.meta}>Barcode {product.barcode}</Text>
                ) : null}
                {quote?.price !== null && quote?.price !== undefined ? (
                  <Text style={styles.price}>{formatMoney(quote.price)}</Text>
                ) : null}
                {quote?.promoPrice !== null && quote?.promoPrice !== undefined ? (
                  <Text style={styles.promo}>Promo {formatMoney(quote.promoPrice)}</Text>
                ) : null}
              </View>

              {price !== null && selectedStoreId !== null && product.barcode ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View price history for ${product.name}`}
                  disabled={historyLoading}
                  onPress={() => void onHistory(product)}
                  style={[
                    styles.addBtn,
                    historyLoading && styles.searchBtnDisabled,
                  ]}
                >
                  <Text style={styles.addBtnText}>
                    History
                  </Text>
                </Pressable>
              ) : null}

              {price !== null && selectedStoreId !== null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${product.name} to list`}
                  disabled={!canAdd || addingKey === key}
                  onPress={() => void onAdd(product)}
                  style={[styles.addBtn, (!canAdd || addingKey === key) && styles.searchBtnDisabled]}
                >
                  <Text style={styles.addBtnText}>
                    {addedKeys[key] ? "Added" : addingKey === key ? "Adding..." : "Add"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <PriceHistoryModal
        visible={activeHistory !== null}
        productName={activeHistory?.productName ?? ""}
        data={historyData}
        loading={historyLoading}
        error={historyError}
        onClose={() => {
          setActiveHistory(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: { padding: 16, gap: 14, paddingBottom: 28 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.white,
  },
  searchBtn: {
    backgroundColor: colors.green,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchBtnDisabled: { opacity: 0.45 },
  searchBtnText: { color: colors.white, fontWeight: "700" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hint: { fontSize: 12, color: colors.muted },
  errorText: { color: colors.danger, fontSize: 14 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  store: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 2,
  },
  storeSelected: {
    borderColor: colors.green,
    backgroundColor: colors.greenSoft,
  },
  price: { fontSize: 16, fontWeight: "800", color: colors.greenDark },
  promo: { fontSize: 13, fontWeight: "700", color: colors.green },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  addBtn: {
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addBtnText: { color: colors.greenDark, fontWeight: "700", fontSize: 13 },
  rowBody: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: "700", color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
});
