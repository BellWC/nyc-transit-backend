// api/subway.js
// Fetches live NYC subway data from the MTA (no key needed) and returns clean JSON.
const GtfsRealtimeBindings = require("gtfs-realtime-bindings");

// MTA splits subway lines across a few feed URLs. This covers the main ones.
const FEEDS = {
  "ace": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
  "bdfm": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
  "g": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g",
  "jz": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",
  "nqrw": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
  "l": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l",
  "123456s": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  "7": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-7",
};

async function fetchFeed(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MTA feed error: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
    new Uint8Array(buffer)
  );
  return feed;
}

function simplifyFeed(feed) {
  const arrivals = [];
  feed.entity.forEach((entity) => {
    if (!entity.tripUpdate) return;
    const trip = entity.tripUpdate;
    const routeId = trip.trip.routeId;
    (trip.stopTimeUpdate || []).forEach((stu) => {
      const arrivalTime = stu.arrival ? stu.arrival.time : null;
      if (!arrivalTime) return;
      arrivals.push({
        line: routeId,
        stopId: stu.stopId,
        arrivalUnix: Number(arrivalTime),
      });
    });
  });
  return arrivals;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const group = req.query.group || "nqrw"; // which feed group to fetch
  const feedUrl = FEEDS[group];

  if (!feedUrl) {
    return res.status(400).json({ error: "Unknown feed group", validGroups: Object.keys(FEEDS) });
  }

  try {
    const feed = await fetchFeed(feedUrl);
    const arrivals = simplifyFeed(feed);
    res.status(200).json({ group, fetchedAt: Date.now(), arrivals });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch subway data", detail: err.message });
  }
};
