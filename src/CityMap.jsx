import React, { useEffect, useMemo, useState } from 'react'
import Map, { useControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { ColumnLayer, ScatterplotLayer } from '@deck.gl/layers'

const SATELLITE = {
  version: 8,
  sources: {
    esri: { type: 'raster', tileSize: 256,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#060b16' } },
    { id: 'esri', type: 'raster', source: 'esri', paint: { 'raster-opacity': 0.9 } },
  ],
}

const ramp = (v, max) => {
  const t = Math.min(1, v / max)
  if (t < 0.45) return [16, 185, 129, 225]
  if (t < 0.75) return [250, 204, 21, 235]
  return [248, 113, 113, 240]
}

function DeckOverlay(props) {
  const overlay = useMemo(() => new MapboxOverlay({ interleaved: true, ...props }), [props.layers])
  return useControl(() => overlay)
}

function greedy(blocks, budget, minKm) {
  const sorted = [...blocks].sort((a, b) => b.annual - a.annual)
  const picked = []
  for (const b of sorted) {
    if (picked.length >= budget) break
    if (picked.every(p => Math.hypot((p.lat - b.lat) * 111, (p.lon - b.lon) * 96) >= minKm)) picked.push(b)
  }
  return picked
}

export default function CityMap({ data, city, setCity }) {
  const cities = Object.keys(data.cblocks || {})
  const blocks = (data.cblocks && data.cblocks[city]) || []
  const chargers = (data.cchargers && data.cchargers[city]) || []
  const center = (data.cities.find(c => c.city === city)) || { lat: 28.6, lon: 77.2 }

  const [month, setMonth] = useState(0)
  const [play, setPlay] = useState(true)
  const [showOpt, setShowOpt] = useState(true)
  const [showExist, setShowExist] = useState(true)
  const [vs, setVs] = useState({ longitude: center.lon, latitude: center.lat, zoom: 11, pitch: 55, bearing: -15 })

  useEffect(() => { setVs(v => ({ ...v, longitude: center.lon, latitude: center.lat })) }, [city])
  useEffect(() => {
    if (!play) return
    const id = setInterval(() => setMonth(m => (m + 1) % 12), 900)
    return () => clearInterval(id)
  }, [play])

  const maxM = useMemo(() => Math.max(1, ...blocks.map(b => Math.max(...b.monthly))), [blocks])
  const opt = useMemo(() => greedy(blocks, 10, 3), [blocks])

  const layers = [
    new ColumnLayer({
      id: 'blocks', data: blocks,
      getPosition: d => [d.lon, d.lat],
      getElevation: d => d.monthly[month],
      elevationScale: 20,
      getFillColor: d => ramp(d.monthly[month], maxM),
      getLineColor: [255, 255, 255, 60],
      extruded: true, radius: 420, coverage: 0.8, pickable: true,
      transitions: { getElevation: 500, getFillColor: 500 },
    }),
    showExist && new ScatterplotLayer({
      id: 'exist', data: chargers, getPosition: d => [d.lon, d.lat],
      getRadius: 200, getFillColor: [59, 130, 246, 210], getLineColor: [255,255,255,220],
      lineWidthMinPixels: 1, pickable: true,
    }),
    showOpt && new ScatterplotLayer({
      id: 'opt', data: opt, getPosition: d => [d.lon, d.lat],
      getRadius: 400, getFillColor: [250, 204, 21, 235], getLineColor: [255,255,255,255],
      lineWidthMinPixels: 2, pickable: true,
    }),
  ].filter(Boolean)

  const total = blocks.reduce((s, b) => s + b.monthly[month], 0)
  const annual = blocks.reduce((s, b) => s + b.annual, 0)

  return (
    <div className="view">
      <div className="stage">
        <Map
          mapStyle={SATELLITE}
          initialViewState={vs}
          onViewStateChange={e => setVs(e.viewState)}
          attributionControl={false}
          style={{ position: 'absolute', inset: 0 }}
        >
          <DeckOverlay layers={layers}
            getTooltip={({ object, layer }) => object && layer && ({
              html: layer.id === 'blocks'
                ? `<b>Zone ${object.id}</b><br/>${object.monthly[month].toFixed(0)} t CO2 this month<br/>annual ${(object.annual/1000).toFixed(0)} kt`
                : layer.id === 'opt' ? `<b>Optimized charger site</b>` : `<b>${object.name}</b><br/>existing charger`,
            })} />
        </Map>

        <div className="legend">
          <b style={{ color: 'var(--cyan)' }}>{city}</b> - satellite + 3D emission columns
          <div className="bar" />
          <span>low</span> to <span>high</span>
          <div style={{ marginTop: 8 }}>
            <span className="chip"><span className="dot" style={{ background: '#3b82f6' }} />existing</span>
            <span className="chip"><span className="dot" style={{ background: '#facc15' }} />optimized (10)</span>
          </div>
        </div>

        <div className="timebar">
          <button onClick={() => setPlay(p => !p)}>{play ? 'Pause' : 'Play'}</button>
          <input type="range" min={0} max={11} value={month} onChange={e => { setPlay(false); setMonth(+e.target.value) }} />
          <b style={{ color: 'var(--cyan)' }}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month]}</b>
          <span className="unit">{(total/1000).toFixed(1)} kt this month</span>
        </div>
      </div>

      <div className="side">
        <h2>City 3D + 4D</h2>
        <label>City</label>
        <select value={city} onChange={e => setCity(e.target.value)} className="select">
          {cities.map(c => <option key={c}>{c}</option>)}
        </select>
        <div className="kpis" style={{ marginTop: 12 }}>
          <div className="kpi"><b>{(annual/1e6).toFixed(2)}</b><span>Mt CO2/yr</span></div>
          <div className="kpi"><b>{blocks.length}</b><span>zones</span></div>
          <div className="kpi"><b>{chargers.length}</b><span>chargers</span></div>
        </div>
        <div className="card">
          <h3>Earth view</h3>
          <p style={{ fontSize: 11, color: 'var(--mut)' }}>
            Real satellite imagery with extruded 3D emission columns. Drag to orbit, scroll to zoom.
            The 4D time animation cycles the 12 month season so columns rise and fall.
          </p>
        </div>
        <div className="card">
          <h3>Layers</h3>
          <label><input type="checkbox" checked={showOpt} onChange={e => setShowOpt(e.target.checked)} /> Optimized charger sites</label>
          <label><input type="checkbox" checked={showExist} onChange={e => setShowExist(e.target.checked)} /> Existing chargers</label>
        </div>
        <div className="card">
          <h3>Top emission zones</h3>
          <table className="tbl"><tbody>
            {[...blocks].sort((a,b) => b.annual - a.annual).slice(0,8).map(b => (
              <tr key={b.id}><td>{b.id}</td><td>{(b.annual/1000).toFixed(1)} kt/yr</td></tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </div>
  )
}
