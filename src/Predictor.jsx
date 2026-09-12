import React, { useEffect, useMemo, useState } from 'react'
import { predict } from './model.js'

const CLAT = 28.61, CLON = 77.21

export default function Predictor({ data }) {
  const [dist, setDist] = useState(5)
  const [cells, setCells] = useState(12)
  const [cd, setCd] = useState(2)
  const [month, setMonth] = useState(1)
  const [dow, setDow] = useState(3)
  const [aqi, setAqi] = useState(200)
  const [ev, setEv] = useState(0.05)
  const [cng, setCng] = useState(0.2)
  const [vkt, setVkt] = useState(1.6e9)
  const [out, setOut] = useState(null)

  useEffect(() => {
    const doy = Math.round(month * 30.4)
    const x = {
      lat: CLAT + dist * 0.008, lon: CLON + dist * 0.006,
      dist_center_km: dist, n_cells: cells, charger_dist_km: cd,
      doy, dow: dow, month, is_weekend: dow >= 5 ? 1 : 0,
      sin_doy: Math.sin(2 * Math.PI * doy / 365.25), cos_doy: Math.cos(2 * Math.PI * doy / 365.25),
      aqi, ev_share: ev, cng_share: cng, log_vkt: Math.log1p(vkt),
    }
    const pred = predict(x)
    const evHigh = predict({ ...x, ev_share: Math.min(0.5, ev + 0.25) })
    setOut({ pred, evHigh })
  }, [dist, cells, cd, month, dow, aqi, ev, cng, vkt])

  return (
    <div className="view">
      <div className="stage" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ width: 460, textAlign: 'center' }}>
          <h2>Live AI prediction</h2>
          <div className="big">{out ? out.pred.toFixed(1) : '-'}</div>
          <div className="unit">tonnes CO2 per day for this zone</div>
          <div className="unit">~ {(out ? out.pred * 365 / 1000 : 0).toFixed(1)} kt per year</div>
          {out && (
            <div className="kpi" style={{ marginTop: 14 }}>
              <b style={{ color: 'var(--teal)' }}>{((out.pred - out.evHigh) / Math.max(0.01, out.pred) * 100).toFixed(1)}%</b>
              <span>lower if EV share +25 pp (what-if)</span>
            </div>
          )}
          <p style={{ fontSize: 10.5, color: 'var(--mut)', marginTop: 12 }}>
            This is the real trained XGBoost (400 trees) running live in your browser via a parity-verified JSON tree interpreter (max diff vs Python 7.9e-5).
          </p>
        </div>
      </div>
      <div className="side">
        <h2>AI Predictor inputs</h2>
        <label>Distance from centre: <span className="val">{dist} km</span></label>
        <input type="range" min={0} max={15} step={0.5} value={dist} onChange={e => setDist(+e.target.value)} />
        <label>Zone size (500m cells): <span className="val">{cells}</span></label>
        <input type="range" min={1} max={25} value={cells} onChange={e => setCells(+e.target.value)} />
        <label>Distance to nearest charger: <span className="val">{cd} km</span></label>
        <input type="range" min={0} max={10} step={0.5} value={cd} onChange={e => setCd(+e.target.value)} />
        <label>Month: <span className="val">{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]}</span></label>
        <input type="range" min={1} max={12} value={month} onChange={e => setMonth(+e.target.value)} />
        <label>Day of week: <span className="val">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][dow]}</span></label>
        <input type="range" min={0} max={6} value={dow} onChange={e => setDow(+e.target.value)} />
        <label>Air quality (AQI): <span className="val">{aqi}</span></label>
        <input type="range" min={40} max={450} value={aqi} onChange={e => setAqi(+e.target.value)} />
        <label>EV share of new fleet: <span className="val">{(ev*100).toFixed(0)}%</span></label>
        <input type="range" min={0} max={0.5} step={0.01} value={ev} onChange={e => setEv(+e.target.value)} />
        <label>CNG/LPG share: <span className="val">{(cng*100).toFixed(0)}%</span></label>
        <input type="range" min={0} max={0.5} step={0.01} value={cng} onChange={e => setCng(+e.target.value)} />
        <label>Monthly vehicle-km (VKT): <span className="val">{(vkt/1e6).toFixed(0)}M</span></label>
        <input type="range" min={1e8} max={2e9} step={1e7} value={vkt} onChange={e => setVkt(+e.target.value)} />
      </div>
    </div>
  )
}
