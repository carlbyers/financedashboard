"use strict";

// ── Chart.js global defaults ─────────────────────────────────────────────────
Chart.defaults.color         = "#8b949e";
Chart.defaults.borderColor   = "#30363d";
Chart.defaults.font.family   = "'Inter','Segoe UI',system-ui,sans-serif";
Chart.defaults.font.size     = 11;

const C = {
  accent:  "#58a6ff",
  green:   "#3fb950",
  red:     "#f85149",
  amber:   "#d29922",
  purple:  "#bc8cff",
  muted:   "#8b949e",
  surface: "#1c2333",
};

// ── Spread table (mirrors backend) ───────────────────────────────────────────
const SPREAD_TABLE = {
  "Aaa/AAA":0.63,"Aa1/AA+":0.78,"Aa2/AA":0.88,"Aa3/AA-":1.04,
  "A1/A+":1.22,"A2/A":1.33,"A3/A-":1.56,
  "Baa1/BBB+":1.79,"Baa2/BBB":2.02,"Baa3/BBB-":2.60,
  "Ba1/BB+":3.28,"Ba2/BB":3.78,"Ba3/BB-":4.43,
  "B1/B+":5.25,"B2/B":6.00,"B3/B-":7.00,
  "Caa/CCC":10.00,"Ca/CC":14.00,"C":18.00,
};

// ── Utilities ────────────────────────────────────────────────────────────────
function fmt(n, d = 2) { return n == null ? "—" : Number(n).toFixed(d); }
function pct(n, d = 2)  { return n == null ? "—" : fmt(n, d) + "%"; }
function fmtM(n) {
  if (n == null) return "—";
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9)  return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6)  return "$" + (n / 1e6).toFixed(2) + "M";
  return "$" + n.toFixed(0);
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function el(id) { return document.getElementById(id); }

let _toastTimer = null;
function toast(msg, type = "") {
  const t = el("toast");
  t.textContent = msg;
  t.className = "show " + type;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.className = ""; }, 3500);
}

function setKpi(valId, chgId, value, change, decimals = 2) {
  el(valId).textContent = fmt(value, decimals);
  const c = el(chgId);
  if (change == null) { c.textContent = ""; return; }
  const sign = change > 0 ? "+" : "";
  c.textContent = `${sign}${fmt(change, decimals)}`;
  c.className = "kpi-chg " + (change > 0 ? "pos" : change < 0 ? "neg" : "flat");
}

function setTag(id, text, cls) {
  const t = el(id);
  t.textContent = text;
  t.className = "data-tag " + (cls || "");
}

// ── Tab switching ────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      el("tab-" + btn.dataset.tab).classList.add("active");

      // Resize charts after tab becomes visible
      [treasuryChart, erpChart, spreadsChart, waccChart].forEach(ch => ch && ch.resize());
    });
  });
}

// ── Chart factories ──────────────────────────────────────────────────────────
function makeTimeChart(canvasId, label, color) {
  const ctx = el(canvasId).getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, color + "2e");
  grad.addColorStop(1, color + "00");

  return new Chart(ctx, {
    type: "line",
    data: { datasets: [{ label, data: [], borderColor: color, backgroundColor: grad,
      borderWidth: 2, pointRadius: 0, pointHoverRadius: 5,
      pointHoverBackgroundColor: color, tension: 0.3, fill: true }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: C.surface, borderColor: "#444c56", borderWidth: 1,
          titleColor: "#e6edf3", bodyColor: C.muted, padding: 10,
          callbacks: {
            title: i => fmtDate(i[0].raw.x),
            label: i => ` ${i.dataset.label}: ${fmt(i.raw.y, 2)}%`,
          }
        }
      },
      scales: {
        x: { type: "time", time: { unit: "month", tooltipFormat: "yyyy-MM-dd" },
          grid: { color: "#21262d" }, ticks: { maxTicksLimit: 7, color: C.muted } },
        y: { grid: { color: "#21262d" },
          ticks: { color: C.muted, callback: v => v.toFixed(2) + "%" } }
      }
    }
  });
}

function makeSpreadsChart() {
  const ctx = el("spreads-chart").getContext("2d");
  return new Chart(ctx, {
    type: "bar",
    data: { labels: [], datasets: [{ label: "Spread (%)", data: [],
      backgroundColor: [], borderRadius: 4, borderSkipped: false }] },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: C.surface, borderColor: "#444c56", borderWidth: 1,
          titleColor: "#e6edf3", bodyColor: C.muted, padding: 10,
          callbacks: { label: i => ` Spread: +${fmt(i.raw, 2)}%` }
        }
      },
      scales: {
        x: { grid: { color: "#21262d" },
          ticks: { color: C.muted, callback: v => v.toFixed(1) + "%" },
          title: { display: true, text: "Spread over risk-free rate (%)", color: C.muted, font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { color: "#c9d1d9", font: { size: 10.5 } } }
      }
    }
  });
}

function makeWaccChart() {
  const ctx = el("wacc-chart").getContext("2d");
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Equity", "Debt"],
      datasets: [
        { label: "Weight (%)", data: [100, 0], backgroundColor: [C.accent + "cc", C.amber + "cc"],
          borderRadius: 6, borderSkipped: false, yAxisID: "y1" },
        { label: "Cost (%)",   data: [0, 0], backgroundColor: [C.accent + "55", C.amber + "55"],
          borderRadius: 6, borderSkipped: false, yAxisID: "y2" },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: C.muted, font: { size: 11 }, padding: 12 } },
        tooltip: {
          backgroundColor: C.surface, borderColor: "#444c56", borderWidth: 1,
          titleColor: "#e6edf3", bodyColor: C.muted, padding: 10,
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: C.muted } },
        y1: { type: "linear", position: "left",
          title: { display: true, text: "Weight (%)", color: C.muted, font: { size: 10 } },
          grid: { color: "#21262d" }, ticks: { color: C.muted, callback: v => v + "%" } },
        y2: { type: "linear", position: "right",
          title: { display: true, text: "Cost (%)", color: C.muted, font: { size: 10 } },
          grid: { display: false }, ticks: { color: C.muted, callback: v => v + "%" } },
      }
    }
  });
}

// ── Spread colour gradient ────────────────────────────────────────────────────
function spreadColor(val) {
  if (val < 1)   return C.green;
  if (val < 2.5) return C.accent;
  if (val < 5)   return C.amber;
  if (val < 10)  return C.red;
  return C.purple;
}

// ── Beta risk label ───────────────────────────────────────────────────────────
function betaRisk(b) {
  if (b < 0.5) return { label: "Very Low", cls: "risk-vlow"  };
  if (b < 0.8) return { label: "Low",      cls: "risk-low"   };
  if (b < 1.1) return { label: "Medium",   cls: "risk-med"   };
  if (b < 1.4) return { label: "High",     cls: "risk-high"  };
  return             { label: "Very High", cls: "risk-vhigh" };
}

function betaColor(b) {
  if (b < 0.6) return C.green;
  if (b < 1.0) return C.accent;
  if (b < 1.3) return C.amber;
  return C.red;
}

// ── State ─────────────────────────────────────────────────────────────────────
let treasuryChart, erpChart, spreadsChart, waccChart;
let betasData   = [];
let liveRf      = null;   // live 10Y yield (%)
let liveErp     = null;   // live ERP (%)
let bondsData   = [];     // spreads from server

// ── Key Drivers: load functions ───────────────────────────────────────────────
async function loadTreasury() {
  try {
    const d = await fetch("/api/treasury").then(r => r.json());
    const pts = (d.series || []).map(p => ({ x: p.date, y: p.value }));
    treasuryChart.data.datasets[0].data = pts;
    treasuryChart.update("none");

    liveRf = d.current?.value ?? null;
    setKpi("t-val", "t-chg", d.current?.value, d.change, 2);
    setTag("t-tag", `${pts.length} data points`, "live");

    // Pre-fill WACC Rf if not yet touched by user
    if (liveRf !== null) {
      const rfInput = el("f-rf");
      if (!rfInput.dataset.touched) rfInput.value = liveRf.toFixed(2);
    }
  } catch (e) {
    console.error(e);
    setTag("t-tag", "Error", "fallback");
    toast("Treasury data unavailable", "err");
  }
}

async function loadERP() {
  try {
    const d = await fetch("/api/erp").then(r => r.json());
    const pts = (d.series || []).map(p => ({ x: p.date, y: p.value }));
    erpChart.data.datasets[0].data = pts;
    erpChart.update("none");

    liveErp = d.current?.value ?? null;
    setKpi("e-val", "e-chg", d.current?.value, d.change, 2);
    const latest = d.current?.date ? fmtDate(d.current.date) : "—";
    setTag("e-tag", `Latest: ${latest}`, "live");

    if (liveErp !== null) {
      const erpInput = el("f-erp");
      if (!erpInput.dataset.touched) erpInput.value = liveErp.toFixed(2);
    }
  } catch (e) {
    console.error(e);
    setTag("e-tag", "Error", "fallback");
    toast("ERP data unavailable", "err");
  }
}

async function loadSpreads() {
  try {
    const d = await fetch("/api/bond-spreads").then(r => r.json());
    bondsData = d.spreads || [];
    spreadsChart.data.labels = bondsData.map(s => s.rating);
    spreadsChart.data.datasets[0].data            = bondsData.map(s => s.spread);
    spreadsChart.data.datasets[0].backgroundColor = bondsData.map(s => spreadColor(s.spread) + "cc");
    spreadsChart.update("none");
    setTag("s-tag", `${bondsData.length} ratings`, "live");
    recalcWacc();
  } catch (e) {
    console.error(e);
    setTag("s-tag", "Error", "fallback");
  }
}

async function loadBetas() {
  try {
    const d = await fetch("/api/betas").then(r => r.json());
    betasData = d.betas || [];
    renderBetaTable(betasData);
    setTag("b-tag", `${betasData.length} industries`, "live");
  } catch (e) {
    console.error(e);
    setTag("b-tag", "Error", "fallback");
  }
}

// ── Beta table ────────────────────────────────────────────────────────────────
function renderBetaTable(data) {
  const body = el("betas-body");
  if (!data.length) {
    body.innerHTML = '<tr><td colspan="3" class="loading-cell">No data</td></tr>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const row of data) {
    const { label, cls } = betaRisk(row.beta);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.industry}</td>
      <td><span class="beta-val" style="color:${betaColor(row.beta)}">${fmt(row.beta, 3)}</span></td>
      <td><span class="risk-pill ${cls}">${label}</span></td>`;
    frag.appendChild(tr);
  }
  body.innerHTML = "";
  body.appendChild(frag);
}

function applyBetaFilters() {
  const q   = el("beta-search").value.toLowerCase();
  const srt = el("beta-sort").value;
  let data = betasData.filter(d => d.industry.toLowerCase().includes(q));
  if (srt === "asc")  data.sort((a, b) => a.beta - b.beta);
  if (srt === "desc") data.sort((a, b) => b.beta - a.beta);
  if (srt === "name") data.sort((a, b) => a.industry.localeCompare(b.industry));
  renderBetaTable(data);
}

// ── WACC Builder ──────────────────────────────────────────────────────────────
async function loadCompany() {
  const ticker = el("wacc-ticker").value.trim().toUpperCase();
  if (!ticker) { toast("Enter a ticker symbol", "err"); return; }

  const btn = el("wacc-load-btn");
  btn.disabled = true;
  btn.textContent = "Loading…";

  try {
    const d = await fetch(`/api/lookup/${ticker}`).then(r => r.json());
    if (d.error) { toast(d.error, "err"); return; }

    // Show company card
    el("wcc-name").textContent    = d.name;
    el("wcc-sector").textContent  = d.sector;
    el("wcc-industry").textContent = d.industry;
    el("wcc-mcap").textContent    = fmtM(d.market_cap);
    el("wcc-debt").textContent    = fmtM(d.total_debt);
    el("wcc-beta-raw").textContent = fmt(d.beta_levered, 3);
    el("wacc-company-card").classList.remove("hidden");

    // Fill inputs (only if not manually touched)
    const betaInput = el("f-beta");
    const deInput   = el("f-de");
    const taxInput  = el("f-tax");

    betaInput.value = fmt(d.beta_levered, 3);
    deInput.value   = fmt(d.de_ratio, 4);
    taxInput.value  = fmt(d.tax_rate * 100, 1);

    // Set guessed rating in dropdown
    const ratingSelect = el("f-rating");
    const opt = Array.from(ratingSelect.options).find(o => o.value === d.guessed_rating);
    if (opt) ratingSelect.value = d.guessed_rating;

    recalcWacc();
    toast(`Loaded ${d.name}`, "ok");
  } catch (e) {
    toast("Lookup failed: " + e.message, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Load ↗";
  }
}

function getWaccInputs() {
  const rf     = parseFloat(el("f-rf").value)   || liveRf  || 4.39;
  const erp    = parseFloat(el("f-erp").value)  || liveErp || 4.98;
  const beta   = parseFloat(el("f-beta").value) || 1.0;
  const de     = parseFloat(el("f-de").value)   || 0.0;
  const tax    = parseFloat(el("f-tax").value)  || 21.0;
  const rating = el("f-rating").value;

  // Get spread from live data or table fallback
  const spreadObj = bondsData.find(s => s.rating === rating);
  const spread = spreadObj ? spreadObj.spread : (SPREAD_TABLE[rating] ?? 2.02);

  return { rf, erp, beta, de, tax, rating, spread };
}

function recalcWacc() {
  const { rf, erp, beta, de, tax, rating, spread } = getWaccInputs();

  const taxDec   = tax / 100;
  const ke       = rf / 100 + beta * (erp / 100);           // cost of equity
  const kdPre    = rf / 100 + spread / 100;                  // pre-tax cost of debt
  const kdAfter  = kdPre * (1 - taxDec);                     // after-tax cost of debt
  const eWeight  = 1 / (1 + de);
  const dWeight  = de / (1 + de);
  const wacc     = eWeight * ke + dWeight * kdAfter;

  // Update headline
  el("r-wacc").textContent  = fmt(wacc * 100, 2);
  el("r-wacc2").textContent = pct(wacc * 100, 2);
  el("r-wacc-sub").textContent =
    `Ke=${pct(ke*100,2)}  ·  Kd(at)=${pct(kdAfter*100,2)}  ·  E/V=${pct(eWeight*100,1)}  ·  D/V=${pct(dWeight*100,1)}`;

  // Update breakdown rows
  el("r-rf").textContent        = pct(rf, 2);
  el("r-rf2").textContent       = pct(rf, 2);
  el("r-beta").textContent      = fmt(beta, 3) + "×";
  el("r-erp").textContent       = pct(erp, 2);
  el("r-ke").textContent        = pct(ke * 100, 2);
  el("r-ew").textContent        = pct(eWeight * 100, 1);

  el("r-spread").textContent    = "+" + pct(spread, 2);
  el("r-kd-pre").textContent    = pct(kdPre * 100, 2);
  el("r-tax-shield").textContent = fmt((1 - taxDec) * 100, 1) + "×";
  el("r-kd").textContent        = pct(kdAfter * 100, 2);
  el("r-dw").textContent        = pct(dWeight * 100, 1);

  // Update chart
  waccChart.data.datasets[0].data = [eWeight * 100, dWeight * 100];
  waccChart.data.datasets[1].data = [ke * 100, kdAfter * 100];
  waccChart.update("active");
}

// ── Refresh all ───────────────────────────────────────────────────────────────
async function refreshAll() {
  const btn = el("refresh-btn");
  btn.disabled = true; btn.textContent = "↺ Refreshing…";
  try {
    await fetch("/api/refresh");
    await Promise.all([loadTreasury(), loadERP(), loadSpreads(), loadBetas()]);
    el("last-updated").textContent = new Date().toLocaleTimeString();
    toast("Data refreshed", "ok");
  } catch (e) {
    toast("Refresh failed: " + e.message, "err");
  } finally {
    btn.disabled = false; btn.textContent = "↺ Refresh";
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  initTabs();

  // Build charts
  treasuryChart = makeTimeChart("treasury-chart", "10Y Treasury Yield", C.accent);
  erpChart      = makeTimeChart("erp-chart",      "Implied ERP",        C.green);
  spreadsChart  = makeSpreadsChart();
  waccChart     = makeWaccChart();

  // Wire WACC inputs → live recalc
  ["f-rf","f-erp","f-beta","f-de","f-tax","f-rating"].forEach(id => {
    el(id).addEventListener("input", () => {
      el(id).dataset.touched = "1";
      recalcWacc();
    });
  });

  // Mark Rf/ERP as auto-filled when user types
  el("f-rf").addEventListener("input",  () => { el("f-rf").dataset.touched  = "1"; });
  el("f-erp").addEventListener("input", () => { el("f-erp").dataset.touched = "1"; });

  el("refresh-btn").addEventListener("click", refreshAll);
  el("wacc-load-btn").addEventListener("click", loadCompany);
  el("wacc-ticker").addEventListener("keydown", e => { if (e.key === "Enter") loadCompany(); });
  el("beta-search").addEventListener("input", applyBetaFilters);
  el("beta-sort").addEventListener("change", applyBetaFilters);

  // Load all data in parallel
  await Promise.all([loadTreasury(), loadERP(), loadSpreads(), loadBetas()]);
  el("last-updated").textContent = new Date().toLocaleTimeString();

  // Initial WACC calc with defaults
  recalcWacc();
})();
