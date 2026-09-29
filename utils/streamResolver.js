// server/utils/streamResolver.js
// Server-side stream resolution is disabled. The download route now returns
// external embed URLs that the client opens directly in a new tab.
// This stub is kept so any legacy require() of this module fails loudly
// instead of silently doing nothing.
module.exports = {
  resolveStreamUrl: async () => {
    throw new Error("Stream resolver disabled — use external URLs");
  },
  closeBrowser: async () => {},
  getBrowser: async () => {
    throw new Error("Stream resolver disabled — use external URLs");
  },
};