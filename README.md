# TourGuard AI (online core)

The online AI part of the TourGuard AI app from SIH 2026 (team CTRL Freaks1).
This version provides itinerary planning, place narration, and a travel Q&A, powered by Google Gemini's free tier.

Offline mesh translation, SOS, and the Flutter mobile app are not included yet.

## Setup

1. Install Node.js 18 or newer.
2. Get a free Gemini API key at https://aistudio.google.com/apikey
3. Copy the environment file and add your key:
   ```bash
   cp .env.example .env
   # edit .env and set GEMINI_API_KEY
   ```
4. Install and run:
   ```bash
   npm install
   npm start
   ```
5. Open http://localhost:3000

## API

| Method | Path            | Body                                           | Returns      |
|--------|-----------------|------------------------------------------------|--------------|
| POST   | /api/itinerary  | `{ city, days, interests[], budget }`          | `itinerary`  |
| POST   | /api/guide      | `{ place, city?, facts? }`                     | `guide`      |
| POST   | /api/chat       | `{ question, place?, context? }`               | `answer`     |
| GET    | /api/health     |                                                | `{ ok: true }` |

## Files

- `server.js` - Express routes
- `llm.js` - Gemini wrapper (swap providers here)
- `prompts.js` - prompt templates
- `public/index.html` - simple test UI

## Notes

- Free tier limits and data-use terms change. Check Google AI Studio before relying on it.
- Free-tier prompts may be used by Google to improve its products, so avoid sending personal data.
- The model only gets facts you pass in via `facts`. Add verified details from tourism boards or maps data for accuracy.

## What's in the app

- **Explore** (first tab): travel-style chips and state cards from the India starter guide, then place rows (heritage, forts, temples, food, cafés, folk, nature, road trips), planning tips and sources.
- **Map**: coloured political map of India. Tap a state for its guide (best time, highlights, tip) and places; add stops to a route. A Jaipur close-up is included.
- **Guide**: offline place notes, plus AI guide, trip planner and Q&A (need internet and a Gemini key).
- **Phrases**: offline Hindi phrasebook.
- **SOS** (last tab): press and hold 2 s. Works offline: reports queue on the phone and sync to `/api/sos`. Calls 112, 100, 108.

Data files are in `public/data/` (`places.js`, `regions.js`, `states.js`). Run: `npm install`, copy `.env.example` to `.env`, `npm start`.

## Deploy on Netlify

1. Push this folder to GitHub (or drag-and-drop deploy with the Netlify CLI).
2. In Netlify: Add new site, Import from Git, pick the repo. `netlify.toml` already sets the publish folder (`public`) and the functions folder; no build command is needed.
3. Site settings, Environment variables: add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`, `GOOGLE_MAPS_API_KEY`). Redeploy.
4. SOS reports are saved in Netlify Blobs (store `sos-reports`); view them in the Netlify dashboard under Blobs. They are not forwarded to police or ambulance services.

`netlify/functions/api.mjs` replaces `server.js` on Netlify. `npm start` still runs the local Express version.
