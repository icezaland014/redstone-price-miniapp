// RED Quick Stats — RedStone (frontend-only)
const API_BASE = "https://api.redstone.finance/prices";
const DEFAULT_SYMBOL = "RED";

const $ = (id) => document.getElementById(id);
let latest = { price: null, provider: "auto" };

// ---------- formatting ----------
const fmtNumber = (n) =>
  n == null ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 6 });
const fmtTime = (ts) => new Date(ts).toLocaleString();
function fmtAge(ts) {
  const d = Date.now() - ts;
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

// ---------- fetch helpers ----------
function aliasesForRed(symbol) {
  // try common aliases for RedStone token
  if (symbol.toUpperCase() === "RED") return ["RED", "REDSTONE"];
  return [symbol.toUpperCase()];
}

async function fetchOnce(sym, { provider, source } = {}) {
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

async function fetchSmart(symbol) {
  const aliases = aliasesForRed(symbol);
  const plans = [];
  for (const a of aliases) {
    plans.push({ sym: a, label: "auto" }); // no provider
    plans.push({ sym: a, provider: "redstone-primary-prod", label: "redstone-primary-prod" });
    // fallback to external source proxied by RedStone API
    plans.push({ sym: a, source: "coingecko", label: "source:coingecko" });
  }

  let lastErr;
  for (const p of plans) {
    try {
      const obj = await fetchOnce(p.sym, { provider: p.provider, source: p.source });
      return { obj, resolved: p.label };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("price not found");
}

// Try to approximate 24h change using a fallback source if available
async function tryFetch24hChange(symbol) {
  try {
    const url = new URL(API_BASE);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("source", "coingecko"); // use coingecko series if available
    // Some deployments support `period=24h` returning { value, previousValue }
    url.searchParams.set("period", "24h");
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error("no series");
    const data = await res.json();
    const obj = Array.isArray(data) ? data[0] : data;
    const now = obj?.value ?? obj?.price ?? null;
    const prev = obj?.previousValue ?? null;
    if (now == null || prev == null) throw new Error("insufficient series");
    const pct = ((now - prev) / prev) * 100;
    return pct;
  } catch {
    return null; // graceful fallback
  }
}

// ---------- UI update ----------
async function update() {
  $("sym").textContent = DEFAULT_SYMBOL;
  $("status").textContent = "Loading…";
  $("change").textContent = "—";

  try {
    const { obj, resolved } = await fetchSmart(DEFAULT_SYMBOL);
    const val = obj.value ?? obj.price ?? obj.latestPrice;
    const ts = obj.timestamp || obj.updatedAt || Date.now();

    latest.price = val;
    latest.provider = obj.provider || resolved || "auto";

    $("price").textContent = fmtNumber(val);
    $("prov").textContent = latest.provider;
    $("time").textContent = fmtTime(ts);
    $("age").textContent = fmtAge(ts);
    $("signer").textContent =
      (obj.metadata && (obj.metadata.signer || obj.metadata.source)) ||
      obj.signer ||
      "—";
    $("status").textContent = "Updated";

    // optional 24h change
    const pct = await tryFetch24hChange(DEFAULT_SYMBOL);
    if (pct == null) {
      $("change").textContent = "—";
    } else {
      const sign = pct >= 0 ? "+" : "";
      $("change").textContent = `${sign}${pct.toFixed(2)}%`;
      $("change").style.borderColor = pct >= 0 ? "rgba(16,185,129,.5)" : "rgba(239,68,68,.5)";
      $("change").style.color = pct >= 0 ? "rgb(16,185,129)" : "rgb(239,68,68)";
    }
  } catch (err) {
    $("status").textContent = "Error: " + err.message;
    console.error(err);
  }
}

// ---------- Share to Warpcast ----------
function shareToWarpcast() {
  const price = latest.price != null ? `$${fmtNumber(latest.price)}` : "—";
  const provider = latest.provider || "RedStone";
  const text = `RED Quick Stats — Price: ${price} (via ${provider}) #RedStone #oracle`;
  const url = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

// ---------- Farcaster ready ----------
function farcasterReady() {
  try {
    const sdk = window.FarcasterMiniApps?.createClient?.() || window.FarcasterMiniApps?.client;
    if (sdk?.actions?.ready) sdk.actions.ready();
    else window?.farcaster?.actions?.ready?.();
  } catch {}
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  $("refresh").addEventListener("click", update);
  $("share").addEventListener("click", shareToWarpcast);
  update();
  farcasterReady();
});
