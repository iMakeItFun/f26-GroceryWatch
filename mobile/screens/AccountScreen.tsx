import { useCallback, useEffect, useState } from "react";
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
import {
  PriceHistoryModal,
  type PriceHistoryResponse,
} from "../components/PriceHistoryModal";

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const SESSION_KEY = "grocerywatch-session";

type Profile = {
  id: string;
  display_name: string;
  email?: string;
};

type Session = {
  user: Profile;
  token: string;
  expires_at: string;
};

type SpottedProduct = {
  id: string;
  name: string;
  price: number;
  location: string;
  quantity: number | null;
  barcode: string | null;
  external_store_id: string | null;
};

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function readSession() {
  const storage = (globalThis as typeof globalThis & {
    [SESSION_KEY]?: string;
    localStorage?: { getItem: (key: string) => string | null };
  });

  try {
    const globalValue = storage[SESSION_KEY];
    if (typeof globalValue === "string") {
      return JSON.parse(globalValue) as Session;
    }
  } catch {
    // Ignore storage read failures.
  }

  try {
    const raw = storage.localStorage?.getItem(SESSION_KEY);
    if (raw) {
      return JSON.parse(raw) as Session;
    }
  } catch {
    // Ignore storage read failures.
  }

  return null;
}

function writeSession(session: Session | null) {
  const storage = (globalThis as typeof globalThis & {
    [SESSION_KEY]?: string;
    localStorage?: {
      setItem: (key: string, value: string) => void;
      removeItem: (key: string) => void;
    };
  });

  try {
    storage[SESSION_KEY] = session ? JSON.stringify(session) : undefined;
  } catch {
    // Ignore storage write errors.
  }

  try {
    if (session) {
      storage.localStorage?.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      storage.localStorage?.removeItem(SESSION_KEY);
    }
  } catch {
    // Ignore storage write errors.
  }
}

async function readError(res: Response) {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === "string") return data.error;
  } catch {
  }
  return "Request failed.";
}

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = "Bearer " + token;
  }
  return headers;
}

export function AccountScreen() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<SpottedProduct[]>([]);
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [formError, setFormError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [activeHistory, setActiveHistory] = useState<SpottedProduct | null>(null);
  const [historyData, setHistoryData] = useState<PriceHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const clearSession = useCallback(() => {
    writeSession(null);
    setSession(null);
    setProfile(null);
    setProducts([]);
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!API_URL) {
      setStatus("error");
      setLoadError("API URL not set");
      return;
    }

    if (!session) {
      setStatus("ready");
      setLoadError("");
      setProfile(null);
      setProducts([]);
      return;
    }

    if (!quiet) setStatus("loading");
    setLoadError("");

    try {
      const response = await fetch(`${API_URL}/profile`, {
        headers: authHeaders(session.token),
      });

      if (response.status === 401) {
        clearSession();
        setFormError("Your session expired. Please log in again.");
        return;
      }

      if (!response.ok) {
        setStatus("error");
        setLoadError(await readError(response));
        return;
      }

      const profileData = (await response.json()) as Profile;
      const productsResponse = await fetch(`${API_URL}/products`, {
        headers: authHeaders(session.token),
      });

      if (productsResponse.status === 401) {
        clearSession();
        setFormError("Your session expired. Please log in again.");
        return;
      }

      if (!productsResponse.ok) {
        setStatus("error");
        setLoadError(await readError(productsResponse));
        return;
      }

      setProfile(profileData);
      setProducts((await productsResponse.json()) as SpottedProduct[]);
      setStatus("ready");
    } catch {
      setStatus("error");
      setLoadError("API unreachable");
    }
  }, [clearSession, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const canSubmitAuth =
    !saving &&
    email.trim().length > 0 &&
    password.trim().length >= 8 &&
    (mode === "login" || displayName.trim().length >= 2);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState("");

  const canSubmitProduct =
    status === "ready" &&
    !saving &&
    !!session &&
    name.trim().length > 0 &&
    price.trim().length > 0 &&
    location.trim().length > 0;

  async function onSubmitAuth() {
    if (!API_URL || !canSubmitAuth) return;

    setSaving(true);
    setFormError("");

    const endpoint = mode === "signup" ? "/auth/signup" : "/auth/login";
    const body =
      mode === "signup"
        ? {
            displayName: displayName.trim(),
            email: email.trim(),
            password: password.trim(),
          }
        : {
            email: email.trim(),
            password: password.trim(),
          };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setFormError(await readError(res));
        return;
      }

      const nextSession = (await res.json()) as Session;
      writeSession(nextSession);
      setSession(nextSession);
      setDisplayName("");
      setEmail("");
      setPassword("");
      setMode("login");
      setStatus("loading");
    } catch {
      setFormError("API unreachable");
    } finally {
      setSaving(false);
    }
  }

  async function onRemove(id: string) {
    if (!API_URL || removingId || !session) return;
    setRemovingId(id);
    setFormError("");
    try {
      const res = await fetch(`${API_URL}/products/${id}`, {
        method: "DELETE",
        headers: authHeaders(session.token),
      });
      if (!res.ok) {
        setFormError(await readError(res));
        return;
      }
      setProducts((current) => current.filter((product) => product.id !== id));
    } catch {
      setFormError("API unreachable");
    } finally {
      setRemovingId(null);
    }
  }

  async function onHistory(product: SpottedProduct) {
    if (
      !API_URL ||
      !product.barcode ||
      !product.external_store_id ||
      historyLoading
    ) {
      return;
    }

    setActiveHistory(product);
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
            locationId: product.external_store_id,
            barcode: product.barcode,
            name: product.name,
          }),
        }
      );

      if (!response.ok) {
        setHistoryError(await readError(response));
        return;
      }

      const data =
        (await response.json()) as PriceHistoryResponse;

      setHistoryData(data);
    } catch {
      setHistoryError(
        "Could not retrieve price history."
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  async function onSubmitProduct() {
    if (!canSubmitProduct || !session || !API_URL) return;

    setSaving(true);
    setFormError("");

    const body: { name: string; price: number; location: string; quantity?: number } = {
      name: name.trim(),
      price: Number(price),
      location: location.trim(),
    };
    if (quantity.trim()) {
      body.quantity = Number(quantity);
    }

    try {
      const res = await fetch(`${API_URL}/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(session.token),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setFormError(await readError(res));
        return;
      }

      setName("");
      setPrice("");
      setLocation("");
      setQuantity("");
      await load(true);
    } catch {
      setFormError("API unreachable");
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    if (!API_URL || !session) return;
    setSaving(true);
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: {
          ...authHeaders(session.token),
        },
      });
    } catch {
      // Keep the local session cleared even if the API call fails.
    } finally {
      clearSession();
      setSaving(false);
    }
  }

  if (!session) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Account" showActions={false} />
        <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>{mode === "login" ? "Log in" : "Create account"}</Text>
            <Text style={styles.muted}>
              {mode === "login"
                ? "Welcome back. Sign in to manage your list."
                : "Create an account to save your grocery list."}
            </Text>

            {mode === "signup" && (
              <>
                <Text style={styles.label}>Display name</Text>
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Jane Shopper"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  autoCapitalize="words"
                />
              </>
            )}

            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
              secureTextEntry
            />

            {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={!canSubmitAuth}
              style={[styles.primaryBtn, !canSubmitAuth && styles.primaryBtnDisabled]}
              onPress={() => void onSubmitAuth()}
            >
              <Text style={styles.primaryBtnText}>{saving ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setMode(mode === "login" ? "signup" : "login");
                setFormError("");
              }}
            >
              <Text style={styles.switchText}>
                {mode === "login" ? "Need an account? Create one" : "Already have an account? Log in"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Account" showActions={false} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {status === "loading" && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={colors.greenDark} />
            <Text style={styles.muted}>Loading profile...</Text>
          </View>
        )}

        {status === "error" && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable style={styles.secondaryBtn} onPress={() => void load()}>
              <Text style={styles.secondaryBtnText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {status === "ready" && profile && (
          <>
            <View style={styles.profile}>
              <View style={styles.avatar} />
              <View style={styles.profileText}>
                <Text style={styles.name}>{profile.display_name}</Text>
                <Text style={styles.muted}>{profile.email ?? "Personal account"}</Text>
              </View>
              <Pressable onPress={() => void onLogout()} style={styles.logoutBtn}>
                <Text style={styles.logoutBtnText}>Log out</Text>
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Add a product</Text>
              <Text style={styles.muted}>
                Record something you found in a store. Quantity is optional.
              </Text>

              <Text style={styles.label}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Whole milk"
                placeholderTextColor={colors.muted}
                style={styles.input}
                accessibilityLabel="Product name"
              />

              <Text style={styles.label}>Current price</Text>
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="3.49"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                style={styles.input}
                accessibilityLabel="Current price"
              />

              <Text style={styles.label}>Location</Text>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="Kroger on Hampton Blvd"
                placeholderTextColor={colors.muted}
                style={styles.input}
                accessibilityLabel="Location"
              />

              <Text style={styles.label}>Quantity</Text>
              <TextInput
                value={quantity}
                onChangeText={setQuantity}
                placeholder="Optional"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={styles.input}
                accessibilityLabel="Quantity"
              />

              {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

              <Pressable
                accessibilityRole="button"
                disabled={!canSubmitProduct}
                style={[styles.primaryBtn, !canSubmitProduct && styles.primaryBtnDisabled]}
                onPress={() => void onSubmitProduct()}
              >
                <Text style={styles.primaryBtnText}>{saving ? "Saving..." : "Save product"}</Text>
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your list</Text>
              {products.length === 0 ? (
                <Text style={styles.muted}>Nothing on your list yet.</Text>
              ) : (
                products.map((product) => (
                  <View key={product.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardName}>{product.name}</Text>
                      <Text style={styles.cardPrice}>{formatMoney(product.price)}</Text>
                    </View>
                    <Text style={styles.muted}>{product.location}</Text>
                    {product.quantity !== null && (
                      <Text style={styles.muted}>Qty {product.quantity}</Text>
                    )}
                    <View style={styles.cardActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View price history for ${product.name}`}
                        disabled={
                          !product.barcode ||
                          !product.external_store_id ||
                          historyLoading
                        }
                        onPress={() => void onHistory(product)}
                        style={[
                          styles.actionBtn,
                          styles.historyBtn,
                          (!product.barcode ||
                            !product.external_store_id ||
                            historyLoading) &&
                            styles.primaryBtnDisabled,
                        ]}
                      >
                        <Text style={styles.historyBtnText}>
                          History
                        </Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${product.name}`}
                        disabled={removingId === product.id}
                        onPress={() => void onRemove(product.id)}
                        style={[
                          styles.actionBtn,
                          styles.removeBtn,
                          removingId === product.id &&
                            styles.primaryBtnDisabled,
                        ]}
                      >
                        <Text style={styles.removeBtnText}>
                          {removingId === product.id
                            ? "Removing..."
                            : "Remove"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
        </ScrollView>

      <PriceHistoryModal
        visible={activeHistory !== null}
        productName={activeHistory?.name ?? ""}
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
  authContent: { flexGrow: 1, justifyContent: "center", padding: 16 },
  authCard: { backgroundColor: colors.card, borderRadius: layout.radius, padding: 18, gap: 12 },
  authTitle: { fontSize: 24, fontWeight: "800", color: colors.text },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  profile: { flexDirection: "row", gap: 14, alignItems: "center" },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.placeholder,
  },
  profileText: { flex: 1, gap: 4 },
  name: { fontSize: 20, fontWeight: "800", color: colors.text },
  muted: { color: colors.muted, fontSize: 13 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  label: { fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.white,
  },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: layout.radius,
    padding: 14,
    gap: 10,
  },
  errorText: { color: colors.danger, fontSize: 14 },
  primaryBtn: {
    backgroundColor: colors.green,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: colors.white, fontWeight: "700" },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.black,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryBtnText: { color: colors.text, fontWeight: "700" },
  switchText: { textAlign: "center", color: colors.greenDark, fontWeight: "700", marginTop: 8 },
  logoutBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutBtnText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: layout.radius,
    padding: 14,
    gap: 4,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  },
  cardName: { flex: 1, fontWeight: "700", color: colors.text, fontSize: 16 },
  cardPrice: { fontWeight: "800", color: colors.greenDark, fontSize: 16 },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    minWidth: 100,
    height: 36,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  historyBtn: {
    borderColor: colors.greenDark,
  },
  historyBtnText: {
    color: colors.greenDark,
    fontWeight: "700",
    fontSize: 13,
  },
  removeBtn: {
    borderColor: colors.border,
    marginTop: 0,
    alignSelf: "auto",
  },
  removeBtnText: {
    color: colors.danger,
    fontWeight: "700",
    fontSize: 13,
  },
});
