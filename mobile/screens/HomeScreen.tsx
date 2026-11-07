import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { PRICE_ALERTS } from "../data/mockHome";
import type { HealthState } from "../hooks/useHealth";
import { colors, layout } from "../theme";
import { HealthChip, ScreenHeader } from "../components/Chrome";

type Props = {
  health: HealthState;
  onOpenSettings: () => void;
  onOpenShoppingList: () => void;
};

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

export function HomeScreen({ health, onOpenSettings, onOpenShoppingList }: Props) {
  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Home"
        onListPress={onOpenShoppingList}
        onSettingsPress={onOpenSettings}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <HealthChip health={health} />

        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🛒🔍</Text>
          <Text style={styles.heroTitle}>GroceryWatch</Text>
          <Text style={styles.heroTagline}>Compare grocery prices near you.</Text>
          <Text style={styles.pocBadge}>Proof of concept</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Deals around you</Text>
          <View style={styles.dealsRow}>
            <View style={styles.dealPlaceholder} />
            <View style={styles.dealPlaceholder} />
          </View>
          <Text style={styles.sectionHint}>See deals that are close to your area.</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Price Alerts</Text>
            <Text style={styles.deluxeTag}>Deluxe</Text>
          </View>

          {PRICE_ALERTS.map((alert) => (
            <View key={alert.id} style={styles.alertCard}>
              <View style={styles.alertTop}>
                <Text style={styles.alertProduct}>{alert.product}</Text>
                <Text style={styles.alertStore}>{alert.store}</Text>
              </View>
              <View style={styles.alertPrices}>
                <Text style={styles.oldPrice}>{formatMoney(alert.oldPrice)}</Text>
                <Text style={styles.newPrice}>{formatMoney(alert.newPrice)}</Text>
                <Text style={styles.decrease}>{alert.percentDecrease}% Decrease</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          style={styles.cta}
          onPress={() =>
            Alert.alert(
              "Price History",
              "Coming in deluxe — price history at select stores is not wired up yet."
            )
          }
        >
          <Text style={styles.ctaText}>See Price History at Select Stores</Text>
        </Pressable>

        <Text style={styles.footer}>CS 411W · ODU · Team Iron GroceryWatch</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 18,
  },
  hero: {
    alignItems: "center",
    backgroundColor: colors.greenSoft,
    borderRadius: layout.radius,
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 6,
  },
  heroEmoji: { fontSize: 42, marginBottom: 4 },
  heroTitle: { fontSize: 26, fontWeight: "800", color: colors.text },
  heroTagline: { fontSize: 15, color: colors.muted, textAlign: "center" },
  pocBadge: {
    marginTop: 8,
    backgroundColor: colors.white,
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "700",
    color: colors.greenDark,
    borderWidth: 1,
    borderColor: colors.green,
  },
  section: { gap: 10 },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    borderBottomWidth: 3,
    borderBottomColor: colors.green,
    alignSelf: "flex-start",
    paddingBottom: 2,
  },
  sectionHint: { fontSize: 12, color: colors.muted },
  deluxeTag: {
    backgroundColor: colors.warnSoft,
    fontSize: 11,
    fontWeight: "700",
    color: colors.warn,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  dealsRow: { flexDirection: "row", gap: 12 },
  dealPlaceholder: {
    flex: 1,
    height: 72,
    borderRadius: 12,
    backgroundColor: colors.placeholder,
  },
  alertCard: {
    backgroundColor: colors.card,
    borderRadius: layout.radius,
    padding: 14,
    gap: 8,
  },
  alertTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  alertProduct: { fontSize: 16, fontWeight: "700", color: colors.text },
  alertStore: { fontSize: 13, color: colors.muted },
  alertPrices: { flexDirection: "row", alignItems: "center", gap: 10 },
  oldPrice: {
    fontSize: 14,
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  newPrice: { fontSize: 18, fontWeight: "800", color: colors.greenDark },
  decrease: { fontSize: 13, fontWeight: "700", color: colors.green },
  cta: {
    backgroundColor: colors.green,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { color: colors.white, fontWeight: "700", fontSize: 15 },
  footer: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
});
