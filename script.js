// === RedStone Price MiniApp (smart fetch with RED support) ===
const API_BASE = "https://api.redstone.finance/prices";

const $ = (id) => document.getElementById(id);
let timer = null;

function fmtNumber(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 6 });
}
function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}
function fmtAge(ts) {
  const delta = Date.now() - ts;
  if (delta < 1000) return "now";
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

// ---- helpers for multi-attempt fetching ----
function getAliases(symbol) {
  const s = symbol.toUpperCase();
  if (s === "RED") return ["RED", "REDSTONE"]; // try both
  return [s];
}

async function fetchFrom(sym, { provider, source } = {}) {
  const url = new URL(API_BASE);
  url.searchParams.set("symbol", sym);
  if (provider) url.searchParams.set("provider", provider);
  if (source) url.searchParams.set("source", source);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const obj = Array.isArray(data) ? data[0] : data;
  const val = obj?.value ?? obj?.price ?? obj?.latestPrice;
  if (val == null) throw new Error("no price in response");
  return obj;
}

/**
 * Try multiple plans until one returns a price.
 * Plans order:
 *  - Explicit provider (if user chose)
 *  - Auto (no provider)
 *  - redstone-primary-prod
 *  - source=coingecko (fallback)
 */
async function fetchPriceSmart(symbol, chosenProvider) {
  const aliases = getAliases(symbol);
  const plans = [];

  if (chosenProvider) {
    for (const a of aliases) plans.push({ sym: a, provider: chosenProvider, label: chosenProvider });
  } else {
    for (const a of aliases) {
      plans.push({ sym: a, label: "auto" }); // no provider param
      plans.push({ sym: a, provider: "redstone-primary-prod", label: "redstone-primary-prod" });
      // Fallback through RedStone API using external source
      plans.push({ sym: a, source: "coingecko", label: "source:coingecko" });
    }
  }

  let lastErr;
  for (const p of plans) {
    try {
      const obj = await fetchFrom(p.sym, { provider: p.provider, source: p.source });
      return { obj, resolved: p.label };
    } catch (e) {
      lastErr = e;
      // try next plan
    }
  }
  throw lastErr || new Error("price not found");
}

async function update() {
  const symbol = $("symbol").value.trim().toUpperCase();
  const provider = $("provider").value || undefined;
  $("sym").textContent = symbol;
  $("status").textContent = "Loading…";

  try {
    const { obj, resolved } = await fetchPriceSmart(symbol, provider);

    $("price").textContent = fmtNumber(obj.value ?? obj.price ?? obj.latestPrice);
    $("prov").textContent = obj.provider || resolved || "auto";
    const ts = obj.timestamp || obj.updatedAt || Date.now();
    $("time").textContent = fmtTime(ts);
    $("age").textContent = fmtAge(ts);
    $("signer").textContent = (obj.metadata && (obj.metadata.signer || obj.metadata.source)) || obj.signer || "—";
    $("status").textContent = "Updated";
  } catch (err) {
    $("status").textContent = "Error: " + err.message;
    $("price").textContent = "—";
    console.error(err);
  }
}

function setIntervalHandler(ms) {
  if (timer) clearInterval(timer);
  if (ms > 0) timer = setInterval(update, ms);
}

// Farcaster splash: call ready() once UI is up
function farcasterReady() {
  try {
    const sdk = window.FarcasterMiniApps?.createClient?.() || window.FarcasterMiniApps?.client;
    if (sdk?.actions?.ready) sdk.actions.ready();
    else window?.farcaster?.actions?.ready?.();
  } catch (_) {}
}

// init
document.addEventListener("DOMContentLoaded", () => {
  $("refresh").addEventListener("click", update);
  $("controls").addEventListener("change", () => {
    const ms = Number($("interval").value);
    setIntervalHandler(ms);
    update();
  });

  setIntervalHandler(Number($("interval").value));
  update();
  farcasterReady();
});
