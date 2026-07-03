require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const setupSocket = require("./socket/handler");
const registerRoute = require("./routes/register");
const authRoute     = require("./routes/auth");
const dataRoute     = require("./routes/data");

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;

// Behind Render / a VPS reverse proxy (nginx) we sit behind a load balancer.
// Trust it so client IPs / wss are detected correctly.
app.set("trust proxy", 1);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());

// ── REST Routes ───────────────────────────────────────────────────────────────
app.get("/", (_, res) => res.json({ status: "Hub Server 🚀", version: "1.0.0" }));

app.use("/api/register", registerRoute);
app.use("/api/auth",     authRoute);
app.use("/api/data",     dataRoute);

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },

  // Heartbeat — engine.io does ping/pong for us. Do NOT add manual setInterval
  // pings on top. These values: server sends a ping every 20s; if no pong comes
  // back within 25s the socket is considered dead and cleaned up automatically.
  // Tuned a little tighter than defaults so dead links are detected faster on
  // flaky café / mobile networks, while staying under typical proxy idle limits.
  pingInterval: 20000,
  pingTimeout:  25000,

  // Survive brief network drops without losing data. On a short disconnect the
  // session + any events emitted during the gap are restored on reconnect, so a
  // 2s blip no longer drops `pos:event` messages or marks the POS offline.
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  },

  // Reject absurd payloads instead of buffering them into a memory leak.
  maxHttpBufferSize: 2 * 1024 * 1024, // 2 MB
});

// Surface (don't crash on) engine-level connection errors.
io.engine.on("connection_error", (err) => {
  console.warn(`⚠️  engine connection_error: ${err.code} ${err.message}`);
});

setupSocket(io);

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🚀 Hub Server running on port ${PORT}`);
  console.log(`📡 Socket.io ready`);
  console.log(`🔗 REST API ready`);
});
// ── Keep-alive self-ping ───────────────────────────────────────────────────────
// Free hosts (Render, etc.) spin the app down after ~15 min of inactivity. Hit our
// own health endpoint every 10 min so the instance stays awake. No router needed —
// this is just a background timer that calls `/` on ourselves.
const KEEP_ALIVE_MS = 1 * 30 * 1000; // 10 minutes
const SELF_URL =
  process.env.RENDER_EXTERNAL_URL || "https://boot-keep-server-alive-1.onrender.com" ||
  process.env.SELF_URL ||
  `http://127.0.0.1:${PORT}`;

const keepAlive = setInterval(async () => {
  try {
    const res = await fetch(`${SELF_URL}/`);
    console.log(`💓 keep-alive ping → ${res.status} ${SELF_URL}`);
  } catch (err) {
    console.warn(`⚠️  keep-alive ping failed: ${err.message}`);
  }
}, KEEP_ALIVE_MS).unref();

// ── Resilience: never let one bad event take the whole hub down ────────────────
process.on("uncaughtException", (err) => {
  console.error("💥 uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("💥 unhandledRejection:", reason);
});

// ── Graceful shutdown (Render/VPS redeploys send SIGTERM) ──────────────────────
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — draining connections...`);

  // Ask all clients to disconnect cleanly so they reconnect to the new instance.
  io.close(() => console.log("📡 Socket.io closed"));
  server.close(() => {
    console.log("🛑 HTTP server closed — bye");
    process.exit(0);
  });

  // Hard cap so a stuck socket can't block the redeploy forever.
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
