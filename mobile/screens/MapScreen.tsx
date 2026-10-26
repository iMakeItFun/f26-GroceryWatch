import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScreenHeader } from "../components/Chrome";
import { requestDeviceCoordinates, showLocationPermissionDenied } from "../location";
import { colors, layout } from "../theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type KrogerStore = {
  locationId: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

function pinStyle(store: KrogerStore, stores: KrogerStore[]) {
  const points = stores.filter(
    (item) => item.latitude !== null && item.longitude !== null
  );
  if (store.latitude === null || store.longitude === null || points.length === 0) {
    return null;
  }
  const lats = points.map((item) => item.latitude as number);
  const lngs = points.map((item) => item.longitude as number);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 1;
  const lngSpan = maxLng - minLng || 1;
  return {
    top: `${12 + (1 - (store.latitude - minLat) / latSpan) * 68}%`,
    left: `${8 + ((store.longitude - minLng) / lngSpan) * 76}%`,
  } as const;
}

async function readError(res: Response) {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === "string") return data.error;
  } catch {
  }
  return "Store search failed.";
}

export function MapScreen() {
  const [zip, setZip] = useState("");
  const [stores, setStores] = useState<KrogerStore[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  const [searchSource, setSearchSource] = useState<"zip" | "location">("zip");
  const canSearch = /^\d{5}$/.test(zip.trim()) && status !== "loading";
  const mapped = stores.filter((store) => pinStyle(store, stores));

  async function onSearch() {
    if (!canSearch) return;
    setSearchSource("zip");
    if (!API_URL) {
      setStatus("error");
      setError("API URL not set");
      return;
    }
    setStatus("loading");
    setError("");
    setChecked(false);
    try {
      const res = await fetch(`${API_URL}/stores?zip=${encodeURIComponent(zip.trim())}`);
      if (!res.ok) {
        setStatus("error");
        setError(await readError(res));
        setStores([]);
        return;
      }
      setStores((await res.json()) as KrogerStore[]);
      setChecked(true);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("API unreachable");
      setStores([]);
    }
  }

  async function onUseLocation() {
    if (status === "loading") return;
    setSearchSource("location");
    setChecked(false);
    setStores([]);
    setError("");
    if (!API_URL) {
      setStatus("error");
      setError("API URL not set");
      return;
    }

    setStatus("loading");
    // Show the right error if finding stores fails after we get the location.
    let locating = true;
    try {
      const location = await requestDeviceCoordinates();
      if (!location.granted) {
        setStatus("idle");
        showLocationPermissionDenied(location.canAskAgain, setError);
        return;
      }

      locating = false;
      const params = new URLSearchParams({
        latitude: String(location.coordinates.latitude),
        longitude: String(location.coordinates.longitude),
      });
      const res = await fetch(`${API_URL}/stores?${params.toString()}`);
      if (!res.ok) {
        setStatus("error");
        setError(await readError(res));
        return;
      }
      setStores((await res.json()) as KrogerStore[]);
      setChecked(true);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError(locating
        ? "Could not get your location. Check location services or search by ZIP."
        : "Could not reach the store search API. Try again or search by ZIP.");
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Map" showActions={false} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          disabled={status === "loading"}
          onPress={() => void onUseLocation()}
          style={[styles.locationBtn, status === "loading" && styles.searchBtnDisabled]}
        >
          <Text style={styles.locationBtnText}>
            {status === "loading" && searchSource === "location"
              ? "Finding your location..."
              : "Use my location"}
          </Text>
        </Pressable>
        <Text style={styles.hint}>Or search by ZIP code.</Text>
        <View style={styles.searchBar}>
          <TextInput
            value={zip}
            onChangeText={setZip}
            onSubmitEditing={() => void onSearch()}
            placeholder="Zip code"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            style={styles.input}
            accessibilityLabel="Zip code"
            maxLength={5}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!canSearch}
            onPress={() => void onSearch()}
            style={[styles.searchBtn, !canSearch && styles.searchBtnDisabled]}
          >
            <Text style={styles.searchBtnText}>{status === "loading" ? "Finding..." : "Find stores"}</Text>
          </Pressable>
        </View>

        {status === "loading" && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={colors.greenDark} />
            <Text style={styles.hint}>Searching nearby Kroger stores...</Text>
          </View>
        )}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {!checked && status !== "loading" && error === "" ? (
          <Text style={styles.hint}>Use your location or enter a ZIP code to find nearby Kroger stores.</Text>
        ) : null}

        <View style={styles.map}>
          {mapped.length === 0 ? (
            <Text style={styles.mapEmpty}>
              {checked && stores.length === 0
                ? searchSource === "location"
                  ? "No Kroger stores found near your location."
                  : "No Kroger stores found for that zip."
                : checked
                  ? "These stores did not include a map location."
                  : "Nearby Kroger stores"}
            </Text>
          ) : (
            stores.map((store, index) => {
              const position = pinStyle(store, stores);
              if (!position) return null;
              return (
                <View key={store.locationId} style={[styles.pin, position]}>
                  <Text style={styles.pinIndex}>{index + 1}</Text>
                  <Text style={styles.pinName} numberOfLines={2}>
                    {store.name}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {stores.map((store, index) => (
          <View key={store.locationId} style={styles.storeCard}>
            <Text style={styles.storeIndex}>{index + 1}</Text>
            <View style={styles.storeBody}>
              <Text style={styles.storeName}>{store.name}</Text>
              {store.address ? <Text style={styles.storeMeta}>{store.address}</Text> : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: { padding: 16, gap: 12, paddingBottom: 28 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8 },
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
  locationBtn: {
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  locationBtnText: { color: colors.greenDark, fontWeight: "700" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hint: { fontSize: 13, color: colors.muted },
  errorText: { color: colors.danger, fontSize: 14 },
  map: {
    height: 280,
    borderRadius: layout.radius,
    backgroundColor: colors.card,
    position: "relative",
    overflow: "hidden",
  },
  mapEmpty: {
    textAlign: "center",
    color: colors.muted,
    marginTop: 120,
    paddingHorizontal: 20,
  },
  pin: {
    position: "absolute",
    maxWidth: 120,
    gap: 2,
  },
  pinIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
    textAlign: "center",
    lineHeight: 22,
    backgroundColor: colors.green,
    color: colors.white,
    fontWeight: "700",
    fontSize: 12,
  },
  pinName: { fontSize: 11, fontWeight: "700", color: colors.text },
  storeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.radius,
    padding: 14,
  },
  storeIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    textAlign: "center",
    lineHeight: 24,
    backgroundColor: colors.green,
    color: colors.white,
    fontWeight: "700",
  },
  storeBody: { flex: 1, gap: 2 },
  storeName: { fontSize: 16, fontWeight: "700", color: colors.text },
  storeMeta: { color: colors.muted, fontSize: 13 },
});
