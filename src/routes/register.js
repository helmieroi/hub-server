const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const jwtUtil = require("../utils/jwt");
const { generateQR } = require("../utils/qrcode");
const posStore = require("../utils/posStore");

/**
 * POST /api/register
 * Called from Next.js when a new POS is being registered
 * Body: { xPosCode, storeName, adminUsername, adminPassword }
 *
 * Flow:
 * 1. Check xPosCode exists (POS must be connected via WebSocket)
 * 2. Create default WebUser in POS SQLite (via Socket)
 * 3. Generate JWT token from default user params
 * 4. Generate QR code from token
 * 5. Return { user, token, qrCode }
 */
router.post("/", async (req, res) => {
  try {
    const { xPosCode, storeName, adminUsername, adminPassword } = req.body;

    // ── Validate input ────────────────────────────────────────────────────
    if (!xPosCode || !storeName || !adminUsername || !adminPassword) {
      return res.status(400).json({
        success: false,
        error: "xPosCode, storeName, adminUsername, adminPassword are required",
      });
    }

    // ── Check POS is connected ────────────────────────────────────────────
    const pos = posStore.get(xPosCode);
    if (!pos) {
      return res.status(404).json({
        success: false,
        error: `POS avec xPosCode="${xPosCode}" est hors ligne ou non connecté`,
      });
    }

    // ── Hash password ─────────────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // ── Build default user payload ────────────────────────────────────────
    const defaultUser = {
      id: uuidv4(),
      username: adminUsername,
      password: hashedPassword,
      status: "ACTIVE",
      isDefault: true,
      xPosCode,
      createdAt: new Date().toISOString(),
    };

    // ── Send to POS via Socket → save in SQLite ───────────────────────────
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("POS did not respond in time"));
      }, 10000); // 10 seconds timeout

      pos.socket.emit("server:createDefaultUser", { storeName, user: defaultUser });

      pos.socket.once("pos:defaultUserCreated", (response) => {
        clearTimeout(timeout);
        if (response.success) resolve(response);
        else reject(new Error(response.error || "POS failed to create user"));
      });
    });

    // ── Generate JWT token (from default user) ────────────────────────────
    const token = jwtUtil.generate({
      userId: defaultUser.id,
      username: defaultUser.username,
      xPosCode,
      role: "pos",
      isDefault: true,
    });

    // ── Generate QR Code ──────────────────────────────────────────────────
    const qrCode = await generateQR(token);

    // ── Send token + QR to POS for storage ───────────────────────────────
    pos.socket.emit("server:saveToken", { token, qrCode });

    // ── Response to Next.js ───────────────────────────────────────────────
    return res.status(201).json({
      success: true,
      data: {
        xPosCode,
        storeName,
        user: {
          id: defaultUser.id,
          username: defaultUser.username,
          status: defaultUser.status,
          isDefault: true,
        },
        token,
        qrCode, // base64 image — afficher dans Next.js
      },
    });
  } catch (err) {
    console.error("Register error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
