// Real XGBoost inference in the browser. Contract: FEATS order from pipeline_delhi.py.
export const FEATS = ['lat','lon','dist_center_km','n_cells','charger_dist_km','doy','dow','month',
  'is_weekend','sin_doy','cos_doy','aqi','ev_share','cng_share','log_vkt'];
export const EF_ICE = 0.171, CONS_EV = 0.16;

let T = null, BASE = 0;
export async function loadModel() {
  if (T) return;
  const m = await (await fetch('data/model.json')).json();
  T = m.learner.gradient_booster.model.trees;
  const bs = m.learner.learner_model_param.base_score;
  BASE = typeof bs === 'string' ? parseFloat(bs.replace(/[[\]]/g, '')) : bs[0];
}
const fr = x => Math.fround(x);
export function predict(x) {
  let tot = BASE;
  for (let i = 0; i < T.length; i++) {
    const t = T[i], bw = t.base_weights, L = t.left_children, R = t.right_children,
      F = t.split_indices, C = t.split_conditions;
    let n = 0;
    for (;;) {
      if (L[n] < 0) { tot += bw[n]; break; }
      const fv = fr(+x[FEATS[F[n]]]);
      n = fv < fr(C[n]) ? L[n] : R[n];
    }
  }
  return tot;
}
