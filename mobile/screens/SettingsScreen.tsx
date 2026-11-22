import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SETTINGS_ROWS } from "../data/mockHome";
import type { HealthState } from "../hooks/useHealth";
import { colors, layout } from "../theme";
import { HealthChip } from "../components/Chrome";

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const SESSION_KEY = "grocerywatch-session";

type PrivacySettings = {
  shareLocation: boolean;
  shareAnalytics: boolean;
  personalizedDeals: boolean;
};

type Session = {
  user: {
    id: string;
    display_name: string;
    email?: string;
  };
  token: string;
  expires_at: string;
};

function readSession(): Session | null {
  const storage = globalThis as typeof globalThis & {
    [SESSION_KEY]?: string;
    localStorage?: { getItem: (key: string) => string | null };
  };

  try {
    const globalValue = storage[SESSION_KEY];
    if (typeof globalValue === "string") {
      return JSON.parse(globalValue) as Session;
    }
  } catch {}

  try {
    const raw = storage.localStorage?.getItem(SESSION_KEY);
    if (raw) {
      return JSON.parse(raw) as Session;
    }
  } catch {}

  return null;
}

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = "Bearer " + token;
  }
  return headers;
}

type Props = {
  health: HealthState;
  onClose: () => void;
};

export function SettingsScreen({ health, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"menu" | "privacy">("menu");
  const [privacy, setPrivacy] = useState<PrivacySettings>({
    shareLocation: true,
    shareAnalytics: true,
    personalizedDeals: true,
  });
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [privacyMessage, setPrivacyMessage] = useState("");
  const [session, setSession] = useState<Session | null>(() => readSession());

  useEffect(() => {
    const sess = readSession();
    setSession(sess);
    if (!API_URL || !sess) return;

    fetch(`${API_URL}/profile/privacy`, {
      headers: authHeaders(sess.token),
    })
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data: PrivacySettings | null) => {
        if (data) setPrivacy(data);
      })
      .catch(() => {});
  }, [activeTab]);

  async function onTogglePrivacy(key: keyof PrivacySettings, value: boolean) {
    const updated = { ...privacy, [key]: value };
    setPrivacy(updated);
    setSavingPrivacy(true);
    setPrivacyMessage("");

    if (!API_URL || !session) {
      setSavingPrivacy(false);
      setPrivacyMessage("Saved for this session.");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/profile/privacy`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(session.token),
        },
        body: JSON.stringify({ [key]: value }),
      });
      if (res.ok) {
        setPrivacyMessage("Privacy settings saved.");
      } else {
        setPrivacyMessage("Failed to save setting.");
      }
    } catch {
      setPrivacyMessage("Failed to save setting.");
    } finally {
      setSavingPrivacy(false);
    }
  }

  if (activeTab === "privacy") {
    return (
      <View style={styles.root}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to settings"
            style={styles.backBtn}
            onPress={() => {
              setPrivacyMessage("");
              setActiveTab("menu");
            }}
          >
            <Text style={styles.backBtnText}>‹ Settings</Text>
          </Pressable>
        </View>

        <Text style={styles.title}>Privacy & Security</Text>
        <Text style={styles.subtitle}>
          Control how your data, location, and recommendations are used in GroceryWatch.
        </Text>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.privacyCard}>
            <View style={styles.privacyHeader}>
              <Text style={styles.cardHeading}>Preferences</Text>
              {savingPrivacy && <Text style={styles.savingText}>Saving...</Text>}
              {!savingPrivacy && privacyMessage !== "" && (
                <Text style={styles.savedText}>{privacyMessage}</Text>
              )}
            </View>

            <View style={styles.privacyRow}>
              <View style={styles.privacyInfo}>
                <Text style={styles.privacyLabel}>Share Location</Text>
                <Text style={styles.privacyDesc}>
                  Use your location to discover nearby grocery stores and compare prices.
                </Text>
              </View>
              <Switch
                value={privacy.shareLocation}
                onValueChange={(val) => void onTogglePrivacy("shareLocation", val)}
                accessibilityLabel="Share location toggle"
                trackColor={{ false: colors.border, true: colors.green }}
              />
            </View>

            <View style={[styles.privacyRow, styles.privacyRowBorder]}>
              <View style={styles.privacyInfo}>
                <Text style={styles.privacyLabel}>Anonymous Analytics</Text>
                <Text style={styles.privacyDesc}>
                  Help improve GroceryWatch by sending anonymous app usage data.
                </Text>
              </View>
              <Switch
                value={privacy.shareAnalytics}
                onValueChange={(val) => void onTogglePrivacy("shareAnalytics", val)}
                accessibilityLabel="Anonymous analytics toggle"
                trackColor={{ false: colors.border, true: colors.green }}
              />
            </View>

            <View style={[styles.privacyRow, styles.privacyRowBorder]}>
              <View style={styles.privacyInfo}>
                <Text style={styles.privacyLabel}>Personalized Deals</Text>
                <Text style={styles.privacyDesc}>
                  Allow product and deal recommendations tailored to your shopping list.
                </Text>
              </View>
              <Switch
                value={privacy.personalizedDeals}
                onValueChange={(val) => void onTogglePrivacy("personalizedDeals", val)}
                accessibilityLabel="Personalized deals toggle"
                trackColor={{ false: colors.border, true: colors.green }}
              />
            </View>
          </View>

          {!session && (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>
                💡 Guest mode: Settings apply to this browser session. Log in on Account to sync across devices.
              </Text>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            style={styles.homeBtn}
            onPress={() => {
              setPrivacyMessage("");
              setActiveTab("menu");
            }}
          >
            <Text style={styles.homeBtnText}>Done</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Settings</Text>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <Text style={styles.searchPlaceholder}>Search</Text>
        </View>

        {SETTINGS_ROWS.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={row.label}
            style={styles.row}
            onPress={() => {
              if (row.id === "privacy") {
                setActiveTab("privacy");
                return;
              }
              if (row.id === "about") {
                Alert.alert(
                  "About GroceryWatch",
                  `CS 411W · ODU\nTeam Iron GroceryWatch\n\n${health.label}`
                );
                return;
              }
              Alert.alert(row.label, `${row.hint}\n\nComing soon.`);
            }}
          >
            <Text style={styles.rowIcon}>{row.icon}</Text>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}

        <View style={styles.aboutBox}>
          <Text style={styles.aboutTitle}>System status</Text>
          <HealthChip health={health} />
          <Text style={styles.aboutBody}>
            GroceryWatch proof of concept. Live API health is shown above; settings
            preferences are saved to your account.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Home"
          style={styles.homeBtn}
          onPress={onClose}
        >
          <Text style={styles.homeBtnText}>Home</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingRight: 12,
  },
  backBtnText: {
    color: colors.greenDark,
    fontSize: 16,
    fontWeight: "700",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    paddingHorizontal: 16,
    paddingBottom: 14,
    lineHeight: 20,
  },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 12 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  searchIcon: { fontSize: 16 },
  searchPlaceholder: { color: colors.muted, fontSize: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  rowIcon: { fontSize: 18, width: 28, textAlign: "center" },
  rowLabel: { flex: 1, fontSize: 16, color: colors.text, fontWeight: "500" },
  chevron: { fontSize: 22, color: colors.muted },
  aboutBox: {
    marginTop: 16,
    backgroundColor: colors.greenSoft,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  aboutTitle: { fontWeight: "700", color: colors.text },
  aboutBody: { color: colors.muted, lineHeight: 20 },
  homeBtn: {
    marginTop: 16,
    backgroundColor: colors.green,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  homeBtnText: { color: colors.white, fontWeight: "700", fontSize: 16 },
  privacyCard: {
    backgroundColor: colors.card,
    borderRadius: layout.radius,
    padding: 16,
    gap: 14,
  },
  privacyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  savingText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600",
  },
  savedText: {
    fontSize: 12,
    color: colors.greenDark,
    fontWeight: "600",
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 4,
  },
  privacyRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  privacyInfo: {
    flex: 1,
    gap: 2,
  },
  privacyLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  privacyDesc: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  noticeBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
  },
  noticeText: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
});
