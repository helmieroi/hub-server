const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "change_this_secret";

module.exports = {
  // Generate token for WebUser
  generate(payload, expiresIn = "365d") {
    return jwt.sign(payload, SECRET, { expiresIn });
  },

  // Verify token
  verify(token) {
    return jwt.verify(token, SECRET);
  },
};
