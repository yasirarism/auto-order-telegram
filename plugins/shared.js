function createSharedContext(baseScope) {
  const sharedState = {
    activeMessages: [],
    autoSyncPaused: false,
    lastProducts: [],
  };

  const scope = {
    ...baseScope,
    get activeMessages() { return sharedState.activeMessages; },
    set activeMessages(v) { sharedState.activeMessages = v; },
    get autoSyncPaused() { return sharedState.autoSyncPaused; },
    set autoSyncPaused(v) { sharedState.autoSyncPaused = v; },
    get lastProducts() { return sharedState.lastProducts; },
    set lastProducts(v) { sharedState.lastProducts = v; },
  };

  return scope;
}

module.exports = { createSharedContext };
