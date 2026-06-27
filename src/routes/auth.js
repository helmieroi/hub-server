const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwtUtil = require("../utils/jwt");
const posStore = require("../utils/posStore");

/**
 * POST /api/auth/login
 * Login via username + password (Next.js Dashboard)
 * Body: { xPosCode, username, password }
 */
router.post("/login", async (req, res) => {
  try {
    const { xPosCode, username, password } = req.body;

    if (!xPosCode || !username || !password) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }

    // Check POS online
    const pos = posStore.get(xPosCode);
    if (!pos) {
      return res.status(404).json({
        success: false,
        error: `POS "${xPosCode}" est hors ligne`,
      });
    }

    // Ask POS to find user in its SQLite
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("POS timeout")), 8000);

      pos.socket.emit("server:getUser", { username });
      pos.socket.once("pos:userFound", (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });

    if (!result.user) {
      return res.status(401).json({ success: false, error: "User not found" });
    }

    if (result.user.status !== "ACTIVE") {
      return res.status(403).json({ success: false, error: "User is inactive" });
    }

    // Verify password
    const valid = await bcrypt.compare(password, result.user.password);
    if (!valid) {
      return res.status(401).json({ success: false, error: "Wrong password" });
    }

    // Generate token
    const token = jwtUtil.generate({
      userId: result.user.id,
      username: result.user.username,
      xPosCode,
      role: "dashboard",
      isDefault: result.user.isDefault,
    });

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: result.user.id,
          username: result.user.username,
          status: result.user.status,
          isDefault: result.user.isDefault,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/auth/qr
 * Login via QR token scan (POS Desktop)
 * Body: { token }
 */
router.post("/qr", (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: "Token required" });

    const payload = jwtUtil.verify(token);

    return res.json({
      success: true,
      data: {
        token, // same token, already valid
        user: {
          userId: payload.userId,
          username: payload.username,
          xPosCode: payload.xPosCode,
          isDefault: payload.isDefault,
        },
      },
    });
  } catch (err) {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
});

/**
 * GET /api/auth/verify
 * Verify token validity
 * Header: Authorization: Bearer <token>
 */
router.get("/verify", (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, error: "No token" });

    const payload = jwtUtil.verify(token);
    return res.json({ success: true, data: payload });
  } catch {
    return res.status(401).json({ success: false, error: "Invalid token" });
  }
});

module.exports = router;
