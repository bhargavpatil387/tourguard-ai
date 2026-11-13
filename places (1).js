// Place lookup via Google Places API (Text Search, New).
// Without GOOGLE_MAPS_API_KEY it returns a small built-in sample so the app still runs.

const SAMPLE = {
  "hawa mahal": { name: "Hawa Mahal", address: "Badi Chaupad, Jaipur, Rajasthan", rating: 4.5, openNow: null, facts: "Built in 1799 by Maharaja Sawai Pratap Singh. Its many small windows let royal women watch street life unseen." },
  "gateway of india": { name: "Gateway of India", address: "Apollo Bunder, Mumbai, Maharashtra", rating: 4.6, openNow: null, facts: "A basalt arch completed in 1924 on the Mumbai waterfront, built to mark the arrival of British royalty." },
};

export async function findPlace(query) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    const hit = SAMPLE[query.toLowerCase().split(",")[0].trim()];
    return hit ? { ...hit, source: "sample" } : null;
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.rating,places.regularOpeningHours.openNow",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Places request failed (${res.status})`);

  const p = data.places?.[0];
  if (!p) return null;
  return {
    name: p.displayName?.text,
    address: p.formattedAddress,
    rating: p.rating ?? null,
    openNow: p.regularOpeningHours?.openNow ?? null,
    facts: "",
    source: "google",
  };
}
