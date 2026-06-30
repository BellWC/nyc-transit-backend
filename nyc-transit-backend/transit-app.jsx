import React, { useState, useEffect, useMemo } from "react";
import { MapPin, Clock, AlertTriangle, Lock, ChevronRight, Search, Star, Zap } from "lucide-react";

// ---- Mock data layer (structured to mirror real MTA GTFS-realtime shape) ----
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

const NEARBY_STOPS = [
  { id: "n1", name: "14 St – Union Sq", lines: ["4", "5", "6", "L", "N", "Q", "R", "W"], dist: 0.1 },
  { id: "n2", name: "3 Av", lines: ["L"], dist: 0.2 },
  { id: "n3", name: "M14A Bus — 14 St", lines: ["BUS"], dist: 0.15, busLabel: "M14A" },
  { id: "n4", name: "8 St – NYU", lines: ["R", "W"], dist: 0.3 },
];

const FAR_STOPS = [
  { id: "f1", name: "Times Sq – 42 St", lines: ["1", "2", "3", "7", "N", "Q", "R", "W"], dist: 1.4 },
  { id: "f2", name: "Atlantic Av – Barclays Ctr", lines: ["2", "3", "4", "5", "B", "D", "N", "Q", "R"], dist: 3.1 },
  { id: "f3", name: "Jackson Hts – Roosevelt Av", lines: ["7", "E", "F", "M", "R"], dist: 5.8 },
];

const ARRIVALS = {
  n1: [
    { line: "6", dest: "Pelham Bay Park", mins: [2, 11, 19] },
    { line: "L", dest: "8 Av", mins: [4, 13] },
    { line: "N", dest: "Astoria", mins: [6, 16] },
  ],
  n2: [{ line: "L", dest: "Canarsie", mins: [3, 12, 21] }],
  n3: [{ line: "BUS", dest: "8 Av", mins: [5, 17, 29] }],
  n4: [{ line: "R", dest: "Forest Hills", mins: [7, 18] }],
  f1: [{ line: "7", dest: "Flushing", mins: [3, 9, 15] }],
  f2: [{ line: "B", dest: "145 St", mins: [4, 14] }],
  f3: [{ line: "E", dest: "World Trade Center", mins: [2, 10] }],
};

const ALERTS = [
  { id: "a1", severity: "delay", line: "L", text: "Trains running with delays in both directions due to signal problems near Bedford Av." },
  { id: "a2", severity: "info", line: "6", text: "Weekend service changes — trains skip 3 stations in the Bronx." },
  { id: "a3", severity: "delay", line: "BUS", text: "M14A detoured due to a street closure on 14 St." },
];

function Bullet({ line, size = 26 }) {
  const isBus = line === "BUS";
  const bg = LINE_COLORS[line] || "#888";
  return (
    <div
      style={{
        width: size, height: size, borderRadius: isBus ? 6 : "50%",
        background: bg, color: "#fff", display: "flex", alignItems: "center",
        justifyContent: "center", fontWeight: 700, fontSize: size * 0.5,
        fontFamily: "'Helvetica Neue', Arial, sans-serif", flexShrink: 0,
        letterSpacing: isBus ? "-0.5px" : 0,
      }}
    >
      {isBus ? "B" : line}
    </div>
  );
}

function PaywallModal({ onClose, reason }) {
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

function StopRow({ stop, locked, onLocked, saved, onToggleSave }) {
  const arrivals = ARRIVALS[stop.id] || [];
  return (
    <div
      style={{
        border: "1px solid #232326", borderRadius: 14, padding: "14px 16px",
        marginBottom: 10, background: "#121214", position: "relative",
        filter: locked ? "saturate(0.4)" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {stop.lines.slice(0, 6).map((l, i) => (
            <Bullet key={i} line={l} size={22} />
          ))}
        </div>
        <button
          onClick={() => onToggleSave(stop.id)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
          aria-label="Save stop"
        >
          <Star size={17} color={saved ? "#FCCC0A" : "#4a4a4f"} fill={saved ? "#FCCC0A" : "none"} />
        </button>
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 17, margin: 0, color: "#F2F1ED" }}>{stop.name}</h3>
        <span style={{ fontSize: 12, color: "#73737a" }}>{stop.dist} mi</span>
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

  const toggleSave = (id) => {
    setSaved((s) => {
      const next = { ...s, [id]: !s[id] };
      const count = Object.values(next).filter(Boolean).length;
      if (count > 2 && next[id]) {
        setPaywall("Save unlimited stops");
        return s;
      }
      return next;
    });
  };

  const filteredFar = useMemo(
    () => FAR_STOPS.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  return (
    <div
      style={{
        fontFamily: "'Inter', sans-serif", background: "#0a0a0b", minHeight: "100%",
        color: "#F2F1ED", maxWidth: 480, margin: "0 auto", paddingBottom: 90,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "22px 18px 14px", borderBottom: "1px solid #1c1c1f" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, color: "#FCCC0A", textTransform: "uppercase", marginBottom: 4 }}>
              NYC Transit
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, margin: 0 }}>Right now, nearby</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#73737a" }}>
            <MapPin size={13} /> Union Sq
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <Search size={15} color="#5a5a5f" style={{ position: "absolute", left: 12, top: 11 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any station, anywhere in NYC"
            style={{
              width: "100%", background: "#16161a", border: "1px solid #232326",
              borderRadius: 10, padding: "10px 12px 10px 34px", color: "#F2F1ED",
              fontSize: 13.5, outline: "none",
            }}
          />
        </div>
      </div>

      {/* Alerts strip */}
      <div style={{ padding: "12px 18px 0" }}>
        {ALERTS.slice(0, 2).map((a) => (
          <div
            key={a.id}
            style={{
              display: "flex", gap: 10, alignItems: "flex-start", background: "#1a1410",
              border: "1px solid #3a2c12", borderRadius: 10, padding: "10px 12px", marginBottom: 8,
            }}
          >
            <AlertTriangle size={15} color="#FCCC0A" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12.5, color: "#d8c9a3", lineHeight: 1.4 }}>
              <Bullet line={a.line} size={16} />{" "}
              <span style={{ marginLeft: 4 }}>{a.text}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "10px 18px 0" }}>
        {["nearby", "explore"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer",
              background: tab === t ? "#F2F1ED" : "transparent",
              color: tab === t ? "#0a0a0b" : "#73737a",
              fontSize: 13, fontWeight: 600, textTransform: "capitalize",
            }}
          >
            {t === "nearby" ? "Within ¼ mile" : "Anywhere in NYC"}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ padding: "14px 18px 0" }}>
        {tab === "nearby" &&
          NEARBY_STOPS.map((s) => (
            <StopRow
              key={s.id}
              stop={s}
              locked={false}
              onLocked={() => {}}
              saved={!!saved[s.id]}
              onToggleSave={toggleSave}
            />
          ))}

        {tab === "explore" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, color: "#73737a", fontSize: 12 }}>
              <ChevronRight size={13} /> Outside your free range — preview only
            </div>
            {filteredFar.map((s) => (
              <StopRow
                key={s.id}
                stop={s}
                locked={true}
                onLocked={(name) => setPaywall(`See live arrivals at ${name}`)}
                saved={!!saved[s.id]}
                onToggleSave={toggleSave}
              />
            ))}
          </>
        )}
      </div>

      {/* Route planner teaser */}
      <div style={{ padding: "6px 18px 0" }}>
        <button
          onClick={() => setPaywall("Unlock citywide route planning")}
          style={{
            width: "100%", marginTop: 8, display: "flex", alignItems: "center", gap: 10,
            background: "linear-gradient(135deg,#16161a,#1c1c1f)", border: "1px solid #232326",
            borderRadius: 14, padding: "14px 16px", cursor: "pointer", textAlign: "left",
          }}
        >
          <Clock size={18} color="#FCCC0A" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#F2F1ED" }}>Plan a trip across the city</div>
            <div style={{ fontSize: 12, color: "#73737a" }}>Compare every route, not just what's close</div>
          </div>
          <Lock size={14} color="#5a5a5f" />
        </button>
      </div>

      {paywall && <PaywallModal reason={paywall} onClose={() => setPaywall(null)} />}
    </div>
  );
}
