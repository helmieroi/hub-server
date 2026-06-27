const jwt = require("jsonwebtoken");
const posStore = require("../utils/posStore");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";

module.exports = function setupSocket(io) {
  // ── Auth middleware ─────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) return next(new Error("No token provided"));

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      socket.data.userId   = payload.userId;
      socket.data.username = payload.username;
      socket.data.xPosCode = payload.xPosCode;
      socket.data.role     = payload.role; // "pos" | "dashboard"
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  // ── Connection ──────────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const { xPosCode, role, username } = socket.data;
    console.log(`✅ [${role}] connected → xPosCode=${xPosCode} user=${username}`);

    // ── POS Desktop connects ──────────────────────────────────────────────
    if (role === "pos") {
      // Register in posStore
      posStore.register(xPosCode, socket, { username });

      // Join room for this store
      socket.join(`store_${xPosCode}`);

      // Notify dashboard this POS is now online
      io.to(`dashboard_${xPosCode}`).emit("pos:online", {
        xPosCode,
        connectedAt: new Date(),
      });

      // ── POS responds to data requests ───────────────────────────────
      // These are forwarded to Next.js via HTTP response (in data.js)
      // POS just needs to listen for "server:request" and emit back
      // "pos:response:<type>"

      // ── POS pushes live events (sales, etc.) ────────────────────────
      socket.on("pos:event", ({ type, data }) => {
        console.log(`📡 pos:event [${type}] xPosCode=${xPosCode}`);
        io.to(`dashboard_${xPosCode}`).emit("server:event", { type, data, xPosCode });
      });

      // ── POS disconnects ──────────────────────────────────────────────
      socket.on("disconnect", () => {
        posStore.unregister(xPosCode);
        io.to(`dashboard_${xPosCode}`).emit("pos:offline", { xPosCode });
        console.log(`❌ POS disconnected → xPosCode=${xPosCode}`);
      });
    }

    // ── Next.js Dashboard connects ────────────────────────────────────────
    if (role === "dashboard") {
      socket.join(`dashboard_${xPosCode}`);

      // Tell dashboard current POS status
      socket.emit("pos:status", {
        xPosCode,
        online: posStore.isOnline(xPosCode),
      });

      // Dashboard can send commands to POS
      socket.on("dashboard:command", ({ type, payload }) => {
        const pos = posStore.get(xPosCode);
        if (!pos) {
          socket.emit("error", { message: `POS "${xPosCode}" hors ligne` });
          return;
        }
        console.log(`📤 dashboard:command [${type}] → xPosCode=${xPosCode}`);
        pos.socket.emit("server:command", { type, payload });
      });

      socket.on("disconnect", () => {
        console.log(`❌ Dashboard disconnected → xPosCode=${xPosCode}`);
      });
    }
  });
};
