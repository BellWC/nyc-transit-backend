import React, { useState, useEffect, useMemo } from "react";
import { MapPin, Clock, AlertTriangle, Lock, ChevronRight, Search, Star, Zap } from "lucide-react";

// ---- Live data config ----
const API_BASE = "https://nyc-transit-backend.vercel.app";

async function fetchNearbyStations(lat, lng, radiusMiles = 0.25) {
  const res = await fetch(`${API_BASE}/api/stations?lat=${lat}&lng=${lng}&radiusMiles=${radiusMiles}`);
  if (!res.ok) throw new Error("Stations fetch failed");
  return res.json();
}

async function fetchNearbyBusStops(lat, lng, radiusMiles = 0.25) {
  const res = await fetch(`${API_BASE}/api/bus-stops?lat=${lat}&lng=${lng}&radiusMiles=${radiusMiles}`);
  if (!res.ok) throw new Error("Bus stops fetch failed");
  return res.json();
}

function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported in this browser"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

async function fetchSubwayArrivals(feedGroup) {
  const res = await fetch(`${API_BASE}/api/subway?group=${feedGroup}`);
  if (!res.ok) throw new Error("Subway fetch failed");
  return res.json();
}

async function fetchBusArrivals(stopId) {
  const res = await fetch(`${API_BASE}/api/bus?stopId=${stopId}`);
  if (!res.ok) throw new Error("Bus fetch failed");
  return res.json();
}

const ALL_SUBWAY_FEED_GROUPS = ["ace", "bdfm", "g", "jz", "nqrw", "l", "123456s", "7"];

async function fetchAllSubwayArrivalsMerged() {
  const results = await Promise.allSettled(ALL_SUBWAY_FEED_GROUPS.map(fetchSubwayArrivals));
  const merged = [];
  results.forEach((r) => {
    if (r.status === "fulfilled") merged.push(...r.value.arrivals);
  });
  return merged;
}

async function searchStations(text) {
  const [stationsRes, busRes] = await Promise.all([
    fetch(`${API_BASE}/api/stations?query=${encodeURIComponent(text)}`).then((r) => r.json()),
    fetch(`${API_BASE}/api/bus-stops?query=${encodeURIComponent(text)}`).then((r) => r.json()),
  ]);
  return {
    stations: (stationsRes.stations || []).slice(0, 8),
    busStops: (busRes.stops || []).slice(0, 8),
  };
}

async function fetchAlertsLive() {
  const res = await fetch(`${API_BASE}/api/alerts`);
  if (!res.ok) throw new Error("Alerts fetch failed");
  return res.json();
}

const STATION_GRAPH = {
  "Union Sq": { lat: 40.7359, lng: -73.9911, edges: [
    { to: "14 St (8 Av)", line: "L", mins: 3 },
    { to: "Times Sq", line: "N", mins: 8 },
    { to: "Atlantic Av", line: "4", mins: 12 },
    { to: "Grand Central", line: "6", mins: 5 },
  ]},
  "14 St (8 Av)": { lat: 40.7400, lng: -74.0021, edges: [
    { to: "Union Sq", line: "L", mins: 3 },
    { to: "Times Sq", line: "A", mins: 6 },
  ]},
  "Times Sq": { lat: 40.7558, lng: -73.9870, edges: [
    { to: "Union Sq", line: "N", mins: 8 },
    { to: "14 St (8 Av)", line: "A", mins: 6 },
    { to: "Grand Central", line: "7", mins: 4 },
    { to: "Jackson Hts", line: "7", mins: 15 },
  ]},
  "Grand Central": { lat: 40.7527, lng: -73.9772, edges: [
    { to: "Union Sq", line: "6", mins: 5 },
    { to: "Times Sq", line: "7", mins: 4 },
    { to: "Atlantic Av", line: "4", mins: 18 },
  ]},
  "Atlantic Av": { lat: 40.6840, lng: -73.9774, edges: [
    { to: "Union Sq", line: "4", mins: 12 },
    { to: "Grand Central", line: "4", mins: 18 },
    { to: "Jackson Hts", line: "R", mins: 22 },
  ]},
  "Jackson Hts": { lat: 40.7464, lng: -73.8918, edges: [
    { to: "Times Sq", line: "7", mins: 15 },
    { to: "Atlantic Av", line: "R", mins: 22 },
  ]},
};

const TRANSFER_PENALTY_MINS = 4;

function findRoutes(origin, destination, limit = 3) {
  if (!STATION_GRAPH[origin] || !STATION_GRAPH[destination]) return [];
  if (origin === destination) return [];

  function dijkstra(blockedFirstEdgeTo = null) {
    const dist = {};
    const prevLine = {};
    const prevNode = {};
    Object.keys(STATION_GRAPH).forEach((n) => (dist[n] = Infinity));
    dist[origin] = 0;
    const visited = new Set();

    while (visited.size < Object.keys(STATION_GRAPH).length) {
      let current = null;
      let best = Infinity;
      for (const node of Object.keys(STATION_GRAPH)) {
        if (!visited.has(node) && dist[node] < best) {
          best = dist[node];
          current = node;
        }
      }
      if (current === null) break;
      visited.add(current);

      for (const edge of STATION_GRAPH[current].edges) {
        if (current === origin && edge.to === blockedFirstEdgeTo) continue;
        const switchingLines = prevLine[current] && prevLine[current] !== edge.line;
        const cost = edge.mins + (switchingLines ? TRANSFER_PENALTY_MINS : 0);
        const newDist = dist[current] + cost;
        if (newDist < dist[edge.to]) {
          dist[edge.to] = newDist;
          prevNode[edge.to] = current;
          prevLine[edge.to] = edge.line;
        }
      }
    }

    if (dist[destination] === Infinity) return null;

    const path = [];
    let node = destination;
    while (node !== origin) {
      const from = prevNode[node];
      if (!from) return null;
      path.unshift({ from, to: node, line: prevLine[node] });
      node = from;
    }

    const transfers = path.reduce((count, leg, i) => {
      if (i === 0) return 0;
      return leg.line !== path[i - 1].line ? count + 1 : count;
    }, 0);

    return { totalMins: Math.round(dist[destination]), legs: path, transfers };
  }

  const routes = [];
  const seen = new Set();

  const primary = dijkstra();
  if (primary) {
    routes.push(primary);
    seen.add(JSON.stringify(primary.legs.map((l) => l.line)));
  }

  let blocker = primary?.legs?.[0]?.to || null;
  for (let i = 0; i < limit - 1 && blocker; i++) {
    const alt = dijkstra(blocker);
    if (alt) {
      const key = JSON.stringify(alt.legs.map((l) => l.line));
      if (!seen.has(key)) {
        routes.push(alt);
        seen.add(key);
      }
    }
    blocker = alt?.legs?.[0]?.to || null;
  }

  return routes.sort((a, b) => a.totalMins - b.totalMins).slice(0, limit);
}

const LINE_COLORS = {
  "1": "#EE352E", "2": "#EE352E", "3": "#EE352E",
  "4": "#00933C", "5": "#00933C", "6": "#00933C",
  "7": "#B933AD",
  A: "#2850AD", C: "#2850AD", E: "#2850AD",
  B: "#FF6319", D: "#FF6319", F: "#FF6319", M: "#FF6319",
  G: "#6CBE45",
  J: "#996633", Z: "#996633",
  L: "#A7A9AC",
  N: "#FCCC0A", Q: "#FCCC0A", R: "#FCCC0A", W: "#FCCC0A",
  BUS: "#0039A6",
};

const ALERTS = [];

function Bullet({ line, size = 26 }) {
  const isBus = line === "BUS";
  const bg = LINE_COLORS[line] || "#888";
  return (
    <div style={{
      width: size, height: size, borderRadius: isBus ? 6 : "50%",
      background: bg, color: "#fff", display: "flex", alignItems: "center",
      justifyContent: "center", fontWeight: 700, fontSize: size * 0.5,
      fontFamily: "'Helvetica Neue', Arial, sans-serif", flexShrink: 0,
      letterSpacing: isBus ? "-0.5px" : 0,
    }}>
      {isBus ? "B" : line}
    </div>
  );
}

function RoutePlanner({ onNeedsPaywall }) {
  const stations = Object.keys(STATION_GRAPH);
  const [origin, setOrigin] = useState(stations[0]);
  const [destination, setDestination] = useState(stations[2]);
  const [routes, setRoutes] = useState(null);
  const [searched, setSearched] = useState(false);

  const FREE_STATIONS = new Set(["Union Sq", "14 St (8 Av)"]);

  const handleSearch = () => {
    const isFree = FREE_STATIONS.has(origin) && FREE_STATIONS.has(destination);
    if (!isFree) {
      onNeedsPaywall("Unlock citywide route planning");
      return;
    }
    setRoutes(findRoutes(origin, destination));
    setSearched(true);
  };

  return (
    <div style={{ background: "#121214", border: "1px solid #232326", borderRadius: 14, padding: 16, marginTop: 6 }}>
      <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 17, margin: "0 0 12px" }}>Compare routes</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {[
          { label: "From", value: origin, set: setOrigin },
          { label: "To", value: destination, set: setDestination },
        ].map((f) => (
          <div key={f.label}>
            <label style={{ fontSize: 11, color: "#73737a", display: "block", marginBottom: 4 }}>{f.label}</label>
            <select
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              style={{
                width: "100%", background: "#16161a", border: "1px solid #232326", borderRadius: 8,
                padding: "9px 10px", color: "#F2F1ED", fontSize: 13.5,
              }}
            >
              {stations.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button
        onClick={handleSearch}
        disabled={origin === destination}
        style={{
          width: "100%", background: origin === destination ? "#2a2a2d" : "#F2F1ED",
          color: origin === destination ? "#73737a" : "#0a0a0b", border: "none", borderRadius: 9,
          padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: origin === destination ? "default" : "pointer",
        }}
      >
        Find routes
      </button>
      {searched && (!routes || routes.length === 0) && (
        <p style={{ fontSize: 13, color: "#73737a", marginTop: 12 }}>No route found between those stations yet.</p>
      )}
      {routes && routes.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {routes.map((r, i) => (
            <div key={i} style={{ border: "1px solid #232326", borderRadius: 10, padding: "12px 14px", background: "#16161a" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace" }}>{r.totalMins} min</span>
                <span style={{ fontSize: 11.5, color: i === 0 ? "#5fae6e" : "#73737a" }}>
                  {i === 0 ? "Fastest" : r.transfers === 0 ? "No transfers" : `${r.transfers} transfer${r.transfers > 1 ? "s" : ""}`}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {r.legs.map((leg, j) => (
                  <React.Fragment key={j}>
                    <Bullet line={leg.line} size={20} />
                    {j < r.legs.length - 1 && leg.line !== r.legs[j + 1].line && (
                      <ChevronRight size={13} color="#5a5a5f" />
                    )}
                  </React.Fragment>
                ))}
                <span style={{ fontSize: 12, color: "#73737a", marginLeft: 4 }}>
                  via {r.legs.map((l) => l.to).join(" → ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}function PaywallModal({ onClose, reason }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(8,8,9,0.78)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 50, padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#121214", border: "1px solid #2a2a2d", borderRadius: 16,
          maxWidth: 380, width: "100%", padding: "28px 24px", color: "#F2F1ED",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ background: "#FCCC0A", borderRadius: 8, padding: 7, display: "flex" }}>
            <Lock size={16} color="#121214" />
          </div>
          <span style={{ fontSize: 13, letterSpacing: 1, color: "#9a9a9e", textTransform: "uppercase" }}>
            Past your free range
          </span>
        </div>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, margin: "0 0 8px", lineHeight: 1.2 }}>
          {reason}
        </h2>
        <p style={{ color: "#b3b3b8", fontSize: 14.5, lineHeight: 1.55, margin: "0 0 20px" }}>
          Free shows everything within a quarter mile. Go further, save unlimited routes,
          and get pushed alerts for your lines with <strong style={{ color: "#F2F1ED" }}>Transit+</strong>.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          {[
            "Live arrivals anywhere in the five boroughs",
            "Push alerts before disruptions hit your line",
            "Unlimited saved routes & stops",
          ].map((t) => (
            <div key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Zap size={15} color="#FCCC0A" style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: "#d8d8db" }}>{t}</span>
            </div>
          ))}
        </div>
        <button
          style={{
            width: "100%", background: "#F2F1ED", color: "#121214", border: "none",
            borderRadius: 10, padding: "13px 0", fontSize: 15, fontWeight: 600,
            cursor: "pointer", marginBottom: 10,
          }}
          onClick={onClose}
        >
          Try Transit+ — $3.99/mo
        </button>
        <button
          style={{ width: "100%", background: "none", border: "none", color: "#73737a", fontSize: 13, cursor: "pointer", padding: "4px 0" }}
          onClick={onClose}
        >
          Not now
        </button>
      </div>
    </div>
  );
}

function StopRow({ stop, locked, onLocked, saved, onToggleSave, arrivalsData }) {
  const arrivals = arrivalsData[stop.id] || [];
  const knownLines = stop.lines && stop.lines.length ? stop.lines : [...new Set(arrivals.map((a) => a.line))];
  const isBusStop = stop.isBus || (knownLines.length === 0 && stop.type === "bus");

  return (
    <div style={{
      border: "1px solid #232326", borderRadius: 14, padding: "14px 16px",
      marginBottom: 10, background: "#121214", position: "relative",
      filter: locked ? "saturate(0.4)" : "none",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {knownLines.length > 0 ? (
            knownLines.slice(0, 6).map((l, i) => <Bullet key={i} line={l} size={22} />)
          ) : (
            <span style={{ fontSize: 11, color: "#5a5a5f", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {isBusStop ? "Bus stop" : "Station"}
            </span>
          )}
        </div>
        <button onClick={() => onToggleSave(stop.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
          <Star size={17} color={saved ? "#FCCC0A" : "#4a4a4f"} fill={saved ? "#FCCC0A" : "none"} />
        </button>
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 17, margin: 0, color: "#F2F1ED" }}>{stop.name}</h3>
        <span style={{ fontSize: 12, color: "#73737a" }}>
          {stop.distMiles != null ? stop.distMiles.toFixed(2) : stop.dist} mi
        </span>
      </div>
      {locked ? (
        <button
          onClick={() => onLocked(stop.name)}
          style={{
            marginTop: 10, width: "100%", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 6, background: "#1b1b1e", border: "1px dashed #35353a",
            borderRadius: 10, padding: "10px 0", color: "#9a9a9e", fontSize: 13, cursor: "pointer",
          }}
        >
          <Lock size={13} /> Unlock arrival times
        </button>
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {arrivals.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Bullet line={a.line} size={20} />
              <span style={{ fontSize: 13, color: "#b3b3b8", flex: 1 }}>to {a.dest}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#F2F1ED", fontFamily: "monospace" }}>
                {a.mins.map((m) => (m === a.mins[0] ? `${m}` : ` · ${m}`))}
                <span style={{ fontSize: 11, color: "#73737a", fontWeight: 400 }}> min</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TransitApp() {
  const [paywall, setPaywall] = useState(null);
  const [tab, setTab] = useState("nearby");
  const [saved, setSaved] = useState({});
  const [query, setQuery] = useState("");
  const [liveArrivals, setLiveArrivals] = useState({});
  const [liveAlerts, setLiveAlerts] = useState(ALERTS);
  const [usingLiveData, setUsingLiveData] = useState(false);
  const [locationStatus, setLocationStatus] = useState("loading");
  const [nearbyStations, setNearbyStations] = useState([]);
  const [nearbyBusStops, setNearbyBusStops] = useState([]);
  const [searchResults, setSearchResults] = useState({ stations: [], busStops: [] });

  const FREE_RADIUS_MILES = 0.25;

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const { lat, lng } = await getUserLocation();
        if (cancelled) return;
        setLocationStatus("granted");
        const [stationData, busData] = await Promise.all([
          fetchNearbyStations(lat, lng, FREE_RADIUS_MILES),
          fetchNearbyBusStops(lat, lng, FREE_RADIUS_MILES),
        ]);
        if (cancelled) return;
        setNearbyStations(stationData.stations.map((s) => ({ ...s, type: "subway" })));
        setNearbyBusStops(busData.stops.map((s) => ({ ...s, type: "bus", isBus: true })));
      } catch (err) {
        if (!cancelled) setLocationStatus(err.code === 1 ? "denied" : "error");
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (nearbyStations.length === 0 && nearbyBusStops.length === 0) return;
    let cancelled = false;
    async function loadLiveData() {
      try {
        const results = {};
        const allSubwayArrivals = await fetchAllSubwayArrivalsMerged();
        nearbyStations.forEach((station) => {
          const matches = allSubwayArrivals
            .filter((a) => a.stopId && a.stopId.startsWith(station.id))
            .sort((a, b) => a.arrivalUnix - b.arrivalUnix)
            .slice(0, 3);
          results[station.id] = matches.map((a) => ({
            line: a.line, dest: "—",
            mins: [Math.max(0, Math.round((a.arrivalUnix * 1000 - Date.now()) / 60000))],
          }));
        });
        await Promise.all(nearbyBusStops.map(async (stop) => {
          try {
            const data = await fetchBusArrivals(stop.id);
            results[stop.id] = data.arrivals.slice(0, 3).map((a) => ({
              line: a.line || "BUS", dest: a.destination,
              mins: a.expectedArrival
                ? [Math.max(0, Math.round((new Date(a.expectedArrival) - Date.now()) / 60000))]
                : [],
            }));
          } catch { results[stop.id] = []; }
        }));
        const alertData = await fetchAlertsLive();
        if (!cancelled) {
          setLiveArrivals(results);
          setLiveAlerts(alertData.alerts.slice(0, 4).map((a) => ({
            id: a.id, severity: "delay", line: a.lines[0] || "—", text: a.text,
          })));
          setUsingLiveData(true);
        }
      } catch (err) {
        console.warn("Live data unavailable:", err.message);
      }
    }
    loadLiveData();
    const interval = setInterval(loadLiveData, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [nearbyStations, nearbyBusStops]);

  useEffect(() => {
    if (tab !== "explore" || query.trim().length < 2) {
      setSearchResults({ stations: [], busStops: [] });
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const res = await searchStations(query.trim());
        if (!cancelled) setSearchResults(res);
      } catch (err) { console.warn("Search failed:", err.message); }
    }, 350);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [query, tab]);

  const toggleSave = (id) => {
    setSaved((s) => {
      const next = { ...s, [id]: !s[id] };
      const count = Object.values(next).filter(Boolean).length;
      if (count > 2 && next[id]) { setPaywall("Save unlimited stops"); return s; }
      return next;
    });
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#0a0a0b", minHeight: "100%", color: "#F2F1ED", maxWidth: 480, margin: "0 auto", paddingBottom: 90 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap'); * { box-sizing: border-box; }`}</style>
      <div style={{ padding: "22px 18px 14px", borderBottom: "1px solid #1c1c1f" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, color: "#FCCC0A", textTransform: "uppercase", marginBottom: 4 }}>NYC Transit</div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, margin: 0 }}>Right now, nearby</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#73737a" }}>
            <MapPin size={13} />
            {locationStatus === "loading" && "Locating…"}
            {locationStatus === "granted" && "Your location"}
            {locationStatus === "denied" && "Location off"}
            {locationStatus === "error" && "Location unavailable"}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <Search size={15} color="#5a5a5f" style={{ position: "absolute", left: 12, top: 11 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any station or bus stop, anywhere in NYC"
            style={{ width: "100%", background: "#16161a", border: "1px solid #232326", borderRadius: 10, padding: "10px 12px 10px 34px", color: "#F2F1ED", fontSize: 13.5, outline: "none" }}
          />
        </div>
      </div>
      <div style={{ padding: "12px 18px 0" }}>
        {usingLiveData && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, color: "#5fae6e" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#5fae6e", display: "inline-block" }} />
            Live MTA data
          </div>
        )}
        {liveAlerts.slice(0, 2).map((a) => (
          <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#1a1410", border: "1px solid #3a2c12", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
            <AlertTriangle size={15} color="#FCCC0A" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12.5, color: "#d8c9a3", lineHeight: 1.4 }}>
              <Bullet line={a.line} size={16} />{" "}
              <span style={{ marginLeft: 4 }}>{a.text}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, padding: "10px 18px 0" }}>
        {["nearby", "explore", "routes"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer", background: tab === t ? "#F2F1ED" : "transparent", color: tab === t ? "#0a0a0b" : "#73737a", fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>
            {t === "nearby" ? "Within ¼ mile" : t === "explore" ? "Anywhere in NYC" : "Routes"}
          </button>
        ))}
      </div>
      <div style={{ padding: "14px 18px 0" }}>
        {tab === "nearby" && (
          <>
            {locationStatus === "loading" && <p style={{ fontSize: 13, color: "#73737a" }}>Finding what's near you…</p>}
            {locationStatus === "denied" && <p style={{ fontSize: 13, color: "#73737a", lineHeight: 1.5 }}>Location access is off. Turn it on in your browser/phone settings, or use the search bar above.</p>}
            {locationStatus === "error" && <p style={{ fontSize: 13, color: "#73737a", lineHeight: 1.5 }}>Couldn't get your location just now. You can still search any station or stop above.</p>}
            {locationStatus === "granted" && nearbyStations.length === 0 && nearbyBusStops.length === 0 && (
              <p style={{ fontSize: 13, color: "#73737a" }}>Nothing within ¼ mile — try the search bar, or check Transit+ for a wider radius.</p>
            )}
            {nearbyStations.map((s) => <StopRow key={s.id} stop={s} locked={false} onLocked={() => {}} saved={!!saved[s.id]} onToggleSave={toggleSave} arrivalsData={liveArrivals} />)}
            {nearbyBusStops.map((s) => <StopRow key={s.id} stop={s} locked={false} onLocked={() => {}} saved={!!saved[s.id]} onToggleSave={toggleSave} arrivalsData={liveArrivals} />)}
          </>
        )}
        {tab === "explore" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, color: "#73737a", fontSize: 12 }}>
              <ChevronRight size={13} /> Search the full city — preview only past your free radius
            </div>
            {query.trim().length < 2 && <p style={{ fontSize: 13, color: "#73737a" }}>Type a station or bus stop name above to search all of NYC.</p>}
            {searchResults.stations.map((s) => <StopRow key={s.id} stop={s} locked={true} onLocked={(name) => setPaywall(`See live arrivals at ${name}`)} saved={!!saved[s.id]} onToggleSave={toggleSave} arrivalsData={{}} />)}
            {searchResults.busStops.map((s) => <StopRow key={s.id} stop={{ ...s, isBus: true }} locked={true} onLocked={(name) => setPaywall(`See live arrivals at ${name}`)} saved={!!saved[s.id]} onToggleSave={toggleSave} arrivalsData={{}} />)}
          </>
        )}
        {tab === "routes" && (
          <>
            <RoutePlanner onNeedsPaywall={(reason) => setPaywall(reason)} />
            <p style={{ fontSize: 11.5, color: "#5a5a5f", marginTop: 10, lineHeight: 1.5 }}>Free routes are limited to nearby stations. Citywide routing needs Transit+.</p>
          </>
        )}
      </div>
      {paywall && <PaywallModal reason={paywall} onClose={() => setPaywall(null)} />}
    </div>
  );
}
