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
import StoreMap from "../components/StoreMap";
import { requestDeviceCoordinates, showLocationPermissionDenied } from "../location";
import type { KrogerStore } from "../store";
import { colors, layout } from "../theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type StoreReview = {
  id: string;
  storeName: string;
  rating: number;
  comment: string;
  createdAt: string;
};

type StoreReviewSummary = {
  reviewCount: number;
  averageRating: number | null;
  reviews: StoreReview[];
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
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  const [searchSource, setSearchSource] = useState<"zip" | "location">("zip");
  const [reviewStoreId, setReviewStoreId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewStatus, setReviewStatus] = useState<"idle" | "saving" | "submitted" | "error">("idle");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewsStoreId, setReviewsStoreId] = useState<string | null>(null);
  const [storeReviews, setStoreReviews] = useState<StoreReviewSummary | null>(null);
  const [reviewsStatus, setReviewsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [reviewsError, setReviewsError] = useState("");
  const selectedStore = stores.find((store) => store.locationId === selectedStoreId) ?? null;
  const canSearch = /^\d{5}$/.test(zip.trim()) && status !== "loading";

  function openReview(store: KrogerStore) {
    setReviewStoreId(store.locationId);
    setReviewRating(5);
    setReviewComment("");
    setReviewStatus("idle");
    setReviewMessage("");
  }

  async function loadStoreReviews(store: KrogerStore) {
    setStoreReviews(null);
    setReviewsError("");
    if (!API_URL) {
      setReviewsStatus("error");
      setReviewsError("API URL not set.");
      return;
    }

    setReviewsStatus("loading");
    try {
      const res = await fetch(
        `${API_URL}/stores/${encodeURIComponent(store.locationId)}/reviews`
      );
      if (!res.ok) {
        setReviewsStatus("error");
        setReviewsError(await readError(res, "Could not load store reviews."));
        return;
      }
      setStoreReviews((await res.json()) as StoreReviewSummary);
      setReviewsStatus("idle");
    } catch {
      setReviewsStatus("error");
      setReviewsError("Could not reach the API. Please try again.");
    }
  }

  async function onToggleReviews(store: KrogerStore) {
    if (reviewsStoreId === store.locationId) {
      setReviewsStoreId(null);
      return;
    }

    setReviewsStoreId(store.locationId);
    await loadStoreReviews(store);
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
      if (reviewsStoreId === store.locationId) {
        await loadStoreReviews(store);
      }
    } catch {
      setReviewStatus("error");
      setReviewMessage("Could not reach the API. Please try again.");
    }
  }

  async function onSearch() {
    if (!canSearch) return;
    setSearchSource("zip");
    setSelectedStoreId(null);
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
    setSelectedStoreId(null);
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
          <StoreMap
            stores={stores}
            selectedStoreId={selectedStoreId}
            onSelect={setSelectedStoreId}
            emptyMessage={
              checked && stores.length === 0
                ? searchSource === "location"
                  ? "No Kroger stores found near your location."
                  : "No Kroger stores found for that zip."
                : checked
                  ? "These stores did not include a map location."
                  : "Nearby Kroger stores"
            }
          />
        </View>

        {selectedStore ? (
          <View style={styles.selectedStore} accessibilityLiveRegion="polite">
            <Text style={styles.selectedStoreLabel}>Selected store</Text>
            <Text style={styles.storeName}>{selectedStore.name}</Text>
            {selectedStore.address ? (
              <Text style={styles.storeMeta}>{selectedStore.address}</Text>
            ) : null}
          </View>
        ) : null}

        {stores.map((store, index) => (
          <View
            key={store.locationId}
            style={[
              styles.storeCard,
              selectedStoreId === store.locationId && styles.storeCardSelected,
            ]}
          >
            <Text style={styles.storeIndex}>{index + 1}</Text>
            <View style={styles.storeBody}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Select ${store.name}`}
                accessibilityState={{ selected: selectedStoreId === store.locationId }}
                onPress={() => setSelectedStoreId(store.locationId)}
                style={styles.storeSelect}
              >
                <Text style={styles.storeName}>{store.name}</Text>
                {store.address ? <Text style={styles.storeMeta}>{store.address}</Text> : null}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: reviewsStoreId === store.locationId }}
                onPress={() => void onToggleReviews(store)}
                style={styles.reviewToggle}
              >
                <Text style={styles.reviewToggleText}>
                  {reviewsStoreId === store.locationId ? "Hide reviews" : "View reviews"}
                </Text>
              </Pressable>
              {reviewsStoreId === store.locationId ? (
                <View style={styles.reviewList}>
                  {reviewsStatus === "loading" ? (
                    <View style={styles.statusRow}>
                      <ActivityIndicator color={colors.greenDark} />
                      <Text style={styles.hint}>Loading reviews...</Text>
                    </View>
                  ) : null}
                  {reviewsError ? <Text style={styles.errorText}>{reviewsError}</Text> : null}
                  {storeReviews ? (
                    <>
                      <Text style={styles.reviewSummary}>
                        {storeReviews.averageRating === null
                          ? "No ratings yet"
                          : `${storeReviews.averageRating.toFixed(1)} / 5`}
                        {` · ${storeReviews.reviewCount} ${storeReviews.reviewCount === 1 ? "review" : "reviews"}`}
                      </Text>
                      {storeReviews.reviews.length === 0 ? (
                        <Text style={styles.storeMeta}>Be the first to review this store.</Text>
                      ) : (
                        storeReviews.reviews.map((review) => (
                          <View key={review.id} style={styles.reviewItem}>
                            <Text style={styles.reviewLabel}>{review.rating} / 5</Text>
                            <Text style={styles.reviewComment}>{review.comment}</Text>
                            <Text style={styles.reviewDate}>
                              {new Date(review.createdAt).toLocaleDateString()}
                            </Text>
                          </View>
                        ))
                      )}
                    </>
                  ) : null}
                </View>
              ) : null}
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
    height: 360,
    borderRadius: layout.radius,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  storeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.radius,
    padding: 14,
  },
  storeCardSelected: { borderColor: colors.greenDark, backgroundColor: colors.greenSoft },
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
  storeSelect: { alignSelf: "stretch", gap: 4 },
  storeName: { fontSize: 16, fontWeight: "700", color: colors.text },
  storeMeta: { color: colors.muted, fontSize: 13 },
  selectedStore: {
    gap: 4,
    borderWidth: 1,
    borderColor: colors.greenDark,
    borderRadius: layout.radius,
    padding: 14,
    backgroundColor: colors.greenSoft,
  },
  selectedStoreLabel: { color: colors.greenDark, fontSize: 12, fontWeight: "700" },
  reviewToggle: { alignSelf: "flex-start", paddingVertical: 6 },
  reviewToggleText: { color: colors.greenDark, fontSize: 14, fontWeight: "700" },
  reviewList: { gap: 8, paddingTop: 4 },
  reviewSummary: { color: colors.text, fontSize: 15, fontWeight: "700" },
  reviewItem: { gap: 3, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  reviewComment: { color: colors.text, fontSize: 14 },
  reviewDate: { color: colors.muted, fontSize: 12 },
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
