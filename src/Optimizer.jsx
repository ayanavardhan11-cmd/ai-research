import React, { useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
         ComposedChart, Area, Line, Legend } from 'recharts'

const EF_ICE = 0.171, CONS = 0.16

function place(blocks, budget, minKm, ratio) {
  const sorted = [...blocks].sort((a, b) => (b.annual * ratio) - (a.annual * ratio))
  const picked = []
  for (const b of sorted) {
    if (picked.length >= budget) break
    if (picked.every(p => Math.hypot((p.lat - b.lat) * 111, (p.lon - b.lon) * 96) >= minKm)) picked.push(b)
  }
  return picked
}

export default function Optimizer({ data }) {
  const [city, setCity] = useState('Delhi')
  const [budget, setBudget] = useState(10)
  const [spacing, setSpacing] = useState(3)
  const [ci2030, setCi2030] = useState(0.45)
  const [evMax, setEvMax] = useState(0.6)

  const ratio = 1 - (CONS * 0.72) / EF_ICE
  const blocks = (data.cblocks && data.cblocks[city]) || data.blocks
  const sites = useMemo(() => place(blocks, budget, spacing, ratio), [blocks, budget, spacing])
  const saved = sites.reduce((s, b) => s + b.annual * ratio, 0)

  const budgetCurve = useMemo(() =>
    [5, 10, 15, 20, 25, 30].map(b => ({
      b, saved: Math.round(place(blocks, b, spacing, ratio).reduce((s, x) => s + x.annual * ratio, 0) / 1000),
    })), [blocks, spacing])

  // scenario roadmap 2021..2030 driven by sliders
  const total = blocks.reduce((s, b) => s + b.annual, 0)
  const road = useMemo(() => {
    const out = []
    for (let yr = 2021; yr <= 2030; yr++) {
      const t = yr - 2021
      const ci = 0.72 + (ci2030 - 0.72) * (t / 9)
      const ev = evMax / (1 + Math.exp(-(t - 5.5) / 1.6))
      const growth = Math.pow(1.04, t)
      const r = 1 - (CONS * ci) / EF_ICE
      const base = total * growth
      out.push({ year: yr, abated: Math.round(base * ev * r / 1000), pct: +(100 * ev * r).toFixed(1) })
    }
    return out
  }, [total, ci2030, evMax])

  return (
    <div className="view">
      <div className="stage" style={{ overflow: 'auto', padding: 24 }}>
        <h2>EV charging optimizer and 2030 scenarios</h2>
        <div className="kpis">
          <div className="kpi"><b>{budget}</b><span>sites selected</span></div>
          <div className="kpi"><b>{(saved/1000).toFixed(1)}</b><span>kt CO2/yr displaced</span></div>
          <div className="kpi"><b>{(saved/budget/1000).toFixed(1)}</b><span>kt per site</span></div>
          <div className="kpi"><b>{road[9].pct}%</b><span>2030 reduction</span></div>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div className="card" style={{ width: 430 }}>
            <h3>Abatement vs budget</h3>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={budgetCurve}><CartesianGrid stroke="#16283c" />
                <XAxis dataKey="b" stroke="#8fa2ba" /><YAxis stroke="#8fa2ba" />
                <Tooltip contentStyle={TT} /><Bar dataKey="saved" fill="#22d3ee" radius={[4,4,0,0]} /></BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card" style={{ width: 430 }}>
            <h3>2030 decarbonization roadmap (live scenario)</h3>
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={road}><CartesianGrid stroke="#16283c" />
                <XAxis dataKey="year" stroke="#8fa2ba" />
                <YAxis yAxisId="l" stroke="#8fa2ba" /><YAxis yAxisId="r" orientation="right" stroke="#f87171" />
                <Tooltip contentStyle={TT} /><Legend />
                <Area yAxisId="l" dataKey="abated" name="abated kt" fill="#34d399" fillOpacity={0.35} stroke="#34d399" />
                <Line yAxisId="r" dataKey="pct" name="% reduction" stroke="#f87171" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card" style={{ marginTop: 16, maxWidth: 900 }}>
          <h3>Selected sites (ranked by displaced CO2)</h3>
          <table className="tbl"><tbody>
            {sites.map((s, i) => (
              <tr key={s.id}><td>#{i+1} - {s.id}</td><td>{s.lat.toFixed(3)}, {s.lon.toFixed(3)}</td>
                <td>{((s.annual*ratio)/1000).toFixed(1)} kt/yr</td></tr>
            ))}
          </tbody></table>
        </div>
      </div>
      <div className="side">
        <h2>Scenario controls</h2>
        <label>City</label>
        <select value={city} onChange={e => setCity(e.target.value)} className="select">
          {Object.keys(data.cblocks || { Delhi: [] }).map(c => <option key={c}>{c}</option>)}
        </select>
        <label>Budget (sites): <span className="val">{budget}</span></label>
        <input type="range" min={1} max={30} value={budget} onChange={e => setBudget(+e.target.value)} />
        <label>Min spacing (km): <span className="val">{spacing}</span></label>
        <input type="range" min={0} max={8} value={spacing} onChange={e => setSpacing(+e.target.value)} />
        <label>2030 grid carbon intensity (kg/kWh): <span className="val">{ci2030.toFixed(2)}</span></label>
        <input type="range" min={0.2} max={0.72} step={0.01} value={ci2030} onChange={e => setCi2030(+e.target.value)} />
        <label>2030 EV adoption ceiling: <span className="val">{(evMax*100).toFixed(0)}%</span></label>
        <input type="range" min={0.1} max={0.9} step={0.05} value={evMax} onChange={e => setEvMax(+e.target.value)} />
        <div className="card">
          <h3>How it works</h3>
          <p style={{ fontSize: 11, color: 'var(--mut)' }}>
            Benefit per zone = annual CO2 x displacement factor (ICE vs EV on the grid).
            The optimizer picks highest benefit zones under your budget and spacing.
            The roadmap recomputes live as you move the grid and EV sliders.
          </p>
        </div>
      </div>
    </div>
  )
}

const TT = { background: '#0d1626', border: '1px solid #16283c' }
