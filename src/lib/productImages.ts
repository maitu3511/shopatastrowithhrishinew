import type { SyntheticEvent } from "react";

/**
 * Every catalog photo that actually ships in /public/assets/products, keyed by the
 * numeric catalog id (or file name) stored in the database / built-in catalog.
 * Only files present on disk are listed here, so nothing ever 404s.
 */
const P = "/assets/products";

const LOCAL_IMAGES: Record<string, string> = {
  // 7 Chakra Crystal Tree
  "1000212756": `${P}/1000212756.jpg`,
  // Ranga Dhatu Sarp Set
  "1000212762": `${P}/1000212762.jpg`,
  // Moonstone Bracelet
  "1000212764": `${P}/1000212764.jpg`,
  // Rose Quartz Bracelet
  "1000212766": `${P}/1000212766-a.jpg`,
  "1000212766-a.jpg": `${P}/1000212766-a.jpg`,
  // Pyrite Bracelet
  "1000212768": `${P}/1000212768.jpg`,
  // Sunstone Bracelet
  "1000212775": `${P}/1000212775-a.jpg`,
  "1000212775-a.jpg": `${P}/1000212775-a.jpg`,
  // Carnelian Bracelet
  "1000212777": `${P}/1000212777.jpg`,
  // Tiger Eye Bracelet (lifestyle background photo)
  "1000212779": `${P}/1000212779 copy 2.jpg`,
  "1000212779.jpg": `${P}/1000212779 copy 2.jpg`,
  "1000212779 copy.jpg": `${P}/1000212779 copy 2.jpg`,
  "1000212779 copy 2.jpg": `${P}/1000212779 copy 2.jpg`,
  "tiger-eye-bracelet": `${P}/1000212779 copy 2.jpg`,
  // 7 Chakra Black Tourmaline Bracelet
  "1000212781": `${P}/1000212781-a.jpg`,
  "1000212781-a.jpg": `${P}/1000212781-a.jpg`,
  // Dhanyog Bracelet
  "1000212783": `${P}/1000212783-a.jpg`,
  "1000212783-a.jpg": `${P}/1000212783-a.jpg`,
  // Trishield Bracelet (lifestyle background photo)
  "trishield-bracelet": `${P}/1000219125 copy.jpg`,
  "1000219125": `${P}/1000219125 copy.jpg`,
  "1000219125 copy.jpg": `${P}/1000219125 copy.jpg`,
  "1000219125.jpg": `${P}/1000219125 copy.jpg`,
  "trishield-1.jpg": `${P}/1000219125 copy.jpg`,
  "trishield-2.jpg": `${P}/1000219125 copy.jpg`,
  "trishield-3.jpg": `${P}/1000219125 copy.jpg`,
  "trishield-4.jpg": `${P}/trishield-4.jpg`,
};

/**
 * Database rows store generic file names ("product-4.jpg"). This maps each of
 * them to the matching catalog photo, in the shop's sort order:
 * 1 7 Chakra Tree, 2 Ranga Dhatu Sarp Set, 3 Moonstone, 4 Rose Quartz,
 * 5 Pyrite, 6 Sunstone, 7 Carnelian, 8 Tiger Eye, 9 7 Chakra Black
 * Tourmaline, 10 Dhanyog.
 */
const DB_ALIASES: Record<string, string> = {
  "product-1.jpg": "1000212756",
  "product-2.jpg": "1000212762",
  "product-3.jpg": "1000212764",
  "product-4.jpg": "1000212766",
  "product-5.jpg": "1000212768",
  "product-6.jpg": "1000212775",
  "product-7.jpg": "1000212777",
  "product-8.jpg": "1000212779",
  "product-9.jpg": "1000212781",
  "product-10.jpg": "1000212783",
};

for (const [file, id] of Object.entries(DB_ALIASES)) LOCAL_IMAGES[file] = LOCAL_IMAGES[id];

const placeholder = LOCAL_IMAGES["1000212756"];

/**
 * Resolves a stored image reference to a usable URL.
 * Accepts absolute URLs (admin-added products), legacy CDN paths, or catalog filenames.
 */
export const resolveImage = (ref?: string | null): string => {
  if (!ref) return placeholder;
  if (ref.startsWith("/api/media/") || ref.startsWith("/assets/") || /^(https?:)?\/\//.test(ref) || ref.startsWith("data:")) return ref;
  if (LOCAL_IMAGES[ref]) return LOCAL_IMAGES[ref];
  // Stored values can be plain filenames ("1000212783 copy.jpg"), root paths
  // ("/assets/products/1000212783.jpg") or legacy CDN pointers. Match on the file
  // name segment only — matching the whole string wrongly picked up digit runs
  // inside asset UUIDs.
  const fileName = decodeURIComponent(ref.split("?")[0].split("/").pop() ?? "");
  if (LOCAL_IMAGES[fileName]) return LOCAL_IMAGES[fileName];
  const id = fileName.match(/\d{6,}/)?.[0];
  if (id && LOCAL_IMAGES[id]) return LOCAL_IMAGES[id];
  if (ref.startsWith("/__l5e/")) return placeholder;
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith("data:") || ref.startsWith("/api/media/") || ref.startsWith("/assets/")) return ref;
  return placeholder;
};

/**
 * Extra photo angles that exist on disk, keyed by the numeric catalog id.
 */
const EXTRA_VIEWS: Record<string, string[]> = {
  "1000212756": [`${P}/1000212756-a.jpg`, `${P}/1000212756-b.jpg`],
  "1000212762": [`${P}/1000212762-a.jpg`, `${P}/1000212762-b.jpg`],
  "1000212764": [`${P}/1000212764-a.jpg`, `${P}/1000212764-b.jpg`],
  "1000212766": [`${P}/1000212766-b.jpg`],
  "1000212768": [`${P}/1000212768-a.jpg`, `${P}/1000212768-b.jpg`],
  "1000212775": [`${P}/1000212775 copy.jpg`],
  "1000212777": [`${P}/1000212777-a.jpg`],
  "1000212779": [`${P}/1000212779 copy 2.jpg`],
  "1000219125": [`${P}/1000219125 copy.jpg`],
  "trishield-1.jpg": [`${P}/1000219125 copy.jpg`],
  "trishield-4.jpg": [`${P}/1000219125 copy.jpg`],
};

/**
 * Attach as onError on any product <img> so a broken link quietly swaps in the
 * bundled placeholder photo instead of the browser's broken-image icon.
 */
export const handleImageError = (e: SyntheticEvent<HTMLImageElement>) => {
  const el = e.currentTarget;
  if (el.dataset.fallbackApplied === "1") return;
  el.dataset.fallbackApplied = "1";
  el.src = placeholder;
};

const catalogKey = (ref?: string | null) => {
  if (!ref) return null;
  const fileName = decodeURIComponent(ref.split("?")[0].split("/").pop() ?? "");
  return DB_ALIASES[fileName] ?? fileName.match(/\d{6,}/)?.[0] ?? null;
};

export const resolveImages = (product: {
  id?: string;
  image_url?: string | null;
  images?: string[] | null;
}): string[] => {
  const list = (product.images ?? []).filter(Boolean);
  const all = list.length ? list : product.image_url ? [product.image_url] : [];
  const resolved = Array.from(new Set(all.map(resolveImage)));
  const key = catalogKey(all[0] ?? product.image_url);
  for (const extra of (key && EXTRA_VIEWS[key]) || []) {
    if (!resolved.includes(extra)) resolved.push(extra);
  }
  return resolved.length ? resolved : [placeholder];
};
