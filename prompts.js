// Prompt builders. Keep facts in the prompt so the model describes what we give it
// rather than inventing opening hours or history.

const SYSTEM =
  "You are TourGuard AI, a friendly, safety-conscious tour guide for India. " +
  "Be accurate, concise and practical. If you are unsure of a fact, say so instead of guessing.";

export function buildItineraryPrompt({ city, days, interests, budget }) {
  const likes = interests.length ? interests.join(", ") : "general sightseeing";
  return `${SYSTEM}

Create a ${days}-day itinerary for a tourist visiting ${city}.
Interests: ${likes}
Budget level: ${budget}

For each day give morning, afternoon and evening suggestions. For each stop include:
- one line on why it is worth visiting
- a rough time needed
- a rough cost tier (free / low / medium / high)
End with 3 safety tips specific to ${city}. Use plain markdown headings and bullets.`;
}

export function buildGuidePrompt({ place, city, facts }) {
  return `${SYSTEM}

Write a short spoken-style guide (about 120-150 words) for a visitor standing at:
${place}${city ? `, ${city}` : ""}
${facts ? `Verified facts to use:\n${facts}\n` : "No verified facts were supplied; keep claims general and avoid specific dates or numbers."}
Cover the history or culture of the place and one thing to look out for. Write it so it can be read aloud.`;
}

export function buildChatPrompt({ question, place, context }) {
  return `${SYSTEM}

The traveller is${place ? ` at ${place}` : " on a tour"}.
${context ? `Context:\n${context}\n` : ""}
Question: ${question}

Answer in 2-4 sentences. If the question is about an emergency, tell them to call police on 100 or an ambulance on 108 (India) first.`;
}
