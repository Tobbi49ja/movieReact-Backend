// server/utils/streamResolver.js
// Resolve the real .m3u8/.mp4 stream URL from a third-party embed page.
// Uses Playwright (headless Chromium) to execute the page's JS player and
// sniff the network request that carries the actual stream URL.

const { chromium } = require("playwright");

// Module-level singleton browser. Launched lazily on first request, reused
// across all requests, closed on process shutdown.
let browser = null;

const DEBUG = process.env.DEBUG ? /download/i.test(process.env.DEBUG) : false;
function log(...args) {
  if (DEBUG) console.log("[streamResolver]", ...args);
}

// Known embed source -> base URL mapping for movies and TV shows.
// Each value is a function that returns the full embed URL given the query.
const SOURCE_URLS = {
  vidsrc: {
    movie: (tmdbId) => `https://autoembed.cc/movie/tmdb/${tmdbId}`,
    tv: (tmdbId, s, e) =>
      `https://autoembed.cc/tv/tmdb/${tmdbId}-${s}-${e}`,
  },
  "2embed": {
    movie: (tmdbId) => `https://www.2embed.cc/embed/${tmdbId}`,
    tv: (tmdbId, s, e) =>
      `https://www.2embed.cc/embedtv/${tmdbId}&s=${s}&e=${e}`,
  },
  multiembed: {
    movie: (tmdbId) => `https://multiembed.mov/direct-download?tmdb=${tmdbId}`,
    tv: (tmdbId, s, e) =>
      `https://multiembed.mov/direct-download?tmdb=${tmdbId}&s=${s}&e=${e}`,
  },
  vidsrcpro: {
    movie: (tmdbId) => `https://embed.su/embed/movie/${tmdbId}`,
    tv: (tmdbId, s, e) =>
      `https://embed.su/embed/tv/${tmdbId}/${s}/${e}`,
  },
};

// Matches URLs that look like an actual stream file, not an HTML page.
const STREAM_RE = /\.(m3u8|mp4)(\?|$)/i;

/**
 * Get (or create) the shared Chromium browser instance.
 */
async function getBrowser() {
  if (browser && browser.isConnected()) return browser;

  const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";
  browser = await chromium.launch({
    headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-features=AudioServiceOutOfProcess",
    ],
  });
  log("Browser launched", { headless });
  return browser;
}

/**
 * Resolve a stream URL for a given source + TMDB metadata.
 *
 * @param {Object} opts
 * @param {string} opts.source     - one of: vidsrc, 2embed, multiembed, vidsrcpro
 * @param {string|number} opts.tmdbId
 * @param {string} opts.type       - "movie" | "tv"
 * @param {number} [opts.season]
 * @param {number} [opts.episode]
 * @returns {Promise<string|null>}  the resolved stream URL, or null on failure
 */
async function resolveStreamUrl({ source, tmdbId, type, season, episode }) {
  const key = String(source).toLowerCase();
  const sourceMap = SOURCE_URLS[key];
  if (!sourceMap) {
    log("Unknown source", source);
    return null;
  }

  const buildUrl = type === "tv" ? sourceMap.tv : sourceMap.movie;
  const targetUrl =
    type === "tv"
      ? buildUrl(tmdbId, season, episode)
      : buildUrl(tmdbId);

  if (!targetUrl) {
    log("Could not build embed URL", { source, type, tmdbId });
    return null;
  }

  log("Resolving", { source, targetUrl });

  let page = null;
  const timeoutMs = 20000;

  try {
    const b = await getBrowser();
    page = await b.newPage();

    // Spoof a real desktop Chrome User-Agent so embed sites don't block us.
    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    });

    // Capture candidate stream URLs as they arrive.
    const streamCandidates = [];
    const handler = (request) => {
      const url = request.url();
      if (STREAM_RE.test(url)) {
        log("Stream candidate", url);
        streamCandidates.push(url);
      }
    };
    page.on("request", handler);

    // Race navigation against the timeout.
    await Promise.race([
      page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Navigation timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);

    // Give the player JS a moment to fire its initial stream request.
    await page
      .waitForTimeout(2000)
      .catch(() => {});

    const streamUrl = streamCandidates[0] || null;
    log("Resolved stream", streamUrl);

    return streamUrl;
  } catch (err) {
    log("Resolve failed", err.message);
    return null;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (closeErr) {
        log("Page close failed", closeErr.message);
      }
    }
  }
}

/**
 * Close the shared browser instance. Safe to call multiple times.
 */
async function closeBrowser() {
  if (browser) {
    try {
      await browser.close();
    } catch (err) {
      log("Browser close error", err.message);
    }
    browser = null;
    log("Browser closed");
  }
}

module.exports = { resolveStreamUrl, closeBrowser, getBrowser };