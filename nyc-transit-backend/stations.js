// api/stations.js
// Serves the FULL official list of NYC subway stations (all ~472), sourced
// from MTA's static GTFS data (the same dataset Google Maps/Citymapper use
// under the hood for station names/locations). Supports filtering by the
// user's current location or by a text search.
//
// Usage:
//   /api/stations                          -> all stations
//   /api/stations?lat=40.73&lng=-73.99&radiusMiles=0.25  -> nearby only
//   /api/stations?query=union sq            -> name search

const JSZip = require("jszip");

const SUBWAY_GTFS_URL = "http://web.mta.info/developers/data/nyct/subway/google_transit.zip";

// In-memory cache so we don't re-download/parse on every request within the
// same running server instance. Resets on cold start (normal for serverless).
let cachedStations = null;
let cachedAt = 0;
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours — station locations rarely change

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
    // Basic CSV split that respects quoted commas (station names sometimes have them)
    const values = line.match(/(".*?"|[^",]+)(?=,|$)/g) || [];
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] || "").replace(/^"|"$/g, "").trim();
    });
    return row;
  });
}

async function loadStations() {
  if (cachedStations && Date.now() - cachedAt < CACHE_TTL_MS) return cachedStations;

  const res = await fetch(SUBWAY_GTFS_URL);
  if (!res.ok) throw new Error(`Failed to download subway GTFS: ${res.status}`);
  const buffer = await res.arrayBuffer();

  const zip = await JSZip.loadAsync(buffer);
  const stopsFile = zip.file("stops.txt");
  if (!stopsFile) throw new Error("stops.txt not found in GTFS archive");
  const stopsText = await stopsFile.async("text");

  const rows = parseCsv(stopsText);

  // location_type "1" = parent station (the ~472 stations).
  // Platform-level rows (location_type "0" or "") are children of these and
  // are skipped here since riders think in terms of stations, not platforms.
  const stations = rows
    .filter((r) => r.location_type === "1")
    .map((r) => ({
      id: r.stop_id,
      name: r.stop_name,
      lat: parseFloat(r.stop_lat),
      lng: parseFloat(r.stop_lon),
    }))
    .filter((s) => !isNaN(s.lat) && !isNaN(s.lng));

  cachedStations = stations;
  cachedAt = Date.now();
  return stations;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const stations = await loadStations();
    const { lat, lng, radiusMiles, query } = req.query;

    let results = stations;

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
    }

    res.status(200).json({ count: results.length, stations: results });
  } catch (err) {
    res.status(500).json({ error: "Failed to load stations", detail: err.message });
  }
};
