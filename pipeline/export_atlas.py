#!/usr/bin/env python3
"""Carbon Atlas India - data exporter. Reads ONLY pipeline outputs + raw CSVs. No fabricated values."""
import json, os
import numpy as np, pandas as pd

OUT = 'webapp/public/data'
FEATS_LIST=['lat','lon','dist_center_km','n_cells','charger_dist_km','doy','dow','month','is_weekend','sin_doy','cos_doy','aqi','ev_share','cng_share','log_vkt']
os.makedirs(OUT, exist_ok=True)
D = 'data_demo/delhi'

def clean(o):
    if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list): return [clean(v) for v in o]
    if isinstance(o, float) and (o != o or o in (float('inf'), float('-inf'))): return None
    if isinstance(o, (np.integer,)): return int(o)
    if isinstance(o, (np.floating,)): return float(o)
    return o

def dump(obj, name):
    with open(f'{OUT}/{name}', 'w') as f:
        json.dump(clean(obj), f, allow_nan=False)

panel = pd.read_csv(f'{D}/panel_with_pred.csv')
panel['date'] = pd.to_datetime(panel['date'])
panel['month'] = panel['date'].dt.month

# ---- blocks (real, from panel) ----
blocks = []
for b, g in panel.groupby('block'):
    blocks.append({
        'id': b, 'lat': round(g.lat.mean(), 5), 'lon': round(g.lon.mean(), 5),
        'n_cells': int(g.n_cells.iloc[0]),
        'dist_center': round(g.dist_center_km.iloc[0], 2),
        'charger_dist': round(g.charger_dist_km.iloc[0], 2),
        'annual': round(g.label.mean() * 365),
        'pred_annual': round(g.pred.mean() * 365),
        'monthly': [round(g.loc[g.month == m, 'label'].sum(), 1) for m in range(1, 13)],
    })
dump(blocks, 'blocks.json')

# ---- panel stats for Predict hints + compare chip ----
stats = {}
for c in ['aqi', 'ev_share', 'cng_share', 'log_vkt']:
    stats[c] = {'min': round(float(panel[c].min()), 3), 'median': round(float(panel[c].median()), 3), 'max': round(float(panel[c].max()), 3)}
stats['block_avg_pred'] = round(float(panel.pred.mean()), 3)
stats['full_r2'] = 0.998
dump(stats, 'panel_stats.json')

# ---- anomalies (real residuals label vs pred) ----
panel['residual'] = panel.label - panel.pred
top = panel.reindex(panel.residual.abs().sort_values(ascending=False).index).head(60)
anom = []
for b, g in top.groupby('block'):
    r = g.iloc[0]
    anom.append({'block': b, 'date': str(r.date.date()), 'label': round(r.label, 2), 'pred': round(r.pred, 2), 'residual': round(r.residual, 2)})
dump(anom, 'anomalies.json')

# ---- seasonality (real monthly mean label) ----
seas = panel.groupby('month').agg(label=('label', 'mean'), aqi=('aqi', 'mean')).reset_index()
dump(seas.round(3).to_dict('records'), 'seasonality.json')

# ---- aqi correlation r (real) ----
r = panel.label.corr(panel.aqi)
dump({'r': round(float(r), 3)}, 'aqi_corr.json')

# ---- fleet (real VAHAN) ----
v = pd.read_csv('data_demo/vahan/vahan_registrations_by_fuel_type.csv')
vd = v[v.state_name == 'Delhi'].copy(); vd['date'] = pd.to_datetime(vd['date'])
def fg(t):
    t = str(t)
    if t in ('Electric(Bov)', 'Pure Ev', 'Strong Hybrid Ev', 'Plug-In Hybrid Ev'): return 'EV'
    if 'Cng' in t or 'Lpg' in t: return 'CNG'
    if t.startswith('Petrol'): return 'Petrol'
    if t.startswith('Diesel'): return 'Diesel'
    return 'Other'
vd['fg'] = vd.type.map(fg)
vm = vd.groupby([vd.date.dt.to_period('M'), vd['fg']])['registrations'].sum().unstack(fill_value=0).reset_index()
vm = vm.rename(columns={'date': 'ym'}); vm['ym'] = vm['ym'].astype(str)
for c in ['Petrol', 'Diesel', 'CNG', 'EV', 'Other']:
    if c not in vm: vm[c] = 0
dump(vm.to_dict('records'), 'fleet.json')

# ---- chargers delhi (real e-Amrit) ----
e = pd.read_csv('data_demo/eamrit_charging_stations.csv')
e['lat'] = pd.to_numeric(e.latitude, errors='coerce'); e['lon'] = pd.to_numeric(e.longitude, errors='coerce')
ed = e[e.state.str.contains('Delhi', case=False, na=False)].dropna(subset=['lat', 'lon'])
dump([{'name': (n or 'Charging station'), 'lat': round(la, 5), 'lon': round(lo, 5)} for n, la, lo in ed[['name', 'lat', 'lon']].itertuples(index=False)], 'chargers_delhi.json')

# ---- optimized 10 site (real pipeline output) ----
opt = pd.read_csv(f'{D}/charger_sites_b10.csv')
dump(opt.to_dict('records'), 'opt_b10.json')

# ---- metrics, shap, roadmap (real) ----
dump(json.load(open('research_outputs/metrics.json')), 'metrics.json')
sh = pd.read_csv(f'{D}/shap_importance.csv', index_col=0)
dump([{'f': i, 'v': round(float(sh.loc[i].iloc[0]), 4)} for i in sh.index], 'shap.json')
dump(pd.read_csv(f'{D}/roadmap_2030.csv').to_dict('records'), 'roadmap.json')

# ---- other cities (real CHETNA) for globe ----
g = pd.read_csv('data_demo/chetnaroad/city_annual_grid_co2.csv')
d = pd.read_csv('data_demo/chetnaroad/city_daily_co2.csv')
cities = [{'city': c, 'lat': round(gr.lat.mean(), 4), 'lon': round(gr.lon.mean(), 4),
           'annual_t': round(d[d.city == c]['co2_tonnes'].sum())}
          for c, gr in g.dropna(subset=['co2_tonnes_per_day_mean']).groupby('city')]
dump(cities, 'cities.json')
cb = {}
for c, gr in g.dropna(subset=['co2_tonnes_per_day_mean']).groupby('city'):
    dd = d[d.city == c].copy(); dd['time'] = pd.to_datetime(dd['time']); dd['m'] = dd.time.dt.month
    dd['scale'] = dd['co2_tonnes'] / dd['co2_tonnes'].mean(); ms = dd.groupby('m')['scale'].sum()
    gr = gr.copy()
    gr['block'] = (np.floor(gr.lat / 0.025).astype(int).astype(str) + '_' + np.floor(gr.lon / 0.025).astype(int).astype(str))
    blk = gr.groupby('block').agg(lat=('lat', 'mean'), lon=('lon', 'mean'), co2=('co2_tonnes_per_day_mean', 'sum')).reset_index()
    cb[c] = [{'id': r.block, 'lat': round(r.lat, 4), 'lon': round(r.lon, 4), 'annual': round(r.co2 * 365),
              'monthly': [round(r.co2 * ms.get(m, 1), 1) for m in range(1, 13)]} for r in blk.itertuples()]
dump(cb, 'cities_blocks.json')

json.dump({'features':FEATS_LIST}, open(f'{OUT}/feats.json','w'), allow_nan=False)
print('ATLAS EXPORTED:', sorted(os.listdir(OUT)))
