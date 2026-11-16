import { useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./StoreMap.web.css";
import type { KrogerStore } from "../store";
import { colors } from "../theme";

type Props = {
  stores: KrogerStore[];
  selectedStoreId: string | null;
  onSelect: (locationId: string) => void;
  emptyMessage: string;
};

type LocatedStore = KrogerStore & { latitude: number; longitude: number };

function storeMarkerIcon(index: number, selected: boolean) {
  const fill = selected ? colors.greenDark : colors.green;
  return L.divIcon({
    className: "grocerywatch-store-marker",
    html: `<span style="background:${fill}">${index + 1}</span>`,
    iconSize: [32, 38],
    iconAnchor: [16, 36],
  });
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
  const bounds = useMemo(
    () => L.latLngBounds(mapped.map((store) => [store.latitude, store.longitude])),
    [stores]
  );

  if (mapped.length === 0) {
    return <div className="store-map-empty">{emptyMessage}</div>;
  }

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [28, 28], maxZoom: 15 }}
      scrollWheelZoom
      className="store-map-leaflet"
      aria-label="Street map of nearby stores"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {mapped.map((store) => {
        const index = stores.indexOf(store);
        const selected = selectedStoreId === store.locationId;
        return (
          <Marker
            key={store.locationId}
            position={[store.latitude, store.longitude]}
            icon={storeMarkerIcon(index, selected)}
            eventHandlers={{ click: () => onSelect(store.locationId) }}
            title={`Select ${store.name}`}
          >
            <Popup>
              <strong>{store.name}</strong>
              {store.address ? <div>{store.address}</div> : null}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
