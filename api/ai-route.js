// api/ai-route.js
// Calls Claude to recommend the fastest NYC transit route given live data.
// Requires ANTHROPIC_API_KEY set in Vercel environment variables.

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY in Vercel environment variables" });

  function haversineMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  try {
    const {
      originAddress, destAddress,
      originLat, originLng, destLat, destLng,
      originStations, destStations,
      arrivals, alerts
    } = req.body;

    const walkMiles = haversineMiles(originLat, originLng, destLat, destLng);
    const walkMins = Math.round(walkMiles * 20);

    const prompt = `You are an expert NYC transit planner with real-time data access. Your job is to recommend the SINGLE best route from origin to destination.

ORIGIN: ${originAddress}
DESTINATION: ${destAddress}
Direct walk: ${walkMiles.toFixed(2)} miles = ~${walkMins} min

STATIONS NEAR ORIGIN (with live next arrivals in minutes):
${JSON.stringify(originStations, null, 2)}

STATIONS NEAR DESTINATION:
${JSON.stringify(destStations, null, 2)}

LIVE ARRIVAL DATA:
${JSON.stringify(arrivals, null, 2)}

ACTIVE SERVICE ALERTS:
${alerts && alerts.length > 0 ? JSON.stringify(alerts.slice(0, 6), null, 2) : "None reported"}

PLANNING RULES:
1. If walking takes under 10 minutes, recommend walking — it's often fastest in NYC
2. Check alerts — if a line is severely disrupted and no good alternative exists, recommend rideshare
3. Factor in: walk to station + wait for train/bus + ride time + walk to destination
4. Prefer fewer transfers — one transfer adds ~5 min
5. Buses are slower than subway — only use if subway isn't available nearby
6. If multiple routes are similar, pick the one with the soonest next departure

RESPONSE FORMAT — return ONLY valid JSON, no markdown, no explanation outside JSON:
{
  "recommendation": "2-3 sentence plain English summary of what to do and why",
  "steps": [
    { "type": "walk", "description": "Walk 3 min to 14 St-Union Sq", "minutes": 3 },
    { "type": "transit", "line": "6", "mode": "subway", "description": "Take the 6 train toward Pelham Bay Park", "boardAt": "14 St-Union Sq", "exitAt": "Grand Central-42 St", "waitMinutes": 2, "rideMinutes": 8 },
    { "type": "walk", "description": "Walk 4 min to destination", "minutes": 4 }
  ],
  "totalMinutes": 17,
  "useRideshare": false,
  "rideshareReason": null,
  "affectedLines": [],
  "isWalkOnly": false,
  "confidence": "high"
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const rawText = (data.content || []).map((c) => c.text || "").join("");
    const clean = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: "AI route planning failed", detail: err.message });
  }
};
