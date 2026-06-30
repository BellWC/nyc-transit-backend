// api/bus-stops.js
// Serves the FULL official list of NYC bus stops (~15,000+ citywide), sourced
// from MTA's static GTFS bus data, published separately per borough.
// Same filtering options as /api/stations.js:
//   /api/bus-stops?lat=&lng=&radiusMiles=0.25
//   /api/bus-stops?query=14 st

const JSZip = require("jszip");

const BOROUGH_FEEDS = [
  "http://web.mta.info/developers/data/nyct/bus/google_transit_bronx.zip",
  "http://web.mta.info/developers/data/nyct/bus/google_transit_brooklyn.zip",
  "http://web.mta.info/developers/data/nyct/bus/google_transit_manhattan.zip",
  "http://web.mta.info/developers/data/nyct/bus/google_transit_queens.zip",
  "http://web.mta.info/developers/data/nyct/bus/google_transit_staten_island.zip",
];

let cachedStops = null;
let cachedAt = 0;
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseCsv(text) {
  const lines = text.split("\n").filter(Boolean);
  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.match(/(".*?"|[^",]+)(?=,|$)/g) || [];
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] || "").replace(/^"|"$/g, "").trim();
    });
    return row;
  });
}

async function loadOneBorough(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const stopsFile = zip.file("stops.txt");
  if (!stopsFile) return [];
  const text = await stopsFile.async("text");
  return parseCsv(text)
    .map((r) => ({
      id: r.stop_id,
      name: r.stop_name,
      lat: parseFloat(r.stop_lat),
      lng: parseFloat(r.stop_lon),
    }))
    .filter((s) => !isNaN(s.lat) && !isNaN(s.lng));
}

async function loadAllStops() {
  if (cachedStops && Date.now() - cachedAt < CACHE_TTL_MS) return cachedStops;

  // Fetch all 5 boroughs in parallel, but don't let one failure kill the rest.
  const results = await Promise.allSettled(BOROUGH_FEEDS.map(loadOneBorough));
  const stops = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  // De-duplicate stops that appear in more than one borough feed (rare, near borough lines)
  const seen = new Set();
  const deduped = stops.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  cachedStops = deduped;
  cachedAt = Date.now();
  return deduped;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const stops = await loadAllStops();
    const { lat, lng, radiusMiles, query } = req.query;

    let results = stops;

    if (query) {
      const q = query.toLowerCase();
      results = results.filter((s) => s.name.toLowerCase().includes(q));
    }

    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const radius = radiusMiles ? parseFloat(radiusMiles) : null;

      results = results
        .map((s) => ({ ...s, distMiles: haversineMiles(userLat, userLng, s.lat, s.lng) }))
        .sort((a, b) => a.distMiles - b.distMiles);

      if (radius) results = results.filter((s) => s.distMiles <= radius);
      else results = results.slice(0, 50); // safety cap when no radius given
    }

    res.status(200).json({ count: results.length, stops: results });
  } catch (err) {
    res.status(500).json({ error: "Failed to load bus stops", detail: err.message });
  }
};
