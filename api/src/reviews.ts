export type ReviewInput = {
  locationId: string;
  storeName: string;
  storeAddress: string;
  rating: number;
  comment: string;
};

export function parseReviewInput(body: unknown): ReviewInput | string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Request body is required.";
  }

  const raw = body as Record<string, unknown>;
  const locationId =
    typeof raw.locationId === "string" ? raw.locationId.trim() : "";
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(locationId)) {
    return "A valid store is required.";
  }

  const storeName = typeof raw.storeName === "string" ? raw.storeName.trim() : "";
  if (!storeName || storeName.length > 120) {
    return "Store name must be between 1 and 120 characters.";
  }

  const storeAddress =
    typeof raw.storeAddress === "string" ? raw.storeAddress.trim() : "";
  if (storeAddress.length > 250) {
    return "Store address must be no more than 250 characters.";
  }

  if (
    typeof raw.rating !== "number" ||
    !Number.isInteger(raw.rating) ||
    raw.rating < 1 ||
    raw.rating > 5
  ) {
    return "Rating must be a whole number from 1 to 5.";
  }

  const comment = typeof raw.comment === "string" ? raw.comment.trim() : "";
  if (!comment || comment.length > 1000) {
    return "Review must be between 1 and 1000 characters.";
  }

  return {
    locationId,
    storeName,
    storeAddress,
    rating: raw.rating,
    comment,
  };
}
