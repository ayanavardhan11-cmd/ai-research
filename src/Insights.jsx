import React from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
         LineChart, Line, AreaChart, Area, ComposedChart } from 'recharts'

const TT = { background: '#10262c', border: '1px solid #1d3a3a' }

export default function Insights({ data }) {
  const cv = Object.entries(data.metrics).filter(([k]) => k !== 'optimizer')
    .map(([k, v]) => ({ name: k.replace(/_/g, ' '), r2: v.r2, mae: v.mae }))
  const fleet = data.fleet.map(r => ({
    ym: r.ym.slice(2), Petrol: r.Petrol || 0, Diesel: r.Diesel || 0, CNG: r.CNG || 0, EV: r.EV || 0,
  }))
  const ct = data.ct.filter(r => r.year >= 2021).map(r => ({ ...r, kt: +(r.co2_tonnes / 1000).toFixed(0) }))
  const aqi = data.aqi.map(r => ({ d: r.date.slice(5), aqi: r.aqi }))

  return (
    <div className="view">
      <div className="stage" style={{ overflow: 'auto', padding: 22 }}>
        <h2>Model + data insights</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card"><h3>Cross-validation R² (honest generalization)</h3>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={cv}><CartesianGrid stroke="#1d3a3a" />
                <XAxis dataKey="name" stroke="#93a8ad" tick={{ fontSize: 9 }} />
                <YAxis domain={[0, 1]} stroke="#93a8ad" /><Tooltip contentStyle={TT} />
                <Bar dataKey="r2" fill="#17c3a5" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer></div>
          <div className="card"><h3>SHAP feature importance</h3>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={data.shap} layout="vertical"><CartesianGrid stroke="#1d3a3a" />
                <XAxis type="number" stroke="#93a8ad" /><YAxis type="category" dataKey="f" width={110} stroke="#93a8ad" tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={TT} /><Bar dataKey="v" fill="#FDD807" /></BarChart>
            </ResponsiveContainer></div>
          <div className="card"><h3>Delhi AQI, 2021 (validation covariate)</h3>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={aqi}><CartesianGrid stroke="#1d3a3a" />
                <XAxis dataKey="d" stroke="#93a8ad" tick={{ fontSize: 9 }} interval={40} />
                <YAxis stroke="#93a8ad" /><Tooltip contentStyle={TT} />
                <Line dataKey="aqi" stroke="#ff5c5c" dot={false} strokeWidth={1.5} /></LineChart>
            </ResponsiveContainer></div>
          <div className="card"><h3>Climate TRACE Delhi monthly CO2 (kt)</h3>
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={ct}><CartesianGrid stroke="#1d3a3a" />
                <XAxis dataKey="year" stroke="#93a8ad" tick={{ fontSize: 9 }} />
                <YAxis stroke="#93a8ad" /><Tooltip contentStyle={TT} />
                <Area dataKey="kt" stroke="#17c3a5" fill="#17c3a5" fillOpacity={0.35} /></AreaChart>
            </ResponsiveContainer></div>
          <div className="card" style={{ gridColumn: '1 / -1' }}><h3>Delhi fleet composition + EV adoption (VAHAN)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={fleet}><CartesianGrid stroke="#1d3a3a" />
                <XAxis dataKey="ym" stroke="#93a8ad" tick={{ fontSize: 9 }} interval={5} />
                <YAxis yAxisId="a" stroke="#93a8ad" /><YAxis yAxisId="b" orientation="right" stroke="#ff5c5c" />
                <Tooltip contentStyle={TT} /><Legend />
                <Area yAxisId="a" stackId="1" dataKey="Petrol" fill="#8a6d0b" />
                <Area yAxisId="a" stackId="1" dataKey="Diesel" fill="#3c5a4f" />
                <Area yAxisId="a" stackId="1" dataKey="CNG" fill="#17c3a5" />
                <Area yAxisId="a" stackId="1" dataKey="EV" fill="#FDD807" />
              </ComposedChart>
            </ResponsiveContainer></div>
        </div>
      </div>
    </div>
  )
}
