const express = require('express');
const router = express.Router();
const AppConfig = require('../models/AppConfig');
const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/adminOnly');

const DEFAULTS = {
  latestVersionName: '',
  latestVersionCode: 1,
  apkUrl: '',
  updateNotice: '',
  externalLinks: [],
  updatedAt: null,
};

const VALID_KINDS = ['whatsapp', 'telegram', 'email', 'social', 'other'];

function isUrlAllowed(u) {
  return (
    u.startsWith('https://') ||
    u.startsWith('mailto:') ||
    u.startsWith('tel:')
  );
}

function validate(body) {
  const errors = [];
  const strFields = ['latestVersionName', 'apkUrl', 'updateNotice'];
  for (const f of strFields) {
    if (body[f] !== undefined && body[f] !== null) {
      if (typeof body[f] !== 'string') {
        errors.push(`${f} must be a string`);
        continue;
      }
      const t = body[f].trim();
      if (t.length > 200) errors.push(`${f} max 200 chars`);
    }
  }
  if (body.latestVersionCode !== undefined && body.latestVersionCode !== null) {
    const v = body.latestVersionCode;
    if (!Number.isInteger(v) || v < 1) errors.push('versionCode must be integer >=1');
  }
  if (body.apkUrl !== undefined && body.apkUrl !== null) {
    const t = String(body.apkUrl).trim();
    if (t && !(t.startsWith('https://') || t.startsWith('/'))) {
      errors.push('apkUrl must start with https:// or /');
    }
  }
  if (body.externalLinks !== undefined && body.externalLinks !== null) {
    if (!Array.isArray(body.externalLinks)) {
      errors.push('externalLinks must be an array');
    } else {
      if (body.externalLinks.length > 20) errors.push('max 20 links');
      body.externalLinks.forEach((l, i) => {
        if (!l || typeof l !== 'object') {
          errors.push(`link ${i} invalid`);
          return;
        }
        if (l.label !== undefined && l.label !== null) {
          if (typeof l.label !== 'string') errors.push(`link ${i} label must be string`);
          else if (l.label.trim().length > 200) errors.push(`link ${i} label max 200 chars`);
        }
        if (l.url !== undefined && l.url !== null) {
          if (typeof l.url !== 'string') errors.push(`link ${i} url must be string`);
          else {
            const u = l.url.trim();
            if (u.length > 200) errors.push(`link ${i} url max 200 chars`);
            if (u && !isUrlAllowed(u)) errors.push(`link ${i} url must start with https://, mailto: or tel:`);
          }
        }
        if (l.kind !== undefined && l.kind !== null) {
          if (!VALID_KINDS.includes(l.kind)) errors.push(`link ${i} kind invalid`);
        }
      });
    }
  }
  return errors;
}

router.get('/', async (req, res) => {
  try {
    const doc = await AppConfig.findOne().sort({ updatedAt: -1 });
    res.setHeader('Cache-Control', 'public, max-age=60');
    if (!doc) {
      return res.json({ success: true, data: DEFAULTS, message: 'ok' });
    }
    return res.json({
      success: true,
      data: {
        latestVersionName: doc.latestVersionName,
        latestVersionCode: doc.latestVersionCode,
        apkUrl: doc.apkUrl,
        updateNotice: doc.updateNotice,
        externalLinks: doc.externalLinks,
        updatedAt: doc.updatedAt,
      },
      message: 'ok',
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, code: 500 });
  }
});

router.put('/', protect, adminOnly, async (req, res) => {
  const errors = validate(req.body || {});
  if (errors.length) {
    return res.status(400).json({ error: errors.join('; ') });
  }
  try {
    const b = req.body || {};
    const update = {};
    if (b.latestVersionName !== undefined) update.latestVersionName = String(b.latestVersionName).trim();
    if (b.latestVersionCode !== undefined) update.latestVersionCode = b.latestVersionCode;
    if (b.apkUrl !== undefined) update.apkUrl = String(b.apkUrl).trim();
    if (b.updateNotice !== undefined) update.updateNotice = String(b.updateNotice).trim();
    if (b.externalLinks !== undefined) {
      update.externalLinks = b.externalLinks.map((l) => ({
        label: l.label !== undefined && l.label !== null ? String(l.label).trim() : '',
        url: l.url !== undefined && l.url !== null ? String(l.url).trim() : '',
        kind: l.kind || 'other',
      }));
    }
    update.updatedAt = new Date();

    const doc = await AppConfig.findOneAndUpdate({}, update, {
      new: true,
      upsert: true,
      sort: { updatedAt: -1 },
    });
    return res.json({
      success: true,
      data: {
        latestVersionName: doc.latestVersionName,
        latestVersionCode: doc.latestVersionCode,
        apkUrl: doc.apkUrl,
        updateNotice: doc.updateNotice,
        externalLinks: doc.externalLinks,
        updatedAt: doc.updatedAt,
      },
      message: 'ok',
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, code: 500 });
  }
});

module.exports = router;
