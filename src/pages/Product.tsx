import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Check, MessageCircle, ShieldCheck, ShoppingBag, Star, Truck, Video, Play, Film } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import SEO, { SITE_URL } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { lineKey, useCart } from "@/lib/cart";
import { resolveImages, handleImageError } from "@/lib/productImages";
import { inr, mrpOf, deliveryEstimate, slugifyProductName, productRouteId, type DBProduct } from "@/lib/shop";
import { getYouTubeEmbedUrl } from "@/lib/video";
import { waLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { catalogById } from "@/lib/catalog";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { trackViewItem, trackAddToCart } from "@/lib/analytics";

const REVIEWS = [
  { name: "Priya Shah", city: "Surat", rating: 5, text: "Genuine product with premium packaging. Felt calmer within a few days of wearing it." },
  { name: "Mehul Patel", city: "Ahmedabad", rating: 5, text: "Hrishi ji guided me properly before buying. Delivery was quick and the quality is excellent." },
  { name: "Harsh Mehta", city: "Vadodara", rating: 4, text: "Beautiful finish and clearly energised. Highly recommended for anyone starting out." },
];

const Product = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const add = useCart((s) => s.add);
  const requireAuth = useRequireAuth();
  const [product, setProduct] = useState<DBProduct | null>(() => catalogById(id));
  const [loading, setLoading] = useState(() => !catalogById(id));
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const fallback = catalogById(id);
      if (!fallback) setLoading(true);
      if (!id) return;
      try {
        const docSnap = await getDoc(doc(db, "products", id));
        if (!alive) return;
        if (docSnap.exists()) {
          setProduct({ id: docSnap.id, ...docSnap.data() } as unknown as DBProduct);
        } else {
          const snap = await getDocs(collection(db, "products"));
          if (!alive) return;
          const bySlug = snap.docs
            .map((row) => ({ id: row.id, ...row.data() } as unknown as DBProduct))
            .find((row) => row.active !== false && (productRouteId(row) === id || slugifyProductName(row.name) === id));
          setProduct(bySlug ?? fallback ?? null);
        }
      } catch (err) {
        console.warn("Product fetch from Firestore warning, using catalog fallback:", err);
        if (alive) setProduct(fallback ?? null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (product) {
      trackViewItem({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        category: product.category,
      });
    }
  }, [product?.id]);

  const images = useMemo(() => (product ? resolveImages(product) : []), [product]);
  const youtubeEmbedUrl = product ? getYouTubeEmbedUrl(product.video_url) : null;

  if (loading) {
    return (
      <PageLayout>
        <div className="container grid lg:grid-cols-2 gap-10">
          <div className="aspect-square rounded-2xl bg-secondary animate-pulse" />
          <div className="space-y-4">
            <div className="h-8 w-2/3 bg-secondary animate-pulse rounded" />
            <div className="h-4 w-full bg-secondary animate-pulse rounded" />
            <div className="h-4 w-5/6 bg-secondary animate-pulse rounded" />
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!product) {
    return (
      <PageLayout title="Product not found">
        <div className="container text-center">
          <Button asChild className="rounded-full bg-gradient-gold text-primary-foreground">
            <Link to="/shop">Back to Shop</Link>
          </Button>
        </div>
      </PageLayout>
    );
  }

  const price = Number(product.price);
  const mrp = mrpOf(price, product.discount_percent);
  const out = (product.stock ?? 100) <= 0;

  const line = {
    id: lineKey(product.id),
    product_id: product.id,
    name: product.name,
    price,
    image_url: images[0],
    variant: null,
  };

  const addToCart = () => {
    if (!requireAuth()) return;
    add(line, qty);
    trackAddToCart(
      {
        id: product.id,
        name: product.name,
        price,
        category: product.category,
      },
      qty
    );
    toast.success(`${product.name} added to cart`);
  };

  const buyNow = () => {
    if (!requireAuth()) return;
    add(line, qty);
    trackAddToCart(
      {
        id: product.id,
        name: product.name,
        price,
        category: product.category,
      },
      qty
    );
    nav("/checkout");
  };

  return (
    <PageLayout>
      <SEO
        title={`${product.name} — Buy Energised ${product.category ?? "Astrology Product"} | Astro With Hrishi`}
        description={(product.description ?? `Buy the ${product.name}, energised and blessed by Astrologer Hrishi.`).slice(0, 155)}
        path={`/product/${product.id}`}
        type="product"
        image={images[0]}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: SITE_URL,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Shop",
                item: `${SITE_URL}/shop`,
              },
              {
                "@type": "ListItem",
                position: 3,
                name: product.name,
                item: `${SITE_URL}/product/${product.id}`,
              },
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            description: product.description ?? undefined,
            image: images.map((src) => (src.startsWith("http") ? src : `${SITE_URL}${src}`)),
            sku: product.id,
            brand: { "@type": "Brand", name: "Astro With Hrishi" },
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: Number(product.rating || 4.8).toFixed(1),
              reviewCount: product.review_count || 36,
            },
            offers: {
              "@type": "Offer",
              url: `${SITE_URL}/product/${product.id}`,
              price: String(price),
              priceCurrency: "INR",
              availability: out ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
            },
          },
        ]}
      />

      <div className="container">
        <Link to="/shop" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-gold mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to Shop
        </Link>

        <div className="grid lg:grid-cols-2 gap-12">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            {/* Main Media Viewport: Video or Image */}
            <div className="aspect-square rounded-2xl overflow-hidden bg-secondary border border-border relative">
              {showVideo && product.video_url ? (
                <div className="w-full h-full bg-black/95 relative flex items-center justify-center">
                  {youtubeEmbedUrl ? (
                    <iframe
                      src={youtubeEmbedUrl}
                      title={product.video_title || "Product video"}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full border-0"
                    />
                  ) : (
                    <video
                      src={product.video_url}
                      controls
                      autoPlay
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  )}
                  <div className="absolute top-3 left-3 flex items-center gap-2 z-10 pointer-events-none">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-gold text-primary-foreground shadow flex items-center gap-1">
                      <Video className="h-3 w-3" />
                      {product.video_type === "review" ? "Client Review Video" : "Product Video"}
                    </span>
                    {product.video_duration && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/70 text-gold border border-gold/40">
                        {product.video_duration}s
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowVideo(false)}
                    className="absolute top-3 right-3 text-xs bg-black/75 hover:bg-black text-white hover:text-gold px-2.5 py-1 rounded-lg border border-white/20 transition-colors z-10"
                  >
                    View Photos
                  </button>
                </div>
              ) : (
                <>
                  <img
                    src={images[active]}
                    alt={`${product.name} — ${product.category ?? "astrology product"} by Astro With Hrishi`}
                    width={800}
                    height={800}
                    {...{ fetchpriority: "high" }}
                    decoding="sync"
                    onError={handleImageError}
                    className="w-full h-full object-cover"
                  />
                  {product.video_url && (
                    <button
                      type="button"
                      onClick={() => setShowVideo(true)}
                      className="absolute bottom-3 right-3 z-10 px-3 py-1.5 rounded-full bg-black/80 hover:bg-black text-gold text-xs font-semibold border border-gold/40 shadow-lg flex items-center gap-1.5 backdrop-blur-sm transition-transform hover:scale-105"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      Watch {product.video_type === "review" ? "Client Review" : "Video"} ({product.video_duration || 30}s)
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Thumbnail Strip: Images + Video Thumbnail */}
            <div className="flex gap-2.5 mt-4 overflow-x-auto pb-1">
              {/* Product video thumbnail */}
              {product.video_url && (
                <button
                  type="button"
                  onClick={() => setShowVideo(true)}
                  className={cn(
                    "h-20 w-20 shrink-0 rounded-xl overflow-hidden border transition-all relative bg-gradient-to-br from-gold/30 via-black/85 to-black flex flex-col items-center justify-center group",
                    showVideo ? "border-gold shadow-gold ring-1 ring-gold" : "border-gold/30 hover:border-gold"
                  )}
                  aria-label="Play video"
                >
                  <div className="h-7 w-7 rounded-full bg-gold text-primary-foreground flex items-center justify-center shadow group-hover:scale-110 transition-transform mb-0.5">
                    <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                  </div>
                  <span className="text-[9px] font-bold text-gold tracking-wider uppercase">VIDEO</span>
                  <span className="text-[8px] text-cosmic-silver/80">{product.video_duration || 30}s</span>
                </button>
              )}

              {images.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setShowVideo(false);
                    setActive(i);
                  }}
                  className={cn(
                    "h-20 w-20 shrink-0 rounded-xl overflow-hidden border transition-colors",
                    !showVideo && i === active ? "border-gold" : "border-border hover:border-gold/50"
                  )}
                >
                  <img src={src} alt={`${product.name} view ${i + 1}`} onError={handleImageError} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            {/* Interactive video banner under gallery */}
            {product.video_url && !showVideo && (
              <button
                type="button"
                onClick={() => setShowVideo(true)}
                className="mt-3 w-full py-2.5 px-4 rounded-xl border border-gold/40 bg-gold/10 hover:bg-gold/20 text-gold flex items-center justify-between text-xs font-semibold transition-all shadow-sm group"
              >
                <span className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-gold text-primary-foreground flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Play className="h-3 w-3 fill-current ml-0.5" />
                  </div>
                  {product.video_type === "review"
                    ? `Watch Client Review Video (${product.video_client_name || "Customer Experience"})`
                    : "Watch Product Showcase & Energisation Video"}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-gold/20 text-[10px] font-bold border border-gold/30">
                  {product.video_duration || 30}s Clip
                </span>
              </button>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            {product.category && <p className="text-[11px] uppercase tracking-[0.28em] text-gold mb-3">{product.category}</p>}
            <h1 className="font-display text-3xl sm:text-4xl mb-4">{product.name}</h1>

            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
              <span className="flex items-center gap-1 text-gold">
                {[...Array(5)].map((_, i) => <Star key={i} className="h-4 w-4 fill-gold" />)}
              </span>
              <span className="text-foreground font-medium">{Number(product.rating || 4.8).toFixed(1)}</span>
              <span>· {product.review_count || 36} reviews</span>
            </div>

            <div className="flex items-baseline gap-3 mb-6">
              <span className="font-display text-3xl">{inr(price)}</span>
              {Number(product.discount_percent) > 0 && (
                <span className="text-muted-foreground line-through">{inr(mrp)}</span>
              )}
              {Number(product.discount_percent) > 0 && (
                <span className="text-sm font-semibold text-gold">{Math.round(Number(product.discount_percent))}% off</span>
              )}
              <span className="text-xs uppercase tracking-wider text-gold">Inclusive of all taxes</span>
            </div>

            <p className="text-muted-foreground leading-relaxed whitespace-pre-line mb-8">{product.description}</p>

            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center border border-border rounded-full">
                <button onClick={() => setQty((n) => Math.max(1, n - 1))} className="h-11 w-11 text-lg hover:text-gold" aria-label="Decrease quantity">−</button>
                <span className="w-8 text-center text-sm">{qty}</span>
                <button onClick={() => setQty((n) => n + 1)} className="h-11 w-11 text-lg hover:text-gold" aria-label="Increase quantity">+</button>
              </div>
              <span className={cn("text-sm inline-flex items-center gap-1.5", out ? "text-destructive" : "text-gold")}>
                <Check className="h-4 w-4" /> {out ? "Out of stock" : "In stock — ships in 24 hrs"}
              </span>
            </div>

            <div className="flex flex-wrap gap-3 mb-8">
              <Button onClick={addToCart} disabled={out} variant="outline" size="lg" className="rounded-full px-8 btn-outline-gold min-h-11">
                <ShoppingBag className="mr-2 h-4 w-4" /> Add to Cart
              </Button>
              <Button onClick={buyNow} disabled={out} size="lg" className="rounded-full px-8 bg-gradient-gold text-primary-foreground min-h-11">
                Buy Now
              </Button>
              <Button asChild variant="ghost" size="lg" className="rounded-full btn-whatsapp-ghost min-h-11">
                <a href={waLink(`Hello, I want to know more about "${product.name}" (${inr(price)}).`)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" /> Ask on WhatsApp
                </a>
              </Button>
            </div>


            <div className="grid sm:grid-cols-3 gap-4 text-xs text-muted-foreground">
              <div className="lux-card rounded-xl p-4"><Truck className="h-5 w-5 text-gold mb-2" />Delivery by {deliveryEstimate()}</div>
              <div className="lux-card rounded-xl p-4"><ShieldCheck className="h-5 w-5 text-gold mb-2" />100% authentic & energised</div>
              <div className="lux-card rounded-xl p-4"><MessageCircle className="h-5 w-5 text-gold mb-2" />Free astrologer guidance</div>
            </div>
          </motion.div>
        </div>

        {/* Reviews */}
        <section className="mt-20">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display text-2xl sm:text-3xl">Customer Reviews</h2>
            {product.video_url && product.video_type === "review" && (
              <span className="text-xs px-3 py-1 rounded-full bg-gold/15 border border-gold/30 text-gold flex items-center gap-1.5 font-semibold">
                <Video className="h-3.5 w-3.5" /> Video Review Available ({product.video_duration || 30}s)
              </span>
            )}
          </div>
          <div className="gold-divider w-24 mb-8" />

          {/* Client Review Video Spotlight */}
          {product.video_url && product.video_type === "review" && (
            <div className="mb-10 p-6 sm:p-7 rounded-3xl border border-gold/30 glass-gold shadow-xl">
              <div className="flex flex-col lg:flex-row gap-6 items-center">
                <div className="w-full lg:w-80 shrink-0 aspect-video rounded-2xl overflow-hidden bg-black/95 border border-gold/40 relative shadow-lg">
                  {youtubeEmbedUrl ? (
                    <iframe
                      src={youtubeEmbedUrl}
                      title={product.video_title || "Client review video"}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full border-0"
                    />
                  ) : (
                    <video
                      src={product.video_url}
                      controls
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  )}
                  <div className="absolute top-2 left-2 bg-gold text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded shadow flex items-center gap-1 pointer-events-none">
                    <Play className="h-2.5 w-2.5 fill-current" /> {product.video_duration || 30}s Video
                  </div>
                </div>
                <div className="flex-1 space-y-2 text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold/15 border border-gold/30 text-gold text-xs font-semibold">
                    <Video className="h-3.5 w-3.5" /> Verified Client Video Experience
                  </div>
                  <h3 className="font-display text-xl sm:text-2xl text-foreground font-bold">
                    "{product.video_title || "Honest unboxing and real positive transformation after wearing"}"
                  </h3>
                  <div className="flex items-center gap-1 text-gold">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-gold" />
                    ))}
                    <span className="text-xs text-muted-foreground ml-2 font-medium">5.0 Star Rating</span>
                  </div>
                  <p className="text-sm text-cosmic-silver/80 leading-relaxed">
                    Watch genuine customer <strong>{product.video_client_name || "Verified Seeker"}</strong> share personal feedback, packaging review, and energisation results.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-6">
            {REVIEWS.map((r) => (
              <div key={r.name} className="lux-card rounded-2xl p-6">
                <div className="flex gap-1 text-gold mb-3">
                  {[...Array(r.rating)].map((_, i) => <Star key={i} className="h-4 w-4 fill-gold" />)}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">"{r.text}"</p>
                <div className="text-sm font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.city}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageLayout>
  );
};

export default Product;
