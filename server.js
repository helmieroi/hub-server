require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";
const PORT = process.env.PORT || 3001;

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());

// ─── In-memory store ─────────────────────────────────────────────────────────
// { storeId: { socketId, storeId, connectedAt } }
const posClients = {};

// ─── Socket.io setup ─────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ─── Middleware: JWT auth ─────────────────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) return next(new Error("No token provided"));

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.data.storeId = payload.storeId;
    socket.data.role = payload.role; // "pos" | "dashboard"
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});
// ── Keep-alive self-ping ───────────────────────────────────────────────────────
// Free hosts (Render, etc.) spin the app down after ~15 min of inactivity. Hit our
// own health endpoint every 10 min so the instance stays awake. No router needed —
// this is just a background timer that calls `/` on ourselves.
const KEEP_ALIVE_MS = 1 * 1 * 1000; // 10 minutes
const SELF_URL =
  process.env.RENDER_EXTERNAL_URL ||
  process.env.SELF_URL ||
  `http://127.0.0.1:${PORT}`;

setInterval(async () => {
  try {
    const res = await fetch(`${SELF_URL}/`);
    console.log(`💓 keep-alive ping → ${res.status}`);
  } catch (err) {
    console.warn(`⚠️  keep-alive ping failed: ${err.message}`);
  }
}, KEEP_ALIVE_MS).unref();

// ─── Connection handler ───────────────────────────────────────────────────────
io.on("connection", (socket) => {
  const { storeId, role } = socket.data;
  console.log(`✅ Connected [${role}] storeId=${storeId} socket=${socket.id}`);

  // POS Desktop connects
  if (role === "pos") {
    posClients[storeId] = { socketId: socket.id, storeId, connectedAt: new Date() };
    socket.join(`store_${storeId}`);
    console.log(`🏪 POS registered → store_${storeId}`);

    // Notify dashboard that POS is online
    io.to(`dashboard_${storeId}`).emit("pos:status", { storeId, online: true });
  }

  // Next.js Dashboard connects
  if (role === "dashboard") {
    socket.join(`dashboard_${storeId}`);
    console.log(`🖥️  Dashboard joined → dashboard_${storeId}`);

    // Tell dashboard if POS is already online
    const pos = posClients[storeId];
    socket.emit("pos:status", { storeId, online: !!pos });
  }

  // ── Dashboard → Server → POS (request data) ──────────────────────────────
  socket.on("dashboard:request", ({ type, payload }) => {
    const pos = posClients[storeId];
    if (!pos) {
      socket.emit("error", { message: "POS غير متصل" });
      return;
    }
    console.log(`📤 dashboard:request [${type}] → POS store_${storeId}`);
    io.to(pos.socketId).emit("server:request", { type, payload });
  });

  // ── POS → Server → Dashboard (send data back) ────────────────────────────
  socket.on("pos:response", ({ type, data }) => {
    console.log(`📥 pos:response [${type}] → dashboard_${storeId}`);
    io.to(`dashboard_${storeId}`).emit("server:response", { type, data });
  });

  // ── POS pushes event (sale, sync, etc.) ──────────────────────────────────
  socket.on("pos:event", ({ type, data }) => {
    console.log(`📡 pos:event [${type}] from store_${storeId}`);
    io.to(`dashboard_${storeId}`).emit("server:event", { type, data });
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    if (role === "pos" && posClients[storeId]?.socketId === socket.id) {
      delete posClients[storeId];
      io.to(`dashboard_${storeId}`).emit("pos:status", { storeId, online: false });
      console.log(`❌ POS disconnected → store_${storeId}`);
    }
    if (role === "dashboard") {
      console.log(`❌ Dashboard disconnected → store_${storeId}`);
    }
  });
});

// ─── REST API ─────────────────────────────────────────────────────────────────

// Health check
app.get("/", (req, res) => res.json({ status: "Hub Server running 🚀" }));


// POST /auth/token  body: { storeId: "1", role: "pos", secret: "ADMIN_SECRET" }
app.post("/auth/token", (req, res) => {
  const { storeId, role, secret } = req.body;

  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!["pos", "dashboard"].includes(role)) {
    return res.status(400).json({ error: "role must be pos or dashboard" });
  }

  const token = jwt.sign({ storeId, role }, JWT_SECRET, { expiresIn: "365d" });
  res.json({ token });
});

app.get("/status", (req, res) => {
  res.json({ connected_pos: Object.values(posClients) });
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🚀 Hub Server listening on port ${PORT}`);
});
