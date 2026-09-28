// server/utils/prerender.js
// Serve pre-rendered HTML to social crawlers so Open Graph / Twitter Card
// tags (set by React Helmet after JS loads) actually reach WhatsApp, Telegram,
// Twitter/X, and other bots that don't execute client-side JavaScript.

const { chromium } = require("playwright");

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://moviereact-zzye.onrender.com"
    : "http://localhost:5173");

let browser = null;

async function getBrowser() {
  if (browser) return browser;
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });
  return browser;
}

// User agents that need pre-rendered HTML (bots, crawlers, social previews).
const BOT_PATTERNS = [
  /whatsapp/i,
  /telegram/i,
  /twitterbot/i,
  /facebookexternalhit/i,
  /linkedinbot/i,
  /slackbot/i,
  /pinterest/i,
  /redditbot/i,
  /discordbot/i,
  /googlebot/i,
  /bingbot/i,
  /slurp/i,
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /applebot/i,
  /crawler/i,
  /spider/i,
  /bot\b/i,
];

function isBot(userAgent) {
  if (!userAgent) return false;
  return BOT_PATTERNS.some((re) => re.test(userAgent));
}

/**
 * Prerender a page by loading it in headless Chromium and returning the
 * fully-rendered HTML string. Falls back gracefully if Playwright fails.
 *
 * @param {string} path - e.g. "/watch/12345"
 * @returns {Promise<string|null>} rendered HTML or null on failure
 */
async function prerenderPage(path) {
  const url = `${FRONTEND_URL}${path}`;
  let page = null;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    // Wait a beat for Helmet to inject meta tags
    await page.waitForTimeout(1500);
    return await page.content();
  } catch (err) {
    console.warn(`[prerender] Failed for ${path}:`, err.message);
    return null;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (_) {
        /* ignore */
      }
    }
  }
}

async function closeBrowser() {
  if (browser) {
    try {
      await browser.close();
    } catch (err) {
      console.warn("[prerender] Browser close error:", err.message);
    }
    browser = null;
  }
}

module.exports = { isBot, prerenderPage, closeBrowser };