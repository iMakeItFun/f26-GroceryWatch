export type PrivacySettings = {
  shareLocation: boolean;
  shareAnalytics: boolean;
  personalizedDeals: boolean;
};

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  shareLocation: true,
  shareAnalytics: true,
  personalizedDeals: true,
};

export function parsePrivacySettingsInput(
  body: unknown
): Partial<PrivacySettings> | string {
  if (!body || typeof body !== "object") {
    return "Request body is required.";
  }
  const raw = body as Record<string, unknown>;
  const result: Partial<PrivacySettings> = {};

  if ("shareLocation" in raw) {
    if (typeof raw.shareLocation !== "boolean") {
      return "shareLocation must be a boolean.";
    }
    result.shareLocation = raw.shareLocation;
  }
  if ("shareAnalytics" in raw) {
    if (typeof raw.shareAnalytics !== "boolean") {
      return "shareAnalytics must be a boolean.";
    }
    result.shareAnalytics = raw.shareAnalytics;
  }
  if ("personalizedDeals" in raw) {
    if (typeof raw.personalizedDeals !== "boolean") {
      return "personalizedDeals must be a boolean.";
    }
    result.personalizedDeals = raw.personalizedDeals;
  }

  if (Object.keys(result).length === 0) {
    return "At least one privacy setting must be provided.";
  }
  return result;
}
