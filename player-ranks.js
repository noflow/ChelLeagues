/* The approved artwork is retained intact; SVG viewports select each badge.
   This is a display adapter for the existing scoring formula, not a new model. */
(() => {
  'use strict';
  const asset = new URL('assets/player-ranks-v2.png', document.currentScript.src).href;
  const tiers = ['Silver', 'Gold', 'Platinum', 'Diamond', 'Elite'];
  const divisions = ['III', 'II', 'I'];
  // Explicit, stable thresholds on the existing 70–96 skater scale.
  const thresholds = [70,72,74,76,78,80,82,84,86,88,90,92,94,95,96];
  const centers = [187,486,780,1075,1368];
  const rows = {III:[112,280], II:[394,269], I:[664,290]};
  let clipSequence = 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function rank(score, gp, goalie = false) {
    const minimum = goalie ? 3 : 4; // Match the current model's qualification gates.
    if (!Number.isFinite(Number(gp)) || Number(gp) < minimum || !Number.isFinite(score)) {
      return {provisional:true, label:'Provisional', minimum};
    }
    // Goalies use 72–95 in the existing model; align its endpoints with 70–96.
    const displayScore = goalie ? 70 + (score - 72) * 26 / 23 : score;
    let level = 0;
    thresholds.forEach((threshold, index) => {if (displayScore >= threshold) level = index;});
    const tier = Math.floor(level / 3);
    const division = divisions[level % 3];
    return {tier, division, label:`${tiers[tier]} ${division}`, minimum, provisional:false};
  }
  function art(tier, division) {
    const [y, height] = rows[division];
    const x = centers[tier]-144;
    const clip = `cl-rank-crop-${++clipSequence}`;
    return `<svg class="cl-rank-art" viewBox="${x} ${y} 288 ${height}" width="40" height="40" aria-hidden="true" focusable="false"><defs><clipPath id="${clip}" clipPathUnits="userSpaceOnUse"><rect x="${x}" y="${y}" width="288" height="${height}"/></clipPath></defs><image href="${escape(asset)}" width="1536" height="1024" clip-path="url(#${clip})"/></svg>`;
  }
  function render({score, gp, goalie=false, compact=false}) {
    const value = rank(score, gp, goalie);
    const title = value.provisional
      ? `Provisional — ${value.minimum} games required for this role.`
      : `${value.label} — League performance rank for this stats view.`;
    const icon = value.provisional ? '<span class="cl-rank-pending" aria-hidden="true">…</span>' : art(value.tier,value.division);
    return `<span class="cl-player-rank${compact?' cl-player-rank-compact':''}" role="img" aria-label="${escape(value.label)}" title="${escape(title)}">${icon}${compact?'':`<span class="cl-rank-label">${escape(value.label)}</span>`}</span>`;
  }
  window.ChelRanks = Object.freeze({rank,render,thresholds:Object.freeze(thresholds)});
  document.addEventListener('DOMContentLoaded', () => {
    for (const id of ['page-players','page-goalies']) {
      const page = document.getElementById(id);
      if (!page) continue;
      const guide = document.createElement('details');
      guide.className = 'cl-rank-guide';
      guide.innerHTML = `<summary>Player rank guide</summary><p>Ranks progress from Silver III to Elite I. Division I is the highest within each tier. Skaters qualify after 4 games and goalies after 3; until then, they are Provisional. Ranks reflect the current league scoring model for the selected stats view.</p><div class="cl-rank-tier-grid">${tiers.map((tier,index)=>`<section><h3>${tier}</h3><div>${divisions.map(division=>`<span role="img" aria-label="${tier} ${division}">${art(index,division)}</span>`).join('')}</div></section>`).join('')}</div>`;
      const controls = page.querySelector('.controls');
      if (controls) controls.after(guide); else page.prepend(guide);
    }
  });
})();
