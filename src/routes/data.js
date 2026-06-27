const express = require("express");
const router = express.Router();
const jwtUtil = require("../utils/jwt");
const posStore = require("../utils/posStore");

// ── Auth middleware ───────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, error: "No token" });
    req.user = jwtUtil.verify(token);
    next();
  } catch {
    return res.status(401).json({ success: false, error: "Invalid token" });
  }
}

/**
 * Generic bridge: asks POS for data and waits for response
 * @param {string} requestType  - event name sent to POS
 * @param {object} payload      - data sent with the request
 * @param {object} pos          - POS socket entry from posStore
 */
function askPOS(pos, requestType, payload = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("POS did not respond in time"));
    }, 10000);

    pos.socket.emit("server:request", { type: requestType, payload });

    pos.socket.once(`pos:response:${requestType}`, (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

// Helper: get POS or return 404
function getPos(xPosCode, res) {
  const pos = posStore.get(xPosCode);
  if (!pos) {
    res.status(404).json({
      success: false,
      error: `POS "${xPosCode}" est hors ligne`,
    });
    return null;
  }
  return pos;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/data/:xPosCode/sales
 * Get sales list from POS SQLite
 */
router.get("/:xPosCode/sales", authMiddleware, async (req, res) => {
  const { xPosCode } = req.params;
  const { from, to, limit } = req.query;

  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const data = await askPOS(pos, "GET_SALES", { from, to, limit });
    res.json({ success: true, data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/data/:xPosCode/products
 * Get products list from POS SQLite
 */
router.get("/:xPosCode/products", authMiddleware, async (req, res) => {
  const { xPosCode } = req.params;
  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const data = await askPOS(pos, "GET_PRODUCTS", {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/data/:xPosCode/status
 * Get POS status (online/offline + basic info)
 */
router.get("/:xPosCode/status", authMiddleware, (req, res) => {
  const { xPosCode } = req.params;
  const pos = posStore.get(xPosCode);

  if (!pos) {
    return res.json({
      success: true,
      data: { online: false, xPosCode },
    });
  }

  res.json({
    success: true,
    data: {
      online: true,
      xPosCode,
      socketId: pos.socketId,
      connectedAt: pos.connectedAt,
      storeInfo: pos.storeInfo,
    },
  });
});

/**
 * GET /api/data/:xPosCode/users
 * Get WebUsers list from POS SQLite
 */
router.get("/:xPosCode/users", authMiddleware, async (req, res) => {
  const { xPosCode } = req.params;
  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const data = await askPOS(pos, "GET_USERS", {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/data/:xPosCode/users
 * Create new WebUser in POS SQLite
 */
router.post("/:xPosCode/users", authMiddleware, async (req, res) => {
  const { xPosCode } = req.params;
  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const data = await askPOS(pos, "CREATE_USER", req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/data/:xPosCode/users/:userId
 * Update WebUser status in POS SQLite
 */
router.patch("/:xPosCode/users/:userId", authMiddleware, async (req, res) => {
  const { xPosCode, userId } = req.params;
  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const data = await askPOS(pos, "UPDATE_USER", { userId, ...req.body });
    res.json({ success: true, data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/data/all/status
 * Get status of ALL connected POS
 */
router.get("/all/status", authMiddleware, (req, res) => {
  const all = posStore.getAll();
  res.json({ success: true, data: all });
});

module.exports = router;
