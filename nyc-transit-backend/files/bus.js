// api/bus.js
// Fetches live NYC bus data from MTA BusTime (SIRI API). Requires a free key,
// stored as an environment variable (MTA_BUS_API_KEY) — never hardcode it here.

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const apiKey = process.env.MTA_BUS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing MTA_BUS_API_KEY environment variable" });
  }

  const stopId = req.query.stopId; // e.g. a bus stop code like "401652"
  if (!stopId) {
    return res.status(400).json({ error: "Missing stopId query parameter" });
  }

  const url = `https://bustime.mta.info/api/siri/stop-monitoring.json?key=${apiKey}&MonitoringRef=${stopId}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`MTA BusTime error: ${response.status}`);
    const data = await response.json();

    const visits =
      data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];

    const arrivals = visits.map((v) => {
      const journey = v.MonitoredVehicleJourney;
      return {
        line: journey?.PublishedLineName?.[0] || journey?.LineRef,
        destination: journey?.DestinationName?.[0] || "Unknown",
        expectedArrival:
          journey?.MonitoredCall?.ExpectedArrivalTime ||
          journey?.MonitoredCall?.AimedArrivalTime ||
          null,
      };
    });

    res.status(200).json({ stopId, fetchedAt: Date.now(), arrivals });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch bus data", detail: err.message });
  }
};
