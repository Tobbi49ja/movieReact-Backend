// server/Routes/subtitles.js
// Subtitle search + file proxy backed by Wyzie Subs (https://sub.wyzie.io)
const express = require("express");
const router = express.Router();

const WYZIE_KEY = process.env.WYZIE_KEY;
const WYZIE_BASE = "https://sub.wyzie.io";
const WYZIE_HOST = "sub.wyzie.io";
const UPSTREAM_TIMEOUT_MS = 10000;
const MAX_RESULTS = 20;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;

if (!WYZIE_KEY) {
  console.warn("⚠️  WYZIE_KEY is not set — subtitle routes will fail");
}

const rateBuckets = new Map();

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function rateLimit(req, res, next) {
  const now = Date.now();
  if (rateBuckets.size > 5000) {
    for (const [ip, bucket] of rateBuckets) {
      if (now - bucket.start >= RATE_LIMIT_WINDOW_MS) {
        rateBuckets.delete(ip);
      }
    }
  }

  const ip = clientIp(req);
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(ip, { start: now, count: 1 });
    return next();
  }

  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil(
      (bucket.start + RATE_LIMIT_WINDOW_MS - now) / 1000
    );
    res.setHeader("Retry-After", String(retryAfter));
    return res
      .status(429)
      .json({ error: "Too many requests. Try again shortly." });
  }
  next();
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

function isTimeout(err) {
  return Boolean(
    err && (err.name === "AbortError" || err.name === "TimeoutError")
  );
}

function parseWyzieUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.hostname !== WYZIE_HOST) return null;
  if (parsed.port && parsed.port !== "443") return null;
  return parsed;
}

function decodeSubtitle(buffer, charset) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return new TextDecoder("utf-8").decode(buffer.subarray(3));
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer.subarray(2));
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buffer.subarray(2));
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {}

  if (charset) {
    try {
      return new TextDecoder(charset, { fatal: true }).decode(buffer);
    } catch {}
  }

  try {
    return new TextDecoder("windows-1252").decode(buffer);
  } catch {
    return buffer.toString("latin1");
  }
}

router.use(rateLimit);

// -----------------------------
// GET /api/subtitles/search?tmdbId=&season=&episode=&lang=
// -----------------------------
router.get("/search", async (req, res) => {
  const tmdbId = String(req.query.tmdbId ?? "").trim();
  const lang = String(req.query.lang ?? "").trim().toLowerCase();
  const seasonValue = req.query.season;
  const episodeValue = req.query.episode;

  if (!/^\d{1,10}$/.test(tmdbId) || Number(tmdbId) <= 0) {
    return res
      .status(400)
      .json({ error: "tmdbId must be a positive numeric id" });
  }
  if (!/^[a-z]{2,5}$/.test(lang)) {
    return res.status(400).json({ error: "lang must be 2-5 letters" });
  }

  const hasSeason =
    seasonValue !== undefined && String(seasonValue).trim() !== "";
  const hasEpisode =
    episodeValue !== undefined && String(episodeValue).trim() !== "";
  if (hasSeason !== hasEpisode) {
    return res
      .status(400)
      .json({ error: "season and episode must be provided together" });
  }

  let season;
  let episode;
  if (hasSeason) {
    const seasonText = String(seasonValue).trim();
    const episodeText = String(episodeValue).trim();
    if (!/^\d{1,3}$/.test(seasonText) || !/^\d{1,3}$/.test(episodeText)) {
      return res
        .status(400)
        .json({ error: "season and episode must be numeric" });
    }
    season = Number(seasonText);
    episode = Number(episodeText);
  }

  if (!WYZIE_KEY) {
    return res
      .status(503)
      .json({ error: "Subtitle service is not configured" });
  }

  const upstreamUrl = new URL(`${WYZIE_BASE}/search`);
  upstreamUrl.searchParams.set("id", tmdbId);
  upstreamUrl.searchParams.set("language", lang);
  upstreamUrl.searchParams.set("key", WYZIE_KEY);
  if (season !== undefined) {
    upstreamUrl.searchParams.set("season", String(season));
    upstreamUrl.searchParams.set("episode", String(episode));
  }

  let upstream;
  try {
    upstream = await fetchWithTimeout(upstreamUrl.toString(), {
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    if (isTimeout(err)) {
      return res.status(504).json({ error: "Subtitle service timed out" });
    }
    console.error("Wyzie search error:", err?.message || err);
    return res.status(502).json({ error: "Subtitle service unavailable" });
  }

  if (upstream.status === 404) {
    return res.json([]);
  }
  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) res.setHeader("Retry-After", retryAfter);
    return res
      .status(429)
      .json({ error: "Subtitle service rate limit reached" });
  }
  if (!upstream.ok) {
    let detail = "";
    try {
      detail = (await upstream.text()).slice(0, 200);
    } catch {}
    console.error(`Wyzie search HTTP ${upstream.status}: ${detail}`);
    return res.status(502).json({ error: "Subtitle service error" });
  }

  let payload;
  try {
    payload = await upstream.json();
  } catch (err) {
    if (isTimeout(err)) {
      return res.status(504).json({ error: "Subtitle service timed out" });
    }
    return res
      .status(502)
      .json({ error: "Invalid subtitle service response" });
  }

  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.subtitles)
      ? payload.subtitles
      : [];

  const results = [];
  for (const item of items) {
    if (!item) continue;
    const parsed = parseWyzieUrl(item.url);
    if (!parsed) continue;
    results.push({
      id: item.id != null ? String(item.id) : "",
      lang: item.language || lang,
      label: item.display || item.language || lang,
      format: item.format || "",
      url: parsed.toString(),
    });
    if (results.length >= MAX_RESULTS) break;
  }

  res.json(results);
});

// -----------------------------
// GET /api/subtitles/file?url=
// Server-side fetch so the browser never talks to Wyzie directly.
// -----------------------------
router.get("/file", async (req, res) => {
  const parsed = parseWyzieUrl(req.query.url);
  if (!parsed) {
    return res
      .status(400)
      .json({ error: "Only Wyzie subtitle URLs are allowed" });
  }

  let upstream;
  try {
    upstream = await fetchWithTimeout(parsed.toString(), {
      headers: {
        Accept: "text/plain, text/vtt, application/x-subrip, */*",
      },
    });
  } catch (err) {
    if (isTimeout(err)) {
      return res.status(504).json({ error: "Subtitle service timed out" });
    }
    console.error("Wyzie file error:", err?.message || err);
    return res.status(502).json({ error: "Subtitle service unavailable" });
  }

  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) res.setHeader("Retry-After", retryAfter);
    return res
      .status(429)
      .json({ error: "Subtitle service rate limit reached" });
  }
  if (!upstream.ok) {
    let detail = "";
    try {
      detail = (await upstream.text()).slice(0, 200);
    } catch {}
    console.error(`Wyzie file HTTP ${upstream.status}: ${detail}`);
    const status =
      upstream.status >= 400 && upstream.status < 500
        ? upstream.status
        : 502;
    return res.status(status).json({ error: "Subtitle file unavailable" });
  }

  const contentLength = Number(upstream.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES) {
    return res.status(413).json({ error: "Subtitle file too large" });
  }

  let buffer;
  try {
    buffer = Buffer.from(await upstream.arrayBuffer());
  } catch (err) {
    if (isTimeout(err)) {
      return res.status(504).json({ error: "Subtitle service timed out" });
    }
    console.error("Wyzie file read error:", err?.message || err);
    return res.status(502).json({ error: "Failed to read subtitle file" });
  }
  if (buffer.length > MAX_FILE_BYTES) {
    return res.status(413).json({ error: "Subtitle file too large" });
  }

  const contentType = upstream.headers.get("content-type") || "";
  const charsetMatch = contentType.match(/charset\s*=\s*"?([^";]+)"?/i);
  let text;
  try {
    text = decodeSubtitle(buffer, charsetMatch ? charsetMatch[1].trim() : null);
  } catch (err) {
    console.error("Wyzie file decode error:", err?.message || err);
    return res.status(502).json({ error: "Failed to decode subtitle file" });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(text);
});

module.exports = router;
