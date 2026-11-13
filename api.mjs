// Netlify Function that serves every /api/* route (same URLs as the local Express server).
// SOS reports are stored in Netlify Blobs (store "sos-reports", one entry per report id).
import { getStore } from "@netlify/blobs";
import { askGemini, isDemoMode } from "../../llm.js";
import { findPlace } from "../../places.js";
import { buildItineraryPrompt, buildGuidePrompt, buildChatPrompt } from "../../prompts.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function readBody(req) {
  try { return await req.json(); } catch { return {}; }
}

async function handleSos(req) {
  const r = await readBody(req);
  if (typeof r.id !== "string" || !r.id || r.id.length > 100) return json({ error: "id is required" }, 400);

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

  const store = getStore("sos-reports");
  const key = r.id.replace(/[^A-Za-z0-9_-]/g, "_");
  if (await store.get(key)) return json({ ok: true, id: r.id, duplicate: true });
  await store.setJSON(key, record);
  console.log(`SOS received ${r.id} (${loc ? "with location" : "no location"})`);
  return json({ ok: true, id: r.id });
}

export default async (req) => {
  const { pathname, searchParams } = new URL(req.url);
  const route = pathname.replace(/\/+$/, "");
  try {
    if (route === "/api/health" && req.method === "GET") return json({ ok: true, demoMode: isDemoMode() });

    if (route === "/api/sos" && req.method === "POST") return await handleSos(req);

    if (route === "/api/places" && req.method === "GET") {
      const q = (searchParams.get("q") || "").trim();
      if (!q) return json({ error: "q is required" }, 400);
      const place = await findPlace(q);
      return place ? json(place) : json({ error: `No place found for "${q}"` }, 404);
    }

    if (route === "/api/itinerary" && req.method === "POST") {
      const { city, days = 2, interests = [], budget = "medium" } = await readBody(req);
      if (!city) return json({ error: "city is required" }, 400);
      return json({ itinerary: await askGemini(buildItineraryPrompt({ city, days, interests, budget })) });
    }

    if (route === "/api/guide" && req.method === "POST") {
      const { place, city = "" } = await readBody(req);
      if (!place) return json({ error: "place is required" }, 400);
      const found = await findPlace(city ? `${place}, ${city}` : place);
      const facts = found
        ? [found.facts, found.address && `Address: ${found.address}`, found.rating && `Rating: ${found.rating}`]
            .filter(Boolean).join("\n")
        : "";
      const text = await askGemini(buildGuidePrompt({ place: found?.name || place, city, facts }));
      return json({ guide: text, place: found || null });
    }

    if (route === "/api/chat" && req.method === "POST") {
      const { question, place = "", context = "" } = await readBody(req);
      if (!question) return json({ error: "question is required" }, 400);
      return json({ answer: await askGemini(buildChatPrompt({ question, place, context })) });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

export const config = { path: "/api/*" };
