import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { BottomTabs, type TabId } from "./components/BottomTabs";
import { useHealth } from "./hooks/useHealth";
import { AccountScreen } from "./screens/AccountScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { MapScreen } from "./screens/MapScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { colors, layout } from "./theme";

export default function App() {
  const health = useHealth();
  const [tab, setTab] = useState<TabId>("home");
  const [showSettings, setShowSettings] = useState(false);
  const { width } = useWindowDimensions();
  const frameWidth = Math.min(width, layout.phoneWidth);

  const openSettings = () => setShowSettings(true);
  const openShoppingList = () => {
    setShowSettings(false);
    setTab("account");
  };
  const closeSettings = () => {
    setShowSettings(false);
    setTab("home");
  };

  let screen = (
    <HomeScreen
      health={health}
      onOpenSettings={openSettings}
      onOpenShoppingList={openShoppingList}
    />
  );

  if (showSettings) {
    screen = <SettingsScreen health={health} onClose={closeSettings} />;
  } else if (tab === "map") {
    screen = <MapScreen />;
  } else if (tab === "search") {
    screen = (
      <SearchScreen
        onOpenSettings={openSettings}
        onOpenShoppingList={openShoppingList}
      />
    );
  } else if (tab === "account") {
    screen = <AccountScreen />;
  }

  return (
    <View style={styles.page}>
      <StatusBar style="dark" />
      <View style={[styles.phone, { width: frameWidth }]}>
        <View style={styles.screen}>{screen}</View>
        {!showSettings && (
          <BottomTabs
            active={tab}
            onChange={(next) => {
              setShowSettings(false);
              setTab(next);
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: Platform.OS === "web" ? "#1F2937" : colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  phone: {
    flex: 1,
    maxWidth: layout.phoneWidth,
    width: "100%",
    backgroundColor: colors.white,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? {
          maxHeight: 844,
          borderRadius: 24,
          marginVertical: 16,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
        }
      : null),
  },
  screen: { flex: 1 },
});
