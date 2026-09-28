// server/Routes/nollywood.js
// Nigerian (Nollywood) content via TMDB — origin country filter
const express = require("express");
const router = express.Router();
const https = require("https");

const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

const fetchTMDB = (url) => {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
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
    const url = `${TMDB_BASE}/search/movie?api_key=${TMDB_KEY}&language=en-US&query=${encodeURIComponent(q)}&region=NG&page=${page}`;
    const data = await fetchTMDB(url);

    res.json({
      results: Array.isArray(data?.results) ? data.results : [],
      page: data?.page || page,
      total_pages: data?.total_pages || 1,
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