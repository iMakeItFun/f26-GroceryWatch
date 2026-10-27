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
  calculateFinalPrice,
  calculateShoppingListTotal,
  ESTIMATED_TAX_RATE,
} from "../tax";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Profile = {
  id: string;
  display_name: string;
};

type SpottedProduct = {
  id: string;
  name: string;
  price: number;
  location: string;
  quantity: number | null;
};

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

async function readError(res: Response) {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === "string") return data.error;
  } catch {
  }
  return "Request failed.";
}

export function AccountScreen() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<SpottedProduct[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!API_URL) {
      setStatus("error");
      setLoadError("API URL not set");
      return;
    }

    if (!quiet) setStatus("loading");
    setLoadError("");

    try {
      const [profileRes, productsRes] = await Promise.all([
        fetch(`${API_URL}/profile`),
        fetch(`${API_URL}/products`),
      ]);

      if (!profileRes.ok) {
        setStatus("error");
        setLoadError(await readError(profileRes));
        return;
      }
      if (!productsRes.ok) {
        setStatus("error");
        setLoadError(await readError(productsRes));
        return;
      }

      setProfile((await profileRes.json()) as Profile);
      setProducts((await productsRes.json()) as SpottedProduct[]);
      setStatus("ready");
    } catch {
      setStatus("error");
      setLoadError("API unreachable");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canSubmit =
    status === "ready" &&
    !saving &&
    name.trim().length > 0 &&
    price.trim().length > 0 &&
    location.trim().length > 0;

  async function onRemove(id: string) {
    if (!API_URL || removingId) return;
    setRemovingId(id);
    setFormError("");
    try {
      const res = await fetch(`${API_URL}/products/${id}`, { method: "DELETE" });
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

  async function onSubmit() {
    if (!canSubmit || !API_URL) return;

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
        headers: { "Content-Type": "application/json" },
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

  return (
    <View style={styles.root}>
      <ScreenHeader title="List" showActions={false} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
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
                <Text style={styles.muted}>Placeholder shopper</Text>
              </View>
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

              <Text style={styles.label}>Shelf price (before tax)</Text>
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
                disabled={!canSubmit}
                style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
                onPress={() => void onSubmit()}
              >
                <Text style={styles.primaryBtnText}>{saving ? "Saving..." : "Save product"}</Text>
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your list</Text>
              {products.length > 0 && (
                <Text style={styles.muted}>
                  Estimated total includes {(ESTIMATED_TAX_RATE * 100).toFixed(0)}% estimated tax.
                </Text>
              )}
              {products.length === 0 ? (
                <Text style={styles.muted}>Nothing on your list yet.</Text>
              ) : (
                products.map((product) => (
                  <View key={product.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardName}>{product.name}</Text>
                      <Text style={styles.cardPrice}>
                        {formatMoney(
                          calculateFinalPrice(
                            product.price * (product.quantity ?? 1)
                          )
                        )}
                      </Text>
                    </View>
                    <Text style={styles.muted}>
                      Shelf price {formatMoney(product.price)}
                      {product.quantity !== null ? ` · Qty ${product.quantity}` : ""}
                    </Text>
                    <Text style={styles.muted}>{product.location}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${product.name}`}
                      disabled={removingId === product.id}
                      style={[styles.removeBtn, removingId === product.id && styles.primaryBtnDisabled]}
                      onPress={() => void onRemove(product.id)}
                    >
                      <Text style={styles.removeBtnText}>
                        {removingId === product.id ? "Removing..." : "Remove"}
                      </Text>
                    </Pressable>
                  </View>
                ))
              )}
              {products.length > 0 && (
                <View style={styles.cardTop}>
                  <Text style={styles.cardName}>Estimated list total</Text>
                  <Text style={styles.cardPrice}>
                    {formatMoney(calculateShoppingListTotal(products))}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: { padding: 16, gap: 14, paddingBottom: 28 },
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
  removeBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  removeBtnText: { color: colors.danger, fontWeight: "700", fontSize: 13 },
});
