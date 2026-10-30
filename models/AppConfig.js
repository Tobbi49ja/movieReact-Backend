const mongoose = require('mongoose');

const externalLinkSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 200 },
    url: { type: String, trim: true, maxlength: 200 },
    kind: {
      type: String,
      enum: ['whatsapp', 'telegram', 'email', 'social', 'other'],
      default: 'other',
    },
  },
  { _id: false }
);

const appConfigSchema = new mongoose.Schema(
  {
    latestVersionName: { type: String, trim: true, maxlength: 200, default: '' },
    latestVersionCode: { type: Number, default: 1 },
    apkUrl: { type: String, trim: true, maxlength: 200, default: '' },
    updateNotice: { type: String, trim: true, maxlength: 200, default: '' },
    externalLinks: { type: [externalLinkSchema], default: [] },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

module.exports = mongoose.model('AppConfig', appConfigSchema);
