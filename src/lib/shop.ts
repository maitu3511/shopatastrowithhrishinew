export type ProductVideo = {
  url: string;
  duration?: number; // 15, 30, 45, 60 seconds (max 1 minute)
  type?: "review" | "product"; // "review" = client review, "product" = showcase
  title?: string;
  client_name?: string;
  rating?: number;
  thumbnail?: string;
};

export type DBProduct = {
  id: string;
  slug?: string;
  name: string;
  title?: string;
  description: string | null;
  price: number;
  image_url: string | null;
  images: string[] | null;
  category: string | null;
  stock: number;
  active: boolean;
  discount_percent: number;
  variants: { name: string; options: string[] }[] | null;
  sku: string | null;
  badge: string | null;
  rating: number;
  review_count: number;
  sort_order: number;
  featured?: boolean;
  created_at: string;
  video_url?: string | null;
  video_type?: "review" | "product";
  video_duration?: number;
  video_title?: string | null;
  video_client_name?: string | null;
  videos?: ProductVideo[] | null;
};

export const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

export const slugifyProductName = (name?: string | null) =>
  String(name ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "product";

export const productRouteId = (product: Pick<DBProduct, "id" | "name" | "slug">) => {
  const nameSlug = slugifyProductName(product.name);
  if (typeof product.slug === "string" && product.slug.trim()) return product.slug.trim();
  if (product.id === nameSlug) return product.id;
  return nameSlug;
};

/** Strike-through MRP derived from the product's discount percentage. */
export const mrpOf = (price: number, discount: number) =>
  discount > 0 ? Math.round(price / (1 - discount / 100)) : Math.round(price * 1.3);

export const shippingFor = (subtotal: number) => (subtotal >= 999 || subtotal === 0 ? 0 : 79);

/**
 * Live payment-test line item: a real ₹1/₹5/₹10 product used to validate the
 * Razorpay live flow. Such an order is charged at exactly the product price —
 * no shipping, no GST — so the test amount is predictable.
 */
export const isTestItem = (name: string) => {
  const n = (name || "").trim().toLowerCase();
  return (
    n.startsWith("live payment test") ||
    n.includes("test ₹10") ||
    n.includes("test 10") ||
    n === "live-payment-test-10inr" ||
    n === "live payment test ₹10" ||
    n === "live payment test ₹1" ||
    n === "live-payment-test-1inr" ||
    n.includes("payment test ₹1") ||
    n.includes("test ₹1")
  );
};
export const isTestOrder = (names: string[]) => names.length > 0 && names.some(isTestItem);
export const gstFor = (subtotal: number) => Math.round(subtotal * 0.03);

export type Coupon = {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  min_order: number;
  max_discount: number | null;
  usage_limit: number | null;
  used_count: number;
  active: boolean;
  expires_at: string | null;
};

export const couponDiscount = (coupon: Coupon | null, subtotal: number) => {
  if (!coupon || subtotal < Number(coupon.min_order)) return 0;
  const raw =
    coupon.discount_type === "percent"
      ? (subtotal * Number(coupon.discount_value)) / 100
      : Number(coupon.discount_value);
  const capped = coupon.max_discount ? Math.min(raw, Number(coupon.max_discount)) : raw;
  return Math.min(Math.round(capped), subtotal);
};

export const deliveryEstimate = (days = 6) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};

export const PAYMENT_METHODS = [
  { id: "upi", label: "UPI", hint: "GPay · PhonePe · Paytm · BHIM" },
  { id: "card", label: "Credit / Debit Card", hint: "Visa · Mastercard · RuPay · Amex" },
  { id: "netbanking", label: "Net Banking", hint: "All major Indian banks" },
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];
