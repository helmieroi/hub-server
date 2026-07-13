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

// ── Commercial documents (pièces commerciales) ────────────────────────────────

/**
 * GET /api/data/:xPosCode/tickets
 * Get paginated tickets list from POS SQLite
 * Query: page, limit, status, startDate, endDate
 */
router.get("/:xPosCode/tickets", authMiddleware, async (req, res) => {
  const { xPosCode } = req.params;
  const { page, limit, status, startDate, endDate } = req.query;

  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const data = await askPOS(pos, "GET_TICKETS", { page, limit, status, startDate, endDate });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

// ── Mouvements de caisse ──────────────────────────────────────────────────────

/**
 * GET /api/data/:xPosCode/sessions
 * Get sessions history from POS SQLite
 */
router.get("/:xPosCode/sessions", authMiddleware, async (req, res) => {
  const { xPosCode } = req.params;
  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const data = await askPOS(pos, "GET_SESSIONS_HISTORY", {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/data/:xPosCode/sessions/active
 * Get the currently active (open) session from POS SQLite
 */
router.get("/:xPosCode/sessions/active", authMiddleware, async (req, res) => {
  const { xPosCode } = req.params;
  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const data = await askPOS(pos, "GET_ACTIVE_SESSION", {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/data/:xPosCode/balance
 * Get caisse balance from POS SQLite
 * Query: startDate, endDate, session_id, hasSession
 */
router.get("/:xPosCode/balance", authMiddleware, async (req, res) => {
  const { xPosCode } = req.params;
  const { startDate, endDate, session_id, hasSession } = req.query;

  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const data = await askPOS(pos, "GET_BALANCE", { startDate, endDate, session_id, hasSession });
    res.json({ success: true, data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/data/:xPosCode/movements
 * Get caisse movements from POS SQLite
 * Query: startDate, endDate, types (comma-separated), session_id, hasSession
 */
router.get("/:xPosCode/movements", authMiddleware, async (req, res) => {
  const { xPosCode } = req.params;
  const { startDate, endDate, types, session_id, hasSession } = req.query;

  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const payload = {
      startDate,
      endDate,
      session_id,
      hasSession: hasSession !== undefined ? hasSession === "true" : undefined,
      types: types ? types.split(",") : undefined,
    };
    const data = await askPOS(pos, "GET_MOVEMENTS", payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/data/:xPosCode/movements
 * Create a caisse movement in POS SQLite
 * Body: { type, amount, reason, notes, session_id }
 */
router.post("/:xPosCode/movements", authMiddleware, async (req, res) => {
  const { xPosCode } = req.params;
  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const data = await askPOS(pos, "CREATE_MOVEMENT", req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/data/:xPosCode/movements/:movementId
 * Delete a caisse movement from POS SQLite
 */
router.delete("/:xPosCode/movements/:movementId", authMiddleware, async (req, res) => {
  const { xPosCode, movementId } = req.params;
  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const data = await askPOS(pos, "DELETE_MOVEMENT", { movementId });
    res.json({ success: true, data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

// ── Catalogue : catégories ─────────────────────────────────────────────────────

/**
 * GET /api/data/:xPosCode/categories
 * Get all categories from POS SQLite
 */
router.get("/:xPosCode/categories", authMiddleware, async (req, res) => {
  const { xPosCode } = req.params;
  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const data = await askPOS(pos, "GET_CATEGORIES", {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

// ── Statistiques (tableau de bord) ─────────────────────────────────────────────

/**
 * GET /api/data/:xPosCode/stats
 * Get dashboard stats from POS SQLite
 * Query: period = today | week | month
 */
router.get("/:xPosCode/stats", authMiddleware, async (req, res) => {
  const { xPosCode } = req.params;
  const { period } = req.query;
  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const data = await askPOS(pos, "GET_STATS", { period });
    res.json({ success: true, data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

// ── Menu public (QR) ───────────────────────────────────────────────────────────

/**
 * GET /api/data/:xPosCode/menu
 * PUBLIC (no auth) — active categories + available products for the QR menu.
 */
router.get("/:xPosCode/menu", async (req, res) => {
  const { xPosCode } = req.params;
  const pos = getPos(xPosCode, res);
  if (!pos) return;

  try {
    const data = await askPOS(pos, "GET_MENU", {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(503).json({ success: false, error: err.message });
  }
});

module.exports = router;
