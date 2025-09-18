// === Config ===
// Base endpoint for RedStone Price API (Data Service).
// Public endpoint typically: https://api.redstone.finance/prices?symbol=ETH
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

async function fetchPrice(symbol, provider) {
  const url = new URL(API_BASE);
  url.searchParams.set("symbol", symbol);
  if (provider) url.searchParams.set("provider", provider);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function update() {
  const symbol = $("symbol").value.trim().toUpperCase();
  const provider = $("provider").value;
  $("sym").textContent = symbol;
  $("status").textContent = "กำลังโหลด…";

  try {
    const p = await fetchPrice(symbol, provider || undefined);

    $("price").textContent = fmtNumber(p.value ?? p.price ?? p.latestPrice);
    $("prov").textContent = p.provider || provider || "auto";
    $("time").textContent = fmtTime(p.timestamp || p.updatedAt || Date.now());
    $("age").textContent = fmtAge(p.timestamp || p.updatedAt || Date.now());
    $("signer").textContent = (p.metadata && (p.metadata.signer || p.metadata.source)) || p.signer || "—";
    $("status").textContent = "อัปเดตแล้ว";
  } catch (err) {
    $("status").textContent = "มีข้อผิดพลาด: " + err.message;
    console.error(err);
  }
}

function setIntervalHandler(ms) {
  if (timer) clearInterval(timer);
  if (ms > 0) timer = setInterval(update, ms);
}

$("refresh").addEventListener("click", update);
$("controls").addEventListener("change", () => {
  const ms = Number($("interval").value);
  setIntervalHandler(ms);
  update();
});

// init
setIntervalHandler(Number($("interval").value));
update();


function farcasterReady() {
  try {
    const sdk = window.FarcasterMiniApps?.createClient?.() || window.FarcasterMiniApps?.client;
    if (sdk?.actions?.ready) {
      sdk.actions.ready();
      console.log("Farcaster MiniApp ready()");
      return;
    }
    window?.farcaster?.actions?.ready?.();
  } catch (e) {
    console.warn("farcaster ready failed (non-critical):", e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  farcasterReady();
});
