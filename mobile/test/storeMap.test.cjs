const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadStoreMap() {
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(`${__dirname}/../components/StoreMap.web.tsx`, "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    require: (name) => {
      if (name === "react-native") {
        return {
          Text: "Text",
        };
      }
      if (name === "../theme") {
        return {
          colors: {
            card: "#F3F4F6",
            green: "#3CB371",
            greenDark: "#2E8B57",
            muted: "#6B7280",
            text: "#1A1A1A",
            white: "#FFFFFF",
          },
        };
      }
      if (name === "react") return { useMemo: (callback) => callback() };
      if (name === "react-leaflet") {
        return {
          MapContainer: "MapContainer",
          Marker: "Marker",
          Popup: "Popup",
          TileLayer: "TileLayer",
        };
      }
      if (name === "leaflet") {
        return {
          __esModule: true,
          default: {
            divIcon: (options) => options,
            latLngBounds: (coordinates) => coordinates,
          },
        };
      }
      if (name === "leaflet/dist/leaflet.css") return {};
      if (name === "./StoreMap.web.css") return {};
      return require(name);
    },
  });
  return exports.default;
}

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !node.props) return [];
  return [node, ...elements(node.props.children)];
}

const stores = [
  { locationId: "1", name: "North Market", address: "1 Main St", latitude: 36.9, longitude: -76.3 },
  { locationId: "2", name: "South Market", address: "2 Main St", latitude: 36.8, longitude: -76.2 },
  { locationId: "3", name: "No coordinates", address: "", latitude: null, longitude: null },
];

test("map displays located stores as selectable markers and reflects the selection", () => {
  const StoreMap = loadStoreMap();
  const selectedIds = [];
  const tree = StoreMap({
    stores,
    selectedStoreId: "2",
    onSelect: (id) => selectedIds.push(id),
    emptyMessage: "No stores",
  });
  const markers = elements(tree).filter((element) => element.type === "Marker");

  assert.equal(markers.length, 2);
  assert.deepEqual(markers.map((marker) => marker.props.title), [
    "Select North Market",
    "Select South Market",
  ]);
  assert.match(markers[1].props.icon.html, /#2E8B57/);
  markers[0].props.eventHandlers.click();
  assert.deepEqual(selectedIds, ["1"]);
  const tileLayers = elements(tree).filter((element) => element.type === "TileLayer");
  assert.equal(tileLayers.length, 1);
  assert.match(tileLayers[0].props.url, /tile\.openstreetmap\.org/);
  assert.doesNotMatch(tileLayers[0].props.url, /google|api.?key/i);
});

test("map explains when no store has coordinates", () => {
  const StoreMap = loadStoreMap();
  const tree = StoreMap({
    stores: [stores[2]],
    selectedStoreId: null,
    onSelect: () => assert.fail("A store without coordinates cannot be selected on the map"),
    emptyMessage: "No map locations",
  });

  assert.equal(
    tree.props.children,
    "No map locations"
  );
});
