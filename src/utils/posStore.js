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

  // Remove POS when it disconnects
  unregister(xPosCode) {
    delete store[xPosCode];
    console.log(`❌ POS unregistered → xPosCode=${xPosCode}`);
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
