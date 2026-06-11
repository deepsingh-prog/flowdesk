import React, { useState, useEffect, useMemo, useRef } from "react";

// ============================================================
// FLOW DESK — Daily Options Flow Scanner (Weekly Calls/Puts)
// Deep Singh G L R
// ------------------------------------------------------------
// DATA LAYER: Currently simulated. To go live, replace
// `generatePrint` / the feed interval with one of:
//   • Unusual Whales API  — GET /api/option-trades/flow-alerts
//   • Polygon.io          — WebSocket wss://socket.polygon.io/options
//   • Tradier             — GET /v1/markets/options/chains (volume/OI)
// Map fields into the same `print` shape below and the whole
// UI works unchanged.
// ============================================================

const TICKERS = ["NVDA","TSLA","AAPL","SPY","QQQ","AMD","META","AMZN","MSFT","PLTR","COIN","SMCI","GOOGL","NFLX","AVGO"];
const SPOT = { NVDA: 142, TSLA: 268, AAPL: 214, SPY: 612, QQQ: 545, AMD: 168, META: 705, AMZN: 228, MSFT: 462, PLTR: 92, COIN: 312, SMCI: 48, GOOGL: 196, NFLX: 1240, AVGO: 255 };

let idSeq = 1;
function generatePrint(now = Date.now()) {
  const ticker = TICKERS[Math.floor(Math.random() * TICKERS.length)];
  const side = Math.random() > 0.45 ? "CALL" : "PUT";
  const spot = SPOT[ticker];
  const otm = (Math.random() * 0.08 + 0.005) * (side === "CALL" ? 1 : -1);
  const strike = Math.round(spot * (1 + otm) / (spot > 400 ? 5 : 1)) * (spot > 400 ? 5 : 1);
  // Weekly expiry = this Friday
  const d = new Date(now);
  const friday = new Date(d); friday.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7) - (d.getDay() === 5 ? 7 : 0));
  const dte = Math.max(0, Math.round((friday - d) / 86400000));
  const premium = Math.round((Math.random() ** 2 * 2400 + 60)) * 1000; // $60K–$2.4M skew small
  const vol = Math.round(premium / (Math.random() * 400 + 100));
  const oi = Math.round(vol * (Math.random() * 1.4 + 0.1));
  const volOi = oi > 0 ? vol / oi : 9.9;
  const type = premium > 900000 ? "BLOCK" : Math.random() > 0.5 ? "SWEEP" : "SPLIT";
  const aggressor = Math.random() > 0.35 ? "ASK" : "BID"; // ask-side = aggressive buy
  // Smart-money score: aggressive + sweep + vol>OI + size + short-dated
  let score = 0;
  if (aggressor === "ASK") score += 25;
  if (type === "SWEEP") score += 20; if (type === "BLOCK") score += 15;
  if (volOi > 1) score += 25; else if (volOi > 0.5) score += 10;
  score += Math.min(20, premium / 100000);
  if (dte <= 5) score += 10;
  return {
    id: idSeq++, ts: now, ticker, side, strike, dte,
    expiry: `${friday.getMonth() + 1}/${friday.getDate()}`,
    premium, vol, oi, volOi, type, aggressor, score: Math.round(Math.min(100, score)),
  };
}

const fmtUsd = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1e3)}K`;
const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function FlowDesk() {
  const [prints, setPrints] = useState(() => Array.from({ length: 40 }, (_, i) => generatePrint(Date.now() - i * 47000)).sort((a, b) => b.ts - a.ts));
  const [live, setLive] = useState(true);
  const [sideFilter, setSideFilter] = useState("ALL");
  const [minPremium, setMinPremium] = useState(100000);
  const [sweepsOnly, setSweepsOnly] = useState(false);
  const [askOnly, setAskOnly] = useState(true);
  const [watch, setWatch] = useState({});
  const [selected, setSelected] = useState(null);
  const flash = useRef(null);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      const p = generatePrint();
      flash.current = p.id;
      setPrints((prev) => [p, ...prev].slice(0, 300));
    }, 2800);
    return () => clearInterval(t);
  }, [live]);

  const filtered = useMemo(() => prints.filter((p) =>
    (sideFilter === "ALL" || p.side === sideFilter) &&
    p.premium >= minPremium &&
    (!sweepsOnly || p.type === "SWEEP" || p.type === "BLOCK") &&
    (!askOnly || p.aggressor === "ASK")
  ), [prints, sideFilter, minPremium, sweepsOnly, askOnly]);

  const callPrem = filtered.filter((p) => p.side === "CALL").reduce((s, p) => s + p.premium, 0);
  const putPrem = filtered.filter((p) => p.side === "PUT").reduce((s, p) => s + p.premium, 0);
  const total = callPrem + putPrem || 1;
  const callPct = Math.round((callPrem / total) * 100);

  // Top tickers by net call premium
  const byTicker = useMemo(() => {
    const m = {};
    filtered.forEach((p) => {
      m[p.ticker] = m[p.ticker] || { call: 0, put: 0 };
      m[p.ticker][p.side === "CALL" ? "call" : "put"] += p.premium;
    });
    return Object.entries(m).map(([t, v]) => ({ t, net: v.call - v.put, gross: v.call + v.put }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 6);
  }, [filtered]);

  const S = styles;
  return (
    <div style={S.app}>
      <style>{css}</style>

      {/* Header */}
      <header style={S.header}>
        <div>
          <div style={S.brand}>FLOW DESK</div>
          <div style={S.sub}>Weekly options · institutional prints · {new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</div>
        </div>
        <button onClick={() => setLive(!live)} style={{ ...S.liveBtn, borderColor: live ? "#2EBD85" : "#555" }}>
          <span className={live ? "pulse" : ""} style={{ ...S.dot, background: live ? "#2EBD85" : "#555" }} />
          {live ? "LIVE" : "PAUSED"}
        </button>
      </header>

      {/* Sentiment gauge */}
      <section style={S.gaugeWrap}>
        <div style={S.gaugeLabels}>
          <span style={{ color: "#2EBD85", fontWeight: 700 }}>{fmtUsd(callPrem)} CALLS</span>
          <span style={{ color: "#C9A227", fontFamily: "Georgia, serif", fontStyle: "italic" }}>{callPct}% bullish flow</span>
          <span style={{ color: "#E5484D", fontWeight: 700 }}>{fmtUsd(putPrem)} PUTS</span>
        </div>
        <div style={S.gaugeBar}>
          <div style={{ width: `${callPct}%`, background: "linear-gradient(90deg,#1d7a57,#2EBD85)", transition: "width .6s" }} />
          <div style={{ flex: 1, background: "linear-gradient(90deg,#E5484D,#8f2a30)" }} />
        </div>
      </section>

      {/* Top net flow */}
      <section style={S.heatRow}>
        {byTicker.map((x) => (
          <div key={x.t} style={S.heatChip}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{x.t}</div>
            <div style={{ fontSize: 11, color: x.net >= 0 ? "#2EBD85" : "#E5484D" }}>
              {x.net >= 0 ? "▲" : "▼"} {fmtUsd(Math.abs(x.net))}
            </div>
          </div>
        ))}
      </section>

      {/* Filters */}
      <section style={S.filters}>
        <div style={S.segment}>
          {["ALL", "CALL", "PUT"].map((s) => (
            <button key={s} onClick={() => setSideFilter(s)}
              style={{ ...S.segBtn, ...(sideFilter === s ? S.segActive(s) : {}) }}>
              {s === "ALL" ? "All" : s === "CALL" ? "Calls" : "Puts"}
            </button>
          ))}
        </div>
        <select value={minPremium} onChange={(e) => setMinPremium(+e.target.value)} style={S.select}>
          <option value={50000}>≥ $50K</option>
          <option value={100000}>≥ $100K</option>
          <option value={250000}>≥ $250K</option>
          <option value={500000}>≥ $500K</option>
          <option value={1000000}>≥ $1M</option>
        </select>
        <button onClick={() => setSweepsOnly(!sweepsOnly)} style={{ ...S.toggle, ...(sweepsOnly ? S.toggleOn : {}) }}>Sweeps</button>
        <button onClick={() => setAskOnly(!askOnly)} style={{ ...S.toggle, ...(askOnly ? S.toggleOn : {}) }}>Ask-side</button>
      </section>

      {/* Flow tape */}
      <main style={S.tape}>
        <div style={S.tapeHead}>
          <span style={{ width: 52 }}>Time</span><span style={{ width: 50 }}>Ticker</span>
          <span style={{ flex: 1 }}>Contract</span><span style={{ width: 64, textAlign: "right" }}>Premium</span>
          <span style={{ width: 40, textAlign: "right" }}>Score</span><span style={{ width: 26 }} />
        </div>
        {filtered.length === 0 && (
          <div style={S.empty}>No prints match these filters. Lower the premium floor or turn off Sweeps / Ask-side.</div>
        )}
        {filtered.map((p) => (
          <div key={p.id} className={flash.current === p.id ? "rowFlash" : ""}
            onClick={() => setSelected(selected === p.id ? null : p.id)} style={S.row}>
            <div style={S.rowMain}>
              <span style={{ width: 52, color: "#7d8499", fontSize: 11 }}>{fmtTime(p.ts)}</span>
              <span style={{ width: 50, fontWeight: 700 }}>{p.ticker}</span>
              <span style={{ flex: 1, color: p.side === "CALL" ? "#2EBD85" : "#E5484D", fontWeight: 600, fontSize: 12 }}>
                ${p.strike} {p.side[0]} · {p.expiry} ({p.dte}d)
              </span>
              <span style={{ width: 64, textAlign: "right", fontWeight: 700, color: p.premium >= 1e6 ? "#C9A227" : "#E8E6DF" }}>{fmtUsd(p.premium)}</span>
              <span style={{ width: 40, textAlign: "right" }}>
                <span style={{ ...S.score, background: p.score >= 75 ? "#C9A22722" : "transparent", color: p.score >= 75 ? "#C9A227" : "#7d8499", border: p.score >= 75 ? "1px solid #C9A22755" : "1px solid #2a3352" }}>{p.score}</span>
              </span>
              <button onClick={(e) => { e.stopPropagation(); setWatch((w) => ({ ...w, [p.ticker]: !w[p.ticker] })); }}
                style={{ ...S.star, color: watch[p.ticker] ? "#C9A227" : "#3a4366" }} aria-label={watch[p.ticker] ? `Remove ${p.ticker} from watchlist` : `Add ${p.ticker} to watchlist`}>★</button>
            </div>
            {selected === p.id && (
              <div style={S.detail}>
                <span><b>{p.type}</b> at the <b>{p.aggressor}</b></span>
                <span>Vol {p.vol.toLocaleString()} / OI {p.oi.toLocaleString()} <b style={{ color: p.volOi > 1 ? "#C9A227" : "#7d8499" }}>({p.volOi.toFixed(1)}x)</b></span>
                <span>{p.volOi > 1 ? "New position opening — volume exceeds open interest" : "Could be closing existing position"}</span>
              </div>
            )}
          </div>
        ))}
      </main>

      <footer style={S.foot}>
        Simulated feed — wire Unusual Whales or Polygon API in the data layer to go live. Not financial advice.
      </footer>
    </div>
  );
}

const css = `
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
  .pulse { animation: pulse 1.4s infinite }
  @keyframes flashIn { from { background:#C9A22718 } to { background:transparent } }
  .rowFlash { animation: flashIn 1.6s ease-out }
  @media (prefers-reduced-motion: reduce) { .pulse,.rowFlash { animation:none } }
  ::-webkit-scrollbar { width: 4px } ::-webkit-scrollbar-thumb { background:#2a3352 }
  select:focus, button:focus-visible { outline: 2px solid #C9A227; outline-offset: 1px }
`;

const styles = {
  app: { minHeight: "100vh", background: "#0A0F1E", color: "#E8E6DF", fontFamily: "'Helvetica Neue', system-ui, sans-serif", maxWidth: 760, margin: "0 auto", padding: "16px 14px 8px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  brand: { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 26, letterSpacing: 6, color: "#C9A227" },
  sub: { fontSize: 11, color: "#7d8499", marginTop: 3, letterSpacing: 0.4 },
  liveBtn: { display: "flex", alignItems: "center", gap: 7, background: "transparent", border: "1px solid", borderRadius: 20, padding: "6px 14px", color: "#E8E6DF", fontSize: 11, letterSpacing: 2, cursor: "pointer" },
  dot: { width: 7, height: 7, borderRadius: "50%" },
  gaugeWrap: { marginBottom: 16 },
  gaugeLabels: { display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 },
  gaugeBar: { display: "flex", height: 8, borderRadius: 4, overflow: "hidden", border: "1px solid #1c2440" },
  heatRow: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 14 },
  heatChip: { flex: "0 0 auto", background: "#111831", border: "1px solid #1c2440", borderRadius: 10, padding: "8px 12px", minWidth: 72, textAlign: "center" },
  filters: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 },
  segment: { display: "flex", background: "#111831", borderRadius: 8, border: "1px solid #1c2440", overflow: "hidden" },
  segBtn: { background: "transparent", border: "none", color: "#7d8499", padding: "7px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600 },
  segActive: (s) => ({ background: s === "CALL" ? "#2EBD85" : s === "PUT" ? "#E5484D" : "#C9A227", color: "#0A0F1E" }),
  select: { background: "#111831", color: "#E8E6DF", border: "1px solid #1c2440", borderRadius: 8, padding: "7px 10px", fontSize: 12 },
  toggle: { background: "#111831", color: "#7d8499", border: "1px solid #1c2440", borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 },
  toggleOn: { color: "#C9A227", borderColor: "#C9A22766", background: "#C9A22711" },
  tape: { background: "#0D1326", border: "1px solid #1c2440", borderRadius: 12, overflow: "hidden" },
  tapeHead: { display: "flex", padding: "9px 12px", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "#5b6380", borderBottom: "1px solid #1c2440" },
  row: { borderBottom: "1px solid #131a33", cursor: "pointer", padding: "10px 12px" },
  rowMain: { display: "flex", alignItems: "center", fontSize: 13 },
  score: { display: "inline-block", borderRadius: 5, padding: "1px 6px", fontSize: 11, fontWeight: 700 },
  star: { background: "none", border: "none", fontSize: 15, cursor: "pointer", width: 26, padding: 0 },
  detail: { display: "flex", flexDirection: "column", gap: 4, marginTop: 8, padding: "8px 10px", background: "#111831", borderRadius: 8, fontSize: 12, color: "#a9afc3" },
  empty: { padding: 28, textAlign: "center", color: "#5b6380", fontSize: 13 },
  foot: { textAlign: "center", fontSize: 10, color: "#3a4366", padding: "14px 0 6px", letterSpacing: 0.5 },
};
