const express = require("express");
const router = express.Router();

const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

const fetchTMDB = async (path, params = {}) => {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_KEY);
  url.searchParams.set("language", "en-US");
  Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
  const res = await fetch(url.toString());
  return res.json();
};

router.get("/movie/now_playing", async (req, res) => {
  try { res.json(await fetchTMDB("/movie/now_playing", { page: req.query.page })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/movie/popular", async (req, res) => {
  try { res.json(await fetchTMDB("/movie/popular", { page: req.query.page })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/movie/top_rated", async (req, res) => {
  try { res.json(await fetchTMDB("/movie/top_rated", { page: req.query.page })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/movie/upcoming", async (req, res) => {
  try { res.json(await fetchTMDB("/movie/upcoming", { page: req.query.page })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/movie/:id/videos", async (req, res) => {
  try { res.json(await fetchTMDB(`/movie/${req.params.id}/videos`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/movie/:id", async (req, res) => {
  try { res.json(await fetchTMDB(`/movie/${req.params.id}`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/tv/airing_today", async (req, res) => {
  try { res.json(await fetchTMDB("/tv/airing_today", { page: req.query.page })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/tv/popular", async (req, res) => {
  try { res.json(await fetchTMDB("/tv/popular", { page: req.query.page })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/tv/top_rated", async (req, res) => {
  try { res.json(await fetchTMDB("/tv/top_rated", { page: req.query.page })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/tv/:id/videos", async (req, res) => {
  try { res.json(await fetchTMDB(`/tv/${req.params.id}/videos`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/tv/:id/season/:season", async (req, res) => {
  try { res.json(await fetchTMDB(`/tv/${req.params.id}/season/${req.params.season}`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/tv/:id", async (req, res) => {
  try { res.json(await fetchTMDB(`/tv/${req.params.id}`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/discover/movie", async (req, res) => {
  try {
    res.json(await fetchTMDB("/discover/movie", {
      page: req.query.page,
      with_genres: req.query.with_genres,
      with_original_language: req.query.with_original_language,
      sort_by: req.query.sort_by
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/discover/tv", async (req, res) => {
  try {
    res.json(await fetchTMDB("/discover/tv", {
      page: req.query.page,
      with_original_language: req.query.with_original_language,
      sort_by: req.query.sort_by
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/search/movie", async (req, res) => {
  try {
    res.json(await fetchTMDB("/search/movie", {
      query: req.query.query,
      include_adult: false
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/search/tv", async (req, res) => {
  try {
    res.json(await fetchTMDB("/search/tv", {
      query: req.query.query,
      include_adult: false
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
