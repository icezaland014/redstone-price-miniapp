// --- เพิ่มฟังก์ชัน fallback: ดึงตรงจาก CoinGecko ---
async function fetchFromCoinGecko() {
  // CoinGecko id ของ RedStone คือ "redstone"
  const url = "https://api.coingecko.com/api/v3/simple/price?ids=redstone&vs_currencies=usd&include_24hr_change=true";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`CG HTTP ${res.status}`);
  const data = await res.json();
  const usd = data?.redstone?.usd;
  if (usd == null) throw new Error("CG no price");
  const changePct = data?.redstone?.usd_24h_change ?? null; // อาจได้หรือไม่ได้
  const now = Date.now();
  // สร้างอ็อบเจ็กต์ให้หน้าบ้านใช้เหมือน RedStone
  return {
    value: usd,
    provider: "coingecko-direct",
    timestamp: now,
    metadata: { source: "coingecko" },
    _cgChangePct: changePct
  };
}

// --- แก้ fetchSmart ให้ลอง CoinGecko เป็นชั้นสุดท้าย ---
async function fetchSmart(symbol) {
  const al = aliases(symbol);
  const plans = [];
  for (const a of al) {
    plans.push({ try: () => fetchOnce(a), label: "auto" });
    plans.push({ try: () => fetchOnce(a, { provider: "redstone-primary-prod" }), label: "redstone-primary-prod" });
    plans.push({ try: () => fetchOnce(a, { source: "coingecko" }), label: "source:coingecko" });
  }
  // ★ ชั้นสุดท้าย: ดึงตรงจาก CoinGecko
  plans.push({ try: () => fetchFromCoinGecko(), label: "coingecko-direct" });

  let lastErr;
  for (const p of plans) {
    try {
      const obj = await p.try();
      return { obj, resolved: p.label };
    } catch (e) {
      lastErr = e;
      // ถ้าเป็น 429/500 จะไหลไปลองแผนถัดไปอัตโนมัติ
    }
  }
  throw lastErr || new Error("price not found");
}

// --- แก้ฟังก์ชัน 24h change ให้ใช้ค่าจาก CoinGecko เมื่อมี ---
async function fetch24hChange(symbol) {
  // ลอง RedStone (source=coingecko) ก่อน
  try {
    const url = new URL(API_BASE);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("source", "coingecko");
    url.searchParams.set("period", "24h");
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const obj = Array.isArray(data) ? data[0] : data;
      const now = valOf(obj);
      const prev = obj?.previousValue ?? null;
      if (now != null && prev != null) return ((now - prev) / prev) * 100;
    }
  } catch (_) {}

  // ★ ถ้าไม่ได้ ให้ใช้ CoinGecko ตรง (รวมอยู่ใน fetchFromCoinGecko แล้ว)
  try {
    const cg = await fetchFromCoinGecko();
    if (typeof cg._cgChangePct === "number") return cg._cgChangePct;
  } catch (_) {}

  return null; // ไม่มีข้อมูลก็แสดง "—"
}

// --- ใน update() ไม่ต้องแก้เยอะ เพิ่มตั้ง provider ให้ตรงกับที่ resolved ---
async function update() {
  $("sym").textContent = DEFAULT_SYMBOL;
  $("status").textContent = "Loading…";
  $("change").textContent = "—";

  try {
    const { obj, resolved } = await fetchSmart(DEFAULT_SYMBOL);
    const price = valOf(obj);
    const ts = obj.timestamp || obj.updatedAt || Date.now();

    latest.price = price;
    latest.provider = obj.provider || resolved || "auto";

    $("price").textContent = fmtNumber(price);
    $("prov").textContent = latest.provider;
    $("time").textContent = fmtTime(ts);
    $("age").textContent = fmtAge(ts);
    $("signer").textContent =
      (obj.metadata && (obj.metadata.signer || obj.metadata.source)) ||
      obj.signer || "—";
    $("status").textContent = "Updated";

    const pct = await fetch24hChange(DEFAULT_SYMBOL);
    if (pct == null) {
      $("change").textContent = "—";
      $("change").style.borderColor = "var(--border)";
      $("change").style.color = "var(--muted)";
    } else {
      const sign = pct >= 0 ? "+" : "";
      $("change").textContent = `${sign}${pct.toFixed(2)}%`;
      const up = pct >= 0;
      $("change").style.borderColor = up ? "rgba(16,185,129,.5)" : "rgba(239,68,68,.5)";
      $("change").style.color = up ? "rgb(16,185,129)" : "rgb(239,68,68)";
    }
  } catch (err) {
    $("status").textContent = "Error: " + err.message;
    console.error(err);
  }
}
