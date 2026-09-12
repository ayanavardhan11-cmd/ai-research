import React, { useEffect, useMemo, useState } from 'react';

// five stop emission ramp (section 2)
const STOPS = [[45,212,191],[163,230,53],[250,204,21],[251,146,60],[239,68,68]];
export function ramp(t) {
  const x = Math.max(0, Math.min(1, t));
  const seg = x * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = STOPS[i], b = STOPS[i + 1];
  return [Math.round(a[0] + (b[0]-a[0])*f), Math.round(a[1]+(b[1]-a[1])*f), Math.round(a[2]+(b[2]-a[2])*f)];
}
export const rampCss = a => `rgba(${a[0]},${a[1]},${a[2]},1)`;

export function CountUp({ value, decimals = 0, suffix = '' }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf; const t0 = performance.now();
    const step = t => { const p = Math.min(1, (t - t0) / 700); setV(value * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span>{v.toFixed(decimals)}{suffix}</span>;
}

export function fmt(v) {
  if (v >= 1e6) return (v / 1e6).toFixed(2) + ' Mt';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + ' kt';
  return v.toFixed(1) + ' t';
}

export function Skeleton({ h = 120 }) { return <div className="sk" style={{ height: h }} />; }

export function Err({ msg, retry }) {
  return <div className="err"><div>Failed to load: {msg}</div>{retry && <button onClick={retry}>Retry</button>}</div>;
}

export function KPI({ label, value, decimals = 0, suffix = '', tone = '' }) {
  return <div className={'kpi ' + tone}><b><CountUp value={value} decimals={decimals} suffix={suffix} /></b><span>{label}</span></div>;
}

export function DataTable({ rows, cols, initSort }) {
  const [sort, setSort] = useState(initSort || (cols[0] && cols[0].k));
  const [dir, setDir] = useState(-1);
  const sorted = useMemo(() => [...rows].sort((a, b) => (a[sort] > b[sort] ? dir : -dir)), [rows, sort, dir]);
  const csv = () => {
    const head = cols.map(c => c.k).join(',');
    const body = sorted.map(r => cols.map(c => r[c.k]).join(',')).join('\n');
    const blob = new Blob([head + '\n' + body], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'carbon_atlas.csv'; a.click();
  };
  return <div>
    <table className="tbl"><thead><tr>
      {cols.map(c => <th key={c.k} onClick={() => { if (sort === c.k) setDir(-dir); else { setSort(c.k); setDir(-1); } }}>{c.l}</th>)}
    </tr></thead><tbody>
      {sorted.map((r, i) => <tr key={i}>{cols.map(c => <td key={c.k} className={c.mono ? 'mono' : ''}>{c.f ? c.f(r[c.k], r) : r[c.k]}</td>)}</tr>)}
    </tbody></table>
    <button className="btn ghost" style={{ marginTop: 8 }} onClick={csv}>Export CSV</button>
  </div>;
}
