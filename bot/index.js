/**
 * WhatsApp Notify Bot
 * -------------------
 * Connects to WhatsApp via whatsapp-web.js and exposes a simple
 * POST /notify endpoint so Kwala (or any HTTP client) can send
 * a text message to any WhatsApp number.
 *
 * Usage:
 *   node index.js
 *   Scan the QR code printed in the terminal with WhatsApp.
 *   The session is saved locally so you only scan once.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;

import qrcode from "qrcode-terminal";
import express from "express";
import { existsSync } from "fs";

// ── Config ────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || "changeme"; // Set a strong key in production

// ── Chrome path detection (works locally & on most Linux setups) ──

function getChromePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/brave-browser",
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return undefined; // Let Puppeteer use its bundled Chromium
}

// ── WhatsApp client ───────────────────────────────────────

let isReady = false;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  puppeteer: {
    headless: true,
    executablePath: getChromePath(),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu",
    ],
  },
});

client.on("qr", (qr) => {
  console.log("\n📱 Scan this QR code with WhatsApp:\n");
  qrcode.generate(qr, { small: true });
  console.log("\n⚠️  Keep this terminal open until you see 'WhatsApp ready'\n");
});

client.on("authenticated", () => {
  console.log("🔐 Authenticated — session saved locally");
});

client.on("ready", () => {
  isReady = true;
  console.log(`✅ WhatsApp ready — API listening on http://localhost:${PORT}`);
});

client.on("disconnected", (reason) => {
  isReady = false;
  console.warn("⚠️  Disconnected:", reason, "— reconnecting in 10s…");
  setTimeout(() => client.initialize().catch(console.error), 10_000);
});

client.initialize().catch((err) => {
  console.error("❌ WhatsApp init failed:", err.message);
  process.exit(1);
});

// ── Express API ───────────────────────────────────────────

const app = express();
app.use(express.json());

/**
 * Simple API key middleware.
 * Pass the key as the x-api-key header:
 *   x-api-key: changeme
 */
function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }
  next();
}

/**
 * GET /health
 * Returns the current status of the WhatsApp client.
 */
app.get("/health", (req, res) => {
  res.json({
    status: isReady ? "ready" : "not_ready",
    message: isReady
      ? "WhatsApp client is connected and ready"
      : "WhatsApp client is not ready yet — scan the QR code first",
  });
});

/**
 * POST /notify
 * Send a WhatsApp text message to a phone number.
 *
 * Headers:
 *   x-api-key: <your API key>
 *   Content-Type: application/json
 *
 * Body:
 * {
 *   "phone": "2348012345678",   // International format, no + or spaces
 *   "message": "Hello from Kwala!"
 * }
 *
 * Response (success):
 * {
 *   "success": true,
 *   "to": "2348012345678@c.us"
 * }
 */
app.post("/notify", requireApiKey, async (req, res) => {
  if (!isReady) {
    return res.status(503).json({
      error: "WhatsApp client not ready",
      hint: "Check /health — the bot may still be initialising or need a QR scan",
    });
  }

  const { phone, message } = req.body;

  // ── Validation ──
  if (!phone || typeof phone !== "string") {
    return res
      .status(400)
      .json({ error: "'phone' is required (string, international format)" });
  }
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "'message' is required (string)" });
  }

  // Normalise phone — strip leading +, spaces, dashes
  const normalisedPhone = phone.replace(/^\+/, "").replace(/[\s\-()]/g, "");

  try {
    // Resolve the WhatsApp ID (handles both c.us and lid formats)
    const numberId = await client.getNumberId(normalisedPhone);

    if (!numberId) {
      return res.status(404).json({
        error: "Phone number not found on WhatsApp",
        phone: normalisedPhone,
      });
    }

    await client.sendMessage(numberId._serialized, message);

    console.log(
      `📨 Message sent to ${normalisedPhone} (${numberId._serialized})`,
    );

    return res.json({ success: true, to: numberId._serialized });
  } catch (err) {
    console.error("❌ Failed to send message:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Start server ──────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 API server started on http://localhost:${PORT}`);
  console.log(
    `🔑 API key: ${API_KEY === "changeme" ? "⚠️  still default — set API_KEY env var" : "set ✓"}`,
  );
});
