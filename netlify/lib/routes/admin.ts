import { FieldValue } from "firebase-admin/firestore";
import { CATALOG } from "../../../src/lib/catalog";
import { ADMIN_STATUS_OPTIONS, canTransition, normalizeStatus } from "../../../src/lib/orderStatus";
import { requireAdmin } from "../auth";
import { getDb } from "../firebaseAdmin";
import { HttpError, json, readJson } from "../http";
import { gateway, getRazorpay, publicKeyId } from "../razorpay";
import type { OrderDoc } from "../orders";

/*
 * Admin API. Every handler calls requireAdmin (verified Firebase ID token +
 * admin custom claim or ADMIN_UIDS). Collections are allowlisted.
 */

const READABLE = new Set([
  "orders", "products", "coupons", "testimonials", "highlights", "offers", "product_reviews",
  "appointments", "contact_messages", "profiles", "analytics_events", "visitor_leads",
]);
const WRITABLE = new Set([
  "products", "coupons", "testimonials", "highlights", "offers", "product_reviews",
  "appointments", "contact_messages",
]);
// Fields that must never leave the server (left over from the old password store).
const PRIVATE_FIELDS = ["password_hash", "salt"];
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

const assertCollection = (name: string, set: Set<string>) => {
  if (!set.has(name)) throw new HttpError(404, "Unknown collection");
};
const assertDocId = (id: string) => {
  if (!DOC_ID_RE.test(id)) throw new HttpError(400, "Invalid document id");
};

const stripPrivate = (doc: Record<string, unknown>) => {
  const copy = { ...doc };
  for (const f of PRIVATE_FIELDS) delete copy[f];
  return copy;
};

/** Cleans an admin-supplied document body. */
const cleanBody = (collection: string, body: Record<string, any>) => {
  const data = { ...body };
  delete data.id;
  for (const f of PRIVATE_FIELDS) delete data[f];
  if (collection === "products" && "price" in data) {
    const price = Number(data.price);
    if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, "Price must be a positive number");
    data.price = Math.round(price);
  }
  if (collection === "coupons" && "code" in data) data.code = String(data.code).trim().toUpperCase();
  return data;
};

const sortNewestFirst = (rows: Record<string, any>[]) =>
  rows.sort((a, b) => {
    const ta = String(a.created_at || a.timestamp || a.appointment_date || "");
    const tb = String(b.created_at || b.timestamp || b.appointment_date || "");
    return tb.localeCompare(ta);
  });

/* ─── POST /api/admin/verify-admin, /api/admin/verify-token ─── */
export const verifyAdmin = async (req: Request) => {
  try {
    const user = await requireAdmin(req);
    return json(200, {
      authorized: true,
      user: { uid: user.uid, email: user.email ?? null, displayName: user.name ?? user.email ?? "Admin", role: "admin", isAdmin: true },
    });
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { authorized: false, error: err.message });
    throw err;
  }
};

/* ─── GET /api/admin/stats ─── */
export const adminStats = async (req: Request) => {
  await requireAdmin(req);
  const db = getDb();
  const [appts, orders] = await Promise.all([db.collection("appointments").get(), db.collection("orders").get()]);
  const today = new Date().toDateString();
  let revenue = 0;
  orders.forEach((d) => {
    const o = d.data();
    if (o.payment_status === "paid") revenue += Number(o.total) || 0;
  });
  return json(200, {
    bookings: appts.size,
    todayBookings: appts.docs.filter((d) => {
      const at = d.data().created_at || d.data().appointment_date;
      return at && new Date(at).toDateString() === today;
    }).length,
    orders: orders.size,
    revenue,
  });
};

/* ─── GET /api/admin/collection/:name ─── */
export const listCollection = async (req: Request, name: string) => {
  await requireAdmin(req);
  assertCollection(name, READABLE);
  const snap = await getDb().collection(name).get();
  let rows: Record<string, any>[] = snap.docs.map((d) => stripPrivate({ ...d.data(), id: d.id }));
  if (name === "products") {
    // Same merge as the shop: built-in catalog overlaid with admin edits.
    const merged = new Map<string, Record<string, any>>(CATALOG.map((p) => [p.id, { ...p }]));
    for (const r of rows) merged.set(r.id, { ...(merged.get(r.id) ?? {}), ...r });
    rows = Array.from(merged.values());
  }
  return json(200, { success: true, data: sortNewestFirst(rows) });
};

/* ─── POST /api/admin/collection/:name ─── */
export const createDocument = async (req: Request, name: string) => {
  await requireAdmin(req);
  assertCollection(name, WRITABLE);
  const data = cleanBody(name, await readJson(req));
  const ref = await getDb().collection(name).add({ ...data, created_at: data.created_at || new Date().toISOString() });
  return json(200, { success: true, id: ref.id, data: { id: ref.id, ...data } });
};

/* ─── PUT /api/admin/collection/:name/:id ─── */
export const updateDocument = async (req: Request, name: string, id: string) => {
  const admin = await requireAdmin(req);
  assertDocId(id);
  if (name === "orders") return updateOrder(req, id, admin.email ?? admin.uid);
  assertCollection(name, WRITABLE);
  const data = cleanBody(name, await readJson(req));
  await getDb().collection(name).doc(id).set({ ...data, updated_at: new Date().toISOString() }, { merge: true });
  return json(200, { success: true, id });
};

/* ─── POST /api/admin/orders/:id/soft-delete ─── */
export const softDeleteOrder = async (req: Request, id: string) => {
  const admin = await requireAdmin(req);
  assertDocId(id);

  const db = getDb();
  const ref = db.collection("orders").doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, "Order not found");
    if (snap.data()?.deleted_at) throw new HttpError(409, "Order is already deleted");

    tx.set(ref, {
      deleted_at: new Date().toISOString(),
      deleted_by: admin.email ?? admin.uid,
    }, { merge: true });
  });

  return json(200, { success: true, id });
};

/* ─── DELETE /api/admin/collection/:name/:id ─── */
export const deleteDocument = async (req: Request, name: string, id: string) => {
  await requireAdmin(req);
  assertDocId(id);
  // Orders are payment records and are never deleted through the API.
  assertCollection(name, WRITABLE);
  await getDb().collection(name).doc(id).delete();
  return json(200, { success: true, id });
};

/* ─── Orders: fulfilment fields only; payment_status is never writable here ─── */

const ORDER_EDITABLE = new Set([
  "status", "note", "cancellation_reason", "courier_name", "tracking_number", "tracking_url",
  "estimated_delivery_date", "shipping_note", "admin_notes",
]);
const NEEDS_PAYMENT = new Set(["payment_confirmed", "confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered", "refund_initiated", "refunded"]);

const optionalText = (raw: unknown, max: number) => {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (value.length > max) throw new HttpError(400, "Value too long");
  return value || null;
};

const updateOrder = async (req: Request, id: string, adminLabel: string) => {
  const body = await readJson(req);
  const unknown = Object.keys(body).filter((k) => !ORDER_EDITABLE.has(k) && k !== "updated_at" && k !== "history");
  if (unknown.length) throw new HttpError(400, `These fields cannot be changed: ${unknown.join(", ")}`);

  const db = getDb();
  const ref = db.collection("orders").doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, "Order not found");
    const order = snap.data() as OrderDoc;
    const ts = new Date().toISOString();
    const update: Record<string, unknown> = { updated_at: ts };

    for (const field of ["courier_name", "tracking_number", "shipping_note", "cancellation_reason"]) {
      if (field in body) update[field] = optionalText(body[field], 500);
    }
    if ("tracking_url" in body) {
      const url = optionalText(body.tracking_url, 500);
      if (url && !/^https?:\/\//i.test(url)) throw new HttpError(400, "Tracking URL must start with http:// or https://");
      update.tracking_url = url;
    }
    if ("estimated_delivery_date" in body) update.estimated_delivery_date = optionalText(body.estimated_delivery_date, 40);
    if ("admin_notes" in body) {
      if (!Array.isArray(body.admin_notes) || body.admin_notes.length > 200) throw new HttpError(400, "Invalid notes");
      update.admin_notes = body.admin_notes;
    }

    if ("status" in body) {
      const next = normalizeStatus(String(body.status));
      const current = normalizeStatus(order.status);
      if (!(ADMIN_STATUS_OPTIONS as readonly string[]).includes(next) || next === "payment_failed") {
        throw new HttpError(400, "Invalid status");
      }
      if (NEEDS_PAYMENT.has(next) && order.payment_status !== "paid" && order.payment_status !== "refunded") {
        throw new HttpError(409, "This order is not paid. Only cancelling is allowed.");
      }
      if (next !== current) {
        if (!canTransition(current, next)) throw new HttpError(409, "That status change is not allowed");
        update.status = next;
        update.history = FieldValue.arrayUnion({
          old_status: current,
          new_status: next,
          status: next,
          note: optionalText(body.note, 500),
          changed_by: `admin:${adminLabel}`,
          changed_at: ts,
        });
      }
    }
    tx.update(ref, update);
  });
  return json(200, { success: true, id });
};

/* ─── GET/POST /api/admin/payment-settings ─── */
export const getPaymentSettings = async (req: Request) => {
  await requireAdmin(req);
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() ?? "";
  return json(200, {
    success: true,
    settings: {
      razorpay_enabled: true,
      razorpay_key_id: keyId,
      has_key_secret: Boolean(process.env.RAZORPAY_KEY_SECRET),
      has_webhook_secret: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
      upi_enabled: false,
      upi_id: "",
      payee_name: "Astro with Hrishi",
      cod_enabled: false,
      test_mode: false,
      is_live: keyId.startsWith("rzp_live_"),
      is_test: keyId.startsWith("rzp_test_"),
      managed_by_env: true,
    },
  });
};

export const savePaymentSettings = async (req: Request) => {
  await requireAdmin(req);
  throw new HttpError(400, "Razorpay keys are managed in the Netlify environment variables, not in the admin panel.");
};

/* ─── POST /api/admin/test-razorpay ─── */
export const testRazorpay = async (req: Request) => {
  await requireAdmin(req);
  try {
    await gateway(getRazorpay().orders.all({ count: 1 }));
  } catch (err: any) {
    return json(400, { valid: false, error: err?.error?.description || "Razorpay rejected the configured keys" });
  }
  const live = publicKeyId().startsWith("rzp_live_");
  return json(200, { valid: true, is_live: live, mode: live ? "Production (Live)" : "Test Mode", message: "Razorpay keys are working." });
};

/* ─── GET/POST /api/admin/tracking-settings ─── */
const TRACKING_FIELDS = ["google_analytics_id", "meta_pixel_id", "google_ads_id", "google_ads_conversion_label", "google_site_verification", "gtm_id"];

export const getTrackingSettings = async (req: Request) => {
  await requireAdmin(req);
  const snap = await getDb().collection("settings").doc("tracking").get();
  const data = snap.data() ?? {};
  const settings: Record<string, unknown> = { enabled: data.enabled !== false };
  for (const f of TRACKING_FIELDS) settings[f] = typeof data[f] === "string" ? data[f] : "";
  return json(200, { success: true, settings });
};

export const saveTrackingSettings = async (req: Request) => {
  await requireAdmin(req);
  const body = await readJson(req);
  const settings: Record<string, unknown> = { enabled: Boolean(body.enabled), updated_at: new Date().toISOString() };
  for (const f of TRACKING_FIELDS) {
    const value = typeof body[f] === "string" ? body[f].trim() : "";
    if (value && !/^[A-Za-z0-9_\-]{1,100}$/.test(value)) throw new HttpError(400, `Invalid ${f}`);
    settings[f] = value;
  }
  await getDb().collection("settings").doc("tracking").set(settings, { merge: true });
  return json(200, { success: true, settings, message: "Tracking configuration updated successfully" });
};
