import { auth } from "@/lib/firebase";

/*
 * Admin API client. Every request carries the signed-in admin's Firebase ID token; the
 * server verifies it and checks admin rights. There are no direct-database fallbacks:
 * if the server refuses, the error is shown rather than bypassed.
 */

export interface AdminStats {
  bookings: number;
  todayBookings: number;
  orders: number;
  revenue: number;
}

export const getAdminHeaders = async (): Promise<HeadersInit> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const user = auth.currentUser;
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  } catch (e) {
    console.warn("Could not retrieve admin token:", e);
  }
  return headers;
};

const parse = async (res: Response) => {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

/** Calls the admin API and throws an Error carrying the server's message when it refuses. */
const request = async <T = any>(path: string, init: RequestInit = {}): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { ...(await getAdminHeaders()), ...(init.headers || {}) } });
  } catch {
    throw new Error("Could not reach the server. Please check your connection.");
  }
  const data = await parse(res);
  if (!res.ok) {
    if (res.status === 401) throw new Error("Your admin session has expired. Please sign in again.");
    if (res.status === 403) throw new Error("This account does not have admin access.");
    throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
  }
  return data as T;
};

export const fetchAdminStats = async (): Promise<AdminStats> => {
  try {
    const data = await request("/api/admin/stats");
    return {
      bookings: Number(data.bookings || 0),
      todayBookings: Number(data.todayBookings || 0),
      orders: Number(data.orders || 0),
      revenue: Number(data.revenue || 0),
    };
  } catch (err) {
    console.warn("Admin stats fetch note:", err);
    return { bookings: 0, todayBookings: 0, orders: 0, revenue: 0 };
  }
};

export const fetchAdminCollection = async (collectionName: string): Promise<any[]> => {
  try {
    const json = await request(`/api/admin/collection/${collectionName}`);
    return Array.isArray(json?.data) ? json.data : [];
  } catch (err) {
    console.warn(`Admin collection ${collectionName} fetch note:`, err);
    return [];
  }
};

export const createAdminDoc = async (collectionName: string, data: any): Promise<string> => {
  const json = await request(`/api/admin/collection/${collectionName}`, { method: "POST", body: JSON.stringify(data) });
  return json?.id;
};

export const updateAdminDoc = async (collectionName: string, id: string, data: any): Promise<void> => {
  await request(`/api/admin/collection/${collectionName}/${id}`, { method: "PUT", body: JSON.stringify(data) });
};

export const deleteAdminDoc = async (collectionName: string, id: string): Promise<void> => {
  await request(`/api/admin/collection/${collectionName}/${id}`, { method: "DELETE" });
};

/** Order fulfilment updates (status, courier, tracking, notes). Payment status can never be changed. */
export const updateAdminOrder = async (id: string, fields: Record<string, unknown>): Promise<void> => {
  await request(`/api/admin/collection/orders/${id}`, { method: "PUT", body: JSON.stringify(fields) });
};

export const softDeleteAdminOrder = async (id: string): Promise<void> => {
  await request(`/api/admin/orders/${id}/soft-delete`, { method: "POST" });
};

export interface PaymentGatewayAdminSettings {
  razorpay_enabled: boolean;
  razorpay_key_id: string;
  has_key_secret?: boolean;
  has_webhook_secret?: boolean;
  is_live?: boolean;
  is_test?: boolean;
}

export const fetchPaymentSettings = async (): Promise<PaymentGatewayAdminSettings | null> => {
  try {
    const data = await request("/api/admin/payment-settings");
    return data.settings || null;
  } catch (err) {
    console.warn("Error fetching payment settings:", err);
    return null;
  }
};

export const testRazorpayConnection = async (): Promise<{ valid: boolean; message?: string; error?: string; mode?: string }> => {
  try {
    const data = await request("/api/admin/test-razorpay", { method: "POST", body: "{}" });
    return { valid: Boolean(data.valid), message: data.message, mode: data.mode };
  } catch (err: any) {
    return { valid: false, error: err.message || "Verification failed" };
  }
};

export interface TrackingAdminSettings {
  google_analytics_id: string;
  meta_pixel_id: string;
  google_ads_id: string;
  google_ads_conversion_label: string;
  google_site_verification: string;
  gtm_id?: string;
  enabled: boolean;
}

export const fetchTrackingSettings = async (): Promise<TrackingAdminSettings | null> => {
  try {
    const data = await request("/api/admin/tracking-settings");
    return data.settings || null;
  } catch (err) {
    console.warn("Error fetching tracking settings:", err);
    return null;
  }
};

export const saveTrackingSettings = async (
  settings: Partial<TrackingAdminSettings>
): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const data = await request("/api/admin/tracking-settings", { method: "POST", body: JSON.stringify(settings) });
    return { success: Boolean(data.success), message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to save tracking settings" };
  }
};

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Uploads an image (JPG, PNG or WebP, up to 4 MB) and returns its public URL.
 * The server re-checks the type, so renaming another file to .jpg does not work.
 */
export const uploadAdminMedia = async (file: File, folder = "media"): Promise<string> => {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new Error("Only JPG, PNG or WebP images can be uploaded.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Image must be under 4 MB.");

  const data: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
  const json = await request("/api/admin/upload-media", {
    method: "POST",
    body: JSON.stringify({ data, filename: file.name, contentType: file.type, folder }),
  });
  if (!json?.url) throw new Error("Upload failed");
  return json.url;
};
