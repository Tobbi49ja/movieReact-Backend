const { listDownloads, startDownload, deleteDownload, clearDownloads } = require('../utils/downloadService');

async function getDownloads(req, res) {
  try {
    const downloads = await listDownloads();
    res.json(downloads);
  } catch (error) {
    console.error('Get downloads error:', error);
    res.status(500).json({ message: 'Failed to fetch downloads', error: error.message });
  }
}

async function startDownloads(req, res) {
  try {
    const payload = req.body || {};
    const download = await startDownload(payload);

    if (download.status === 'failed' && download.lastMessage && download.lastMessage.toLowerCase().includes('not installed')) {
      return res.status(400).json({ message: download.lastMessage, download });
    }

    if (download.status === 'failed' && download.lastMessage && download.lastMessage.toLowerCase().includes('valid media url')) {
      return res.status(400).json({ message: download.lastMessage, download });
    }

    res.status(201).json(download);
  } catch (error) {
    console.error('Start download error:', error);
    res.status(400).json({ message: error.message || 'Unable to start download' });
  }
}

async function removeDownload(req, res) {
  try {
    const { id } = req.params;
    const result = await deleteDownload(id);

    if (!result) {
      return res.status(404).json({ message: 'Download not found' });
    }

    res.json({ success: true, message: 'Download removed' });
  } catch (error) {
    console.error('Remove download error:', error);
    res.status(500).json({ message: 'Failed to remove download', error: error.message });
  }
}

async function clearAllDownloads(req, res) {
  try {
    const result = await clearDownloads();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Clear downloads error:', error);
    res.status(500).json({ message: 'Failed to clear downloads', error: error.message });
  }
}

module.exports = {
  getDownloads,
  startDownloads,
  removeDownload,
  clearAllDownloads,
};
