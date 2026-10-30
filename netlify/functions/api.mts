// Single entry point for every /api/* request (see the redirect in netlify.toml).
// Only the routes the site needs are ported from the old Express server; customer
// account endpoints (register/login/forgot/reset password) are intentionally absent.

import { errorResponse, json } from "../lib/http";
import * as payments from "../lib/routes/payments";
import * as tracking from "../lib/routes/tracking";
import * as admin from "../lib/routes/admin";
import * as media from "../lib/routes/media";

type Handler = (req: Request, params: string[]) => Promise<Response>;

const routes: { method: string; pattern: RegExp; handler: Handler }[] = [
  { method: "GET", pattern: /^health$/, handler: async () => json(200, { ok: true }) },

  { method: "GET", pattern: /^payments\/config$/, handler: () => payments.paymentConfig() },
  { method: "POST", pattern: /^payments\/create-order$/, handler: (req) => payments.createOrder(req) },
  { method: "POST", pattern: /^payments\/verify-payment$/, handler: (req) => payments.verifyPayment(req) },
  { method: "POST", pattern: /^payments\/check-attempt$/, handler: (req) => payments.checkAttempt(req) },
  { method: "GET", pattern: /^payments\/order-status$/, handler: (req) => payments.orderStatus(req) },
  { method: "POST", pattern: /^payments\/webhook$/, handler: (req) => payments.webhook(req) },
  { method: "GET", pattern: /^payments\/webhook$/, handler: async () => json(200, { status: "Webhook endpoint active. POST only." }) },

  { method: "GET", pattern: /^tracking\/lookup$/, handler: (req) => tracking.trackingLookup(req) },
  { method: "GET", pattern: /^tracking\/config$/, handler: () => tracking.trackingConfig() },

  { method: "POST", pattern: /^admin\/verify-(admin|token)$/, handler: (req) => admin.verifyAdmin(req) },
  { method: "GET", pattern: /^admin\/stats$/, handler: (req) => admin.adminStats(req) },
  { method: "GET", pattern: /^admin\/collection\/([a-z_]+)$/, handler: (req, [name]) => admin.listCollection(req, name) },
  { method: "POST", pattern: /^admin\/collection\/([a-z_]+)$/, handler: (req, [name]) => admin.createDocument(req, name) },
  { method: "PUT", pattern: /^admin\/collection\/([a-z_]+)\/([^/]+)$/, handler: (req, [name, id]) => admin.updateDocument(req, name, id) },
  { method: "DELETE", pattern: /^admin\/collection\/([a-z_]+)\/([^/]+)$/, handler: (req, [name, id]) => admin.deleteDocument(req, name, id) },
  { method: "POST", pattern: /^admin\/orders\/([^/]+)\/soft-delete$/, handler: (req, [id]) => admin.softDeleteOrder(req, id) },
  { method: "GET", pattern: /^admin\/payment-settings$/, handler: (req) => admin.getPaymentSettings(req) },
  { method: "POST", pattern: /^admin\/payment-settings$/, handler: (req) => admin.savePaymentSettings(req) },
  { method: "POST", pattern: /^admin\/test-razorpay$/, handler: (req) => admin.testRazorpay(req) },
  { method: "POST", pattern: /^admin\/upload-media$/, handler: (req) => media.uploadMedia(req) },
  { method: "GET", pattern: /^media\/([A-Za-z0-9._-]+)$/, handler: (req, [key]) => media.serveMedia(req, key) },
  { method: "GET", pattern: /^admin\/tracking-settings$/, handler: (req) => admin.getTrackingSettings(req) },
  { method: "POST", pattern: /^admin\/tracking-settings$/, handler: (req) => admin.saveTrackingSettings(req) },
];

// Requests can arrive as /api/<route> or /.netlify/functions/api/<route>; normalise to "<route>".
const routeOf = (url: string) =>
  decodeURIComponent(new URL(url).pathname)
    .replace(/^\/(\.netlify\/functions\/api|api)\/?/, "")
    .replace(/\/+$/, "");

export default async (req: Request) => {
  const path = routeOf(req.url);
  const matching = routes.filter((r) => r.pattern.test(path));
  if (matching.length === 0) return json(404, { error: "Not found" });

  const route = matching.find((r) => r.method === req.method);
  if (!route) return json(405, { error: "Method not allowed" });

  try {
    return await route.handler(req, path.match(route.pattern)!.slice(1));
  } catch (err) {
    return errorResponse(err);
  }
};
