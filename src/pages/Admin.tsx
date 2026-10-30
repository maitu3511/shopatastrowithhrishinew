import { useEffect, useState, useCallback } from "react";
import PageLayout from "@/components/PageLayout";
import SEO from "@/components/SEO";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Trash2, Download, Upload, Plus, X, Pencil, Truck, BarChart3, Lock, KeyRound, ShieldCheck, Eye, EyeOff, Video, Film, Clock, Play } from "lucide-react";
import ProductEditDialog from "@/components/admin/ProductEditDialog";
import HighlightsManager from "@/components/admin/HighlightsManager";
import ReviewsManager from "@/components/admin/ReviewsManager";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import PaymentSettingsTab from "@/components/admin/PaymentSettingsTab";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { fetchAdminStats, fetchAdminCollection, createAdminDoc, updateAdminDoc, deleteAdminDoc, uploadAdminMedia } from "@/lib/adminApi";
import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { db, auth } from "@/lib/firebase";

/* ─── shared helpers ─── */

const useList = (collectionName: string, orderField = "created_at") => {
  const [data, setData] = useState<any[]>([]);
  const load = useCallback(async () => {
    try {
      const rows = await fetchAdminCollection(collectionName);
      setData(rows);
    } catch (err) {
      console.warn(`Admin collection load note for ${collectionName}:`, err);
      setData([]);
    }
  }, [collectionName]);

  useEffect(() => {
    load();
  }, [load]);

  return [data, load] as const;
};

const Card = ({ children }: { children: React.ReactNode }) => <div className="glass-gold rounded-2xl p-5 mt-6">{children}</div>;

const inputCls = "bg-background/40 border-gold/20";

/* ─── image upload helper ─── */

const uploadImage = async (file: File, folder: string): Promise<string | null> => {
  try {
    return await uploadAdminMedia(file, folder);
  } catch (err: any) {
    console.error("Storage upload error:", err);
    toast.error("Upload failed: " + (err.message || "Unknown error"));
    return null;
  }
};

const ImageUpload = ({ bucket, onUploaded, label }: { bucket: string; onUploaded: (url: string) => void; label?: string }) => {
  const [uploading, setUploading] = useState(false);
  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast.error("Image must be under 4MB"); return; }
    setUploading(true);
    const url = await uploadImage(file, bucket);
    setUploading(false);
    if (url) { onUploaded(url); toast.success("Image uploaded"); }
  };
  return (
    <div>
      <label className="flex items-center gap-2 cursor-pointer text-sm text-cosmic-silver/80 hover:text-gold transition-colors">
        <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-background/40 border border-gold/20 border-dashed">
          <Upload className="h-4 w-4 text-gold" />
          {uploading ? "Uploading..." : label || "Upload Image"}
        </span>
        <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handle} className="hidden" disabled={uploading} />
      </label>
    </div>
  );
};

/* ─── main admin ─── */

const Admin = () => {
  const { signOut, firebaseUser } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  // Passwords are managed by Firebase: the admin gets a reset link by email.
  const handleSendResetLink = async () => {
    const email = firebaseUser?.email;
    if (!email) return toast.error("No admin email found. Please sign in again.");
    setPasswordBusy(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success("A password reset link has been sent to " + email);
      setShowPasswordModal(false);
    } catch (err: any) {
      toast.error(err?.message || "Could not send the reset link");
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <PageLayout title="Admin Dashboard">
      <SEO title="Admin Dashboard — Astro With Hrishi" description="Restricted administrative panel." path="/admin" noindex />
      <div className="container max-w-6xl">
        {/* Admin Quick Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 p-4 rounded-2xl glass-gold border border-gold/20 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gold/10 border border-gold/20 text-gold">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm text-foreground">Astro With Hrishi Control Panel</div>
              <div className="text-xs text-cosmic-silver/70">Signed-in admin account · Server-verified access</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPasswordModal(true)}
              className="h-9 text-xs border-gold/30 text-gold hover:bg-gold/10 flex items-center gap-1.5"
            >
              <KeyRound className="h-3.5 w-3.5" /> Change Password
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="h-9 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              Sign Out
            </Button>
          </div>
        </div>

        {/* Change Password Dialog */}
        <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
          <DialogContent className="glass-gold border border-gold/30 max-w-md notranslate" translate="no">
            <DialogHeader>
              <DialogTitle className="text-xl font-serif text-foreground flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-gold" /> Change Admin Password
              </DialogTitle>
              <DialogDescription className="text-xs text-cosmic-silver/80">
                We will email a secure password reset link to {firebaseUser?.email || "your admin email"}.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowPasswordModal(false)} className="text-xs text-cosmic-silver/70">
                Cancel
              </Button>
              <Button type="button" disabled={passwordBusy} size="sm" onClick={() => void handleSendResetLink()} className="bg-gradient-gold text-primary-foreground font-semibold px-4 rounded-xl">
                {passwordBusy ? "Sending..." : "Send reset link"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <StatsOverview />
        <Tabs defaultValue="analytics" className="w-full mt-6">
          <TabsList className="glass-gold flex-wrap h-auto justify-start">
            {["analytics", "appointments", "shop", "orders", "payments", "reviews", "highlights", "offers", "messages", "customers"].map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize data-[state=active]:bg-gradient-gold data-[state=active]:text-primary-foreground">
                {t === "analytics" ? "Analytics & Tracking" : t === "payments" ? "Payment Gateway" : t}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="analytics"><AnalyticsDashboard /></TabsContent>
          <TabsContent value="appointments"><AppointmentsTab /></TabsContent>
          <TabsContent value="shop"><ProductsTab /></TabsContent>
          <TabsContent value="orders"><OrdersTab /></TabsContent>
          <TabsContent value="payments"><PaymentSettingsTab /></TabsContent>
          <TabsContent value="reviews"><ReviewsManager /></TabsContent>
          <TabsContent value="highlights"><HighlightsManager /></TabsContent>
          <TabsContent value="offers"><OffersTab /></TabsContent>
          <TabsContent value="messages"><MessagesTab /></TabsContent>
          <TabsContent value="customers"><CustomersTab /></TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
};

/* ─── stats ─── */

const StatsOverview = () => {
  const [stats, setStats] = useState({ bookings: 0, todayBookings: 0, orders: 0, revenue: 0 });
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetchAdminStats();
        if (active && res) {
          setStats(res);
        }
      } catch (e) {
        console.warn("Failed to load admin stats:", e);
      }
    })();
    return () => { active = false; };
  }, []);
  const items = [
    { label: "WhatsApp Bookings", value: stats.bookings },
    { label: "Bookings Today", value: stats.todayBookings },
    { label: "Shop Orders", value: stats.orders },
    { label: "Shop Revenue", value: `₹${stats.revenue.toLocaleString("en-IN")}` },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((i) => (
        <div key={i.label} className="glass-gold rounded-2xl p-4 text-center">
          <div className="text-2xl font-bold text-gold">{i.value}</div>
          <div className="text-xs text-cosmic-silver/70 mt-1">{i.label}</div>
        </div>
      ))}
    </div>
  );
};

/* ─── appointments ─── */

const AppointmentsTab = () => {
  const [list, reload] = useList("appointments");
  return (
    <div className="space-y-3 mt-6">
      {list.length === 0 && <div className="text-center text-cosmic-silver/60 py-8">No appointments yet</div>}
      {list.map((a) => (
        <div key={a.id} className="glass-gold rounded-2xl p-4">
          <div className="flex justify-between">
            <div><div className="font-display text-gold">{a.name}</div><div className="text-xs text-cosmic-silver/70">{a.phone} • {a.service}</div></div>
            <div className="text-xs text-cosmic-silver/70">{a.appointment_date} {a.appointment_time}</div>
          </div>
          {a.message && <p className="text-xs text-cosmic-silver/60 mt-2">{a.message}</p>}
          <select
            value={a.status || "pending"}
            onChange={async (e) => {
              try {
                await updateAdminDoc("appointments", a.id, { status: e.target.value });
                toast.success("Appointment status updated");
                reload();
              } catch (err: any) {
                toast.error("Failed to update status");
              }
            }}
            className="bg-background/60 border border-gold/30 rounded px-2 text-xs mt-2"
          >
            {["pending", "confirmed", "completed", "cancelled"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
};

/* ─── orders ─── */

const OrdersTab = () => (
  <Card>
    <h3 className="font-display text-gold mb-2 flex items-center gap-2"><Truck className="h-4 w-4" /> Orders & Order Tracking</h3>
    <p className="text-sm text-cosmic-silver/70">
      Order tracking is managed on its own dedicated admin page — update status, courier, tracking number and
      delivery notes there, and customers see it live on their tracking page.
    </p>
    <Button asChild className="mt-4 bg-gradient-gold text-primary-foreground">
      <Link to="/admin/orders">Open Order Tracking</Link>
    </Button>
  </Card>
);

/* ─── products (with image upload) ─── */

const ProductsTab = () => {
  const [list, reload] = useList("products");
  const [f, setF] = useState({ name: "", description: "", price: "", image_url: "", category: "", stock: "100", discount_percent: "0", rating: "4.7" });
  const [imagePreview, setImagePreview] = useState("");
  const [gallery, setGallery] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoType, setVideoType] = useState<"review" | "product">("review");
  const [videoDuration, setVideoDuration] = useState<number>(30);
  const [videoClientName, setVideoClientName] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [videoUploading, setVideoUploading] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const handleVideoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    toast.error("Video upload is not available (images only). Please paste a video link instead, for example a YouTube or hosted .mp4 URL.");
    return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error("Video file size must be under 50MB");
      return;
    }

    try {
      setVideoUploading(true);
      const duration = await new Promise<number>((resolve, reject) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => {
          window.URL.revokeObjectURL(v.src);
          const dur = Math.round(v.duration);
          if (dur > 61) {
            reject(new Error(`Video duration is ${dur}s. Allowed duration is max 1 minute (15s, 30s, 45s, 60s).`));
          } else {
            resolve(dur);
          }
        };
        v.onerror = () => reject(new Error("Unable to read video file metadata. Please select a valid video."));
        v.src = URL.createObjectURL(file);
      });

      let selectedDur = 30;
      if (duration <= 20) selectedDur = 15;
      else if (duration <= 37) selectedDur = 30;
      else if (duration <= 52) selectedDur = 45;
      else selectedDur = 60;

      setVideoDuration(selectedDur);
      toast.info(`Video validated (${duration}s duration). Uploading from gallery...`);
      const url = await uploadAdminMedia(file, "product-videos");
      if (url) {
        setVideoUrl(url);
        toast.success(`Video uploaded successfully (${selectedDur}s duration)!`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to process gallery video");
    } finally {
      setVideoUploading(false);
    }
  };

  const create = async () => {
    if (!f.name || !f.price) return toast.error("Name and price required");
    const images = [f.image_url, ...gallery].filter(Boolean);
    try {
      await createAdminDoc("products", {
        name: f.name,
        description: f.description,
        category: f.category,
        image_url: f.image_url || images[0] || null,
        images: images.length ? images : null,
        price: parseFloat(f.price),
        stock: parseInt(f.stock),
        discount_percent: Number(f.discount_percent) || 0,
        rating: Math.min(4.8, Number(f.rating) || 4.7),
        active: true,
        video_url: videoUrl.trim() || null,
        video_type: videoUrl.trim() ? videoType : null,
        video_duration: videoUrl.trim() ? videoDuration : null,
        video_client_name: videoUrl.trim() && videoType === "review" ? (videoClientName.trim() || null) : null,
        video_title: videoUrl.trim() ? (videoTitle.trim() || null) : null,
        created_at: new Date().toISOString(),
      });
      toast.success("Product added successfully");
      setF({ name: "", description: "", price: "", image_url: "", category: "", stock: "100", discount_percent: "0", rating: "4.7" });
      setImagePreview("");
      setGallery([]);
      setVideoUrl("");
      setVideoClientName("");
      setVideoTitle("");
      reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to add product");
    }
  };
  const del = async (id: string) => {
    try {
      await deleteAdminDoc("products", id);
      toast.success("Product deleted");
      reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete product");
    }
  };

  /** Inline edit of the fields the shop renders. */
  const patch = async (
    id: string,
    values: { price?: number; discount_percent?: number; category?: string; rating?: number }
  ) => {
    try {
      await updateAdminDoc("products", id, {
        ...values,
        updated_at: new Date().toISOString(),
      });
      toast.success("Product updated"); reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to update product");
    }
  };

  return (
    <>
      <Card>
        <h3 className="font-display text-gold mb-3 flex items-center justify-between">
          <span>Add Product</span>
          <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-gold" /> Videos: 15s · 30s · 45s · 60s max
          </span>
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input placeholder="Product Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />
          <Input placeholder="Category (e.g. Bracelet, Mala)" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={inputCls} />
          <Input placeholder="Price (₹)" type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className={inputCls} />
          <Input placeholder="Stock" type="number" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} className={inputCls} />
          <Input placeholder="Discount %" type="number" value={f.discount_percent} onChange={(e) => setF({ ...f, discount_percent: e.target.value })} className={inputCls} />
          <Input placeholder="Rating (max 4.8)" type="number" step="0.1" value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })} className={inputCls} />
        </div>
        <div className="mt-3">
          <label className="text-xs uppercase tracking-widest text-gold/70 mb-2 block">Product Image</label>
          <div className="flex items-center gap-4">
            <ImageUpload bucket="shop-images" label="Upload Product Photo" onUploaded={(url) => { setF({ ...f, image_url: url }); setImagePreview(url); }} />
            {imagePreview && <img src={imagePreview} alt="preview" className="h-16 w-16 rounded-lg object-cover border border-gold/20" />}
          </div>
          {f.image_url && <Input value={f.image_url} readOnly className={`mt-2 text-xs ${inputCls}`} placeholder="Image URL (auto-filled after upload)" />}
        </div>
        <div className="mt-3">
          <label className="text-xs uppercase tracking-widest text-gold/70 mb-2 block">Gallery Images (add 3–4 more)</label>
          <div className="flex flex-wrap items-center gap-3">
            <ImageUpload bucket="shop-images" label="Add Gallery Photo" onUploaded={(url) => setGallery((g) => [...g, url])} />
            {gallery.map((url) => (
              <div key={url} className="relative">
                <img src={url} alt="gallery" className="h-16 w-16 rounded-lg object-cover border border-gold/20" />
                <button type="button" onClick={() => setGallery((g) => g.filter((u) => u !== url))} className="absolute -top-2 -right-2 bg-background rounded-full text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Video Attachment Section with Gallery Support */}
        <div className="mt-4 p-4 rounded-2xl border border-gold/30 bg-gold/5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gold uppercase tracking-wider flex items-center gap-1.5">
              <Film className="h-4 w-4" /> Video Option (Max 1 min: 15s · 30s · 45s · 60s)
            </label>
            <div className="flex items-center gap-1">
              {[15, 30, 45, 60].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setVideoDuration(sec)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    videoDuration === sec
                      ? "bg-gold text-primary-foreground border-gold font-bold"
                      : "bg-background/40 border-gold/20 text-cosmic-silver"
                  }`}
                >
                  {sec === 60 ? "60s (1 min)" : `${sec}s`}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-cosmic-silver/80 block">Video Type:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVideoType("review")}
                className={`py-1.5 px-3 text-xs rounded-xl font-medium border flex items-center justify-center gap-1.5 transition-all ${
                  videoType === "review" ? "bg-gradient-gold text-primary-foreground border-gold shadow font-semibold" : "bg-background/40 border-gold/20 text-cosmic-silver hover:border-gold/40"
                }`}
              >
                Client Review Video
              </button>
              <button
                type="button"
                onClick={() => setVideoType("product")}
                className={`py-1.5 px-3 text-xs rounded-xl font-medium border flex items-center justify-center gap-1.5 transition-all ${
                  videoType === "product" ? "bg-gradient-gold text-primary-foreground border-gold shadow font-semibold" : "bg-background/40 border-gold/20 text-cosmic-silver hover:border-gold/40"
                }`}
              >
                Product Demo Video
              </button>
            </div>
          </div>

          {videoType === "review" && (
            <div className="grid sm:grid-cols-2 gap-2">
              <Input
                placeholder="Client Name (e.g. Priya Shah)"
                value={videoClientName}
                onChange={(e) => setVideoClientName(e.target.value)}
                className={`h-9 text-xs ${inputCls}`}
              />
              <Input
                placeholder="Review Title (e.g. 15s Unboxing Review)"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                className={`h-9 text-xs ${inputCls}`}
              />
            </div>
          )}

          {videoType === "product" && (
            <Input
              placeholder="Video Title (e.g. Sacred Energisation Clip)"
              value={videoTitle}
              onChange={(e) => setVideoTitle(e.target.value)}
              className={`h-9 text-xs ${inputCls}`}
            />
          )}

          {/* Video from Gallery or Direct URL */}
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-gold text-primary-foreground font-semibold cursor-pointer text-xs shadow-md hover:opacity-95 transition-all">
                <Video className="h-4 w-4" />
                {videoUploading ? "Validating & Uploading..." : "Choose Video from Gallery / Device"}
                <input
                  type="file"
                  accept="video/*,video/mp4,video/webm,video/quicktime,video/m4v,video/3gp,video/mkv"
                  className="hidden"
                  disabled={videoUploading}
                  onChange={handleVideoFile}
                />
              </label>
              {videoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setVideoUrl("");
                    setVideoClientName("");
                    setVideoTitle("");
                  }}
                  className="text-xs text-destructive hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <X className="h-3 w-3" /> Remove Video
                </button>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-cosmic-silver/70">Or Enter Direct Video URL (MP4 / WebM / Cloud link):</label>
              <Input
                placeholder="https://example.com/video.mp4"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className={`text-xs ${inputCls}`}
              />
            </div>

            {/* Video Preview */}
            {videoUrl && (
              <div className="mt-2 rounded-xl overflow-hidden border border-gold/30 bg-background/80 p-2.5 space-y-2">
                <div className="flex items-center justify-between text-xs text-gold">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Play className="h-3 w-3" />
                    Video Preview ({videoType === "review" ? "Client Review" : "Product Demo"})
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-gold/15 text-[10px] font-bold border border-gold/30">
                    {videoDuration}s Max
                  </span>
                </div>
                <div className="aspect-video max-h-48 rounded-lg overflow-hidden bg-black/70 flex items-center justify-center">
                  <video src={videoUrl} controls playsInline className="w-full h-full object-contain" />
                </div>
              </div>
            )}
          </div>
        </div>

        <Textarea placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={`mt-3 ${inputCls}`} />
        <Button onClick={create} className="mt-3 bg-gradient-gold text-primary-foreground">Add Product</Button>
      </Card>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
        {list.map((p) => (
          <div key={p.id} className="glass-gold rounded-2xl p-4 flex gap-3">
            <div className="relative shrink-0">
              {p.image_url && <img src={p.image_url} className="h-16 w-16 rounded object-cover" />}
              {p.video_url && (
                <span className="absolute -bottom-1 -right-1 bg-gold text-primary-foreground text-[9px] font-bold px-1 rounded flex items-center gap-0.5 shadow">
                  <Play className="h-2 w-2 fill-current" /> {p.video_duration || 30}s
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{p.name}</div>
              <div className="text-xs text-gold">₹{Number(p.price).toLocaleString("en-IN")}</div>
              <div className="text-xs text-cosmic-silver/60">Stock: {p.stock}</div>
              {p.video_url && (
                <div className="text-[10px] text-gold/90 font-medium flex items-center gap-1 mt-0.5 truncate">
                  <Video className="h-2.5 w-2.5 shrink-0" />
                  {p.video_type === "review" ? `Review Video (${p.video_client_name || "Client"})` : "Product Video"}
                </div>
              )}
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                <Input defaultValue={p.price} type="number" onBlur={(e) => Number(e.target.value) !== Number(p.price) && patch(p.id, { price: Number(e.target.value) })} className={`h-8 text-xs ${inputCls}`} aria-label="Price" />
                <Input defaultValue={p.discount_percent ?? 0} type="number" onBlur={(e) => Number(e.target.value) !== Number(p.discount_percent) && patch(p.id, { discount_percent: Number(e.target.value) })} className={`h-8 text-xs ${inputCls}`} aria-label="Discount %" />
                <Input defaultValue={p.category ?? ""} onBlur={(e) => e.target.value !== (p.category ?? "") && patch(p.id, { category: e.target.value })} className={`h-8 text-xs ${inputCls}`} aria-label="Category" />
                <Input defaultValue={p.rating ?? 4.7} type="number" step="0.1" onBlur={(e) => Number(e.target.value) !== Number(p.rating) && patch(p.id, { rating: Math.min(4.8, Number(e.target.value)) })} className={`h-8 text-xs ${inputCls}`} aria-label="Rating" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => setEditing(p)} aria-label="Edit product" className="text-gold hover:scale-110 transition-transform"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => del(p.id)} aria-label="Delete product" className="text-destructive hover:scale-110 transition-transform"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <ProductEditDialog product={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </>
  );
};

/* ─── offers (coupons) ─── */

const OffersTab = () => {
  const [list, reload] = useList("coupons");
  const [f, setF] = useState({ code: "", description: "", discount_type: "percent", discount_value: "", min_order: "0", max_discount: "", usage_limit: "", expires_at: "" });
  const [editing, setEditing] = useState<any | null>(null);
  const [edit, setEdit] = useState({ code: "", discount_type: "percent", discount_value: "", min_order: "0", active: true });

  const validateOffer = (code: string, discountType: string, discountValue: string, minOrder: string, excludeId?: string) => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return "Coupon code required";
    if (list.some((item: any) => item.id !== excludeId && String(item.code ?? "").trim().toUpperCase() === normalizedCode)) return "Coupon code already exists";

    const discount = Number(discountValue);
    if (!discountValue || !Number.isFinite(discount)) return "Discount value required";
    if (discount < 0) return "Discount value cannot be negative";
    if (discountType === "percent" && (discount < 1 || discount > 100)) return "Percentage discount must be between 1 and 100";

    const minimum = Number(minOrder || 0);
    if (!Number.isFinite(minimum) || minimum < 0) return "Minimum order cannot be negative";
    return null;
  };

  const create = async () => {
    const validationError = validateOffer(f.code, f.discount_type, f.discount_value, f.min_order);
    if (validationError) return toast.error(validationError);

    const discountValue = parseFloat(f.discount_value);
    const minOrder = parseFloat(f.min_order) || 0;
    const maxDiscount = f.max_discount ? parseFloat(f.max_discount) : null;
    const usageLimit = f.usage_limit ? parseInt(f.usage_limit) : null;
    if ((maxDiscount !== null && maxDiscount < 0) || (usageLimit !== null && usageLimit < 0)) return toast.error("Maximum discount and usage limit cannot be negative");

    const payload: any = {
      code: f.code.trim().toUpperCase(),
      description: f.description.trim() || null,
      discount_type: f.discount_type,
      discount_value: discountValue,
      min_order: minOrder,
      max_discount: maxDiscount,
      usage_limit: usageLimit,
      expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null,
      active: true,
      used_count: 0,
      created_at: new Date().toISOString(),
    };
    try {
      await createAdminDoc("coupons", payload);
      toast.success("Offer created"); setF({ code: "", description: "", discount_type: "percent", discount_value: "", min_order: "0", max_discount: "", usage_limit: "", expires_at: "" }); reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to create offer");
    }
  };
  const toggle = async (id: string, active: boolean) => {
    try {
      await updateAdminDoc("coupons", id, { active: !active, updated_at: new Date().toISOString() });
      reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle offer");
    }
  };
  const startEdit = (offer: any) => {
    setEditing(offer);
    setEdit({
      code: String(offer.code ?? ""),
      discount_type: offer.discount_type === "flat" ? "flat" : "percent",
      discount_value: String(offer.discount_value ?? ""),
      min_order: String(offer.min_order ?? 0),
      active: offer.active !== false,
    });
  };
  const saveEdit = async () => {
    if (!editing) return;
    const validationError = validateOffer(edit.code, edit.discount_type, edit.discount_value, edit.min_order, editing.id);
    if (validationError) return toast.error(validationError);
    try {
      await updateAdminDoc("coupons", editing.id, {
        code: edit.code.trim().toUpperCase(),
        discount_type: edit.discount_type,
        discount_value: parseFloat(edit.discount_value),
        min_order: parseFloat(edit.min_order) || 0,
        active: edit.active,
        updated_at: new Date().toISOString(),
      });
      toast.success("Offer updated");
      setEditing(null);
      reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to update offer");
    }
  };
  const del = async (offer: any) => {
    if (!window.confirm(`Delete offer "${offer.code}"? This cannot be undone.`)) return;
    try {
      await deleteAdminDoc("coupons", offer.id);
      if (editing?.id === offer.id) setEditing(null);
      toast.success("Offer deleted");
      reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete offer");
    }
  };

  return (
    <>
      <Card>
        <h3 className="font-display text-gold mb-3">Add Offer / Coupon</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input placeholder="Coupon Code (e.g. DIWALI20)" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} className={inputCls} />
          <select value={f.discount_type} onChange={(e) => setF({ ...f, discount_type: e.target.value })} className={`h-10 rounded-md ${inputCls} px-3`}>
            <option value="percent">Percentage (%)</option>
            <option value="flat">Flat Amount (₹)</option>
          </select>
          <Input placeholder={f.discount_type === "percent" ? "Discount % (e.g. 20)" : "Discount ₹ (e.g. 100)"} type="number" value={f.discount_value} onChange={(e) => setF({ ...f, discount_value: e.target.value })} className={inputCls} />
          <Input placeholder="Min Order ₹ (default 0)" type="number" value={f.min_order} onChange={(e) => setF({ ...f, min_order: e.target.value })} className={inputCls} />
          <Input placeholder="Max Discount ₹ (optional)" type="number" value={f.max_discount} onChange={(e) => setF({ ...f, max_discount: e.target.value })} className={inputCls} />
          <Input placeholder="Usage Limit (optional)" type="number" value={f.usage_limit} onChange={(e) => setF({ ...f, usage_limit: e.target.value })} className={inputCls} />
          <Input placeholder="Expiry Date (optional)" type="date" value={f.expires_at} onChange={(e) => setF({ ...f, expires_at: e.target.value })} className={inputCls} />
          <Input placeholder="Description (optional)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={inputCls} />
        </div>
        <Button onClick={create} className="mt-3 bg-gradient-gold text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> Create Offer</Button>
      </Card>
      <div className="space-y-3 mt-6">
        {list.length === 0 && <div className="text-center text-cosmic-silver/60 py-8">No offers yet</div>}
        {list.map((c) => (
          <div key={c.id} className="glass-gold rounded-2xl p-4">
            {editing?.id === c.id ? (
              <div>
                <h4 className="font-display text-gold mb-3">Edit Offer</h4>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Input placeholder="Coupon Code" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} className={inputCls} />
                  <select value={edit.discount_type} onChange={(e) => setEdit({ ...edit, discount_type: e.target.value })} className={`h-10 rounded-md ${inputCls} px-3`}>
                    <option value="percent">Percentage (%)</option>
                    <option value="flat">Flat Amount (₹)</option>
                  </select>
                  <Input placeholder={edit.discount_type === "percent" ? "Discount %" : "Discount ₹"} type="number" value={edit.discount_value} onChange={(e) => setEdit({ ...edit, discount_value: e.target.value })} className={inputCls} />
                  <Input placeholder="Min Order ₹" type="number" value={edit.min_order} onChange={(e) => setEdit({ ...edit, min_order: e.target.value })} className={inputCls} />
                  <label className="flex items-center gap-2 text-sm text-cosmic-silver">
                    <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active
                  </label>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button onClick={saveEdit} className="bg-gradient-gold text-primary-foreground">Save</Button>
                  <Button type="button" variant="outline" onClick={() => setEditing(null)} className="border-gold/30">Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-gold text-lg">{c.code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{c.active ? "Active" : "Inactive"}</span>
                  </div>
                  <div className="text-xs text-cosmic-silver/70 mt-1">
                    {c.discount_type === "percent" ? `${c.discount_value}% off` : `₹${c.discount_value} off`}
                    {c.min_order > 0 && ` • Min order ₹${c.min_order}`}
                    {c.max_discount && ` • Max ₹${c.max_discount}`}
                    {c.usage_limit && ` • ${c.used_count || 0}/${c.usage_limit} used`}
                    {c.expires_at && ` • Expires ${new Date(c.expires_at).toLocaleDateString()}`}
                  </div>
                  {c.description && <div className="text-xs text-cosmic-silver/60 mt-1">{c.description}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggle(c.id, c.active)} className="text-xs px-2 py-1 rounded border border-gold/30 hover:bg-gold/10">{c.active ? "Deactivate" : "Activate"}</button>
                  <button onClick={() => startEdit(c)} className="text-gold" aria-label={`Edit offer ${c.code}`}><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del(c)} className="text-destructive" aria-label={`Delete offer ${c.code}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
};

/* ─── messages ─── */

const MessagesTab = () => {
  const [list] = useList("contact_messages");
  return (
    <div className="space-y-3 mt-6">
      {list.length === 0 && <div className="text-center text-cosmic-silver/60 py-8">No messages yet</div>}
      {list.map((m) => (
        <div key={m.id} className="glass-gold rounded-2xl p-4">
          <div className="flex justify-between">
            <div className="font-display text-gold">{m.name}</div>
            <div className="text-xs text-cosmic-silver/60">{m.created_at ? new Date(m.created_at).toLocaleString() : ""}</div>
          </div>
          <div className="text-xs text-cosmic-silver/70">{m.email} • {m.phone}</div>
          {m.subject && <div className="text-sm text-foreground mt-1">{m.subject}</div>}
          <p className="text-sm text-cosmic-silver/85 mt-2">{m.message}</p>
        </div>
      ))}
    </div>
  );
};

/* ─── customers ─── */

const CustomersTab = () => {
  const [list] = useList("profiles");

  const exportCSV = () => {
    const headers = ["Name", "Email", "Phone", "Registered On"];
    const rows = list.map((p) => [p.full_name || "—", p.email || "—", p.phone || "—", p.created_at ? new Date(p.created_at).toLocaleString() : "—"]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `customers_${new Date().toISOString().split("T")[0]}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-6">
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-cosmic-silver/70">{list.length} registered customers</div>
        <Button onClick={exportCSV} className="bg-gradient-gold text-primary-foreground" disabled={list.length === 0}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
      </div>
      <div className="space-y-2">
        {list.map((p) => (
          <div key={p.id} className="glass-gold rounded-2xl p-3 flex justify-between">
            <div><div className="text-sm font-semibold">{p.full_name || "—"}</div><div className="text-xs text-cosmic-silver/60">{p.email}</div></div>
            <div className="text-xs text-cosmic-silver/60 text-right"><div>{p.phone || "—"}</div><div>{p.created_at ? new Date(p.created_at).toLocaleDateString() : ""}</div></div>
          </div>
        ))}
        {list.length === 0 && <div className="text-center text-cosmic-silver/60 py-8">No registered customers yet</div>}
      </div>
    </div>
  );
};

export default Admin;
