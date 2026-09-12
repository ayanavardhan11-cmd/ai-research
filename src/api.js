import { EF_ICE, CONS_EV } from './model.js';

// ---- data loaders (all real pipeline outputs) ----
const j = async p => { const r = await fetch(p); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };
export async function loadAll() {
  const [blocks, stats, anomalies, seasonality, aqi_corr, fleet, chargers, optb, metrics, shap, roadmap, cities, cblocks, world] =
    await Promise.all([
      j('data/blocks.json'), j('data/panel_stats.json'), j('data/anomalies.json'), j('data/seasonality.json'),
      j('data/aqi_corr.json'), j('data/fleet.json'), j('data/chargers_delhi.json'), j('data/opt_b10.json'),
      j('data/metrics.json'), j('data/shap.json'), j('data/roadmap.json'), j('data/cities.json'),
      j('data/cities_blocks.json'), j('data/world.geo.json'),
    ]);
  return { blocks, stats, anomalies, seasonality, aqi_corr, fleet, chargers, optb, metrics, shap, roadmap, cities, cblocks, world };
}

// ---- optimizer (same benefit formula as pipeline) ----
export function ratioFor(ci) { return 1 - (CONS_EV * ci) / EF_ICE; }
export function optimize(blocks, budget, minKm, ci = 0.72) {
  const r = ratioFor(ci);
  const sorted = [...blocks].sort((a, b) => b.annual - a.annual);
  const picked = [];
  for (const b of sorted) {
    if (picked.length >= budget) break;
    if (picked.every(p => Math.hypot((p.lat - b.lat) * 111, (p.lon - b.lon) * 96) >= minKm)) picked.push(b);
  }
  return { sites: picked, saved: picked.reduce((s, x) => s + x.annual * r, 0), ratio: r };
}
export function budgetCurve(blocks, minKm, ci = 0.72) {
  return [5, 10, 15, 20, 25, 30].map(b => ({ b, saved: Math.round(optimize(blocks, b, minKm, ci).saved / 1000) }));
}

// ---- roadmap / simulation (pipeline exact equations) ----
export function roadmap(blocks, ci2030, evMax, years = 10) {
  const total = blocks.reduce((s, b) => s + b.annual, 0);
  const out = [];
  for (let t = 0; t < years; t++) {
    const ci = 0.72 + (ci2030 - 0.72) * (t / (years - 1));
    const ev = evMax / (1 + Math.exp(-(t - 5.5) / 1.6));
    const growth = Math.pow(1.04, t);
    const r = 1 - (CONS_EV * ci) / EF_ICE;
    const base = total * growth;
    out.push({ year: 2021 + t, baseline: Math.round(base), abated: Math.round(base * ev * r),
      grid_ci: +ci.toFixed(3), ev_share: +ev.toFixed(3), pct: +(100 * ev * r).toFixed(1) });
  }
  return out;
}

// ---- rule based Ask the Atlas (fixed templates, real data only) ----
export function ask(q, data) {
  const s = q.toLowerCase();
  const B = data.blocks;
  const near = (b) => b.charger_dist;
  if (/top|highest|max/.test(s) && /emission|co2/.test(s)) {
    const top = [...B].sort((a, b) => b.annual - a.annual).slice(0, 5);
    return { text: 'Highest annual emission blocks: ' + top.map(b => b.id).join(', ') + '.', hl: top.map(b => b.id) };
  }
  if (/near|close/.test(s) && /charger/.test(s)) {
    const top = [...B].filter(b => b.charger_dist < 1).sort((a, b) => b.annual - a.annual).slice(0, 6);
    return { text: top.length ? top.length + ' high emission blocks sit within 1 km of an existing charger: ' + top.map(b => b.id).join(', ') + '.' : 'No high emission block is within 1 km of an existing charger.', hl: top.map(b => b.id) };
  }
  if (/anomal|residual|off|deviat/.test(s)) {
    const a = data.anomalies.slice(0, 5);
    return { text: 'Largest model residuals: ' + a.map(x => x.block + ' (' + (x.residual > 0 ? '+' : '') + x.residual + ' t/day)').join(', ') + '.', hl: a.map(x => x.block) };
  }
  if (/charger|where.*add|site|place/.test(s)) {
    const o = optimize(B, 5, 3).sites;
    return { text: 'Top 5 suggested new charger blocks: ' + o.map(b => b.id).join(', ') + '.', hl: o.map(b => b.id) };
  }
  if (/aqi|air|pollut/.test(s)) {
    return { text: 'Correlation between block emissions and AQI is r = ' + data.aqi_corr.r + ' (real, from the panel).', hl: [] };
  }
  if (/total|city|delhi|sum/.test(s)) {
    const tot = B.reduce((x, b) => x + b.annual, 0);
    return { text: 'Delhi road transport emits about ' + (tot / 1e6).toFixed(2) + ' Mt CO2 per year across ' + B.length + ' blocks.', hl: [] };
  }
  return { text: 'Try: "top emission blocks", "blocks near chargers", "anomalies", "where to add chargers", "aqi correlation", or "delhi total".', hl: [] };
}

// ---- route emission estimate (sum of blocks a line crosses) ----
export function routeEmission(blocks, a, b) {
  const steps = 60; let kg = 0; const hit = new Set();
  for (let i = 0; i <= steps; i++) {
    const lon = a[0] + (b[0] - a[0]) * i / steps, lat = a[1] + (b[1] - a[1]) * i / steps;
    let best = null, bd = 1e9;
    for (const bl of blocks) { const d = (bl.lat - lat) ** 2 + (bl.lon - lon) ** 2; if (d < bd) { bd = d; best = bl; } }
    if (best) { hit.add(best.id); kg += (best.annual / 365) * 1000 / steps; }
  }
  return { kgPerDay: Math.round(kg), blocks: [...hit] };
}
