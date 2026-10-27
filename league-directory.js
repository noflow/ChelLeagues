/* Visibility is controlled in Toolkit; never fall back to stale hardcoded cards. */
(() => {
  'use strict';
  const root = document.getElementById('league-directory');
  const status = document.getElementById('directory-status');
  const refresh = document.getElementById('directory-refresh');
  let busy = false;
  async function load() {
    if (busy) return;
    busy = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('https://api-toolbox.onrender.com/api/public/leagues', {
        credentials: 'omit', cache: 'no-store', signal: controller.signal
      });
      if (!response.ok) throw new Error('Directory unavailable');
      const data = await response.json();
      if (!Array.isArray(data.leagues)) throw new Error('Invalid directory');
      const cards = data.leagues.map(league => {
        const url = new URL(league.url);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid website');
        const card = document.createElement('a');
        card.className = 'card';
        card.href = url.href;
        card.style.setProperty('--colour', /^#[a-f0-9]{6}$/i.test(league.colour) ? league.colour : '#40c6ff');
        const heading = document.createElement('h2');
        heading.textContent = league.label;
        const description = document.createElement('p');
        description.textContent = league.name;
        const linkText = document.createElement('strong');
        linkText.textContent = 'Enter league →';
        card.append(heading, description, linkText);
        return card;
      });
      root.replaceChildren(...cards);
      status.textContent = cards.length ? '' : 'No leagues are currently listed. Please check back soon.';
    } catch {
      root.replaceChildren();
      status.textContent = 'League listings are temporarily unavailable. Please try again.';
    } finally {
      clearTimeout(timeout);
      busy = false;
    }
  }
  refresh.addEventListener('click', load);
  window.addEventListener('focus', load);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden) load(); }, 60000);
  load();
})();
