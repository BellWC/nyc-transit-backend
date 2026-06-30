// api/alerts.js
// Fetches live MTA service alerts (no key needed) and returns clean JSON.
const GtfsRealtimeBindings = require("gtfs-realtime-bindings");

const ALERTS_URL =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fall-alerts";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const response = await fetch(ALERTS_URL);
    if (!response.ok) throw new Error(`MTA alerts feed error: ${response.status}`);
    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );

    const alerts = feed.entity
      .filter((e) => e.alert)
      .map((e) => {
        const alert = e.alert;
        const text =
          alert.headerText?.translation?.[0]?.text ||
          alert.descriptionText?.translation?.[0]?.text ||
          "Service alert";
        const lines = (alert.informedEntity || [])
          .map((ie) => ie.routeId)
          .filter(Boolean);
        return { id: e.id, text, lines };
      });

    res.status(200).json({ fetchedAt: Date.now(), alerts });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch alerts", detail: err.message });
  }
};
