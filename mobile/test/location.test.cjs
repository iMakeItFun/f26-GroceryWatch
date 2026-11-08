const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadLocation({ granted = true, canAskAgain = true, services = true,
  coords = { latitude: 36.85, longitude: -76.29 }, os = "ios", settingsFails = false } = {}) {
  let positionCalls = 0;
  const alerts = [];
  const errors = [];
  const exports = {};
  const source = ts.transpileModule(readFileSync(`${__dirname}/../location.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: (name) => {
    if (name === "expo-location") return {
      requestForegroundPermissionsAsync: async () => ({ granted, canAskAgain }),
      hasServicesEnabledAsync: async () => services,
      Accuracy: { Balanced: 3 },
      getCurrentPositionAsync: async () => { positionCalls++; return { coords }; },
    };
    if (name === "react-native") return {
      Platform: { OS: os }, Alert: { alert: (...args) => alerts.push(args) },
      Linking: { openSettings: async () => { if (settingsFails) throw Error("Unavailable"); } },
    };
    throw Error(`Unexpected module: ${name}`);
  } });
  return { ...exports, alerts, errors, setError: (text) => errors.push(text),
    positionCalls: () => positionCalls };
}

test("granted permission returns current coordinates", async () => {
  const location = loadLocation();
  const result = await location.requestDeviceCoordinates();
  assert.equal(result.granted, true);
  assert.equal(result.coordinates.latitude, 36.85);
  assert.equal(result.coordinates.longitude, -76.29);
  assert.equal(location.positionCalls(), 1);
});

test("denied permission skips location lookup and retains ZIP guidance", async () => {
  for (const canAskAgain of [true, false]) {
    const location = loadLocation({ granted: false, canAskAgain });
    const result = await location.requestDeviceCoordinates();
    assert.equal(result.granted, false);
    assert.equal(location.positionCalls(), 0);
    location.showLocationPermissionDenied(result.canAskAgain, location.setError);
    assert.match(location.errors[0], /ZIP/);
    assert.equal(location.alerts.length, canAskAgain ? 0 : 1);
  }
});

test("disabled services and invalid coordinates fail cleanly", async () => {
  const disabled = loadLocation({ services: false });
  await assert.rejects(disabled.requestDeviceCoordinates(), /disabled/);
  assert.equal(disabled.positionCalls(), 0);
  for (const coords of [{ latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 }]) {
    await assert.rejects(loadLocation({ coords }).requestDeviceCoordinates(), /invalid coordinates/);
  }
});

test("settings failures retain fallback and web provides browser guidance", async () => {
  const location = loadLocation({ settingsFails: true });
  location.showLocationPermissionDenied(false, location.setError);
  location.alerts[0][2][1].onPress();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(location.errors.at(-1), /Could not open device settings.*ZIP/);
  const web = loadLocation({ os: "web" });
  web.showLocationPermissionDenied(false, web.setError);
  assert.match(web.errors[0], /browser settings.*ZIP/);
  assert.equal(web.alerts.length, 0);
});
