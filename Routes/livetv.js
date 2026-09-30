// server/Routes/livetv.js
// Live TV channels via iptv-org free M3U playlists
const express = require("express");
const router = express.Router();
const https = require("https");

const CATEGORIES = {
  sports: "https://iptv-org.github.io/iptv/categories/sports.m3u",
  kids: "https://iptv-org.github.io/iptv/categories/kids.m3u",
  news: "https://iptv-org.github.io/iptv/categories/news.m3u",
  documentary: "https://iptv-org.github.io/iptv/categories/documentary.m3u",
  entertainment: "https://iptv-org.github.io/iptv/categories/entertainment.m3u",
  nigerian: "https://iptv-org.github.io/iptv/countries/ng.m3u",
};

// In-memory cache: { [category]: { channels, timestamp } }
const cache = {};
const TTL = 60 * 60 * 1000; // 1 hour

const fetchText = (url) => {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Tobbihub/1.0" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchText(res.headers.location).then(resolve, reject);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`iptv-org HTTP ${res.statusCode}`));
        }

        res.setEncoding("utf8");
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
};

function parseM3U(text) {
  const lines = text.split("\n");
  const channels = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("#EXTINF")) {
      const nameMatch = lines[i].match(/tvg-name="([^"]+)"/);
      const logoMatch = lines[i].match(/tvg-logo="([^"]+)"/);
      const groupMatch = lines[i].match(/group-title="([^"]+)"/);
      const url = lines[i + 1]?.trim();
      if (url && !url.startsWith("#")) {
        channels.push({
          name: nameMatch?.[1] || "Unknown",
          logo: logoMatch?.[1] || "",
          group: groupMatch?.[1] || "",
          url,
        });
      }
    }
  }
  return channels.filter((c) => c.url && c.logo);
}

async function getChannels(category) {
  const now = Date.now();
  const cached = cache[category];
  if (cached && now - cached.timestamp < TTL) {
    return cached.channels;
  }

  const text = await fetchText(CATEGORIES[category]);
  const channels = parseM3U(text);
  cache[category] = { channels, timestamp: now };
  return channels;
}

// -----------------------------
// GET /api/livetv/categories
// -----------------------------
router.get("/categories", (req, res) => {
  try {
    res.json({ categories: Object.keys(CATEGORIES) });
  } catch (err) {
    console.error("Live TV categories error:", err.message);
    res.status(500).json({ error: "Failed to list categories" });
  }
});

// -----------------------------
// GET /api/livetv/channels?category=sports&page=1&limit=24
// -----------------------------
router.get("/channels", async (req, res) => {
  const category = (req.query.category || "sports").toLowerCase();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 24));

  if (!CATEGORIES[category]) {
    return res.status(400).json({ error: `Invalid category. Valid: ${Object.keys(CATEGORIES).join(", ")}` });
  }

  try {
    const channels = await getChannels(category);
    const total = channels.length;
    const start = (page - 1) * limit;

    res.json({
      channels: channels.slice(start, start + limit),
      total,
      page,
      category,
    });
  } catch (err) {
    console.error("Live TV channels error:", err.message);
    res.status(500).json({ error: "Failed to fetch live TV channels" });
  }
});

// -----------------------------
// GET /api/livetv/search?q=ESPN
// Searches every cached/fetched category
// -----------------------------
router.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim().slice(0, 100);

  if (!q) {
    return res.status(400).json({ error: "Search query (q) is required" });
  }

  try {
    const results = await Promise.all(
      Object.keys(CATEGORIES).map((cat) =>
        getChannels(cat).catch(() => [])
      )
    );

    const seen = new Set();
    const channels = [];
    for (const list of results.flat()) {
      const key = `${list.name}|${list.url}`;
      if (seen.has(key)) continue;
      if (list.name.toLowerCase().includes(q.toLowerCase())) {
        seen.add(key);
        channels.push(list);
      }
    }

    res.json({ channels, total: channels.length });
  } catch (err) {
    console.error("Live TV search error:", err.message);
    res.status(500).json({ error: "Failed to search live TV channels" });
  }
});

module.exports = router;
