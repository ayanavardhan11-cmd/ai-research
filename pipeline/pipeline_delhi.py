#!/usr/bin/env python3
"""
=================================================================
 FULL RESEARCH PIPELINE — DELHI (2021)
 Data: CHETNA-Road grid+daily · Climate TRACE monthly · VAHAN fuel ·
       e-Amrit chargers · CPCB AQI · (OWID context)
 Outputs: data_demo/delhi/*.csv + research_outputs/metrics.json
=================================================================
"""
import json, os
import numpy as np
import pandas as pd

OUT = "data_demo/delhi"
os.makedirs(OUT, exist_ok=True)
CLAT, CLON = 28.61, 77.21
BLOCK = 0.025

# ---------------- 1. LOAD ----------------
grid   = pd.read_csv('data_demo/chetnaroad/city_annual_grid_co2.csv')
daily  = pd.read_csv('data_demo/chetnaroad/city_daily_co2.csv')
ct     = pd.read_csv('data_demo/climate_trace/india_road_transport_urban_areas.csv')
vahan  = pd.read_csv('data_demo/vahan/vahan_registrations_by_fuel_type.csv')
amrit  = pd.read_csv('data_demo/eamrit_charging_stations.csv')
aqi    = pd.read_csv('data_demo/aqi/aqi_hourly_long.csv')

cells  = grid[grid['city']=='Delhi'].dropna(subset=['co2_tonnes_per_day_mean']).copy()
dd     = daily[daily['city']=='Delhi'].copy(); dd['time']=pd.to_datetime(dd['time'])
ctu    = ct[ct['urban_area']=='Delhi [New Delhi] Urban Area'].copy()
vd     = vahan[vahan['state_name']=='Delhi'].copy(); vd['date']=pd.to_datetime(vd['date'])
ad     = amrit[amrit['state'].str.contains('Delhi', case=False, na=False)].copy()
ad['lat']=pd.to_numeric(ad['latitude'], errors='coerce'); ad['lon']=pd.to_numeric(ad['longitude'], errors='coerce')
ad = ad.dropna(subset=['lat','lon'])
adq    = aqi[(aqi['city']=='Delhi') & (aqi['year'].astype(str)=='2021')].copy()

# ---------------- 2. BLOCKS ----------------
cells['block'] = (np.floor(cells['lat']/BLOCK).astype(int).astype(str)+'_'+
                  np.floor(cells['lon']/BLOCK).astype(int).astype(str))
blocks = cells.groupby('block').agg(lat=('lat','mean'), lon=('lon','mean'),
        n_cells=('co2_tonnes_per_day_mean','size'),
        co2_t_day=('co2_tonnes_per_day_mean','sum')).reset_index()

# static features
blocks['dist_center_km'] = np.sqrt((blocks['lat']-CLAT)**2+(blocks['lon']-CLON)**2)*111
def near_charger(lat, lon):
    d = np.sqrt((ad['lat']-lat)**2+(ad['lon']-lon)**2)*111
    return d.min()
blocks['charger_dist_km'] = blocks.apply(lambda r: near_charger(r['lat'], r['lon']), axis=1)

# ---------------- 3. TIME-VARYING FEATURES ----------------
dd['scale'] = dd['co2_tonnes']/dd['co2_tonnes'].mean()
adq_d = adq.groupby('date')['aqi'].mean().reset_index(); adq_d['date']=pd.to_datetime(adq_d['date'])
adq_d['ym'] = adq_d['date'].dt.to_period('M')

def fuel_group(t):
    t = str(t)
    if t in ('Electric(Bov)','Pure Ev','Strong Hybrid Ev','Plug-In Hybrid Ev'): return 'EV'
    if 'Cng' in t or 'Lpg' in t: return 'CNG_LPG'
    if t.startswith('Petrol'): return 'Petrol'
    if t.startswith('Diesel'): return 'Diesel'
    return 'Other'
vd['fg'] = vd['type'].map(fuel_group)
vm = vd.groupby(vd['date'].dt.to_period('M')).apply(
     lambda g: pd.Series({'total': g['registrations'].sum(),
        'ev_share': g.loc[g.fg=='EV','registrations'].sum()/max(1,g['registrations'].sum()),
        'cng_share': g.loc[g.fg=='CNG_LPG','registrations'].sum()/max(1,g['registrations'].sum())}),
     include_groups=False).reset_index().rename(columns={'date':'ym'})

ctm = ctu.copy(); ctm['ym'] = pd.PeriodIndex.from_fields(year=ctm['year'], month=ctm['month'], freq='M')
ctm = ctm.groupby('ym').agg(vehicle_km=('vehicle_km','mean'), road_km=('road_km','mean')).reset_index()

# ---------------- 4. PANEL (block x day) ----------------
rows=[]
for _, d in dd.iterrows():
    tmp = blocks.copy()
    tmp['date']=d['time']
    tmp['label']=tmp['co2_t_day']*d['scale']
    rows.append(tmp)
panel = pd.concat(rows, ignore_index=True)
panel['ym'] = panel['date'].dt.to_period('M')
panel['doy']=panel['date'].dt.dayofyear
panel['dow']=panel['date'].dt.dayofweek
panel['month']=panel['date'].dt.month
panel['is_weekend']=(panel['dow']>=5).astype(int)
panel['sin_doy']=np.sin(2*np.pi*panel['doy']/365.25)
panel['cos_doy']=np.cos(2*np.pi*panel['doy']/365.25)
panel = panel.merge(adq_d[['date','aqi']], on='date', how='left')
panel = panel.merge(vm[['ym','ev_share','cng_share']], on='ym', how='left')
panel = panel.merge(ctm[['ym','vehicle_km','road_km']], on='ym', how='left')
panel['log_vkt']=np.log1p(panel['vehicle_km'])
panel['aqi']=panel['aqi'].fillna(panel['aqi'].mean())
panel['ev_share']=panel['ev_share'].fillna(0.01)
panel['cng_share']=panel['cng_share'].fillna(0.1)
panel.to_csv(f'{OUT}/panel.csv', index=False)
print("Panel:", panel.shape)

FEATS=['lat','lon','dist_center_km','n_cells','charger_dist_km','doy','dow','month',
       'is_weekend','sin_doy','cos_doy','aqi','ev_share','cng_share','log_vkt']
X=panel[FEATS]; y=panel['label']

# ---------------- 5. MODEL + CV SCHEMES ----------------
import xgboost as xgb
from sklearn.model_selection import KFold
from sklearn.metrics import mean_absolute_error, r2_score

def fit(Xtr,ytr,Xte,yte):
    m=xgb.XGBRegressor(n_estimators=400, learning_rate=0.05, max_depth=6,
        subsample=0.8, colsample_bytree=0.8, random_state=42, n_jobs=-1)
    m.fit(Xtr,ytr); p=m.predict(Xte)
    return m,p

metrics={}
# random 5-fold
r2s, maes=[],[]
kf=KFold(5, shuffle=True, random_state=42)
for tr,te in kf.split(blocks):
    mtr = panel['block'].isin(blocks['block'].iloc[tr]); mte = panel['block'].isin(blocks['block'].iloc[te])
    _,p = fit(X[mtr],y[mtr],X[mte],y[mte]); r2s.append(r2_score(y[mte],p)); maes.append(mean_absolute_error(y[mte],p))
metrics['random_cv']={'r2':round(np.mean(r2s),3),'mae':round(np.mean(maes),2)}

# spatial
mid=panel['lon'].median()
w,e = panel['lon']<=mid, panel['lon']>mid
_,pw = fit(X[e],y[e],X[w],y[w]); metrics['spatial_E2W']={'r2':round(r2_score(y[w],pw),3),'mae':round(mean_absolute_error(y[w],pw),2)}
_,pe = fit(X[w],y[w],X[e],y[e]); metrics['spatial_W2E']={'r2':round(r2_score(y[e],pe),3),'mae':round(mean_absolute_error(y[e],pe),2)}

# temporal
h1,h2 = panel['month']<=6, panel['month']>6
_,p12 = fit(X[h1],y[h1],X[h2],y[h2]); metrics['temporal_H1toH2']={'r2':round(r2_score(y[h2],p12),3),'mae':round(mean_absolute_error(y[h2],p12),2)}
_,p21 = fit(X[h2],y[h2],X[h1],y[h1]); metrics['temporal_H2toH1']={'r2':round(r2_score(y[h1],p21),3),'mae':round(mean_absolute_error(y[h1],p21),2)}

# spatio-temporal (hardest): west-H1 train -> east-H2 test
tr_mask = w & h1; te_mask = e & h2
_,pst = fit(X[tr_mask],y[tr_mask],X[te_mask],y[te_mask])
metrics['spatiotemporal_W_H1_to_E_H2']={'r2':round(r2_score(y[te_mask],pst),3),'mae':round(mean_absolute_error(y[te_mask],pst),2)}

model_full,_ = fit(X,y,X,y)
panel['pred']=model_full.predict(X)
import os as _os
_os.makedirs('webapp/public/data', exist_ok=True)
model_full.save_model('webapp/public/data/model.json')
panel.to_csv(f'{OUT}/panel_with_pred.csv', index=False)
print("CV metrics:", json.dumps(metrics, indent=1))

# ---------------- 6. SHAP ----------------
import shap
expl = shap.TreeExplainer(model_full)
sv = expl.shap_values(X.sample(3000, random_state=42))
imp = pd.Series(np.abs(sv).mean(axis=0), index=FEATS).sort_values(ascending=False)
imp.to_csv(f'{OUT}/shap_importance.csv')
print("\nSHAP importance:\n", imp.round(4).to_string())
np.save(f'{OUT}/shap_values.npy', sv)

# ---------------- 7. OPTIMIZER + SCENARIOS ----------------
import pulp
ann = blocks.copy()
ann['annual_co2'] = ann['co2_t_day']*365
EF_ICE=0.171; CONS_EV=0.16; CI_2021=0.72
ratio_today = 1 - (CONS_EV*CI_2021)/EF_ICE
ann['benefit'] = ann['annual_co2']*ratio_today
results={}
for budget in (5,10,20,30):
    prob=pulp.LpProblem('place',pulp.LpMaximize)
    x={i:pulp.LpVariable(f'x{i}',cat='Binary') for i in ann.index}
    prob+=pulp.lpSum(ann.loc[i,'benefit']*x[i] for i in ann.index)
    prob+=pulp.lpSum(x[i] for i in ann.index)<=budget
    prob.solve(pulp.PULP_CBC_CMD(msg=0))
    ch=[i for i in ann.index if x[i].value()==1]
    results[budget]={'sites':int(len(ch)),'co2_saved_t':round(sum(ann.loc[i,'benefit'] for i in ch))}
    if budget==10:
        ann.loc[ch,['block','lat','lon','annual_co2','benefit']].to_csv(f'{OUT}/charger_sites_b10.csv',index=False)
print("\nOptimizer:", json.dumps(results))

# scenario roadmap 2021-2030
years=list(range(2021,2031))
tot=ann['annual_co2'].sum()
road=[]
for yr in years:
    t=yr-2021
    ci = 0.72 - (0.27*t/9)                      # grid decarbonization
    ev = 0.02 + 0.58*(1/(1+np.exp(-(t-5.5)/1.6)))  # logistic EV uptake
    growth = (1.04)**t                            # VKT growth
    ratio = 1-(CONS_EV*ci)/EF_ICE
    base = tot*growth
    road.append({'year':yr,'baseline_co2_t':round(base),'abated_co2_t':round(base*ev*ratio),
                 'grid_ci':round(ci,3),'ev_share':round(ev,3),'pct_reduction':round(100*ev*ratio,1)})
pd.DataFrame(road).to_csv(f'{OUT}/roadmap_2030.csv', index=False)
print("\nRoadmap:\n", pd.DataFrame(road).to_string(index=False))

metrics['optimizer']=results
json.dump(metrics, open('research_outputs/metrics.json','w'), indent=1)
print("\n[STAGE 1-3 COMPLETE]")
