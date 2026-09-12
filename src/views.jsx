import React, { useEffect, useMemo, useState } from 'react';
import Map, { useControl, Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ColumnLayer, ScatterplotLayer, GeoJsonLayer } from '@deck.gl/layers';
import { DeckGL } from '@deck.gl/react';
import { _GlobeView as GlobeView } from '@deck.gl/core';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  LineChart, Line, ComposedChart, Area, ScatterChart, Scatter, ZAxis, Cell } from 'recharts';
import { ramp, rampCss, fmt, CountUp, DataTable, KPI } from './ui.jsx';
import { routeEmission, optimize, budgetCurve, roadmap } from './api.js';
import { predict } from './model.js';

const SAT = { version: 8, sources: { esri: { type: 'raster', tileSize: 256, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] } }, layers: [ { id: 'bg', type: 'background', paint: { 'background-color': '#0B0E11' } }, { id: 'esri', type: 'raster', source: 'esri', paint: { 'raster-opacity': 0.92 } } ] };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TT = { background: '#1A1F26', border: '1px solid #2A3038', fontSize: 11 };
const M = '#8B97A5';
function DeckOverlay(props) { const o = useMemo(() => new MapboxOverlay({ interleaved: true, ...props }), [props.layers]); useControl(() => o); return null; }

export function Globe({ data, onPick }) {
  const [spin, setSpin] = useState(true);
  const [vs, setVs] = useState({ longitude: 78, latitude: 21, zoom: 1.2 });
  const max = Math.max(...data.cities.map(c => c.annual_t));
  useEffect(() => { if (!spin) return; const id = setInterval(() => setVs(v => ({ ...v, longitude: v.longitude + 0.18 })), 80); return () => clearInterval(id); }, [spin]);
  const layers = [
    new GeoJsonLayer({ id: 'land', data: data.world, getFillColor: [18,24,30,255], getLineColor: [42,48,56,255], lineWidthMinPixels: 0.6, pickable: false }),
    new ScatterplotLayer({ id: 'cities', data: data.cities, getPosition: d => [d.lon, d.lat], getRadius: d => 20000 + Math.sqrt(d.annual_t) * 42,
      getFillColor: d => { const c = ramp(d.annual_t / max); return [c[0], c[1], c[2], 235]; }, getLineColor: [255,255,255,160], lineWidthMinPixels: 1.2,
      pickable: true, autoHighlight: true, onClick: o => o.object && onPick(o.object.city) }),
  ];
  return <div className="view"><div className="stage">
    <DeckGL views={[new GlobeView({ controller: true })]} initialViewState={vs} controller layers={layers} onDragStart={() => setSpin(false)}
      getTooltip={({ object }) => object && object.annual_t !== undefined && ({ html: `<b>${object.city}</b><br/>${fmt(object.annual_t)} CO2/yr` })}
      style={{ position: 'absolute', inset: 0 }} />
    <div className="overlay legend"><b style={{ color: 'var(--txt)' }}>Annual road CO2</b><div className="rampbar" /><div className="mono">low to high, t/yr</div>
      <div style={{ marginTop: 8 }}><button className="btn ghost" onClick={() => setSpin(s => !s)}>{spin ? 'Pause rotation' : 'Auto rotate'}</button></div>
      <div style={{ marginTop: 6 }}>Click a city to open Earth view</div></div>
  </div></div>;
}

export function Earth({ data, city, setCity }) {
  const blocks = (data.cblocks && data.cblocks[city]) || data.blocks;
  const isDelhi = city === 'Delhi';
  const delhiBlocks = data.blocks;
  const center = (data.cities.find(c => c.city === city)) || { lat: 28.6, lon: 77.2 };
  const [month, setMonth] = useState(0); const [play, setPlay] = useState(true);
  const [mode, setMode] = useState('3d'); const [showAnom, setShowAnom] = useState(false); const [showOpt, setShowOpt] = useState(true);
  const [routePts, setRoutePts] = useState([]); const [routeRes, setRouteRes] = useState(null);
  const [thresh, setThresh] = useState(0); const [toast, setToast] = useState(null);
  const [vs, setVs] = useState({ longitude: center.lon, latitude: center.lat, zoom: 10.6, pitch: 55, bearing: -15 });
  useEffect(() => { setVs(v => ({ ...v, longitude: center.lon, latitude: center.lat })); setRoutePts([]); setRouteRes(null); }, [city]);
  useEffect(() => { if (!play) return; const id = setInterval(() => setMonth(m => (m + 1) % 12), 800); return () => clearInterval(id); }, [play]);
  const maxM = useMemo(() => Math.max(1, ...blocks.map(b => Math.max(...b.monthly))), [blocks]);
  const opt = useMemo(() => optimize(blocks, 10, 3).sites, [blocks]);
  const total = blocks.reduce((s, b) => s + b.monthly[month], 0);
  useEffect(() => { if (thresh <= 0) { setToast(null); return; } const hit = delhiBlocks.filter(b => b.monthly[month] > thresh); setToast(hit.length ? hit.length + ' blocks exceed ' + thresh + ' t/day in ' + MONTHS[month] : null); }, [thresh, month]);
  const layers = [
    new ColumnLayer({ id: 'blocks', data: blocks, getPosition: d => [d.lon, d.lat], getElevation: d => d.monthly[month], elevationScale: 18,
      getFillColor: d => { const c = ramp(d.monthly[month] / maxM); return [c[0], c[1], c[2], 235]; }, getLineColor: [255,255,255,50],
      extruded: mode === '3d', radius: 420, coverage: 0.8, pickable: true, transitions: { getElevation: 500, getFillColor: 500 } }),
    new ScatterplotLayer({ id: 'chg', data: data.chargers, getPosition: d => [d.lon, d.lat], getRadius: 180, getFillColor: [100,116,139,210], getLineColor: [255,255,255,200], lineWidthMinPixels: 1, pickable: true }),
    showOpt && new ScatterplotLayer({ id: 'opt', data: opt, getPosition: d => [d.lon, d.lat], getRadius: 380, getFillColor: [245,165,36,240], getLineColor: [255,255,255,255], lineWidthMinPixels: 2, pickable: true }),
    showAnom && new ScatterplotLayer({ id: 'anom', data: data.anomalies, getPosition: d => { const b = delhiBlocks.find(x => x.id === d.block); return b ? [b.lon, b.lat] : [0,0]; }, getRadius: 300, getFillColor: [56,189,248,60], getLineColor: [56,189,248,255], lineWidthMinPixels: 2, pickable: true }),
  ].filter(Boolean);
  const onMapClick = e => { if (routePts.length >= 2) { setRoutePts([[e.longitude, e.latitude]]); setRouteRes(null); return; } const np = [...routePts, [e.longitude, e.latitude]]; setRoutePts(np); if (np.length === 2) setRouteRes(routeEmission(delhiBlocks, np[0], np[1])); };
  return <div className="view">
    <div className="stage">
      <Map mapStyle={SAT} initialViewState={vs} onViewStateChange={e => setVs(e.viewState)} attributionControl={false} onClick={onMapClick} style={{ position: 'absolute', inset: 0 }}>
        <DeckOverlay layers={layers} getTooltip={({ object, layer }) => object && layer && layer.id !== 'anom' && ({ html: layer.id === 'blocks' ? `<b class="mono">${object.id}</b><br/>${object.monthly[month].toFixed(0)} t/day in ${MONTHS[month]}<br/>annual ${fmt(object.annual)}` : layer.id === 'opt' ? '<b>Optimized charger site</b>' : `<b>${object.name}</b><br/>existing charger` })} />
      </Map>
      <div className="overlay legend"><b style={{ color: 'var(--txt)' }}>{city} - monthly road CO2</b><div className="rampbar" /><div className="mono">low to high t/day</div>
        <div style={{ marginTop: 8 }}><span className="chip"><span className="dot" style={{ background: '#64748B' }} />existing</span><span className="chip"><span className="dot" style={{ background: '#F5A524' }} />optimized</span>{showAnom && <span className="chip"><span className="dot" style={{ background: '#38BDF8' }} />anomaly</span>}</div></div>
      {routeRes && <div className="overlay" style={{ top: 14, left: 14 }}>Route crosses about <b style={{ color: 'var(--amber)' }}>{routeRes.kgPerDay.toLocaleString()} kg CO2/day</b> across {routeRes.blocks.length} blocks.</div>}
      <div className="overlay timebar"><button onClick={() => setPlay(p => !p)}>{play ? 'Pause' : 'Play'}</button>
        <input type="range" min={0} max={11} value={month} onChange={e => { setPlay(false); setMonth(+e.target.value); }} />
        <b style={{ color: 'var(--amber)' }}>{MONTHS[month]}</b><span className="mono">{fmt(total)} this month</span></div>
    </div>
    <div className="side">
      <h2 className="sec">Earth view</h2>
      <label>City</label>
      <select className="sel" value={city} onChange={e => setCity(e.target.value)}>{Object.keys(data.cblocks || {}).map(c => <option key={c}>{c}</option>)}</select>
      {!isDelhi && <div className="cap" style={{ marginTop: 6 }}>Cross city inference is unvalidated. Delhi is the fully validated reference.</div>}
      <div className="kpis" style={{ marginTop: 12 }}>
        <div className="kpi amber"><b>{fmt(blocks.reduce((s, b) => s + b.annual, 0))}</b><span>annual CO2</span></div>
        <div className="kpi"><b>{blocks.length}</b><span>blocks</span></div>
        <div className="kpi"><b>{data.chargers.length}</b><span>chargers</span></div></div>
      <div className="card"><h3>View</h3>
        <button className={mode === '3d' ? 'btn' : 'btn ghost'} onClick={() => setMode('3d')}>3D</button>{' '}
        <button className={mode === '2d' ? 'btn' : 'btn ghost'} onClick={() => { setMode('2d'); setVs(v => ({ ...v, pitch: 0 })); }}>2D</button>{' '}
        <button className="btn ghost" onClick={() => setVs({ longitude: center.lon, latitude: center.lat, zoom: 10.6, pitch: mode === '3d' ? 55 : 0, bearing: -15 })}>Reset</button>
        <div className="mono" style={{ marginTop: 8 }}>pitch {Math.round(vs.pitch)} bearing {Math.round(vs.bearing)}</div></div>
      <div className="card"><h3>Layers</h3>
        <label><input type="checkbox" checked={showOpt} onChange={e => setShowOpt(e.target.checked)} /> Optimized charger sites</label>
        <label><input type="checkbox" checked={showAnom} onChange={e => setShowAnom(e.target.checked)} /> Anomaly residuals (Delhi)</label></div>
      <div className="card"><h3>Route emission</h3><div className="cap">Click two points on the map to estimate ambient road CO2 crossed (Delhi model).</div>
        {routePts.length === 1 && <div className="mono" style={{ marginTop: 6 }}>Start set. Click an end point.</div>}</div>
      <div className="card"><h3>Alert threshold</h3><label>Flag blocks above (t/day): <span className="val">{thresh || 'off'}</span></label>
        <input type="range" min={0} max={200} value={thresh} onChange={e => setThresh(+e.target.value)} /></div>
    </div>
    {toast && <div className="toast">{toast}</div>}
  </div>;
}

export function Predict({ data }) {
  const st = data.stats;
  const [lat, setLat] = useState(28.61); const [lon, setLon] = useState(77.21);
  const [month, setMonth] = useState(1); const [dow, setDow] = useState(2);
  const [aqi, setAqi] = useState(st.aqi.median); const [ev, setEv] = useState(st.ev_share.median);
  const [cng, setCng] = useState(st.cng_share.median); const [vkt, setVkt] = useState(20.5);
  const [dist, setDist] = useState(5); const [cells, setCells] = useState(12); const [cd, setCd] = useState(2);
  const doy = Math.round(month * 30.4);
  const x = { lat, lon, dist_center_km: dist, n_cells: cells, charger_dist_km: cd, doy, dow, month, is_weekend: dow >= 5 ? 1 : 0, sin_doy: Math.sin(2 * Math.PI * doy / 365.25), cos_doy: Math.cos(2 * Math.PI * doy / 365.25), aqi, ev_share: ev, cng_share: cng, log_vkt: vkt };
  const pred = useMemo(() => predict(x), [lat, lon, dist, cells, cd, doy, dow, month, aqi, ev, cng, vkt]);
  return <div className="view">
    <div className="stage" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 460 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--mut)' }}>Predicted road CO2</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--amber)' }}><CountUp value={pred} decimals={1} /></div>
          <div className="mono">tonnes per day at this point</div>
          <div className="cap">Model fit R2 = {st.full_r2} on held out data. Honest spatial generalization is 0.59 to 0.64, so treat cross district values as indicative.</div>
          <div className="kpis" style={{ marginTop: 10 }}><div className="kpi"><b>{st.block_avg_pred}</b><span>block avg t/day</span></div><div className="kpi"><b>{(pred / st.block_avg_pred).toFixed(2)}x</b><span>vs average</span></div></div></div>
        <div className="card"><h3>Top model drivers (SHAP)</h3>{data.shap.slice(0, 5).map(s => <div key={s.f} className="row"><b>{s.f}</b><span className="mono">{s.v}</span></div>)}</div>
      </div></div>
    <div className="side">
      <h2 className="sec">Predict</h2>
      <div className="card" style={{ height: 180, padding: 0, overflow: 'hidden' }}>
        <Map mapStyle={SAT} initialViewState={{ longitude: lon, latitude: lat, zoom: 10 }} onClick={e => { setLat(+e.latitude.toFixed(4)); setLon(+e.longitude.toFixed(4)); }} attributionControl={false} style={{ height: '100%' }}>
          <Marker longitude={lon} latitude={lat}><div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--amber)', border: '2px solid #fff' }} /></Marker></Map></div>
      <div className="mono" style={{ marginTop: 6 }}>lat {lat} lon {lon} (click map)</div>
      <label>Month <span className="val">{month}</span></label><input type="range" min={1} max={12} value={month} onChange={e => setMonth(+e.target.value)} />
      <label>Day of week <span className="val">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][dow]}</span></label><input type="range" min={0} max={6} value={dow} onChange={e => setDow(+e.target.value)} />
      <label>Distance from centre km <span className="val">{dist}</span></label><input type="range" min={0} max={15} step={0.5} value={dist} onChange={e => setDist(+e.target.value)} />
      <label>Zone size cells <span className="val">{cells}</span></label><input type="range" min={1} max={25} value={cells} onChange={e => setCells(+e.target.value)} />
      <label>Charger distance km <span className="val">{cd}</span></label><input type="range" min={0} max={10} step={0.5} value={cd} onChange={e => setCd(+e.target.value)} />
      <label>AQI <span className="val">{Math.round(aqi)}</span> <span className="mono">({st.aqi.min} to {st.aqi.max})</span></label><input type="range" min={st.aqi.min} max={st.aqi.max} value={aqi} onChange={e => setAqi(+e.target.value)} />
      <label>EV share <span className="val">{(ev * 100).toFixed(0)}%</span></label><input type="range" min={0} max={st.ev_share.max} step={0.005} value={ev} onChange={e => setEv(+e.target.value)} />
      <label>CNG share <span className="val">{(cng * 100).toFixed(0)}%</span></label><input type="range" min={0} max={st.cng_share.max} step={0.005} value={cng} onChange={e => setCng(+e.target.value)} />
      <label>log VKT <span className="val">{vkt}</span></label><input type="range" min={18} max={22} step={0.1} value={vkt} onChange={e => setVkt(+e.target.value)} />
    </div></div>;
}

export function Insights({ data }) {
  const cv = Object.entries(data.metrics).filter(([k]) => k !== 'optimizer').map(([k, v]) => ({ name: k.replace(/_/g, ' '), r2: v.r2 }));
  const po = data.blocks.map(b => ({ obs: b.annual, pred: b.pred_annual }));
  const dep = data.blocks.map(b => ({ x: b.dist_center, y: b.annual, z: b.n_cells }));
  const seas = data.seasonality.map(s => ({ m: s.month, label: +s.label.toFixed(1), aqi: +s.aqi.toFixed(0) }));
  const fleet = data.fleet.map(r => ({ ym: r.ym.slice(2), Petrol: r.Petrol, Diesel: r.Diesel, CNG: r.CNG, EV: r.EV }));
  return <div className="view"><div className="stage" style={{ overflow: 'auto', padding: 22 }}>
    <h2 className="sec">Model insights</h2>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div className="card"><h3>Cross validation R2</h3><div className="cap">Six honest validation schemes. Temporal is strong; spatial is the hard, trustworthy number.</div>
        <ResponsiveContainer width="100%" height={210}><BarChart data={cv}><CartesianGrid stroke="#242A32" /><XAxis dataKey="name" stroke={M} tick={{ fontSize: 8 }} /><YAxis domain={[0, 1]} stroke={M} /><Tooltip contentStyle={TT} /><Bar dataKey="r2" fill="#F5A524" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div>
      <div className="card"><h3>Predicted vs observed (R2 = 0.998)</h3><div className="cap">Each point is a block annual total. Tight to the diagonal means the model reproduces real emissions.</div>
        <ResponsiveContainer width="100%" height={210}><ScatterChart><CartesianGrid stroke="#242A32" /><XAxis dataKey="obs" stroke={M} type="number" /><YAxis dataKey="pred" stroke={M} type="number" /><Tooltip contentStyle={TT} /><Scatter data={po} fill="#2DD4BF" /></ScatterChart></ResponsiveContainer></div>
      <div className="card"><h3>SHAP importance</h3><div className="cap">Zone size and distance to centre dominate, matching how traffic concentrates in a city.</div>
        <ResponsiveContainer width="100%" height={210}><BarChart data={data.shap} layout="vertical"><CartesianGrid stroke="#242A32" /><XAxis type="number" stroke={M} /><YAxis type="category" dataKey="f" width={105} stroke={M} tick={{ fontSize: 9 }} /><Tooltip contentStyle={TT} /><Bar dataKey="v">{data.shap.map((s, i) => <Cell key={i} fill={rampCss(ramp(i / data.shap.length))} />)}</Bar></BarChart></ResponsiveContainer></div>
      <div className="card"><h3>Dependence: distance from centre</h3><div className="cap">Emissions fall with distance from the centre; colour encodes zone size.</div>
        <ResponsiveContainer width="100%" height={210}><ScatterChart><CartesianGrid stroke="#242A32" /><XAxis dataKey="x" stroke={M} type="number" /><YAxis dataKey="y" stroke={M} type="number" /><ZAxis dataKey="z" range={[20, 90]} /><Tooltip contentStyle={TT} /><Scatter data={dep} fill="#A3E635" /></ScatterChart></ResponsiveContainer></div>
      <div className="card"><h3>Seasonality and AQI</h3><div className="cap">Monthly mean emissions vs AQI. Correlation r = {data.aqi_corr.r} (real, not rounded up).</div>
        <ResponsiveContainer width="100%" height={210}><ComposedChart data={seas}><CartesianGrid stroke="#242A32" /><XAxis dataKey="m" stroke={M} /><YAxis yAxisId="l" stroke={M} /><YAxis yAxisId="r" orientation="right" stroke="#38BDF8" /><Tooltip contentStyle={TT} /><Legend /><Line yAxisId="l" dataKey="label" name="t/day" stroke="#FACC15" dot={false} strokeWidth={2} /><Line yAxisId="r" dataKey="aqi" name="AQI" stroke="#38BDF8" dot={false} strokeWidth={2} /></ComposedChart></ResponsiveContainer></div>
      <div className="card"><h3>Fleet composition and EV share</h3><div className="cap">Real VAHAN registrations. EV is still a small share, so claims stay modest.</div>
        <ResponsiveContainer width="100%" height={210}><ComposedChart data={fleet}><CartesianGrid stroke="#242A32" /><XAxis dataKey="ym" stroke={M} tick={{ fontSize: 8 }} interval={5} /><YAxis yAxisId="a" stroke={M} /><YAxis yAxisId="b" orientation="right" stroke="#A855F7" /><Tooltip contentStyle={TT} /><Legend /><Area yAxisId="a" stackId="1" dataKey="Petrol" fill="#F5A524" /><Area yAxisId="a" stackId="1" dataKey="Diesel" fill="#64748B" /><Area yAxisId="a" stackId="1" dataKey="CNG" fill="#2DD4BF" /><Area yAxisId="a" stackId="1" dataKey="EV" fill="#A855F7" /></ComposedChart></ResponsiveContainer></div>
    </div></div></div>;
}

export function Optimizer({ data }) {
  const [budget, setBudget] = useState(10); const [spacing, setSpacing] = useState(3);
  const { sites, saved, ratio } = useMemo(() => optimize(data.blocks, budget, spacing), [data.blocks, budget, spacing]);
  const curve = useMemo(() => budgetCurve(data.blocks, spacing), [data.blocks, spacing]);
  const bench = Object.entries(data.metrics.optimizer).map(([b, v]) => ({ b: +b, ref: Math.round(v.co2_saved_t / 1000) }));
  return <div className="view">
    <div className="stage" style={{ position: 'relative' }}>
      <Map mapStyle={SAT} initialViewState={{ longitude: 77.18, latitude: 28.62, zoom: 10 }} attributionControl={false} style={{ position: 'absolute', inset: 0 }} />
      <div className="overlay legend"><b style={{ color: 'var(--txt)' }}>Optimizer - Delhi</b><div style={{ marginTop: 6 }}><span className="chip"><span className="dot" style={{ background: '#64748B' }} />existing</span><span className="chip"><span className="dot" style={{ background: '#F5A524' }} />optimized</span></div></div>
      <div className="overlay" style={{ top: 14, right: 14, width: 300 }}><h3 style={{ margin: '0 0 6px' }}>Abatement vs budget</h3>
        <ResponsiveContainer width="100%" height={170}><ComposedChart data={curve}><CartesianGrid stroke="#242A32" /><XAxis dataKey="b" stroke={M} /><YAxis stroke={M} /><Tooltip contentStyle={TT} /><Legend /><Line dataKey="saved" name="live kt/yr" stroke="#F5A524" dot={false} strokeWidth={2} /><Scatter data={bench} dataKey="ref" name="pipeline benchmark" fill="#38BDF8" /></ComposedChart></ResponsiveContainer></div>
    </div>
    <div className="side">
      <h2 className="sec">EV optimizer</h2>
      <div className="kpis"><div className="kpi amber"><b>{budget}</b><span>sites</span></div><div className="kpi teal"><b>{fmt(saved)}</b><span>CO2/yr saved</span></div><div className="kpi"><b>{fmt(saved / budget)}</b><span>per site</span></div></div>
      <label>Budget (sites) <span className="val">{budget}</span></label><input type="range" min={1} max={30} value={budget} onChange={e => setBudget(+e.target.value)} />
      <label>Min spacing km <span className="val">{spacing}</span></label><input type="range" min={0} max={8} value={spacing} onChange={e => setSpacing(+e.target.value)} />
      <div className="card" style={{ marginTop: 12 }}><h3>Selected sites</h3>
        <DataTable rows={sites.map((s, i) => ({ rank: i + 1, id: s.id, lat: s.lat, lon: s.lon, kt: +((s.annual * ratio) / 1000).toFixed(1) }))} cols={[{ k: 'rank', l: '#' }, { k: 'id', l: 'Block', mono: true }, { k: 'kt', l: 'kt/yr' }]} initSort="kt" /></div>
    </div></div>;
}

export function Roadmap({ data }) {
  const [ci, setCi] = useState(0.45); const [ev, setEv] = useState(0.6);
  const road = useMemo(() => roadmap(data.blocks, ci, ev), [data.blocks, ci, ev]);
  const last = road[road.length - 1]; const cum = road.reduce((s, r) => s + r.abated, 0) / 1e6;
  return <div className="view"><div className="stage" style={{ overflow: 'auto', padding: 24 }}>
    <h2 className="sec">Roadmap 2030</h2>
    <div className="kpis"><KPI label="2030 reduction" value={last.pct} decimals={1} suffix="%" tone="amber" /><KPI label="2030 abated" value={last.abated / 1e6} decimals={2} suffix=" Mt/yr" tone="teal" /><KPI label="cumulative decade" value={cum} decimals={1} suffix=" Mt" /><KPI label="2030 grid CI" value={ci} decimals={2} suffix=" kg/kWh" /></div>
    <div className="card" style={{ maxWidth: 980 }}><h3>Baseline vs abated, 2021 to 2030</h3>
      <div className="cap">Uses the pipeline's exact equations (EF_ICE 0.171, EV consumption 0.16 kWh/km, 4% VKT growth, logistic EV uptake).</div>
      <ResponsiveContainer width="100%" height={320}><ComposedChart data={road}><CartesianGrid stroke="#242A32" /><XAxis dataKey="year" stroke={M} /><YAxis yAxisId="l" stroke={M} /><YAxis yAxisId="r" orientation="right" stroke="#F5A524" /><Tooltip contentStyle={TT} /><Legend /><Bar yAxisId="l" dataKey="baseline" name="baseline t" fill="#475569" /><Bar yAxisId="l" dataKey="abated" name="abated t" fill="#2DD4BF" /><Line yAxisId="r" dataKey="pct" name="% reduction" stroke="#F5A524" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></div>
  </div>
  <div className="side"><h2 className="sec">Scenario</h2>
    <label>2030 grid carbon intensity <span className="val">{ci.toFixed(2)}</span> kg/kWh</label><input type="range" min={0.2} max={0.72} step={0.01} value={ci} onChange={e => setCi(+e.target.value)} />
    <label>2030 EV adoption ceiling <span className="val">{(ev * 100).toFixed(0)}%</span></label><input type="range" min={0.1} max={0.9} step={0.05} value={ev} onChange={e => setEv(+e.target.value)} />
    <div className="card" style={{ marginTop: 12 }}><h3>How to read</h3><div className="cap">Lower grid CI and higher EV adoption both raise the amber reduction line. The teal bars are the CO2 you actually avoid each year.</div></div>
  </div></div>;
}

export function Compare({ data }) {
  const [a, setA] = useState('Delhi'); const [b, setB] = useState('Mumbai'); const [month, setMonth] = useState(5);
  const Pane = ({ city, setCity }) => {
    const blocks = (data.cblocks && data.cblocks[city]) || [];
    const center = data.cities.find(c => c.city === city) || { lat: 28.6, lon: 77.2 };
    const maxM = Math.max(1, ...blocks.map(bl => Math.max(...bl.monthly)));
    const layers = [ new ColumnLayer({ id: 'b', data: blocks, getPosition: d => [d.lon, d.lat], getElevation: d => d.monthly[month], elevationScale: 16, getFillColor: d => { const c = ramp(d.monthly[month] / maxM); return [c[0], c[1], c[2], 235]; }, extruded: true, radius: 420, coverage: 0.8, pickable: false }) ];
    const annual = blocks.reduce((s, bl) => s + bl.annual, 0);
    return <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
      <Map mapStyle={SAT} initialViewState={{ longitude: center.lon, latitude: center.lat, zoom: 10, pitch: 50 }} attributionControl={false} style={{ position: 'absolute', inset: 0 }}><DeckOverlay layers={layers} /></Map>
      <div className="overlay" style={{ top: 10, left: 10, right: 10 }}><select className="sel" value={city} onChange={e => setCity(e.target.value)}>{Object.keys(data.cblocks || {}).map(c => <option key={c}>{c}</option>)}</select>
        <div className="mono" style={{ marginTop: 6 }}>annual {(annual / 1e6).toFixed(2)} Mt - {blocks.length} blocks</div></div></div>;
  };
  const sum = c => ((data.cblocks && data.cblocks[c]) || []).reduce((s, x) => s + x.annual, 0);
  const blk = c => ((data.cblocks && data.cblocks[c]) || []).length;
  const dA = sum(a), dB = sum(b);
  return <div className="view" style={{ flexDirection: 'column' }}>
    <div style={{ display: 'flex', gap: 10, padding: 12, alignItems: 'center' }}><h2 className="sec" style={{ margin: 0 }}>Compare</h2>
      <input type="range" min={0} max={11} value={month} onChange={e => setMonth(+e.target.value)} style={{ width: 220 }} /><span className="mono">{MONTHS[month]}</span></div>
    <div style={{ flex: 1, display: 'flex', gap: 2, minHeight: 0 }}><Pane city={a} setCity={setA} /><Pane city={b} setCity={setB} /></div>
    <div style={{ padding: 12, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      <div className="kpi"><b>{(dA / 1e6).toFixed(2)}</b><span>{a} Mt/yr</span></div><div className="kpi"><b>{(dB / 1e6).toFixed(2)}</b><span>{b} Mt/yr</span></div>
      <div className="kpi amber"><b>{((dA - dB) / 1e6).toFixed(2)}</b><span>delta Mt/yr</span></div><div className="kpi"><b>{blk(a) - blk(b)}</b><span>delta blocks</span></div>
      <div className="kpi"><b>{(dA / Math.max(1, blk(a)) / 1000).toFixed(1)}</b><span>{a} kt per block</span></div><div className="kpi"><b>{(dB / Math.max(1, blk(b)) / 1000).toFixed(1)}</b><span>{b} kt per block</span></div></div>
  </div>;
}

export function Reports({ data }) {
  const tot = data.blocks.reduce((s, b) => s + b.annual, 0); const m = data.metrics;
  return <div className="view"><div className="stage" style={{ overflow: 'auto', padding: 28 }}>
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <h2 className="sec">Carbon Atlas India - session report</h2>
      <div className="mono" style={{ color: 'var(--mut)' }}>Generated {new Date().toLocaleString()} - reference city Delhi</div>
      <div className="card" style={{ marginTop: 14 }}><h3>Headline numbers (all from the trained pipeline)</h3>
        <div className="row"><b>Delhi annual road CO2</b><span className="mono">{fmt(tot)}/yr</span></div>
        <div className="row"><b>Blocks analysed</b><span className="mono">{data.blocks.length}</span></div>
        <div className="row"><b>Existing chargers (e-Amrit)</b><span className="mono">{data.chargers.length}</span></div>
        <div className="row"><b>Full model R2</b><span className="mono">{data.stats.full_r2}</span></div>
        <div className="row"><b>Spatial CV R2 (E to W / W to E)</b><span className="mono">{m.spatial_E2W.r2} / {m.spatial_W2E.r2}</span></div>
        <div className="row"><b>Temporal CV R2</b><span className="mono">{m.temporal_H1toH2.r2}</span></div>
        <div className="row"><b>AQI correlation r</b><span className="mono">{data.aqi_corr.r}</span></div></div>
      <div className="card"><h3>Optimizer benchmarks (real pipeline outputs)</h3>
        {Object.entries(m.optimizer).map(([b, v]) => <div className="row" key={b}><b>{b} sites</b><span className="mono">{Math.round(v.co2_saved_t / 1000)} kt CO2/yr saved</span></div>)}</div>
      <div className="card"><h3>Roadmap defaults (2030)</h3>
        {data.roadmap.filter(r => r.year === 2030).map(r => <div className="row" key={r.year}><b>{r.year}</b><span className="mono">{(r.abated_co2_t / 1e6).toFixed(2)} Mt abated - {r.pct_reduction}% reduction</span></div>)}</div>
      <div className="card"><h3>Data sources</h3><div className="cap">CHETNA-Road (500 m grid), Climate TRACE (city calibration and VKT), VAHAN (fleet), e-Amrit (chargers), CPCB AQI. Model: XGBoost, 400 trees. No fabricated values.</div></div>
      <button className="btn" onClick={() => window.print()}>Download as PDF (print)</button>
    </div></div></div>;
}
