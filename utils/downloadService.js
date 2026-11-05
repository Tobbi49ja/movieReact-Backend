const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');

const DOWNLOAD_ROOT = path.resolve(__dirname, '../downloads');
const DOWNLOAD_STATE_FILE = path.resolve(__dirname, '../data/downloads.json');
const state = new Map();

async function ensureStorage() {
  await fs.mkdir(path.dirname(DOWNLOAD_STATE_FILE), { recursive: true });
  await fs.mkdir(DOWNLOAD_ROOT, { recursive: true });

  try {
    const raw = await fs.readFile(DOWNLOAD_STATE_FILE, 'utf8');
    if (!raw.trim()) {
      state.clear();
      return;
    }

    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.downloads || [];
    state.clear();
    for (const item of list) {
      if (item && item.id) {
        state.set(item.id, item);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Failed to load download state:', error.message);
    }
    state.clear();
  }
}

async function persistState() {
  await fs.mkdir(path.dirname(DOWNLOAD_STATE_FILE), { recursive: true });
  const payload = Array.from(state.values()).sort((a, b) => {
    return new Date(b.startedAt || 0) - new Date(a.startedAt || 0);
  });
  await fs.writeFile(DOWNLOAD_STATE_FILE, JSON.stringify(payload, null, 2));
}

function normalizeUrl(rawUrl) {
  const candidate = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!candidate) {
    throw new Error('A valid media URL is required.');
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Media URL is malformed.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are allowed.');
  }

  return parsed.toString();
}

function sanitizeTitle(rawTitle) {
  const value = String(rawTitle || 'download').trim();
  const cleaned = value
    .replace(/[\\/<>:"|?*\x00-\x1F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || 'download';
}

function toSafeSlug(value) {
  const base = sanitizeTitle(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return base || 'download';
}

function resolveDownloadDirectory(requestedDir) {
  const baseRoot = path.resolve(DOWNLOAD_ROOT);
  const candidate = requestedDir && String(requestedDir).trim() ? requestedDir : baseRoot;

  let resolved = path.resolve(candidate);
  if (!resolved.startsWith(baseRoot)) {
    resolved = path.resolve(baseRoot, path.basename(candidate) || 'downloads');
  }

  return resolved;
}

function relativeWithinBase(fullPath) {
  const absolute = path.resolve(fullPath);
  const relative = path.relative(DOWNLOAD_ROOT, absolute);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.replace(/\\/g, '/');
  }
  return path.basename(absolute);
}

function resolveSafeTargetWithinDownloads(candidate) {
  if (!candidate) return null;

  const maybeRelative = String(candidate).trim();
  if (!maybeRelative) return null;

  const resolved = path.resolve(DOWNLOAD_ROOT, maybeRelative);
  if (!resolved.startsWith(DOWNLOAD_ROOT)) {
    return null;
  }

  return resolved;
}

function findMainFile(baseDir, preferredName) {
  const entries = fsSync.existsSync(baseDir) ? fsSync.readdirSync(baseDir, { withFileTypes: true }) : [];
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(baseDir, entry.name))
    .filter((entry) => {
      const lower = entry.toLowerCase();
      return /(\.(mp4|mkv|webm|avi|mov|m4v|flv))$/i.test(lower) || lower.includes('download');
    })
    .sort((a, b) => fsSync.statSync(b).size - fsSync.statSync(a).size);

  if (!files.length) {
    return '';
  }

  if (preferredName) {
    const direct = files.find((file) => path.basename(file).startsWith(preferredName));
    if (direct) {
      return direct;
    }
  }

  return files[0];
}

function findSubtitleFiles(baseDir, preferredName) {
  if (!fsSync.existsSync(baseDir)) {
    return [];
  }

  return fsSync.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(baseDir, entry.name))
    .filter((file) => {
      const lower = file.toLowerCase();
      return /\.(vtt|srt|ass|ssa|sub)$/i.test(lower) && (!preferredName || lower.includes(preferredName.toLowerCase()));
    })
    .sort();
}

function parseProgressLine(line) {
  const percentageMatch = line.match(/(\d{1,3}(?:\.\d+)?)%/);
  const speedMatch = line.match(/at\s+([\d.]+)\s*(KiB|MiB|GiB|kB|MB|GB|B)\s*\/s/i);
  const sizeMatch = line.match(/of\s+([\d.]+)\s*(KiB|MiB|GiB|kB|MB|GB|B)/i);

  return {
    percentage: percentageMatch ? Number(percentageMatch[1]) : null,
    speed: speedMatch ? `${speedMatch[1]} ${speedMatch[2]}/s` : null,
    size: sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : null,
  };
}

function getExecutable() {
  const envPath = process.env.YT_DLP_PATH || process.env.YT_DLP_BIN;
  const candidates = [];

  if (envPath) {
    candidates.push({ command: envPath, args: [] });
  }

  candidates.push(
    { command: 'yt-dlp', args: [] },
    { command: 'yt-dlp.exe', args: [] },
    { command: 'yt-dlp.cmd', args: [] },
    { command: 'py', args: ['-m', 'yt_dlp'] },
    { command: 'python', args: ['-m', 'yt_dlp'] },
    { command: 'python3', args: ['-m', 'yt_dlp'] },
  );

  for (const candidate of candidates) {
    try {
      const args = [...candidate.args, '--version'];
      const result = spawnSync(candidate.command, args, { stdio: 'ignore' });
      if (result.status === 0) {
        return candidate;
      }
    } catch (error) {
      // ignore and continue
    }
  }

  return null;
}

function normalizeQualityPreference(rawQuality) {
  const quality = String(rawQuality || 'best').trim().toLowerCase();
  const mapped = {
    best: { label: 'best', maxHeight: null },
    '2160p': { label: '2160p', maxHeight: 2160 },
    '1440p': { label: '1440p', maxHeight: 1440 },
    '1080p': { label: '1080p', maxHeight: 1080 },
    '720p': { label: '720p', maxHeight: 720 },
    '480p': { label: '480p', maxHeight: 480 },
    '360p': { label: '360p', maxHeight: 360 },
    '240p': { label: '240p', maxHeight: 240 },
  };

  return mapped[quality] || mapped.best;
}

function normalizeSubtitleList(rawSubtitles) {
  if (Array.isArray(rawSubtitles)) {
    return rawSubtitles
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof rawSubtitles === 'string') {
    return rawSubtitles
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

async function persistJob(job) {
  state.set(job.id, job);
  await persistState();
}

async function createDownloadJob(payload) {
  await ensureStorage();

  const mediaUrl = normalizeUrl(payload?.m3u8Url || payload?.mediaUrl || payload?.url);
  const title = sanitizeTitle(payload?.title || payload?.name || 'download');
  const requestedDownloadPath = payload?.downloadPath || DOWNLOAD_ROOT;
  const safeDir = resolveDownloadDirectory(requestedDownloadPath);
  const subtitleLanguages = normalizeSubtitleList(payload?.subtitles || payload?.subtitleLanguages || payload?.subtitlePreference);
  const qualityPreference = normalizeQualityPreference(payload?.quality || payload?.qualityPreference);
  const safeTitle = toSafeSlug(title);

  await fs.mkdir(safeDir, { recursive: true });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const job = {
    id,
    name: title,
    m3u8Url: mediaUrl,
    downloadPath: path.relative(DOWNLOAD_ROOT, safeDir).replace(/\\/g, '/') || 'downloads',
    filePath: '',
    status: 'queued',
    progress: 0,
    size: '0 B',
    speed: '0 B/s',
    startedAt: now,
    completedAt: null,
    subtitles: subtitleLanguages,
    subtitlePaths: [],
    lastMessage: 'Queued for download',
    mediaId: payload?.mediaId || null,
    mediaType: payload?.mediaType || null,
    quality: qualityPreference.label,
    resolvedPath: safeDir,
  };

  await persistJob(job);

  return { job, safeDir, safeTitle, subtitleLanguages, qualityPreference };
}

async function finalizeDownloadJob(job, safeDir, safeTitle, exitCode, finalError, lastNonEmptyLine) {
  const downloadedFile = findMainFile(safeDir, safeTitle);
  const subtitleFiles = findSubtitleFiles(safeDir, safeTitle);

  if (exitCode === 0 && downloadedFile) {
    const stats = fsSync.statSync(downloadedFile);
    job.status = 'completed';
    job.filePath = relativeWithinBase(downloadedFile);
    job.progress = 100;
    job.size = stats.size ? `${(stats.size / (1024 * 1024)).toFixed(2)} MB` : job.size;
    job.speed = '0 B/s';
    job.lastMessage = 'Download complete';
    job.subtitlePaths = subtitleFiles.map((file) => relativeWithinBase(file));
    job.completedAt = new Date().toISOString();
  } else {
    job.status = 'failed';
    job.lastMessage = finalError || lastNonEmptyLine || 'Download failed';
    job.completedAt = new Date().toISOString();
    if (!job.filePath && downloadedFile) {
      job.filePath = relativeWithinBase(downloadedFile);
    }
  }

  await persistJob(job);
  return job;
}

async function startDownload(payload) {
  const { job, safeDir, safeTitle, subtitleLanguages, qualityPreference } = await createDownloadJob(payload);

  const downloader = getExecutable();
  if (!downloader) {
    job.status = 'failed';
    job.lastMessage = 'yt-dlp is not installed or not available in PATH or Python environment.';
    job.completedAt = new Date().toISOString();
    await persistJob(job);
    return job;
  }

  const outputTemplate = path.join(safeDir, `${safeTitle}.%(ext)s`);
  const formatExpression = qualityPreference.maxHeight
    ? `bestvideo[height<=${qualityPreference.maxHeight}]+bestaudio/best[height<=${qualityPreference.maxHeight}]/best`
    : 'bestvideo+bestaudio/best';

  const args = [
    '--no-warnings',
    '--newline',
    '--ignore-config',
    '--restrict-filenames',
    '--output', outputTemplate,
    '--format', formatExpression,
    '--merge-output-format', 'mp4',
  ];

  if (subtitleLanguages.length) {
    args.push('--write-subs', '--sub-langs', subtitleLanguages.join(','), '--convert-subs', 'vtt');
  }

  args.push(job.m3u8Url);

  let child;
  try {
    const spawnArgs = [...downloader.args, ...args];
    child = spawn(downloader.command, spawnArgs, { cwd: safeDir, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    job.status = 'failed';
    job.lastMessage = error.message;
    job.completedAt = new Date().toISOString();
    await persistJob(job);
    return job;
  }

  job.status = 'downloading';
  job.lastMessage = 'Downloading stream...';
  await persistJob(job);

  let lastNonEmptyLine = '';
  let finalError = '';

  const onData = async (chunk) => {
    const text = chunk.toString();
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
      if (!line || !line.trim()) continue;
      lastNonEmptyLine = line.trim();

      const parsed = parseProgressLine(line);
      if (parsed.percentage !== null) {
        job.progress = Math.min(100, Math.max(0, Math.round(parsed.percentage)));
      }
      if (parsed.size) {
        job.size = parsed.size;
      }
      if (parsed.speed) {
        job.speed = parsed.speed;
      }
      job.lastMessage = lastNonEmptyLine;
      await persistJob(job);
    }
  };

  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('error', async (error) => {
    finalError = error.message;
    await finalizeDownloadJob(job, safeDir, safeTitle, 1, finalError, lastNonEmptyLine);
  });

  child.on('close', async (exitCode) => {
    await finalizeDownloadJob(job, safeDir, safeTitle, exitCode, finalError, lastNonEmptyLine);
  });

  return job;
}

async function listDownloads() {
  await ensureStorage();
  return Array.from(state.values()).map((job) => ({
    ...job,
    downloadPath: String(job.downloadPath || 'downloads'),
    filePath: job.filePath || '',
    subtitlePaths: Array.isArray(job.subtitlePaths) ? job.subtitlePaths : [],
  }));
}

async function deleteDownload(id) {
  await ensureStorage();
  const job = state.get(id);
  if (!job) {
    return null;
  }

  const targets = [];
  if (job.filePath) {
    const fileTarget = resolveSafeTargetWithinDownloads(job.filePath);
    if (fileTarget) targets.push(fileTarget);
  }

  if (Array.isArray(job.subtitlePaths) && job.subtitlePaths.length) {
    for (const subtitlePath of job.subtitlePaths) {
      const target = resolveSafeTargetWithinDownloads(subtitlePath);
      if (target) targets.push(target);
    }
  }

  for (const target of targets) {
    if (fsSync.existsSync(target)) {
      await fs.unlink(target).catch(() => {});
    }
  }

  state.delete(id);
  await persistState();
  return { ok: true };
}

async function clearDownloads() {
  await ensureStorage();
  const targets = [];

  for (const job of state.values()) {
    if (job.filePath) {
      const target = resolveSafeTargetWithinDownloads(job.filePath);
      if (target) targets.push(target);
    }

    if (Array.isArray(job.subtitlePaths)) {
      for (const subtitlePath of job.subtitlePaths) {
        const target = resolveSafeTargetWithinDownloads(subtitlePath);
        if (target) targets.push(target);
      }
    }
  }

  for (const target of targets) {
    if (fsSync.existsSync(target)) {
      await fs.unlink(target).catch(() => {});
    }
  }

  state.clear();
  await persistState();
  return { ok: true };
}

module.exports = {
  listDownloads,
  startDownload,
  deleteDownload,
  clearDownloads,
  ensureStorage,
};
