// server/Routes/download.js
const express = require("express");
const router = express.Router();
const { Readable } = require("stream");

/**
 * Sanitize filenames for Content-Disposition headers
 */
function sanitizeFilename(name) {
  if (!name) return "video.mp4";
  return name.replace(/[^a-zA-Z0-9_\-\. ]/g, "").trim().replace(/\s+/g, "_") + ".mp4";
}

/**
 * GET /api/download/options
 * Returns structured download server targets for a movie or TV episode
 */
router.get("/options", (req, res) => {
  const { tmdbId, type = "movie", season = 1, episode = 1, title = "Movie" } = req.query;

  if (!tmdbId) {
    return res.status(400).json({ error: "Missing tmdbId parameter" });
  }

  const isTv = type === "tv";
  const cleanTitle = isTv ? `${title}_S${season}E${episode}` : title;
  const fileName = sanitizeFilename(cleanTitle);

  // Pre-configured downloadable targets with fallback external mirrors
  const options = [
    {
      id: "vidsrc-vip",
      name: "VidSrc Direct Stream",
      quality: "1080p Full HD",
      speed: "Ultra Fast",
      badge: "1080p HD",
      type: "proxy",
      proxyUrl: `/api/download/proxy?tmdb=${tmdbId}&type=${type}&s=${season}&e=${episode}&filename=${encodeURIComponent(fileName)}`,
      externalUrl: isTv
        ? `https://vidsrc.me/download/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`
        : `https://vidsrc.me/download/movie?tmdb=${tmdbId}`,
    },
    {
      id: "autoembed",
      name: "AutoEmbed HD Gateway",
      quality: "720p / 1080p",
      speed: "High Speed",
      badge: "HD",
      type: "proxy",
      proxyUrl: `/api/download/proxy?tmdb=${tmdbId}&type=${type}&s=${season}&e=${episode}&filename=${encodeURIComponent(fileName)}`,
      externalUrl: isTv
        ? `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}`
        : `https://www.2embed.cc/embed/${tmdbId}`,
    },
    {
      id: "multiembed",
      name: "MultiEmbed Fast Mirror",
      quality: "1080p / 720p / 480p",
      speed: "Stable",
      badge: "Multi Quality",
      type: "proxy",
      proxyUrl: `/api/download/proxy?tmdb=${tmdbId}&type=${type}&s=${season}&e=${episode}&filename=${encodeURIComponent(fileName)}`,
      externalUrl: isTv
        ? `https://multiembed.mov/direct-download?tmdb=${tmdbId}&s=${season}&e=${episode}`
        : `https://multiembed.mov/direct-download?tmdb=${tmdbId}`,
    },
    {
      id: "vidsrc-pro",
      name: "VidSrc Pro Server",
      quality: "720p HD",
      speed: "Standard",
      badge: "Standard",
      type: "proxy",
      proxyUrl: `/api/download/proxy?tmdb=${tmdbId}&type=${type}&s=${season}&e=${episode}&filename=${encodeURIComponent(fileName)}`,
      externalUrl: isTv
        ? `https://vidsrc.pro/embed/tv/${tmdbId}?season=${season}&episode=${episode}`
        : `https://vidsrc.pro/embed/movie/${tmdbId}`,
    },
  ];

  res.json({
    title,
    type,
    tmdbId,
    season: isTv ? season : undefined,
    episode: isTv ? episode : undefined,
    options,
  });
});

/**
 * GET /api/download/proxy
 * Streams media binary directly to browser as an attachment
 */
router.get("/proxy", async (req, res) => {
  const { url, filename = "video.mp4", tmdb, type = "movie", s = 1, e = 1 } = req.query;

  // Build target target source link if url parameter not directly provided
  let targetUrl = url;
  let refererHeader = "https://vidsrc.me/";

  if (!targetUrl && tmdb) {
    if (type === "tv") {
      targetUrl = `https://vidsrc.me/download/tv?tmdb=${tmdb}&season=${s}&episode=${e}`;
    } else {
      targetUrl = `https://vidsrc.me/download/movie?tmdb=${tmdb}`;
    }
  }

  if (!targetUrl) {
    return res.status(400).send("Missing target URL or tmdb parameter");
  }

  try {
    const cleanFilename = sanitizeFilename(filename);

    // Fetch binary stream with spoofed headers
    const upstreamRes = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Referer: refererHeader,
        Accept: "*/*",
      },
    });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      // If direct proxying returns non-200 (e.g. redirect to HTML player), redirect browser gracefully
      return res.redirect(targetUrl);
    }

    const contentType = upstreamRes.headers.get("content-type") || "video/mp4";

    // If third party returned an HTML page (iframe page), redirect to page for player download
    if (contentType.includes("text/html")) {
      return res.redirect(targetUrl);
    }

    // Set binary download attachment headers
    res.setHeader("Content-Disposition", `attachment; filename="${cleanFilename}"`);
    res.setHeader("Content-Type", contentType);

    const contentLength = upstreamRes.headers.get("content-length");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    // Convert fetch web ReadableStream to Node stream and pipe to res
    if (upstreamRes.body) {
      const nodeStream = Readable.fromWeb(upstreamRes.body);
      nodeStream.pipe(res);
    } else {
      res.redirect(targetUrl);
    }
  } catch (error) {
    console.error("Download proxy error:", error.message);
    if (!res.headersSent) {
      res.redirect(targetUrl);
    }
  }
});

module.exports = router;
