const QRCode = require("qrcode");

/**
 * Generate QR code as base64 data URL from a token
 */
async function generateQR(token) {
  try {
    const dataUrl = await QRCode.toDataURL(token, {
      errorCorrectionLevel: "H",
      width: 300,
      margin: 2,
    });
    return dataUrl; // "data:image/png;base64,..."
  } catch (err) {
    throw new Error("QR generation failed: " + err.message);
  }
}

module.exports = { generateQR };
