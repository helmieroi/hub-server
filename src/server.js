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
});

setupSocket(io);

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🚀 Hub Server running on port ${PORT}`);
  console.log(`📡 Socket.io ready`);
  console.log(`🔗 REST API ready`);
});
