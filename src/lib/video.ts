export const getYouTubeEmbedUrl = (url?: string | null): string | null => {
  if (!url) return null;

  try {
    const value = url.trim();
    const parsed = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";

    if (host === "youtu.be") {
      videoId = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (parsed.pathname === "/watch") {
        videoId = parsed.searchParams.get("v") ?? "";
      } else if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
        videoId = parsed.pathname.split("/").filter(Boolean)[1] ?? "";
      }
    }

    const safeId = /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : "";
    return safeId ? `https://www.youtube-nocookie.com/embed/${safeId}` : null;
  } catch {
    return null;
  }
};
