# Downloads — How It Works

The download pipeline resolves the **real** video stream URL (`.m3u8` or `.mp4`)
from a third-party embed page and pipes it to the browser as a downloadable
MP4 file.

## Architecture

```
Client (DownloadModal)
   ¦
   ?
GET /api/download/stream?tmdb=X&type=movie|tv&s=1&e=1&source=vidsrc&filename=Title.mp4
   ¦
   +-? [cache hit?] ---? streamUrl (30 min TTL)
   ¦
   +-? [cache miss?] --? resolveStreamUrl()
                              ¦
                              ?
                         Playwright (Chromium)
                              ¦
                              ?
                    Sniffs network requests on the embed page
                              ¦
                              ?
                    First URL matching /\.(m3u8|mp4)(\?|$)/i
                              ¦
                              ?
                    If .mp4  ? pipe directly to client
                    If .m3u8 ? FFmpeg (HLS ? MP4) ? pipe to client
```

## Why the First Request Is Slow

1. **Browser launch** — Playwright spins up a headless Chromium instance on
   first use. This is cached at module scope (singleton) so subsequent requests
   reuse the same browser.
2. **Page navigation + JS execution** — the embed page runs its player JS, which
   fires the actual stream request. We wait up to 20s for this.
3. **FFmpeg spawn** — for HLS sources, FFmpeg must be launched to transcode
   on the fly.

After the first resolve, the stream URL is cached in an in-memory `Map` for
30 minutes. Subsequent requests for the same source/tmdb/season/episode are
instant.

## Environment Variables

| Variable               | Default        | Purpose                                              |
|------------------------|----------------|------------------------------------------------------|
| `PLAYWRIGHT_HEADLESS`  | `true`         | Set to `false` to run Chromium with a visible UI     |
| `FFMPEG_PATH`          | *(auto)*       | Override path to a custom FFmpeg binary              |
| `DEBUG=download:*`     | *(off)*        | Enables verbose logging in `streamResolver.js`       |

## Debugging

Enable debug logging:

```bash
DEBUG=download:* node server.js
```

You will see:
- The embed URL being navigated to
- Every candidate stream URL sniffed from the network
- The final resolved stream URL
- FFmpeg command lines and lifecycle events

## Memory Notes

- **Browser singleton** — `getBrowser()` lazily creates one Chromium instance
  and reuses it across all requests. It is **never** garbage-collected while
  the process runs.
- **Page-per-request** — each `resolveStreamUrl` call opens a new page and
  closes it before returning. This keeps memory bounded.
- **Stream cache** — `streamCache` is a plain `Map` with no automatic expiry.
  Entries are valid for 30 minutes; after that they are re-resolved. Consider
  adding a periodic sweep if you expect many unique titles.
- **FFmpeg concurrency** — limited to 2 simultaneous jobs via `p-limit`.

## Shutdown

`server.js` registers `SIGINT` and `SIGTERM` handlers that call
`closeBrowser()` before exiting. This prevents dangling Chromium processes.

## Common Failure Modes

| Symptom                          | Likely Cause                                        |
|----------------------------------|-----------------------------------------------------|
| 404 "Could not resolve stream"   | Embed site changed its URL structure, or blocks the headless browser |
| 404 "Could not resolve stream"   | Timeout (20s) — the embed page is slow or JS-heavy |
| 500 "HLS to MP4 conversion failed" | FFmpeg missing, corrupt HLS, or TSL/SSL issue on the upstream |
| 502 "Upstream stream unavailable"  | The resolved `.mp4` URL returned a non-200 status    |
| Download starts but is HTML      | The sniffed URL was not actually a stream — increase `waitForTimeout` or refine `STREAM_RE` |

## Supported Sources

| `source` value | Embed URL pattern (movie / tv) |
|----------------|-------------------------------|
| `vidsrc`       | `vidsrc.xyz/embed/movie?tmdb=` / `vidsrc.xyz/embed/tv?tmdb=` |
| `2embed`       | `www.2embed.cc/embed/` / `www.2embed.cc/embedtv/` |
| `multiembed`   | `multiembed.mov/direct-download?tmdb=` |
| `vidsrcpro`    | `vidsrc.pro/embed/movie/` / `vidsrc.pro/embed/tv/` |
