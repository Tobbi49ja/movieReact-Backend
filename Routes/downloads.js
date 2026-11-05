const express = require('express');
const router = express.Router();
const {
  getDownloads,
  startDownloads,
  removeDownload,
  clearAllDownloads,
} = require('../controllers/downloads.controller');

router.get('/', getDownloads);
router.post('/start', startDownloads);
router.delete('/:id', removeDownload);
router.post('/clear', clearAllDownloads);

module.exports = router;
