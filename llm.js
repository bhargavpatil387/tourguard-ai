// Thin wrapper around the Gemini REST API (free tier via Google AI Studio).
// Without GEMINI_API_KEY it returns a clearly labelled demo reply so the app still runs.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function isDemoMode() {
  return !process.env.GEMINI_API_KEY;
}

export async function askGemini(prompt) {
  if (isDemoMode()) return demoReply(prompt);

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetch(`${API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini request failed (${res.status})`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  if (!text) throw new Error("Gemini returned an empty response.");
  return text.trim();
}

// Canned output used only when no API key is set. It is not AI-generated.
function demoReply(prompt) {
  const note = "[DEMO MODE: no GEMINI_API_KEY set. This is placeholder text, not AI output.]";
  if (prompt.includes("itinerary")) {
    return `${note}\n\nDay 1\n- Morning: Walk the old city and visit the main landmark. About 2 hours. Low cost.\n- Afternoon: Local market for lunch and crafts. About 2 hours. Low cost.\n- Evening: Sunset viewpoint. About 1 hour. Free.\n\nDay 2\n- Morning: Museum or heritage site. About 2 hours. Medium cost.\n- Afternoon: Food walk with a local guide. About 3 hours. Medium cost.\n\nSafety tips\n- Use app-based or pre-paid transport.\n- Keep copies of your ID and emergency contacts.\n- Emergencies: police 100, ambulance 108.`;
  }
  if (prompt.includes("spoken-style guide")) {
    return `${note}\n\nWelcome. This place has stood for generations and still shapes the life around it. Look closely at the details in the stone and the craft of the builders. Take a moment to listen to the people around you, because they carry the stories too.`;
  }
  return `${note}\n\nPlease ask a local guide, your hotel, or the tourist information desk for that. For emergencies, call 100 (police) or 108 (ambulance).`;
}
