import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePrivacySettingsInput,
  DEFAULT_PRIVACY_SETTINGS,
} from "../src/privacySettings";

// Verify initial default states for location, analytics, and deals
test("DEFAULT_PRIVACY_SETTINGS defines sensible user defaults", () => {
  assert.equal(DEFAULT_PRIVACY_SETTINGS.shareLocation, true);
  assert.equal(DEFAULT_PRIVACY_SETTINGS.shareAnalytics, true);
  assert.equal(DEFAULT_PRIVACY_SETTINGS.personalizedDeals, true);
});

// Verify input parsing handles errors and extracts valid booleans
test("parsePrivacySettingsInput validates and extracts boolean privacy preferences", () => {
  assert.equal(typeof parsePrivacySettingsInput(null), "string");
  assert.equal(typeof parsePrivacySettingsInput("not-an-object"), "string");
  assert.equal(
    parsePrivacySettingsInput({}),
    "At least one privacy setting must be provided."
  );

  assert.equal(
    parsePrivacySettingsInput({ shareLocation: "true" }),
    "shareLocation must be a boolean."
  );
  assert.equal(
    parsePrivacySettingsInput({ shareAnalytics: 1 }),
    "shareAnalytics must be a boolean."
  );
  assert.equal(
    parsePrivacySettingsInput({ personalizedDeals: null }),
    "personalizedDeals must be a boolean."
  );

  const parsedValid = parsePrivacySettingsInput({
    shareLocation: false,
    shareAnalytics: true,
  });
  assert.deepEqual(parsedValid, {
    shareLocation: false,
    shareAnalytics: true,
  });

  const parsedAll = parsePrivacySettingsInput({
    shareLocation: false,
    shareAnalytics: false,
    personalizedDeals: false,
  });
  assert.deepEqual(parsedAll, {
    shareLocation: false,
    shareAnalytics: false,
    personalizedDeals: false,
  });
});
