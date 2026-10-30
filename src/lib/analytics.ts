/**
 * Astro With Hrishi - Production Analytics, SEO & Conversion Tracking Hub
 * 
 * Supports:
 * - Google Analytics 4 (gtag.js) via VITE_GA_MEASUREMENT_ID
 * - Meta Pixel (fbq) via VITE_META_PIXEL_ID
 * - Google Ads Conversion Tracking via VITE_GOOGLE_ADS_ID
 * 
 * Strict E-Commerce & Privacy Principles:
 * - Currency is fixed to INR.
 * - Real item IDs, names, prices and quantities.
 * - Idempotent Purchase tracking (fires strictly AFTER server verification, never on button click).
 * - Persistent order-level deduplication prevents repeat triggers on reload/UPI return/webhook.
 * - Zero PII sent in event payloads.
 */

import { collection, addDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

export interface AnalyticsItem {
  id: string | number;
  name: string;
  price: number;
  quantity?: number;
  category?: string;
  variant?: string | null;
}

export interface PurchaseEventPayload {
  orderId: string;
  orderNumber?: string | null;
  total: number;
  items: AnalyticsItem[];
  currency?: string;
  tax?: number;
  shipping?: number;
  coupon?: string;
}

declare global {
  interface Window {
    dataLayer: any[];
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
    _fbq?: any;
    __AWH_ANALYTICS_INITIALIZED__?: boolean;
  }
}

// Persistent key for order deduplication
const TRACKED_PURCHASES_KEY = "awh_analytics_tracked_purchases";

// Environment variables
export const GA_MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID || "G-WQCLV9J913").trim();
export const META_PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID || "").trim();
export const GOOGLE_ADS_ID = (import.meta.env.VITE_GOOGLE_ADS_ID || "").trim();
export const GOOGLE_ADS_CONVERSION_LABEL = (import.meta.env.VITE_GOOGLE_ADS_CONVERSION_LABEL || "").trim();

// Runtime state for dynamically fetched tracking IDs (if configured in Admin)
let dynamicGaId = GA_MEASUREMENT_ID;
let dynamicPixelId = META_PIXEL_ID;
let dynamicAdsId = GOOGLE_ADS_ID;
let dynamicAdsLabel = GOOGLE_ADS_CONVERSION_LABEL;

export function isValidGaId(id: string): boolean {
  return typeof id === "string" && /^G-[A-Z0-9]+$/i.test(id.trim());
}

export function isValidPixelId(id: string): boolean {
  return typeof id === "string" && /^\d{5,25}$/.test(id.trim());
}

export function isValidAdsId(id: string): boolean {
  return typeof id === "string" && /^(AW-)?[0-9]+/i.test(id.trim());
}

export function getActiveGaId(): string {
  return dynamicGaId || GA_MEASUREMENT_ID;
}

export function getActivePixelId(): string {
  return dynamicPixelId || META_PIXEL_ID;
}

export function getActiveAdsId(): string {
  const id = (dynamicAdsId || GOOGLE_ADS_ID || "").trim();
  return /^[0-9]+$/.test(id) ? `AW-${id}` : id;
}

export function getActiveAdsLabel(): string {
  return dynamicAdsLabel || GOOGLE_ADS_CONVERSION_LABEL;
}

// In-memory client rate limiter (max 40 events per minute per browser tab)
let eventCounter = 0;
let lastResetTime = Date.now();

function isRateLimited(): boolean {
  const now = Date.now();
  if (now - lastResetTime > 60000) {
    eventCounter = 0;
    lastResetTime = now;
  }
  if (eventCounter >= 40) return true;
  eventCounter++;
  return false;
}

// Allowed client event names for Firestore logging
const ALLOWED_EVENT_NAMES = new Set([
  "page_view",
  "view_item",
  "view_item_list",
  "search",
  "add_to_cart",
  "remove_from_cart",
  "view_cart",
  "begin_checkout",
  "add_shipping_info",
  "add_payment_info",
  "purchase",
  "login",
  "sign_up",
]);

// Strip sensitive fields (PII, secrets, card data)
function sanitizeDetails(data: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  const blockedRegex = /password|secret|key|token|auth|phone|email|address|street|card|cvv|account|pincode|zip|signature/i;

  for (const [k, v] of Object.entries(data)) {
    if (blockedRegex.test(k)) continue;
    if (typeof v === "string") {
      clean[k] = v.slice(0, 300); // cap string length
    } else if (typeof v === "number" || typeof v === "boolean") {
      clean[k] = v;
    } else if (Array.isArray(v)) {
      clean[k] = v.slice(0, 20).map((item) => {
        if (typeof item === "object" && item !== null) {
          return {
            id: String(item.id || "").slice(0, 100),
            name: String(item.name || "").slice(0, 150),
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 1),
          };
        }
        return String(item).slice(0, 100);
      });
    } else if (v === null || v === undefined) {
      clean[k] = null;
    }
  }
  return clean;
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "server_session";
  try {
    let sid = sessionStorage.getItem("awh_analytics_session_id");
    if (!sid) {
      sid = `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem("awh_analytics_session_id", sid);
    }
    return sid;
  } catch {
    return "anonymous_session";
  }
}

export function getDeviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|iemobile|kindle/i.test(ua)) return "mobile";
  return "desktop";
}

export function getTrafficSource(): string {
  if (typeof window === "undefined") return "Direct";
  try {
    const referrer = document.referrer;
    if (!referrer) return "Direct";
    const refUrl = new URL(referrer);
    if (refUrl.hostname.includes(window.location.hostname)) return "Direct / Internal";
    if (refUrl.hostname.includes("google.")) return "Google Search";
    if (refUrl.hostname.includes("instagram.com")) return "Instagram";
    if (refUrl.hostname.includes("facebook.com") || refUrl.hostname.includes("fb.me")) return "Facebook";
    if (refUrl.hostname.includes("whatsapp.com") || refUrl.hostname.includes("wa.me")) return "WhatsApp";
    if (refUrl.hostname.includes("youtube.com")) return "YouTube";
    return `Referral (${refUrl.hostname})`;
  } catch {
    return "Direct";
  }
}

/**
 * Non-blocking event logging into Firestore `analytics_events` collection with security & rate limiting.
 */
export async function recordEventToFirestore(eventName: string, details: Record<string, any> = {}) {
  if (typeof window === "undefined") return;
  try {
    // Validate event name
    if (!ALLOWED_EVENT_NAMES.has(eventName)) return;

    // Client rate limiter
    if (isRateLimited()) return;

    // Avoid logging admin internal pageviews as public traffic
    if (window.location.pathname.startsWith("/admin") && eventName === "page_view") {
      return;
    }

    const cleanDetails = sanitizeDetails(details);

    const payload: Record<string, any> = {
      event_name: eventName,
      timestamp: new Date().toISOString(),
      path: window.location.pathname,
      session_id: getSessionId(),
      device_type: getDeviceType(),
      referrer: getTrafficSource(),
      user_id: auth.currentUser?.uid || null,
      ...cleanDetails,
    };

    addDoc(collection(db, "analytics_events"), payload).catch((err) => {
      if (isDebug()) console.warn("[AWH Analytics] Firestore event log note:", err);
    });
  } catch (e) {
    // Fail-safe
  }
}

// Debug mode detection
const isDebug = (): boolean => {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV) return true;
  try {
    return (
      window.location.search.includes("debug_tracking=true") ||
      localStorage.getItem("awh_debug_tracking") === "true"
    );
  } catch {
    return false;
  }
};

function logDebug(eventName: string, data?: any) {
  if (isDebug()) {
    console.log(
      `%c[AWH Analytics] %c${eventName}`,
      "color: #D4AF37; font-weight: bold; background: #090814; padding: 2px 6px; border-radius: 4px;",
      "color: #38bdf8; font-weight: bold;",
      data || ""
    );
  }
}

/**
 * Initialize Google tag and Meta Pixel once site-wide.
 * Safely loads configured IDs from environment or dynamic admin config.
 */
let markReady: () => void = () => {};
/** Resolves once the GA4 / Ads / Meta tags have been set up (or setup was skipped or failed). */
export const analyticsReady = new Promise<void>((resolve) => {
  markReady = resolve;
});

export async function initAnalytics() {
  try {
    await initAnalyticsInner();
  } finally {
    markReady();
  }
}

async function initAnalyticsInner() {
  if (typeof window === "undefined") return;

  // Optionally fetch dynamic config if environment variables are not populated
  if (!GA_MEASUREMENT_ID || !META_PIXEL_ID || !GOOGLE_ADS_ID) {
    try {
      const res = await fetch("/api/tracking/config");
      if (res.ok) {
        const json = await res.json();
        if (json?.config) {
          (window as any).__AWH_TRACKING_CONFIG__ = json.config;
          if (!dynamicGaId && json.config.google_analytics_id) {
            dynamicGaId = json.config.google_analytics_id.trim();
          }
          if (!dynamicPixelId && json.config.meta_pixel_id) {
            dynamicPixelId = json.config.meta_pixel_id.trim();
          }
          if (!dynamicAdsId && json.config.google_ads_id) {
            dynamicAdsId = json.config.google_ads_id.trim();
          }
          if (!dynamicAdsLabel && json.config.google_ads_conversion_label) {
            dynamicAdsLabel = json.config.google_ads_conversion_label.trim();
          }
        }
      }
    } catch {
      // Non-blocking fetch failure
    }
  }

  const gaId = getActiveGaId();
  const pixelId = getActivePixelId();
  const adsId = getActiveAdsId();

  // Initialize GA4 if valid ID is present and not already initialized
  if (isValidGaId(gaId) && !(window as any).__AWH_GA_INITIALIZED__) {
    try {
      (window as any).__AWH_GA_INITIALIZED__ = true;
      window.dataLayer = window.dataLayer || [];
      window.gtag = function (...args: any[]) {
        window.dataLayer.push(args);
      };
      window.gtag("js", new Date());
      window.gtag("config", gaId, {
        send_page_view: false, // Managed manually by client route tracker
        currency: "INR",
      });

      if (isValidAdsId(adsId)) {
        window.gtag("config", adsId);
      }

      // Inject gtag.js script if not already present
      const existingScript = document.querySelector(`script[src*="googletagmanager.com/gtag/js"]`);
      if (!existingScript) {
        const script = document.createElement("script");
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
        document.head.appendChild(script);
      }
      logDebug("GA4 Initialized", { measurementId: gaId });
    } catch (err) {
      console.warn("[AWH Analytics] GA4 init note:", err);
    }
  }

  // Initialize Meta Pixel if valid ID is present and not already initialized
  if (isValidPixelId(pixelId) && !(window as any).__AWH_PIXEL_INITIALIZED__) {
    try {
      (window as any).__AWH_PIXEL_INITIALIZED__ = true;
      if (!window.fbq) {
        const fbq: any = function (...args: any[]) {
          if (fbq.callMethod) {
            fbq.callMethod(...args);
          } else {
            fbq.queue.push(args);
          }
        };
        if (!window._fbq) window._fbq = fbq;
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = "2.0";
        fbq.queue = [];
        window.fbq = fbq;

        const script = document.createElement("script");
        script.async = true;
        script.src = "https://connect.facebook.net/en_US/fbevents.js";
        document.head.appendChild(script);
      }

      window.fbq("init", pixelId);
      logDebug("Meta Pixel Initialized", { pixelId });
    } catch (err) {
      console.warn("[AWH Analytics] Meta Pixel init note:", err);
    }
  }
}

/**
 * Format catalog item for GA4 E-Commerce standard schema.
 */
function formatGaItem(item: AnalyticsItem, index = 0) {
  return {
    item_id: String(item.id),
    item_name: item.name,
    price: Number(item.price),
    quantity: item.quantity ? Math.max(1, Number(item.quantity)) : 1,
    item_category: item.category || "Astrology & Crystals",
    item_variant: item.variant || undefined,
    index,
  };
}

/**
 * Track client-side page navigation without duplicate triggers.
 * Skips private admin pages from public marketing logs.
 */
export function trackPageView(path: string, title?: string) {
  if (typeof window === "undefined") return;

  // Do not track internal admin dashboards as public marketing pageviews
  if (path.startsWith("/admin")) {
    logDebug("PageView Skipped (Private Admin Route)", { path });
    return;
  }

  const pageTitle = title || document.title || "Astro With Hrishi";
  const pageLocation = window.location.href;
  const activeGa = getActiveGaId();
  const activePixel = getActivePixelId();

  logDebug("page_view", { path, title: pageTitle });
  recordEventToFirestore("page_view", { path, title: pageTitle, location: pageLocation });

  if (window.gtag && isValidGaId(activeGa)) {
    window.gtag("event", "page_view", {
      page_title: pageTitle,
      page_location: pageLocation,
      page_path: path,
      send_to: activeGa,
    });
  }

  if (window.fbq && isValidPixelId(activePixel)) {
    window.fbq("track", "PageView");
  }
}

/**
 * Track product view (GA4 `view_item` & Meta `ViewContent`).
 */
export function trackViewItem(product: AnalyticsItem) {
  const price = Number(product.price);
  const items = [formatGaItem(product)];

  logDebug("view_item / ViewContent", { product });
  recordEventToFirestore("view_item", {
    product_id: String(product.id),
    product_name: product.name,
    price,
    category: product.category || "Astrology & Crystals",
    variant: product.variant || null,
  });

  if (window.gtag) {
    window.gtag("event", "view_item", {
      currency: "INR",
      value: price,
      items,
    });
  }

  if (window.fbq) {
    window.fbq("track", "ViewContent", {
      content_ids: [String(product.id)],
      content_name: product.name,
      content_type: "product",
      value: price,
      currency: "INR",
    });
  }
}

/**
 * Track product list view (GA4 `view_item_list`).
 */
export function trackViewItemList(items: AnalyticsItem[], listName = "Catalog") {
  if (!items.length) return;
  const gaItems = items.slice(0, 20).map((it, idx) => formatGaItem(it, idx));

  logDebug("view_item_list", { listName, count: items.length });
  recordEventToFirestore("view_item_list", {
    list_name: listName,
    count: items.length,
  });

  if (window.gtag) {
    window.gtag("event", "view_item_list", {
      item_list_name: listName,
      items: gaItems,
    });
  }
}

/**
 * Track on-site search (GA4 `search` & Meta `Search`).
 */
export function trackSearch(searchTerm: string) {
  const term = searchTerm.trim();
  if (!term) return;

  logDebug("search", { searchTerm: term });
  recordEventToFirestore("search", { search_term: term });

  if (window.gtag) {
    window.gtag("event", "search", {
      search_term: term,
    });
  }

  if (window.fbq) {
    window.fbq("track", "Search", {
      search_string: term,
    });
  }
}

/**
 * Track adding item to cart (GA4 `add_to_cart` & Meta `AddToCart`).
 */
export function trackAddToCart(item: AnalyticsItem, quantity = 1) {
  const price = Number(item.price);
  const qty = Math.max(1, quantity);
  const totalValue = price * qty;
  const items = [formatGaItem({ ...item, quantity: qty })];

  logDebug("add_to_cart / AddToCart", { item, quantity: qty, totalValue });
  recordEventToFirestore("add_to_cart", {
    product_id: String(item.id),
    product_name: item.name,
    price,
    quantity: qty,
    total_amount: totalValue,
    category: item.category || "Astrology & Crystals",
    variant: item.variant || null,
  });

  if (window.gtag) {
    window.gtag("event", "add_to_cart", {
      currency: "INR",
      value: totalValue,
      items,
    });
  }

  if (window.fbq) {
    window.fbq("track", "AddToCart", {
      content_ids: [String(item.id)],
      content_name: item.name,
      content_type: "product",
      value: totalValue,
      currency: "INR",
      quantity: qty,
    });
  }
}

/**
 * Track removing item from cart (GA4 `remove_from_cart`).
 */
export function trackRemoveFromCart(item: AnalyticsItem, quantity = 1) {
  const price = Number(item.price);
  const qty = Math.max(1, quantity);
  const totalValue = price * qty;
  const items = [formatGaItem({ ...item, quantity: qty })];

  logDebug("remove_from_cart", { item, quantity: qty });
  recordEventToFirestore("remove_from_cart", {
    product_id: String(item.id),
    product_name: item.name,
    price,
    quantity: qty,
  });

  if (window.gtag) {
    window.gtag("event", "remove_from_cart", {
      currency: "INR",
      value: totalValue,
      items,
    });
  }
}

/**
 * Track cart view (GA4 `view_cart`).
 */
export function trackViewCart(items: AnalyticsItem[], totalValue: number) {
  const gaItems = items.map((it, idx) => formatGaItem(it, idx));

  logDebug("view_cart", { count: items.length, totalValue });
  recordEventToFirestore("view_cart", {
    count: items.length,
    total: totalValue,
  });

  if (window.gtag) {
    window.gtag("event", "view_cart", {
      currency: "INR",
      value: totalValue,
      items: gaItems,
    });
  }
}

/**
 * Track checkout initiation (GA4 `begin_checkout` & Meta `InitiateCheckout`).
 */
let lastBeginCheckout = { key: "", at: 0 };

export function trackBeginCheckout(items: AnalyticsItem[], totalValue: number, coupon?: string) {
  // The cart button and the checkout page both report this; count one checkout, not two.
  const key = items.map((i) => `${i.id}x${i.quantity ?? 1}`).join(",");
  if (key === lastBeginCheckout.key && Date.now() - lastBeginCheckout.at < 60_000) return;
  lastBeginCheckout = { key, at: Date.now() };
  const gaItems = items.map((it, idx) => formatGaItem(it, idx));
  const contentIds = items.map((i) => String(i.id));

  logDebug("begin_checkout / InitiateCheckout", { count: items.length, totalValue });
  recordEventToFirestore("begin_checkout", {
    count: items.length,
    total: totalValue,
    coupon: coupon || null,
    items: items.map((i) => ({ id: String(i.id), name: i.name, price: Number(i.price), quantity: i.quantity || 1 })),
  });

  if (window.gtag) {
    window.gtag("event", "begin_checkout", {
      currency: "INR",
      value: totalValue,
      coupon: coupon || undefined,
      items: gaItems,
    });
  }

  if (window.fbq) {
    window.fbq("track", "InitiateCheckout", {
      content_ids: contentIds,
      content_type: "product",
      value: totalValue,
      currency: "INR",
      num_items: items.length,
    });
  }
}

/**
 * Track adding shipping info stage (GA4 `add_shipping_info`).
 */
export function trackAddShippingInfo(items: AnalyticsItem[], totalValue: number, shippingTier = "Standard Delivery") {
  const gaItems = items.map((it, idx) => formatGaItem(it, idx));

  logDebug("add_shipping_info", { totalValue, shippingTier });
  recordEventToFirestore("add_shipping_info", {
    count: items.length,
    total: totalValue,
    shipping_tier: shippingTier,
  });

  if (window.gtag) {
    window.gtag("event", "add_shipping_info", {
      currency: "INR",
      value: totalValue,
      shipping_tier: shippingTier,
      items: gaItems,
    });
  }
}

/**
 * Track submitting payment info stage (GA4 `add_payment_info` & Meta `AddPaymentInfo`).
 * Fired when customer reaches/submits the payment step, NOT merely on page load.
 */
export function trackAddPaymentInfo(items: AnalyticsItem[], totalValue: number, paymentType = "Razorpay") {
  const gaItems = items.map((it, idx) => formatGaItem(it, idx));

  logDebug("add_payment_info / AddPaymentInfo", { totalValue, paymentType });
  recordEventToFirestore("add_payment_info", {
    count: items.length,
    total: totalValue,
    payment_type: paymentType,
  });

  if (window.gtag) {
    window.gtag("event", "add_payment_info", {
      currency: "INR",
      value: totalValue,
      payment_type: paymentType,
      items: gaItems,
    });
  }

  if (window.fbq) {
    window.fbq("track", "AddPaymentInfo", {
      content_ids: items.map((i) => String(i.id)),
      content_type: "product",
      value: totalValue,
      currency: "INR",
    });
  }
}

/**
 * Check if an order has already been recorded in analytics to prevent duplicates.
 */
export function isPurchaseTracked(orderIdentifier: string): boolean {
  if (!orderIdentifier || typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(TRACKED_PURCHASES_KEY);
    if (!raw) return false;
    const tracked: string[] = JSON.parse(raw);
    return Array.isArray(tracked) && tracked.includes(orderIdentifier.trim());
  } catch {
    return false;
  }
}

/**
 * Mark an order as tracked in persistent storage.
 */
function markPurchaseTracked(orderIdentifier: string) {
  if (!orderIdentifier || typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(TRACKED_PURCHASES_KEY);
    const tracked: string[] = raw ? JSON.parse(raw) : [];
    if (!tracked.includes(orderIdentifier.trim())) {
      tracked.push(orderIdentifier.trim());
      // Keep up to 200 recent tracked order IDs
      if (tracked.length > 200) tracked.shift();
      localStorage.setItem(TRACKED_PURCHASES_KEY, JSON.stringify(tracked));
    }
  } catch (err) {
    console.warn("[AWH Analytics] Could not save tracked order state:", err);
  }
}

/**
 * PRODUCTION-GRADE IDEMPOTENT PURCHASE TRACKING
 * 
 * CRITICAL REQUIREMENTS:
 * 1. ONLY fires after backend confirms order is PAID.
 * 2. Never fires on button click or popup dismissal.
 * 3. Never double-fires on refresh, back navigation, or reopening confirmation screen.
 */
export function trackPurchase(payload: PurchaseEventPayload): boolean {
  const orderKey = (payload.orderNumber || payload.orderId || "").trim();
  if (!orderKey) {
    console.warn("[AWH Analytics] trackPurchase called without valid order identifier, skipping.");
    return false;
  }

  // Idempotency check: prevent duplicate purchase events
  if (isPurchaseTracked(orderKey)) {
    logDebug("Purchase Skipped (Already Tracked)", { orderKey });
    return false;
  }

  // Mark immediately as tracked (one purchase per order, even across refreshes)
  markPurchaseTracked(orderKey);

  const value = Number(payload.total) || 0;
  const currency = payload.currency || "INR";
  const gaItems = (payload.items || []).map((it, idx) => formatGaItem(it, idx));
  const contentIds = (payload.items || []).map((i) => String(i.id));

  logDebug("🔥 PURCHASE EVENT FIRED (VERIFIED BACKEND STATE) 🔥", {
    transaction_id: orderKey,
    value,
    currency,
    itemsCount: gaItems.length,
  });

  // Record into Firestore
  recordEventToFirestore("purchase", {
    order_id: payload.orderId,
    order_number: payload.orderNumber || payload.orderId,
    amount: value,
    total: value,
    items_count: payload.items?.length || 0,
    items: (payload.items || []).map((i) => ({
      id: String(i.id),
      name: i.name,
      price: Number(i.price),
      quantity: i.quantity || 1,
    })),
    coupon: payload.coupon || null,
    status: "paid",
  });

  const sendToTags = () => {
  // 1. Google Analytics 4 purchase event
  if (window.gtag) {
    window.gtag("event", "purchase", {
      transaction_id: orderKey,
      value,
      currency,
      tax: payload.tax || 0,
      shipping: payload.shipping || 0,
      coupon: payload.coupon || undefined,
      items: gaItems,
    });

    // 2. Google Ads Conversion if configured
    const activeAds = getActiveAdsId();
    const activeLabel = getActiveAdsLabel();
    if (isValidAdsId(activeAds)) {
      const sendTo = activeLabel ? `${activeAds}/${activeLabel}` : activeAds;
      window.gtag("event", "conversion", {
        send_to: sendTo,
        value,
        currency,
        transaction_id: orderKey,
      });
      logDebug("Google Ads Conversion Fired", { send_to: sendTo, value, orderKey });
    }
  }

  // 3. Meta Pixel Purchase event with eventID deduplication
  const pixelValue = Number(payload.total);
  if (window.fbq && Number.isFinite(pixelValue) && pixelValue > 0) {
    window.fbq(
      "track",
      "Purchase",
      {
        content_ids: contentIds,
        content_type: "product",
        value: pixelValue,
        currency: "INR",
        num_items: (payload.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0),
      },
      { eventID: `order_${orderKey}` }
    );
  }
  };

  // Wait for the tags to exist (a page opened straight from a payment app may still be loading them).
  Promise.race([analyticsReady, new Promise<void>((r) => setTimeout(r, 10_000))]).then(sendToTags);

  return true;
}

/**
 * Track user login (GA4 `login`).
 */
export function trackLogin(method = "password") {
  logDebug("login", { method });
  recordEventToFirestore("login", { method });
  if (window.gtag) {
    window.gtag("event", "login", {
      method,
    });
  }
}

/**
 * Track user registration (GA4 `sign_up`).
 */
export function trackSignUp(method = "password") {
  logDebug("sign_up", { method });
  recordEventToFirestore("sign_up", { method });
  if (window.gtag) {
    window.gtag("event", "sign_up", {
      method,
    });
  }
}
