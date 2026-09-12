import React, { useEffect, useState } from 'react';
import { loadAll, ask } from './api.js';
import { loadModel } from './model.js';
import { Skeleton, Err } from './ui.jsx';
import { Globe, Earth, Predict, Insights, Optimizer, Roadmap, Compare, Reports } from './views.jsx';

const TABS = [['globe','Globe'],['earth','Earth View'],['predict','Predict'],['insights','Model Insights'],
  ['optimizer','EV Optimizer'],['roadmap','Roadmap 2030'],['compare','Compare'],['reports','Reports']];

export default function App() {
  const [tab, setTab] = useState('earth');
  const [city, setCity] = useState('Delhi');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [theme, setTheme] = useState('dark');
  const [q, setQ] = useState('');
  const [ans, setAns] = useState(null);

  const load = () => { setErr(null); setData(null);
    Promise.all([loadAll(), loadModel()]).then(([d]) => setData(d)).catch(e => setErr(String(e))); };
  useEffect(load, []);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  return <div className="app">
    <nav>
      <svg className="logo" viewBox="0 0 40 40" width="34" height="34" aria-label="Carbon Atlas India">
        <rect width="40" height="40" rx="9" fill="#1A1F26" />
        <circle cx="20" cy="20" r="12" fill="none" stroke="#F5A524" strokeWidth="1.6" />
        <ellipse cx="20" cy="20" rx="12" ry="5" fill="none" stroke="#F5A524" strokeWidth="1" />
        <ellipse cx="20" cy="20" rx="5" ry="12" fill="none" stroke="#F5A524" strokeWidth="1" />
        <path d="M26 12 a10 10 0 0 1 6 8" fill="none" stroke="#2DD4BF" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="title">CARBON <em>ATLAS</em> INDIA</div>
      <div className="tabs">
        {TABS.map(([id, l]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>)}
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask the Atlas"
        onKeyDown={e => { if (e.key === 'Enter' && data) setAns(ask(q, data).text); }}
        style={{ width: 150, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--txt)', fontSize: 12 }} />
      <button className="theme" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'}</button>
    </nav>

    <main>
      {err ? <Err msg={err} retry={load} /> : !data ? (
        <div className="load"><div className="spin" /><div className="mono">Loading model and datasets</div></div>
      ) : (
        <>
          {tab === 'globe' && <Globe data={data} onPick={c => { setCity(c); setTab('earth'); }} />}
          {tab === 'earth' && <Earth data={data} city={city} setCity={setCity} />}
          {tab === 'predict' && <Predict data={data} />}
          {tab === 'insights' && <Insights data={data} />}
          {tab === 'optimizer' && <Optimizer data={data} />}
          {tab === 'roadmap' && <Roadmap data={data} />}
          {tab === 'compare' && <Compare data={data} />}
          {tab === 'reports' && <Reports data={data} city={city} />}
        </>
      )}
    </main>
    {ans && <div className="toast" onClick={() => setAns(null)} style={{ cursor: 'pointer' }}>{ans}</div>}
  </div>;
}
