import express from "express";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { askGemini, isDemoMode } from "./llm.js";
import { findPlace } from "./places.js";
import { buildItineraryPrompt, buildGuidePrompt, buildChatPrompt } from "./prompts.js";

dotenv.config();

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

app.get("/api/health", (_req, res) => res.json({ ok: true, demoMode: isDemoMode() }));

// ---- SOS reports: the phone queues them offline and POSTs here when online.
// Prototype storage is a local JSON-lines file. A real deployment must route
// reports to responders (e.g. police 100 and ambulance 108 systems) under official agreements.
const DATA_DIR = "data";
const SOS_FILE = path.join(DATA_DIR, "sos-reports.jsonl");
fs.mkdirSync(DATA_DIR, { recursive: true });

const seenSos = new Set();
if (fs.existsSync(SOS_FILE)) {
  for (const line of fs.readFileSync(SOS_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { seenSos.add(JSON.parse(line).id); } catch { /* skip bad line */ }
  }
}

app.post("/api/sos", (req, res) => {
  try {
    const r = req.body || {};
    if (typeof r.id !== "string" || !r.id || r.id.length > 100) {
      return res.status(400).json({ error: "id is required" });
    }
    if (seenSos.has(r.id)) return res.json({ ok: true, id: r.id, duplicate: true });

    const loc = r.location && typeof r.location.lat === "number" && typeof r.location.lng === "number"
      ? { lat: r.location.lat, lng: r.location.lng, accuracy: Number(r.location.accuracy) || null }
      : null;

    const record = {
      id: r.id,
      createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      location: loc,
      note: String(r.note || "").slice(0, 300),
      contact: r.contact
        ? { name: String(r.contact.name || "").slice(0, 100), phone: String(r.contact.phone || "").slice(0, 30) }
        : null,
    };

    fs.appendFileSync(SOS_FILE, JSON.stringify(record) + "\n");
    seenSos.add(r.id);
    console.log(`SOS received ${r.id} (${loc ? "with location" : "no location"})`);
    res.json({ ok: true, id: r.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Look up a place by name (Google Places if configured, sample data otherwise)
app.get("/api/places", wrap(async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.status(400).json({ error: "q is required" });
  const place = await findPlace(q);
  if (!place) return res.status(404).json({ error: `No place found for "${q}"` });
  res.json(place);
}));

// Day-by-day itinerary
app.post("/api/itinerary", wrap(async (req, res) => {
  const { city, days = 2, interests = [], budget = "medium" } = req.body || {};
  if (!city) return res.status(400).json({ error: "city is required" });
  const text = await askGemini(buildItineraryPrompt({ city, days, interests, budget }));
  res.json({ itinerary: text });
}));

// Narrated guide for a place. Looks the place up first so the model gets real facts.
app.post("/api/guide", wrap(async (req, res) => {
  const { place, city = "" } = req.body || {};
  if (!place) return res.status(400).json({ error: "place is required" });

  const found = await findPlace(city ? `${place}, ${city}` : place);
  const facts = found
    ? [found.facts, found.address && `Address: ${found.address}`, found.rating && `Rating: ${found.rating}`]
        .filter(Boolean).join("\n")
    : "";
  const text = await askGemini(buildGuidePrompt({
    place: found?.name || place,
    city,
    facts,
  }));
  res.json({ guide: text, place: found || null });
}));

// Traveller Q&A
app.post("/api/chat", wrap(async (req, res) => {
  const { question, place = "", context = "" } = req.body || {};
  if (!question) return res.status(400).json({ error: "question is required" });
  const text = await askGemini(buildChatPrompt({ question, place, context }));
  res.json({ answer: text });
}));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`TourGuard AI running at http://localhost:${port}${isDemoMode() ? " (demo mode)" : ""}`));
