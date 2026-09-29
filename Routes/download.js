// server/Routes/download.js
// Download route: returns external embed source targets for a movie or TV
// episode. No server-side proxying or stream resolution.
const express = require("express");
const router = express.Router();

/**
 * GET /api/download/options
 * Returns external embed source targets for a movie or TV episode.
 * Clients open `externalUrl` in a new tab — no server-side proxying.
 */
router.get("/options", (req, res) => {
  const { tmdbId, tmdb: tmdbShort, type = "movie", season = 1, episode = 1, title = "Movie" } = req.query;
  const tmdb = tmdbId || tmdbShort;

  if (!tmdb) {
    return res.status(400).json({ error: "Missing tmdbId parameter" });
  }

  const isTv = type === "tv";

  // External embed sources — opened directly by the client in a new tab.
  const options = [
    {
      id: "vidsrc-vip",
      name: "VidSrc Direct Stream",
      quality: "1080p Full HD",
      speed: "Ultra Fast",
      badge: "1080p HD",
      type: "external",
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
      type: "external",
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
      type: "external",
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
      type: "external",
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

module.exports = router;
