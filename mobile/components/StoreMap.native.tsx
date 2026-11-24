import MapView, { Callout, Marker, type Region } from "react-native-maps";
import { StyleSheet, Text, View } from "react-native";
import type { KrogerStore } from "../store";
import { colors } from "../theme";

type Props = {
  stores: KrogerStore[];
  selectedStoreId: string | null;
  onSelect: (locationId: string) => void;
  emptyMessage: string;
};

type LocatedStore = KrogerStore & { latitude: number; longitude: number };

function regionFor(stores: LocatedStore[]): Region {
  const latitudes = stores.map((store) => store.latitude);
  const longitudes = stores.map((store) => store.longitude);
  const latitudeSpan = Math.max(Math.max(...latitudes) - Math.min(...latitudes), 0.015);
  const longitudeSpan = Math.max(Math.max(...longitudes) - Math.min(...longitudes), 0.015);

  return {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    latitudeDelta: latitudeSpan * 1.5,
    longitudeDelta: longitudeSpan * 1.5,
  };
}

export default function StoreMap({
  stores,
  selectedStoreId,
  onSelect,
  emptyMessage,
}: Props) {
  const mapped = stores.filter(
    (store): store is LocatedStore =>
      store.latitude !== null && store.longitude !== null
  );

  if (mapped.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <MapView
      key={mapped.map((store) => `${store.locationId}:${store.latitude}:${store.longitude}`).join(",")}
      style={StyleSheet.absoluteFill}
      initialRegion={regionFor(mapped)}
      mapType="standard"
      showsCompass
      showsScale
      accessibilityLabel="Map of nearby stores"
    >
      {mapped.map((store, index) => (
        <Marker
          key={store.locationId}
          coordinate={{ latitude: store.latitude, longitude: store.longitude }}
          title={store.name}
          description={store.address}
          accessibilityLabel={`Select ${store.name}`}
          pinColor={selectedStoreId === store.locationId ? colors.greenDark : colors.green}
          onPress={() => onSelect(store.locationId)}
        >
          <Callout>
            <View style={styles.callout}>
              <Text style={styles.calloutName}>{store.name}</Text>
              {store.address ? <Text>{store.address}</Text> : null}
              <Text style={styles.calloutHint}>Store {index + 1}</Text>
            </View>
          </Callout>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  empty: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: colors.card,
  },
  emptyText: { textAlign: "center", color: colors.muted },
  callout: { gap: 4, maxWidth: 220, padding: 4 },
  calloutName: { fontWeight: "700" },
  calloutHint: { color: colors.muted, fontSize: 12 },
});
