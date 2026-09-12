#!/usr/bin/env python3
"""Generate per-city block + charger JSONs for all CHETNA cities (Carbon Atlas v3)."""
import json, os
import numpy as np, pandas as pd

OUT = 'webapp/public/data'
os.makedirs(OUT, exist_ok=True)

g = pd.read_csv('data_demo/chetnaroad/city_annual_grid_co2.csv')
d = pd.read_csv('data_demo/chetnaroad/city_daily_co2.csv')
amrit = pd.read_csv('data_demo/eamrit_charging_stations.csv')
amrit['lat'] = pd.to_numeric(amrit.latitude, errors='coerce')
amrit['lon'] = pd.to_numeric(amrit.longitude, errors='coerce')
amrit = amrit.dropna(subset=['lat', 'lon'])

ALIAS = {
    'Delhi': ['delhi', 'new delhi'], 'Bengaluru': ['bengaluru', 'bangalore'],
    'Mumbai': ['mumbai'], 'Chennai': ['chennai'], 'Hyderabad': ['hyderabad'],
    'Kolkata': ['kolkata'], 'Jaipur': ['jaipur'], 'Lucknow': ['lucknow'],
    'Indore': ['indore'], 'Vadodara': ['vadodara', 'baroda'], 'Chandigarh': ['chandigarh'],
    'Guwahati': ['guwahati'], 'Mangaluru': ['mangaluru', 'mangalore'],
    'Tiruppur': ['tiruppur', 'tirupur'], 'Pune': ['pune'],
}

blocks_all = {}
chargers_all = {}
for city, grp in g.dropna(subset=['co2_tonnes_per_day_mean']).groupby('city'):
    dd = d[d.city == city].copy(); dd['time'] = pd.to_datetime(dd['time']); dd['month'] = dd.time.dt.month
    dd['scale'] = dd['co2_tonnes'] / dd['co2_tonnes'].mean()
    ms = dd.groupby('month')['scale'].sum()
    grp = grp.copy()
    grp['block'] = (np.floor(grp.lat/0.025).astype(int).astype(str)+'_'+np.floor(grp.lon/0.025).astype(int).astype(str))
    blk = grp.groupby('block').agg(lat=('lat','mean'), lon=('lon','mean'),
          co2_t_day=('co2_tonnes_per_day_mean','sum')).reset_index()
    blocks_all[city] = [
        {'id': r.block, 'lat': round(r.lat,4), 'lon': round(r.lon,4),
         'annual': round(r.co2_t_day*365),
         'monthly': [round(r.co2_t_day*ms.get(m,1),2) for m in range(1,13)]}
        for r in blk.itertuples()]
    # chargers
    keys = ALIAS.get(city, [city.lower()])
    ch = amrit[amrit['city'].str.lower().str.strip().isin(keys)]
    chargers_all[city] = [{'name': (n or 'Charging station'), 'lat': round(la,4), 'lon': round(lo,4)}
                          for n, la, lo in ch[['name','lat','lon']].itertuples(index=False)]

def clean(o):
    if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list): return [clean(v) for v in o]
    if isinstance(o, float) and (o != o or o in (float('inf'), float('-inf'))): return None
    return o

with open(f'{OUT}/cities_blocks.json', 'w') as f: json.dump(clean(blocks_all), f, allow_nan=False)
with open(f'{OUT}/cities_chargers.json', 'w') as f: json.dump(clean(chargers_all), f, allow_nan=False)
print('cities:', len(blocks_all))
for c in blocks_all: print(f"  {c}: {len(blocks_all[c])} blocks, {len(chargers_all[c])} chargers")
