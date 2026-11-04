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
import { colors, layout } from "../theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type KrogerStore = {
  locationId: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

function getSessionToken(): string | null {
  const storage = globalThis as typeof globalThis & {
    "grocerywatch-session"?: string;
    localStorage?: { getItem: (key: string) => string | null };
  };

  try {
    const raw =
      storage["grocerywatch-session"] ??
      storage.localStorage?.getItem("grocerywatch-session");
    if (!raw) return null;

    const session = JSON.parse(raw) as {
      token?: unknown;
      expires_at?: unknown;
    };
    if (typeof session.token !== "string" || !session.token) return null;
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

async function readError(res: Response, fallback = "Store search failed.") {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === "string") return data.error;
  } catch {
  }
  return fallback;
}

export function MapScreen() {
  const [zip, setZip] = useState("");
  const [stores, setStores] = useState<KrogerStore[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  const [reviewStoreId, setReviewStoreId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewStatus, setReviewStatus] = useState<"idle" | "saving" | "submitted" | "error">("idle");
  const [reviewMessage, setReviewMessage] = useState("");
  const canSearch = /^\d{5}$/.test(zip.trim()) && status !== "loading";
  const mapped = stores.filter((store) => pinStyle(store, stores));

  function openReview(store: KrogerStore) {
    setReviewStoreId(store.locationId);
    setReviewRating(5);
    setReviewComment("");
    setReviewStatus("idle");
    setReviewMessage("");
  }

  async function onSubmitReview(store: KrogerStore) {
    if (reviewStatus === "saving" || !reviewComment.trim()) return;
    if (!API_URL) {
      setReviewStatus("error");
      setReviewMessage("API URL not set.");
      return;
    }

    const token = getSessionToken();
    if (!token) {
      setReviewStatus("error");
      setReviewMessage("Please log in from the Account tab to submit a review.");
      return;
    }

    setReviewStatus("saving");
    setReviewMessage("");
    try {
      const res = await fetch(`${API_URL}/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          locationId: store.locationId,
          storeName: store.name,
          storeAddress: store.address,
          rating: reviewRating,
          comment: reviewComment.trim(),
        }),
      });
      if (!res.ok) {
        setReviewStatus("error");
        setReviewMessage(await readError(res, "Review submission failed."));
        return;
      }

      const response = (await res.json()) as { message?: unknown };
      setReviewStatus("submitted");
      setReviewMessage(
        typeof response.message === "string"
          ? response.message
          : "Review submitted. Thanks for sharing your shopping experience."
      );
      setReviewComment("");
    } catch {
      setReviewStatus("error");
      setReviewMessage("Could not reach the API. Please try again.");
    }
  }

  async function onSearch() {
    if (!canSearch) return;
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

  return (
    <View style={styles.root}>
      <ScreenHeader title="Map" showActions={false} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
        {status === "error" ? <Text style={styles.errorText}>{error}</Text> : null}
        {!checked && status !== "loading" && error === "" ? (
          <Text style={styles.hint}>Enter a zip code to find nearby Kroger stores.</Text>
        ) : null}

        <View style={styles.map}>
          {mapped.length === 0 ? (
            <Text style={styles.mapEmpty}>
              {checked && stores.length === 0
                ? "No Kroger stores found for that zip."
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
              <Pressable
                accessibilityRole="button"
                onPress={() => openReview(store)}
                style={styles.reviewToggle}
              >
                <Text style={styles.reviewToggleText}>Write a review</Text>
              </Pressable>
              {reviewStoreId === store.locationId ? (
                <View style={styles.reviewForm}>
                  <Text style={styles.reviewLabel}>Your rating</Text>
                  <View style={styles.ratingRow}>
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <Pressable
                        key={rating}
                        accessibilityRole="button"
                        accessibilityLabel={`Set rating to ${rating} ${rating === 1 ? "star" : "stars"}`}
                        accessibilityState={{ selected: reviewRating === rating }}
                        onPress={() => setReviewRating(rating)}
                        style={[
                          styles.ratingButton,
                          reviewRating === rating && styles.ratingButtonSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.ratingButtonText,
                            reviewRating === rating && styles.ratingButtonTextSelected,
                          ]}
                        >
                          {rating}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    value={reviewComment}
                    onChangeText={setReviewComment}
                    placeholder="Share what your shopping experience was like"
                    placeholderTextColor={colors.muted}
                    style={styles.reviewInput}
                    accessibilityLabel="Review"
                    multiline
                    maxLength={1000}
                    editable={reviewStatus !== "saving" && reviewStatus !== "submitted"}
                  />
                  {reviewMessage ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={reviewStatus === "error" ? styles.errorText : styles.reviewSuccess}
                    >
                      {reviewMessage}
                    </Text>
                  ) : null}
                  {reviewStatus !== "submitted" ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={!reviewComment.trim() || reviewStatus === "saving"}
                      onPress={() => void onSubmitReview(store)}
                      style={[
                        styles.reviewSubmit,
                        (!reviewComment.trim() || reviewStatus === "saving") &&
                          styles.searchBtnDisabled,
                      ]}
                    >
                      <Text style={styles.searchBtnText}>
                        {reviewStatus === "saving" ? "Submitting..." : "Submit review"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
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
  storeBody: { flex: 1, gap: 6 },
  storeName: { fontSize: 16, fontWeight: "700", color: colors.text },
  storeMeta: { color: colors.muted, fontSize: 13 },
  reviewToggle: { alignSelf: "flex-start", paddingVertical: 6 },
  reviewToggleText: { color: colors.greenDark, fontSize: 14, fontWeight: "700" },
  reviewForm: { gap: 8, paddingTop: 6 },
  reviewLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  ratingRow: { flexDirection: "row", gap: 8 },
  ratingButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingButtonSelected: { backgroundColor: colors.green, borderColor: colors.green },
  ratingButtonText: { color: colors.text, fontWeight: "700" },
  ratingButtonTextSelected: { color: colors.white },
  reviewInput: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: "top",
  },
  reviewSubmit: {
    alignSelf: "flex-start",
    backgroundColor: colors.green,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  reviewSuccess: { color: colors.greenDark, fontSize: 13, fontWeight: "600" },
});
