# Downloads

This server now uses a trusted backend downloader flow instead of browser-only streaming.

## Architecture

```
Browser / client
  -> POST /api/downloads/start
  -> backend validates URL and title
  -> spawn yt-dlp (trusted binary, no shell execution)
  -> save file under server/downloads/
  -> parse stdout/stderr progress
  -> persist status in JSON state file
  -> expose state via GET /api/downloads
```

## API

- `GET /api/downloads` — list all tracked downloads
- `POST /api/downloads/start` — start a backend download
- `DELETE /api/downloads/:id` — delete a single download and its sidecar subtitle files
- `POST /api/downloads/clear` — delete all downloads

## Payload

```json
{
  "m3u8Url": "https://example.com/playlist.m3u8",
  "title": "My Movie",
  "downloadPath": "downloads",
  "mediaId": "123",
  "mediaType": "movie",
  "quality": "720p",
  "subtitles": ["en", "es"]
}
```

Supported quality values are `best`, `1080p`, `720p`, `480p`, `360p`, and `240p`.
The backend uses the selected quality preference to choose yt-dlp's format string while preserving a safe MP4 output.

## Security rules

- Only `http` and `https` URLs are accepted.
- The URL is validated before it is used.
- The target download directory is restricted to the server's `downloads/` area.
- Filenames are sanitized before writing.
- No raw shell execution is used; the downloader is invoked directly with `spawn()`.
- Client responses expose relative paths rather than full local filesystem paths.

## Runtime requirements

The downloader expects a working `yt-dlp` binary in PATH.

Check it with:

```bash
yt-dlp --version
```

If `yt-dlp` is not installed, the server returns a clear validation error instead of silently failing.

## Storage

Download state is saved to `server/data/downloads.json` and the files themselves are stored under `server/downloads/`.
This keeps a lightweight persisted job list without exposing unsafe user paths.

## Progress tracking

The service reads downloader stdout/stderr, extracts progress information, and updates:

- `status`
- `progress`
- `size`
- `speed`
- `lastMessage`

## Subtitles

When subtitle languages are supplied, the downloader writes sidecar subtitle files next to the video.
The route records those paths and removes them safely when a download is deleted.
