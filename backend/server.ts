import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// In-memory store (reset on restart). Swap for SQLite/Postgres later.
const logs: any[] = [];

app.post("/api/sensors/report", (req, res) => {
  const body = req.body;

  if (!body.itemId) {
    return res.status(400).json({ error: "itemId is required" });
  }

  const entry = {
    id: crypto.randomUUID(),
    ...body,
    serverTime: new Date().toISOString(),
  };

  logs.unshift(entry); // newest first
  console.log("[SENSOR REPORT]", entry);

  res.json({ success: true, id: entry.id });
});

app.get("/api/sensors/logs/:itemId", (req, res) => {
  const { itemId } = req.params;
  const itemLogs = logs.filter((l) => String(l.itemId) === itemId);
  res.json(itemLogs);
});

app.get("/api/sensors/logs", (req, res) => {
  res.json(logs.slice(0, 100)); // last 100
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Sensor backend running on http://localhost:${PORT}`);
});
