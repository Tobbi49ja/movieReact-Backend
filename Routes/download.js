// server/Routes/download.js
// Download route: resolves real stream URLs from embed pages via Playwright
// and streams them (direct mp4 or HLS->mp4 via FFmpeg) to the client.
const express = require("express");
const router = express.Router();
const { Readable } = require("stream");
const {
  resolveStreamUrl,
  closeBrowser,
} = require("../utils/streamResolver");

const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

ffmpeg.setFfmpegPath(ffmpegPath);

// Simple async concurrency limiter (replaces p-limit which is ESM-only).
function createLimiter(concurrency) {
  let running = 0;
  const queue = [];
  const next = () => {
    running--;
    if (queue.length) queue.shift()();
  };
  return async function limit(fn) {
    if (running >= concurrency) {
      await new Promise((resolve) => queue.push(resolve));
    }
    running++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

// Limit concurrent FFmpeg jobs so one slow stream can't exhaust the process.
const ffmpegLimit = createLimiter(2);

/**
 * In-memory cache for resolved stream URLs. 30-minute TTL.
 * Key: `${source}:${tmdbId}:${type}:${season}:${episode}`
 */
const streamCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

function cacheKey({ source, tmdbId, type, season, episode }) {
  return `${source}:${tmdbId}:${type}:${season}:${episode}`;
}

function isCacheValid(entry) {
  return entry && Date.now() - entry.ts < CACHE_TTL_MS;
}

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
 * (UNCHANGED — kept identical to previous behavior)
 */
router.get("/options", (req, res) => {
  const { tmdbId, tmdb: tmdbShort, type = "movie", season = 1, episode = 1, title = "Movie" } = req.query;
  const tmdb = tmdbId || tmdbShort;

  if (!tmdb) {
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
      sourceKey: "vidsrc",
      proxyUrl: `/api/download/stream?tmdb=${tmdb}&type=${type}&s=${season}&e=${episode}&source=vidsrc&filename=${encodeURIComponent(fileName)}`,
      externalUrl: isTv
        ? `https://vidsrc.me/download/tv?tmdb=${tmdb}&season=${season}&episode=${episode}`
        : `https://autoembed.cc/movie/tmdb/${tmdb}`,
    },
    {
      id: "autoembed",
      name: "AutoEmbed HD Gateway",
      quality: "720p / 1080p",
      speed: "High Speed",
      badge: "HD",
      type: "proxy",
      sourceKey: "2embed",
      proxyUrl: `/api/download/stream?tmdb=${tmdb}&type=${type}&s=${season}&e=${episode}&source=2embed&filename=${encodeURIComponent(fileName)}`,
      externalUrl: isTv
        ? `https://www.2embed.cc/embedtv/${tmdb}&s=${season}&e=${episode}`
        : `https://www.2embed.cc/embed/${tmdb}`,
    },
    {
      id: "multiembed",
      name: "MultiEmbed Fast Mirror",
      quality: "1080p / 720p / 480p",
      speed: "Stable",
      badge: "Multi Quality",
      type: "proxy",
      sourceKey: "multiembed",
      proxyUrl: `/api/download/stream?tmdb=${tmdb}&type=${type}&s=${season}&e=${episode}&source=multiembed&filename=${encodeURIComponent(fileName)}`,
      externalUrl: isTv
        ? `https://multiembed.mov/direct-download?tmdb=${tmdb}&s=${season}&e=${episode}`
        : `https://multiembed.mov/direct-download?tmdb=${tmdb}`,
    },
    {
      id: "vidsrc-pro",
      name: "EmbedSu Mirror",
      quality: "720p HD",
      speed: "Standard",
      badge: "Standard",
      type: "proxy",
      sourceKey: "vidsrcpro",
      proxyUrl: `/api/download/stream?tmdb=${tmdb}&type=${type}&s=${season}&e=${episode}&source=vidsrcpro&filename=${encodeURIComponent(fileName)}`,
      externalUrl: isTv
        ? `https://vidsrc.pro/embed/tv/${tmdb}?season=${season}&episode=${episode}`
        : `https://embed.su/embed/movie/${tmdb}`,
    },
  ];

  res.json({
    title,
    type,
    tmdbId: tmdb,
    season: isTv ? season : undefined,
    episode: isTv ? episode : undefined,
    options,
  });
});
/**
 * GET /api/download/resolve
 * Resolves the real stream URL for a given source + TMDB metadata.
 * Results are cached in-memory for 30 minutes.
 *
 * Query params: tmdb, type (movie|tv), s (season), e (episode), source
 *
 * Returns 200: { streamUrl, type: "hls"|"mp4", source }
 * Returns 404: { error: "Could not resolve stream", source, reason }
 */
router.get("/resolve", async (req, res) => {
  const {
    tmdbId: tmdbFromId,
    tmdb: tmdbFromShort,
    type = "movie",
    season = 1,
    episode = 1,
    source,
  } = req.query;

  const tmdb = tmdbFromId || tmdbFromShort;

  if (!tmdb) {
    return res.status(400).json({ error: "Missing tmdbId parameter" });
  }
  if (!source) {
    return res.status(400).json({ error: "Missing source parameter" });
  }

  const key = cacheKey({
    source: String(source).toLowerCase(),
    tmdbId: tmdb,
    type,
    season: Number(season) || 1,
    episode: Number(episode) || 1,
  });

  // Serve from cache if still valid
  const cached = streamCache.get(key);
  if (isCacheValid(cached)) {
    console.log(`[download] Cache hit for ${key}`);
    return res.json({
      streamUrl: cached.streamUrl,
      type: cached.streamType,
      source: cached.source,
    });
  }

  try {
    const streamUrl = await resolveStreamUrl({
      source: String(source).toLowerCase(),
      tmdbId: tmdb,
      type,
      season: Number(season) || 1,
      episode: Number(episode) || 1,
    });

    if (!streamUrl) {
      return res.status(404).json({
        error: "Could not resolve stream",
        source,
        reason: "Embed page did not yield a stream URL (bot block, site changed, or timeout).",
      });
    }

    const streamType = /\.m3u8(\?|$)/i.test(streamUrl) ? "hls" : "mp4";

    // Cache the successful resolve
    streamCache.set(key, {
      streamUrl,
      streamType,
      source: String(source).toLowerCase(),
      ts: Date.now(),
    });

    return res.json({ streamUrl, type: streamType, source });
  } catch (err) {
    console.error("[download] resolve error:", err.message);
    return res.status(500).json({
      error: "Could not resolve stream",
      source,
      reason: err.message,
    });
  }
});
/**
 * GET /api/download/stream
 * Resolves the stream URL (via cache or fresh resolve) and pipes the
 * resulting media to the client as a downloadable MP4 attachment.
 *
 * Query params: tmdb, type (movie|tv), s (season), e (episode), source, filename
 *
 * - .mp4 streams are piped directly with Content-Disposition: attachment.
 * - .m3u8 (HLS) streams are converted to MP4 on the fly via FFmpeg.
 *
 * The stream URL is NEVER leaked to the client. On failure we return a
 * clear JSON error with status 500.
 */
router.get("/stream", async (req, res) => {
  const {
    tmdbId: tmdbFromId,
    tmdb: tmdbFromShort,
    type = "movie",
    season = 1,
    episode = 1,
    source,
    filename = "video.mp4",
  } = req.query;

  const tmdb = tmdbFromId || tmdbFromShort;

  if (!tmdb) {
    return res.status(400).json({ error: "Missing tmdbId parameter" });
  }
  if (!source) {
    return res.status(400).json({ error: "Missing source parameter" });
  }

  const cleanFilename = sanitizeFilename(filename);
  const key = cacheKey({
    source: String(source).toLowerCase(),
    tmdbId: tmdb,
    type,
    season: Number(season) || 1,
    episode: Number(episode) || 1,
  });

  let streamUrl;
  let streamType;

  // 1. Try cache first
  const cached = streamCache.get(key);
  if (isCacheValid(cached)) {
    streamUrl = cached.streamUrl;
    streamType = cached.streamType;
    console.log(`[download] Stream cache hit for ${key}`);
  } else {
    // 2. Fresh resolve
    streamUrl = await resolveStreamUrl({
      source: String(source).toLowerCase(),
      tmdbId: tmdb,
      type,
      season: Number(season) || 1,
      episode: Number(episode) || 1,
    });

    if (!streamUrl) {
      return res.status(404).json({
        error: "Could not resolve stream",
        source,
        reason: "Embed page did not yield a stream URL (bot block, site changed, or timeout).",
      });
    }

    streamType = /\.m3u8(\?|$)/i.test(streamUrl) ? "hls" : "mp4";

    streamCache.set(key, {
      streamUrl,
      streamType,
      source: String(source).toLowerCase(),
      ts: Date.now(),
    });
  }

  // 3. Stream to client
  res.setHeader("Content-Disposition", `attachment; filename="${cleanFilename}"`);

  if (streamType === "mp4") {
    // Direct MP4 pipe
    res.setHeader("Content-Type", "video/mp4");

    try {
      const upstreamRes = await fetch(streamUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          Referer: "https://vidsrc.xyz/",
          Accept: "*/*",
        },
      });

      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        if (!res.headersSent) {
          return res.status(502).json({
            error: "Upstream stream unavailable",
            source,
            reason: `Upstream returned ${upstreamRes.status}`,
          });
        }
        return;
      }

      const contentType = upstreamRes.headers.get("content-type") || "video/mp4";
      if (!res.headersSent) {
        res.setHeader("Content-Type", contentType);
        const contentLength = upstreamRes.headers.get("content-length");
        if (contentLength) res.setHeader("Content-Length", contentLength);
      }

      if (upstreamRes.body) {
        const nodeStream = Readable.fromWeb(upstreamRes.body);
        nodeStream.on("error", (err) => {
          console.error("[download] upstream pipe error:", err.message);
          if (!res.writableEnded) res.destroy();
        });
        nodeStream.pipe(res);
      } else {
        if (!res.headersSent) {
          return res.status(502).json({
            error: "Upstream stream unavailable",
            source,
            reason: "Empty upstream body",
          });
        }
      }
    } catch (err) {
      console.error("[download] mp4 stream error:", err.message);
      if (!res.headersSent) {
        return res.status(502).json({
          error: "Failed to stream MP4",
          source,
          reason: err.message,
        });
      }
    }
    return;
  }

  // HLS (.m3u8) -> MP4 via FFmpeg
  res.setHeader("Content-Type", "video/mp4");

  let ffmpegProc = null;
  const cleanup = () => {
    if (ffmpegProc && !ffmpegProc.killed) {
      try {
        ffmpegProc.kill("SIGKILL");
      } catch (killErr) {
        // ignore
      }
    }
  };

  // Kill FFmpeg if the client disconnects mid-download
  res.on("close", cleanup);
  req.on("close", cleanup);
  req.on("aborted", cleanup);

  try {
    await ffmpegLimit(async () => {
      await new Promise((resolve, reject) => {
        console.log(`[download] Spawning FFmpeg for HLS -> MP4: ${key}`);

        const command = ffmpeg(streamUrl)
          .inputOptions([
            "-user_agent Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "-referer https://vidsrc.xyz/",
          ])
          .outputOptions([
            "-c copy",
            "-bsf:a aac_adtstoasc",
            "-movflags frag_keyframe+empty_moov",
          ])
          .on("start", (cmd) => {
            console.log("[download] FFmpeg started:", cmd);
          })
          .on("error", (err) => {
            console.error("[download] FFmpeg error:", err.message);
            reject(err);
          })
          .on("end", () => {
            console.log("[download] FFmpeg finished");
            resolve();
          });

        ffmpegProc = command;
        command.pipe(res, { end: true });
      });
    });
  } catch (err) {
    console.error("[download] HLS conversion failed:", err.message);
    if (!res.writableEnded && !res.headersSent) {
      return res.status(500).json({
        error: "HLS to MP4 conversion failed",
        source,
        reason: err.message,
      });
    }
    if (!res.writableEnded) {
      res.end();
    }
  }
});

module.exports = router;
