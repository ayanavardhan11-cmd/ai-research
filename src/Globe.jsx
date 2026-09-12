import React, { useEffect, useState } from 'react'
import { DeckGL } from '@deck.gl/react'
import { _GlobeView as GlobeView } from '@deck.gl/core'
import { ScatterplotLayer } from '@deck.gl/layers'

const color = (t) => t > 2000000 ? [255, 92, 7] : t > 800000 ? [255, 216, 7] : [23, 195, 165]

export default function Globe({ data, onPick }) {
  const [spin, setSpin] = useState(true)
  const [vs, setVs] = useState({ longitude: 78, latitude: 21, zoom: 1.2 })

  useEffect(() => {
    if (!spin) return
    const id = setInterval(() => setVs(v => ({ ...v, longitude: v.longitude + 0.2 })), 80)
    return () => clearInterval(id)
  }, [spin])

  const layers = [
    new ScatterplotLayer({
      id: 'cities',
      data: data.cities,
      getPosition: d => [d.lon, d.lat],
      getRadius: d => 20000 + Math.sqrt(d.annual_t) * 45,
      getFillColor: d => color(d.annual_t),
      getLineColor: [255, 255, 255, 160],
      lineWidthMinPixels: 1.5,
      pickable: true,
      autoHighlight: true,
      onClick: o => o.object && onPick(o.object.city),
      updateTriggers: { getRadius: [], getFillColor: [] },
    }),
  ]

  return (
    <div className="view">
      <div className="stage">
        <DeckGL
          views={[new GlobeView({ controller: true })]}
          initialViewState={vs}
          controller={true}
          layers={layers}
          onDragStart={() => setSpin(false)}
          getTooltip={({ object }) => object && ({
            html: `<b>${object.city}</b><br/>${(object.annual_t / 1e6).toFixed(2)} Mt CO2/yr`,
          })}
          style={{ position: 'absolute', inset: 0 }}
        />
        <div className="legend">
          <b style={{ color: 'var(--yel)' }}>Globe view</b> - 15 Indian cities - annual road CO2
          <div className="bar" />
          <span>low</span> to <span>high</span>
          <div style={{ marginTop: 8 }}>
            <button className="tag" onClick={() => setSpin(s => !s)}>{spin ? 'pause rotation' : 'auto rotate'}</button>
            &nbsp; click a city to open its 3D view
          </div>
        </div>
      </div>
    </div>
  )
}
