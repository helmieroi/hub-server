/**
 * posStore — in-memory registry of connected POS Desktop clients
 * Structure: { [xPosCode]: { socketId, socket, connectedAt, storeInfo } }
 */

const store = {};

module.exports = {
  // Register POS when it connects
  register(xPosCode, socket, storeInfo = {}) {
    store[xPosCode] = {
      socketId: socket.id,
      socket,
      connectedAt: new Date(),
      storeInfo,
    };
    console.log(`🏪 POS registered → xPosCode=${xPosCode}`);
  },

  // Remove POS when it disconnects.
  // Pass the disconnecting socket's id: we only delete the slot if it still
  // belongs to THAT socket. This prevents a slow-dying old connection from
  // evicting a newer one that already reconnected (the "ghost connection" bug).
  unregister(xPosCode, socketId = null) {
    const entry = store[xPosCode];
    if (!entry) return false;
    if (socketId && entry.socketId !== socketId) {
      // A newer socket already took this slot — leave it alone.
      console.log(`↪️  stale disconnect ignored → xPosCode=${xPosCode}`);
      return false;
    }
    delete store[xPosCode];
    console.log(`❌ POS unregistered → xPosCode=${xPosCode}`);
    return true;
  },

  // Get POS socket by xPosCode
  get(xPosCode) {
    return store[xPosCode] || null;
  },

  // Check if POS is online
  isOnline(xPosCode) {
    return !!store[xPosCode];
  },

  // Get all connected POS
  getAll() {
    return Object.entries(store).map(([xPosCode, data]) => ({
      xPosCode,
      socketId: data.socketId,
      connectedAt: data.connectedAt,
      storeInfo: data.storeInfo,
    }));
  },

  // Find xPosCode by socketId (for disconnect handler)
  findBySocketId(socketId) {
    const entry = Object.entries(store).find(
      ([, data]) => data.socketId === socketId
    );
    return entry ? entry[0] : null;
  },
};
