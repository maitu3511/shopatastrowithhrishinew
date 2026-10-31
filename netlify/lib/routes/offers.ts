import { getDb } from "../firebaseAdmin";

type PublicOffer = {
  description: string | null;
  discount_type: "percent" | "flat";
  discount_value: number;
  min_order: number;
};

const expiryValue = (value: unknown): number | null => {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const date = (value as { toDate: () => Date }).toDate();
    const parsed = date instanceof Date ? date.getTime() : Number.NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const activeOffers = async () => {
  try {
    const snapshot = await getDb().collection("coupons").get();
    const now = Date.now();
    const offers: PublicOffer[] = [];

    for (const document of snapshot.docs) {
      const data = document.data();
      if (data.active !== true) continue;

      const expiresAt = expiryValue(data.expires_at);
      if (data.expires_at && (expiresAt === null || expiresAt <= now)) continue;

      const usageLimit = data.usage_limit === null || data.usage_limit === undefined
        ? null
        : Number(data.usage_limit);
      const usedCount = Number(data.used_count ?? 0);
      if (
        usageLimit !== null &&
        Number.isFinite(usageLimit) &&
        usageLimit >= 0 &&
        Number.isFinite(usedCount) &&
        usedCount >= usageLimit
      ) continue;

      const discountValue = Number(data.discount_value);
      const minOrder = Number(data.min_order ?? 0);
      if (!Number.isFinite(discountValue) || !Number.isFinite(minOrder)) continue;

      offers.push({
        description: typeof data.description === "string" && data.description.trim() ? data.description.trim() : null,
        discount_type: data.discount_type === "flat" ? "flat" : "percent",
        discount_value: discountValue,
        min_order: Math.max(0, minOrder),
      });
    }

    return new Response(JSON.stringify({ offers }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  } catch (error) {
    console.warn("[active-offers] offers load note:", error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ offers: [] }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  }
};
