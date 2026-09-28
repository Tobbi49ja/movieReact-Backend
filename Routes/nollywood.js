// server/Routes/nollywood.js
// Nigerian (Nollywood) content via TMDB — origin country filter
const express = require("express");
const router = express.Router();
const https = require("https");

const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

if (!TMDB_KEY) {
  console.warn("⚠️  TMDB_API_KEY is not set — Nollywood routes will fail");
}

const fetchTMDB = (url) => {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        // TMDB returns non-200 for auth/rate-limit errors — surface them
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            reject(new Error(`TMDB HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          });
          return;
        }

        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            // TMDB wraps errors in { status_code, status_message }
            if (parsed.status_code && parsed.status_message) {
              reject(new Error(`TMDB error [${parsed.status_code}]: ${parsed.status_message}`));
              return;
            }
            resolve(parsed);
          } catch (err) {
            reject(new Error("Invalid TMDB response"));
          }
        });
      })
      .on("error", reject);
  });
};

// -----------------------------
// GET /api/nollywood/trending
// Nigerian movies sorted by popularity
// -----------------------------
router.get("/trending", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);

  try {
    const url = `${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=en-US&with_origin_country=NG&sort_by=popularity.desc&page=${page}`;
    const data = await fetchTMDB(url);

    res.json({
      results: Array.isArray(data?.results) ? data.results : [],
      page: data?.page || page,
      total_pages: data?.total_pages || 1,
      source: "tmdb-ng",
    });
  } catch (err) {
    console.error("Nollywood trending error:", err.message);
    res.status(500).json({ error: "Failed to fetch Nollywood trending movies" });
  }
});

// -----------------------------
// GET /api/nollywood/search?q=&page=
// Search Nigerian movies by query
// -----------------------------
router.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim().slice(0, 100);
  const page = Math.max(1, parseInt(req.query.page) || 1);

  if (!q) {
    return res.status(400).json({ error: "Search query (q) is required" });
  }

  try {
    // Search movies first. If fewer than 3 results, also search TV shows
    // filtered by origin country NG so Nigerian series (e.g. "Ordinary People")
    // surface alongside Nollywood films. Merge and deduplicate by id.
    const movieUrl = `${TMDB_BASE}/search/movie?api_key=${TMDB_KEY}&language=en-US&query=${encodeURIComponent(q)}&page=${page}`;
    const movieData = await fetchTMDB(movieUrl);
    const movieResults = Array.isArray(movieData?.results) ? movieData.results : [];

    let merged = movieResults.map((m) => ({ ...m, media_type: "movie" }));

    if (merged.length < 3) {
      try {
        const tvUrl = `${TMDB_BASE}/search/tv?api_key=${TMDB_KEY}&language=en-US&query=${encodeURIComponent(q)}&page=${page}`;
        const tvData = await fetchTMDB(tvUrl);
        const tvResults = Array.isArray(tvData?.results) ? tvData.results : [];
        const tvMapped = tvResults.map((t) => ({ ...t, media_type: "tv" }));

        // Merge and deduplicate by id (movies and TV use separate id spaces, so
        // we key by `${media_type}:${id}` to avoid collisions)
        const seen = new Set(merged.map((m) => `${m.media_type}:${m.id}`));
        for (const t of tvMapped) {
          const k = `${t.media_type}:${t.id}`;
          if (!seen.has(k)) {
            seen.add(k);
            merged.push(t);
          }
        }
      } catch (tvErr) {
        // TV search failed — return what we have from movies only
        console.warn("Nollywood TV search fallback failed:", tvErr.message);
      }
    }

    res.json({
      results: merged,
      page: movieData?.page || page,
      total_pages: movieData?.total_pages || 1,
      source: "tmdb-ng",
    });
  } catch (err) {
    console.error("Nollywood search error:", err.message);
    res.status(500).json({ error: "Failed to search Nollywood movies" });
  }
});

// -----------------------------
// GET /api/nollywood/:id
// Fetch full movie detail by TMDB id
// -----------------------------
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: "Invalid movie id — must be numeric" });
  }

  try {
    const url = `${TMDB_BASE}/movie/${id}?api_key=${TMDB_KEY}&language=en-US&append_to_response=credits`;
    const data = await fetchTMDB(url);

    if (!data || !data.id) {
      return res.status(404).json({ error: "Nollywood movie not found" });
    }

    res.json({ ...data, source: "tmdb-ng" });
  } catch (err) {
    console.error("Nollywood detail error:", err.message);
    res.status(500).json({ error: "Failed to fetch Nollywood movie details" });
  }
});

module.exports = router;