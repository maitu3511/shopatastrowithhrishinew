import { useMemo, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, ShoppingBag, Star, Check, Sparkles, Play, Video } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProducts } from "@/hooks/useProducts";
import { lineKey, useCart } from "@/lib/cart";
import { resolveImages, handleImageError } from "@/lib/productImages";
import { inr, mrpOf, productRouteId, isTestItem, type DBProduct } from "@/lib/shop";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { trackViewItemList, trackSearch, trackAddToCart } from "@/lib/analytics";
import { useEffect, useRef } from "react";

type SortKey = "featured" | "price-asc" | "price-desc" | "name";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "price-asc", label: "Price: Low to High" },
  { id: "price-desc", label: "Price: High to Low" },
  { id: "name", label: "A – Z" },
];

const ProductRow = ({ product, priority }: { product: DBProduct; priority?: boolean }) => {
  const nav = useNavigate();
  const add = useCart((s) => s.add);
  const requireAuth = useRequireAuth();
  const image = resolveImages(product)[0];
  const price = Number(product.price);
  const mrp = mrpOf(price, product.discount_percent);
  const off = Number(product.discount_percent) > 0 ? Math.round(Number(product.discount_percent)) : 0;
  const out = product.stock <= 0;
  const [qty, setQty] = useState(1);

  const buyNow = () => {
    if (!requireAuth()) return;
    if (out) return;
    add(
      {
        id: lineKey(product.id),
        product_id: product.id,
        name: product.name,
        price,
        image_url: image,
        variant: null,
      },
      qty
    );
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

  const addToCart = () => {
    if (!requireAuth()) return;
    add(
      {
        id: lineKey(product.id),
        product_id: product.id,
        name: product.name,
        price,
        image_url: image,
        variant: null,
      },
      qty
    );
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

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      className={cn(
        "rounded-2xl overflow-hidden flex flex-col sm:flex-row",
        product.featured ? "lux-card border-2 border-gold/60 shadow-gold relative" : "lux-card"
      )}
    >
      {product.featured && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent" />
      )}
      <Link
        to={`/product/${productRouteId(product)}`}
        className="relative sm:w-56 lg:w-64 flex-shrink-0 bg-secondary overflow-hidden group"
        aria-label={`View ${product.name}`}
      >
        {/* Fixed aspect ratio reserves the space before the photo arrives — no layout shift. */}
        <div className="aspect-[4/3] sm:aspect-square sm:h-full w-full">
          {off > 0 && (
            <span className="absolute m-3 z-10 text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-gradient-gold text-primary-foreground">
              {off}% OFF
            </span>
          )}
          <img
            src={image}
            alt={`${product.name} — energised astrology product by Astro With Hrishi`}
            width={640}
            height={640}
            loading={priority ? "eager" : "lazy"}
            {...{ fetchpriority: priority ? "high" : "auto" }}
            decoding={priority ? "sync" : "async"}
            onError={handleImageError}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          {product.video_url && (
            <span className="absolute bottom-2.5 left-2.5 z-10 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/85 text-gold border border-gold/40 flex items-center gap-1 shadow backdrop-blur-sm">
              <Play className="h-2.5 w-2.5 fill-current" />
              {product.video_type === "review" ? "Client Review" : "Video"} ({product.video_duration || 30}s)
            </span>
          )}
        </div>
      </Link>

      <div className="flex-1 p-5 sm:p-7 flex flex-col min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {product.category && (
              <p className="text-[10px] uppercase tracking-[0.24em] text-gold mb-2">{product.category}</p>
            )}
            <Link to={`/product/${productRouteId(product)}`}>
              <h3 className="font-display text-xl sm:text-2xl hover:text-gold transition-colors">{product.name}</h3>
            </Link>
          </div>
          {product.badge && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-3 py-1 rounded-full border border-gold text-gold whitespace-nowrap">
              {product.badge}
            </span>
          )}
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mt-3 line-clamp-3">{product.description}</p>

        <div className="flex items-center gap-1.5 mt-4 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 text-gold fill-gold" />
          <span className="text-foreground font-medium">{Number(product.rating || 4.8).toFixed(1)}</span>
          <span>· {product.review_count || 24} reviews</span>
          {!out && <span className="ml-3 inline-flex items-center gap-1 text-gold"><Check className="h-3.5 w-3.5" /> In stock</span>}
        </div>

        <div className="mt-auto pt-6 flex flex-wrap items-end gap-4 justify-between">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl">{inr(price)}</span>
            {off > 0 && <span className="text-sm text-muted-foreground line-through">{inr(mrp)}</span>}
            {off > 0 && <span className="text-sm font-semibold text-gold">{off}% off</span>}
          </div>

          {/* Quantity + actions, bottom-right on desktop */}
          <div className="flex flex-wrap items-center gap-2 sm:justify-end w-full sm:w-auto">
            <div className="flex items-center border border-border rounded-full" role="group" aria-label={`Quantity for ${product.name}`}>
              <button
                type="button"
                onClick={() => setQty((n) => Math.max(1, n - 1))}
                className="h-11 w-11 text-lg rounded-full hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                aria-label={`Decrease quantity of ${product.name}`}
              >
                −
              </button>
              <span className="w-8 text-center text-sm" aria-live="polite">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((n) => Math.min(20, n + 1))}
                className="h-11 w-11 text-lg rounded-full hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                aria-label={`Increase quantity of ${product.name}`}
              >
                +
              </button>
            </div>
            <Button
              type="button"
              onClick={buyNow}
              disabled={out}
              variant="outline"
              className="rounded-full btn-outline-gold min-h-11 font-medium"
            >
              Buy Now
            </Button>
            <Button
              onClick={addToCart}
              disabled={out}
              className="rounded-full bg-gradient-gold text-primary-foreground px-6 min-h-11"
            >
              <ShoppingBag className="mr-2 h-4 w-4" /> {out ? "Out of Stock" : "Add to Cart"}
            </Button>
          </div>
        </div>
      </div>
    </motion.article>
  );
};


const Shop = () => {
  const { products, loading } = useProducts();
  const [adminProducts, setAdminProducts] = useState<DBProduct[]>([]);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<SortKey>("featured");

  useEffect(() => {
    void getDocs(collection(db, "products")).then((snap) => {
      const rows = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as unknown as DBProduct))
        .filter((product) => product.active !== false && product.category !== "test" && !isTestItem(product.name));
      setAdminProducts(rows);
    }).catch((err) => console.warn("Public products load warning:", err));
  }, []);

  const publicProducts = useMemo(() => {
    const merged = new Map<string, DBProduct>();
    for (const product of products) merged.set(product.id, product);
    for (const product of adminProducts) merged.set(product.id, product);
    return Array.from(merged.values()).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [products, adminProducts]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(publicProducts.map((p) => p.category).filter(Boolean) as string[]))],
    [publicProducts]
  );

  const list = useMemo(() => {
    let out = publicProducts.filter((p) => {
      const matchQ = !q || `${p.name} ${p.description ?? ""}`.toLowerCase().includes(q.toLowerCase());
      const matchC = category === "All" || p.category === category;
      return matchQ && matchC;
    });
    out = [...out];
    if (sort === "price-asc") out.sort((a, b) => Number(a.price) - Number(b.price));
    if (sort === "price-desc") out.sort((a, b) => Number(b.price) - Number(a.price));
    if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [publicProducts, q, category, sort]);

  const trishield = publicProducts.find((p) => p.id === "trishield-bracelet");

  // Track product list view once products are loaded
  const trackedListRef = useRef(false);
  useEffect(() => {
    if (publicProducts.length > 0 && !trackedListRef.current) {
      trackedListRef.current = true;
      trackViewItemList(
        publicProducts.map((p) => ({
          id: p.id,
          name: p.name,
          price: Number(p.price),
          category: p.category,
        })),
        category === "All" ? "Full Collection" : `${category} Collection`
      );
    }
  }, [publicProducts, category]);

  // Track search query with debounce
  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(() => {
      trackSearch(q.trim());
    }, 600);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <PageLayout title="The Collection" subtitle="Authentic, energised astrology products — crystals, chakra bracelets and Vedic remedies.">
      <SEO
        title="Shop Astrology Products — Crystals & Bracelets | Astro With Hrishi"
        description="Buy energised 7 Chakra trees, Moonstone, Pyrite, Tiger Eye and Rose Quartz bracelets. Authentic astrology products delivered across India."
        path="/shop"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Astrology & Crystal Products Collection",
          description: "Shop energised Vedic astrology bracelets, healing crystals, and spiritual remedies.",
          url: "https://astrowithhrishi.com/shop",
          mainEntity: {
            "@type": "ItemList",
            itemListElement: publicProducts.slice(0, 20).map((p, idx) => ({
              "@type": "ListItem",
              position: idx + 1,
              url: `https://astrowithhrishi.com/product/${productRouteId(p)}`, 
              name: p.name,
            })),
          },
        }}
      />
      <div className="container">
        {/* Featured New Launch */}
        {trishield && (
          <div className="lux-card rounded-3xl overflow-hidden border-2 border-gold/50 glow-gold relative mb-12">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent" />
            <div className="grid md:grid-cols-[1fr_1.25fr] gap-6 md:gap-10 items-center p-5 md:p-8">
              <Link to="/product/trishield-bracelet" className="relative aspect-[4/3] md:aspect-square overflow-hidden rounded-2xl bg-secondary group">
                <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-semibold px-3 py-1.5 rounded-full bg-gradient-gold text-primary-foreground shadow-lg">
                  <Sparkles className="h-3 w-3" /> New Launch
                </span>
                <img
                  src={resolveImages(trishield)[0]}
                  alt={trishield.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  loading="eager"
                  {...{ fetchpriority: "high" }}
                  decoding="sync"
                  onError={handleImageError}
                />
              </Link>
              <div className="flex flex-col">
                <p className="text-[10px] uppercase tracking-[0.28em] text-gold mb-2">{trishield.category}</p>
                <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl mb-3">{trishield.name}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-3">{trishield.description}</p>
                <div className="flex items-center gap-1.5 mb-4 text-xs text-muted-foreground">
                  <Star className="h-3.5 w-3.5 text-gold fill-gold" />
                  <span className="text-foreground font-medium">{Number(trishield.rating || 4.8).toFixed(1)}</span>
                  <span>· {trishield.review_count || 24} reviews</span>
                  <span className="ml-3 inline-flex items-center gap-1 text-gold"><Check className="h-3.5 w-3.5" /> In stock</span>
                </div>
                <div className="flex items-baseline gap-2 mb-5">
                  <span className="font-display text-2xl sm:text-3xl">{inr(Number(trishield.price))}</span>
                  <span className="text-sm text-muted-foreground line-through">{inr(mrpOf(Number(trishield.price), trishield.discount_percent))}</span>
                  <span className="text-sm font-semibold text-gold">{Math.round(Number(trishield.discount_percent))}% off</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild className="rounded-full bg-gradient-gold text-primary-foreground px-6 min-h-11">
                    <Link to="/product/trishield-bracelet">Buy Now</Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-full btn-outline-gold min-h-11">
                    <Link to="/product/trishield-bracelet">View Details</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between mb-10">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setParams(e.target.value ? { q: e.target.value } : {});
              }}
              placeholder="Search products"
              className="pl-11 rounded-full h-11 bg-secondary border-border"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "px-4 py-2 rounded-full text-xs uppercase tracking-[0.14em] border transition-colors",
                  category === c
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:border-gold hover:text-gold"
                )}
              >
                {c}
              </button>
            ))}
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-11 rounded-full border border-border bg-secondary px-4 text-sm outline-none"
            aria-label="Sort products"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-56 rounded-2xl bg-secondary animate-pulse" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="text-center text-muted-foreground py-20">No products found.</p>
        ) : (
          <div className="space-y-6">
            {list.map((p, i) => (
              <ProductRow key={p.id} product={p} priority={i < 2} />
            ))}

          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default Shop;
