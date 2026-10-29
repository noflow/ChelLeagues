/* A league's website UI; account service access uses league-scoped bearer sessions. */
(() => {
  'use strict';
  const config = document.querySelector('script[data-player-league]');
  if (!config) return;
  const league = config.dataset.playerLeague;
  const service = config.dataset.playerService.replace(/\/$/, '');
  if (!league || !service) return;
  const sharedSignIn = location.origin === 'https://chelleagues.com';
  const legacyKeys = sharedSignIn ? ['continental-virtual-hockey-league','nbhl','cwhl'].map(id=>'player-session:'+id) : ['player-session:'+league];
  const storageKey = sharedSignIn ? 'chelleagues-session' : 'player-session:' + league;
  const verifierKey = 'player-verifier:' + league;
  const labels = {available:'Available', unavailable:'Unavailable', maybe:'Maybe', none:'No response'};
  const E = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let token = localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey) || legacyKeys.map(key=>localStorage.getItem(key) || sessionStorage.getItem(key)).find(Boolean) || '';
  if (token) { localStorage.setItem(storageKey,token); sessionStorage.removeItem(storageKey); }
  for (const key of legacyKeys) { sessionStorage.removeItem(key); if(key!==storageKey)localStorage.removeItem(key); }
  let profile;
  let tab = 'profile';
  let linesTeam = '';
  let pairingCode = '';
  let notice = '';
  let active = false;
  let busy = false;
  let scheduleWeek = '';
  let resultsWeek = '';
  let publishedResults = [];
  let resultsState = 'Loading published results…';
  let viewGeneration = 0;
  const root = document.createElement('section');
  root.id = 'player-centre';
  const page = document.createElement('div');
  page.id = 'page-profile';
  page.className = 'page';
  page.appendChild(root);
  document.querySelector('main').appendChild(page);

  // Read the actual enclosing site's background to select its existing light/dark tokens.
  const colour = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g);
  if (colour && colour.length >= 3) root.dataset.dark = (Number(colour[0])*.2126 + Number(colour[1])*.7152 + Number(colour[2])*.0722 < 110) ? 'true' : 'false';

  function shell(content) {
    root.innerHTML = `<div class="pc-head"><div><h2>My Profile & Availability</h2><p class="pc-muted">Your player. Your team. Your next game.</p></div>${profile ? `<div class="pc-actions"><span>${E(profile.name)}</span>${profile.can_manage_league === true ? `<a class="pc-manage-league" href="https://admin.chelleagues.com/league/${encodeURIComponent(league)}">Manage League</a>` : ''}<button type="button" data-command="logout">Sign out</button></div>` : ''}</div>${notice ? `<div class="pc-notice" role="status">${E(notice)}</div>` : ''}${(profile?.management || profile?.can_draft || profile?.can_review_trades) ? `<div class="pc-tabs" role="tablist" aria-label="Player area"><button type="button" role="tab" aria-selected="${tab==='profile'}" data-command="profile">My Profile</button><button type="button" role="tab" aria-selected="${tab==='team'}" data-command="team">Team Availability</button>${profile.can_manage_lines ? `<button type="button" role="tab" aria-selected="${tab==='lines'}" data-command="lines">Team Lines</button>` : ''}${profile.can_trade ? `<button type="button" role="tab" aria-selected="${tab==='trades'}" data-command="trades">Trades</button>` : ''}${profile.can_review_trades ? `<button type="button" role="tab" aria-selected="${tab==='trade-reviews'}" data-command="trade-reviews">Trade Approvals</button>` : ''}${profile.can_draft ? `<button type="button" role="tab" aria-selected="${tab==='draft'}" data-command="draft">Snake Draft</button>` : ''}</div>` : ''}<div id="pc-content">${content}</div>`;
  }
  function message(text, error=false) { shell(`<div class="pc-card pc-notice" role="${error ? 'alert':'status'}">${E(text)}</div>`); }
  function signedOut() { profile = null; shell('<div class="pc-card"><h3>Your player area, right here</h3><p>Sign in with Discord to claim your player, update your profile, and tell your team which games you can play.</p><button type="button" data-command="login">Sign in with Discord</button><p class="pc-muted">Discord opens briefly for sign-in, then returns you to this website. Already connected to an existing account? Use that same Discord login.</p></div>'); }
  async function call(path, data) {
    const callToken=token;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    let response;
    try { response = await fetch(`${service}/api/website/${encodeURIComponent(league)}/${path}`, {
      method: data ? 'POST':'GET', credentials:'omit', cache:'no-store',
      headers:{Authorization:'Bearer '+callToken}, body:data ? new URLSearchParams(data):undefined, signal:controller.signal
    }); } catch(error) {if(error.name==='AbortError')throw new Error(data?'The server has not confirmed this action. Check the latest status before trying again.':'Live updates are delayed. Reconnecting…');throw error;} finally {clearTimeout(timeout);}
    let result;
    try { result = await response.json(); } catch { throw new Error('The account service is temporarily unavailable. Please try again.'); }
    if (!response.ok) {
      if (response.status === 401 && token===callToken) { token=''; profile=null; sessionStorage.removeItem(storageKey); localStorage.removeItem(storageKey); }
      throw new Error(result.error || 'Please try again.');
    }
    return result;
  }
  async function signIn() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const base64 = value => btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const verifier = base64(bytes);
    sessionStorage.setItem(verifierKey, verifier);
    const challenge = base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    location.assign(`${service}/website/auth/${encodeURIComponent(league)}?challenge=${challenge}&site=${encodeURIComponent(location.origin+location.pathname.replace(/\/?$/,'/'))}`);
  }
  async function exchange() {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    if (!params.has('code')) return;
    const code = params.get('code');
    history.replaceState(null,'','#profile');
    const verifier = sessionStorage.getItem(verifierKey) || '';
    sessionStorage.removeItem(verifierKey);
    if (!verifier) throw new Error('This sign-in has expired. Start again from this website.');
    const response = await fetch(`${service}/api/website/${encodeURIComponent(league)}/session`, {
      method:'POST',credentials:'omit',cache:'no-store',body:new URLSearchParams({code,verifier})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Sign-in could not finish. Please try again.');
    token = result.token;
    localStorage.setItem(storageKey,token);
  }
  const hidden = (name,value) => `<input type="hidden" name="${name}" value="${E(value)}">`;
  const option = (value,label,current) => `<option value="${E(value)}" ${value===current?'selected':''}>${E(label)}</option>`;
  const pill = (status,count='') => `<span class="pc-pill ${Object.hasOwn(labels,status)?status:'none'}">${E(count)} ${E(labels[status] || labels.none)}</span>`;
  function profileView(p) {
    if (!p.joined) return '<div class="pc-card"><h3>Join this league</h3><p>Join as a player, then claim your player record.</p><form data-action="join"><button>Join league</button></form></div>';
    let player;
    if (p.link) {
      player = `<h3>${E(p.link.name)}</h3><span class="pc-pill available">Verified player</span>${p.player ? `<dl><dt>Current team</dt><dd>${E(p.player.team_name || p.player.team)}</dd><dt>Roster</dt><dd>${E(p.player.section_label)}</dd><dt>Position</dt><dd>${E(p.player.position || 'Not listed')}</dd><dt>Salary</dt><dd>${E(Number(p.player.salary || 0).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}))}</dd></dl>`:'<p class="pc-muted">Your player needs a unique current team assignment before you can submit availability.</p>'}`;
    } else {
      player = `<h3>Claim my player</h3><p>League staff verify your claim before you can submit availability.</p>${p.claim ? `<p>Claim: <strong>${E(p.claim.name)}</strong> · ${E(p.claim.status)}</p>`:''}${p.choices.length ? `<form data-action="claim"><label>My player<select name="player_key" required><option value="">Select your player</option>${p.choices.map(c=>option(c.key,c.name,'')).join('')}</select></label><button>Submit player claim</button></form>`:'<p class="pc-muted">Contact league staff if your player is missing.</p>'}`;
    }
    const d = p.details;
    const details = `<h3>My Details</h3><p class="pc-muted">Private profile details. Official roster information stays managed by league staff.</p><form data-action="details"><label>Gamertag<input name="gamertag" maxlength="80" value="${E(d.gamertag)}"></label><label>Platform<select name="platform">${['','Xbox','PlayStation','PC'].map(v=>option(v,v || 'Select platform',d.platform || '')).join('')}</select></label><label>Preferred positions<input name="positions" maxlength="80" placeholder="C, LW, RD" value="${E(d.positions)}"></label><button>Save my details</button></form>`;
    const account = `<details class="pc-account pc-card" ${p.link?'':'open'}><summary>${p.link?'Player profile & details':'Claim your player & profile details'}</summary><div class="pc-columns"><div>${player}</div><div>${details}</div></div></details>`;
    if (!p.link) return `${p.error ? `<div class="pc-notice" role="alert">${E(p.error)}</div>`:''}${account}<div class="pc-card">Your player claim needs approval before you can submit availability.</div>`;
    const identity = `<div class="pc-identity"><div><h3>${E(p.link.name)}</h3><p class="pc-muted">${E(p.player?.team_name || p.player?.team || 'Awaiting team assignment')} · ${E(p.player?.position || 'Player')}</p></div><span class="pc-pill available">Verified player</span></div>`;
    return `${p.error ? `<div class="pc-notice" role="alert">${E(p.error)}</div>`:''}${identity}${statCards(p.stats)}<div class="pc-dashboard"><section class="pc-panel" aria-label="Published league results"><div class="pc-panel-head"><h3>League results</h3><div id="pc-results-filter"></div></div><p class="pc-panel-help">Published game scores · League local time</p><div id="pc-results-list" class="pc-scroll" aria-live="polite"><p class="pc-empty">Loading published results…</p></div></section><section class="pc-panel" aria-label="My team schedule"><div class="pc-panel-head"><h3>${E(p.player?.team_name || p.player?.team || 'My team')} schedule</h3>${weekSelect(p.games,scheduleWeek,'schedule')}</div><p class="pc-panel-help">Your availability · ${E(p.games[0]?.timezone || 'League local time')}</p><div class="pc-scroll">${scheduleRows(p)}</div></section></div><p class="pc-muted pc-privacy">Availability and notes are private to you, current team management, and league admins. Replies close at game time.</p>${account}`;
  }
  function statCards(stats) {
    const skater = stats.find(s=>s.label==='Player Stats') || stats[0];
    const m = Object.fromEntries(skater?.metrics || []);
    const numeric = value => value!==undefined && value!=='—' && value!=='' && Number.isFinite(Number(String(value).replaceAll(',',''))) ? Number(String(value).replaceAll(',','')):null;
    const gp=numeric(m.GP), pts=numeric(m.PTS);
    const fields = skater?.label==='Goalie Stats' ? [['Games played','GP'],['Wins','W'],['Goals against avg','GAA'],['Save %','Save %']] : [['Goals','G'],['Assists','A'],['Points','PTS'],['Points / GP','PPG'],['Shots','Shots'],['Shot %','Shot %']];
    if (gp && pts!==null) m.PPG=(pts/gp).toFixed(2);
    return `<div class="pc-stat-grid">${fields.map(([label,key])=>`<div class="pc-stat"><span>${E(label)}</span><strong>${E(m[key] || '—')}</strong><small>${skater?`${E(skater.team)} · ${E(m.GP || '—')} GP`:'No published stats yet'}</small></div>`).join('')}</div>`;
  }
  function dayDate(value) {
    const day=String(value || '').split(/[ T]/)[0];
    const d=new Date(day+'T12:00:00');
    return Number.isNaN(d.getTime())?null:d;
  }
  function weekKey(value) {
    const d=dayDate(value); if(!d)return '';
    d.setDate(d.getDate()-((d.getDay()+6)%7));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function weekSelect(games,current,kind) {
    const weeks=[...new Set(games.map(g=>weekKey(g.date)).filter(Boolean))].sort();
    const title=value=>{const d=dayDate(value);const end=new Date(d);end.setDate(d.getDate()+6);return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+end.toLocaleDateString('en-US',{month:'short',day:'numeric'});};
    return `<label class="pc-week"><span>Week</span><select data-week="${kind}" aria-label="${kind==='schedule'?'Schedule week':'Results week'}">${option('','All weeks',current)}${weeks.map(w=>option(w,title(w),current)).join('')}</select></label>`;
  }
  function dateCell(game) {
    const d=dayDate(game.date);
    return `<div class="pc-date"><span>${E(d?d.toLocaleDateString('en-US',{weekday:'short'}):'Date TBA')}</span><strong>${E(d?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):game.date)}</strong><small>${E(game.time || '')}</small></div>`;
  }
  function scheduleRows(p) {
    if(!p.player)return '<p class="pc-empty">Your schedule appears once your player is assigned to a team.</p>';
    const games=p.games.filter(g=>!scheduleWeek || weekKey(g.date)===scheduleWeek);
    return games.map(g=>`<article class="pc-fixture">${dateCell(g)}<div class="pc-fixture-body"><strong>${E(g.away)} at ${E(g.home)}</strong><small>${E(labels[g.response.status] || labels.none)}</small><details class="pc-note"><summary>Note & more options</summary><form data-action="availability">${hidden('game_key',g.key)}<label>My response<select name="status">${Object.entries(labels).map(([k,v])=>option(k,v,g.response.status)).join('')}</select></label><label>Note for team management<textarea name="note" maxlength="300" rows="2">${E(g.response.note)}</textarea></label><button>Save response & note</button></form></details></div><div class="pc-response-buttons" role="group" aria-label="Availability for ${E(g.away)} at ${E(g.home)} on ${E(g.date)}">${['available','unavailable','maybe'].map(status=>`<button type="button" class="pc-response ${status}" data-game="${E(g.key)}" data-status="${status}" aria-pressed="${g.response.status===status}">${E(labels[status])}</button>`).join('')}</div></article>`).join('') || '<p class="pc-empty">No upcoming games in this period.</p>';
  }
  function renderResults() {
    const list=root.querySelector('#pc-results-list');
    const filter=root.querySelector('#pc-results-filter');
    if(!list || !filter)return;
    filter.innerHTML=weekSelect(publishedResults,resultsWeek,'results');
    const games=publishedResults.filter(g=>!resultsWeek || weekKey(g.date)===resultsWeek);
    list.innerHTML=games.map(g=>`<article class="pc-fixture pc-result">${dateCell(g)}<div class="pc-fixture-body"><strong>${E(g.away)} <span>${E(g.awayScore)} – ${E(g.homeScore)}</span> ${E(g.home)}</strong><small>Final${g.overtime?' · OT':''}</small></div></article>`).join('') || `<p class="pc-empty">${E(resultsState || 'No published results in this period.')}</p>`;
  }
  async function loadResults(generation) {
    try {
      if(typeof ensureGameLogsLoaded==='function') await ensureGameLogsLoaded();
      if(generation!==viewGeneration || tab!=='profile')return;
      const log=typeof gameLogData==='undefined'?null:gameLogData;
      const rows=typeof allGamesRaw==='undefined'?[]:allGamesRaw;
      const ix=Object.fromEntries((log?.cols || []).map((c,i)=>[c,i]));
      const cell=(row,key)=>String(row[ix[key]] ?? '').trim();
      const team=name=>typeof displayTeamName==='function'?displayTeamName(name):name;
      publishedResults=rows.filter(r=>cell(r,'Team 1 Score')!=='' && cell(r,'Team 2 Score')!=='' && (cell(r,'Team 1 Result') || cell(r,'Team 2 Result'))).map(r=>({date:cell(r,'Date').split(' ')[0],time:cell(r,'Date').split(' ').slice(1).join(' '),away:team(cell(r,'Team 1')),home:team(cell(r,'Team 2')),awayScore:cell(r,'Team 1 Score'),homeScore:cell(r,'Team 2 Score'),overtime:cell(r,'OT').toLowerCase()==='yes'})).sort((a,b)=>b.date.localeCompare(a.date));
      resultsState='No published results yet.';
    } catch { if(generation!==viewGeneration)return; resultsState='Published results are temporarily unavailable.'; }
    if(generation===viewGeneration && tab==='profile')renderResults();
  }

  function teamView(t) {
    const selector = t.admin ? `<div class="pc-card"><form data-team-selector><label>Team<select name="team">${t.teams.map(v=>option(v.abbr,v.name,t.selected_team)).join('')}</select></label><button>View team</button></form></div>` : `<p>Team: <strong>${E(t.selected_team)}</strong></p>`;
    return `${selector}${t.error ? `<div class="pc-notice" role="alert">${E(t.error)}</div>`:''}<p class="pc-muted">Every current roster and TC player is included. Open a game to plan your lineup.</p>${t.games.map((g,i)=>`<details class="pc-card" ${i===0?'open':''}><summary><strong>${E(g.date)} · ${E(g.time)} · ${E(g.away)} at ${E(g.home)}</strong><div class="pc-totals">${Object.entries(labels).map(([k])=>pill(k,g.totals[k])).join('')}</div></summary><p class="pc-muted">Times: ${E(g.timezone)}</p><div class="pc-table"><table><thead><tr><th>Player</th><th>Position</th><th>Roster</th><th>Response</th><th>Note</th></tr></thead><tbody>${g.players.map(p=>`<tr><td>${E(p.name)}${p.linked?'':'<small>Account not linked</small>'}</td><td>${E(p.position || '—')}</td><td>${E(p.section_label)}</td><td>${pill(p.response.status)}</td><td>${E(p.response.note)}</td></tr>`).join('')}</tbody></table></div></details>`).join('') || '<div class="pc-card">No upcoming games for this team in the next 28 days.</div>'}`;
  }
  let tradeData;
  function tradeChoices(team,side) {
    const t=tradeData;
    if(!team)return '<p class="pc-muted">Choose a team to see its players and picks.</p>';
    const choices=(items,name)=>items.map(p=>`<label class="pc-trade-choice"><input type="checkbox" name="${name}" value="${E(p.value)}"><span>${E(p.label)}</span></label>`).join('') || '<p class="pc-muted">None available.</p>';
    return `<fieldset class="pc-trade-assets"><legend>Players</legend>${choices(t.players.filter(p=>p.team===team).map(p=>({value:p.name,label:p.name+' · '+(p.section_label || '')+' · $'+Number(p.salary || 0).toLocaleString()})),'players_from_'+side)}</fieldset>${t.picks_enabled?`<fieldset class="pc-trade-assets"><legend>Future picks</legend>${choices(t.picks.filter(p=>p.owner_team===team).map(p=>({value:p.id,label:p.label})),'picks_from_'+side)}</fieldset>`:''}`;
  }
  function tradeView(t) {
    tradeData=t;
    const packageText=(o,side)=>[...(o['players_from_'+side] || []),...(o['picks_from_'+side] || []).map(p=>p.label)].map(E).join(', ') || 'None';
    return `<div class="pc-card"><h3>Team trades · ${E(t.team)}</h3><p class="pc-muted">Both teams agree first. League administration approves before players or picks move.</p><button type="button" data-command="trades">Refresh status</button></div>${t.error?`<p class="pc-notice" role="alert">${E(t.error)}</p>`:''}<details class="pc-card" open><summary>Propose a trade</summary><form data-action="trade-propose"><div class="pc-columns"><section><h3>Your team sends</h3>${tradeChoices(t.team,'proposer')}</section><section><label>Trade with<select name="receiving_team" data-trade-team required><option value="">Choose a team</option>${t.teams.filter(v=>v.abbr!==t.team).map(v=>option(v.abbr,v.name || v.abbr,'')).join('')}</select></label><h3>You receive</h3><div id="pc-trade-receiver">${tradeChoices('','receiver')}</div></section></div><label>Offer note<textarea name="note" maxlength="1000" rows="2"></textarea></label><p class="pc-muted">Select at least one asset from each team. Rosters, salary limits, and pick ownership are checked when you send or accept an offer.</p><button>Send trade offer</button></form></details><h3>Offers & history</h3>${t.offers.map(o=>`<article class="pc-card"><h3>${E(o.proposing_team)} ↔ ${E(o.receiving_team)}</h3><span class="pc-pill">${E(o.status_label)}</span><div class="pc-columns"><p><strong>${E(o.proposing_team)} sends</strong><br>${packageText(o,'proposer')}</p><p><strong>${E(o.receiving_team)} sends</strong><br>${packageText(o,'receiver')}</p></div>${o.salary_cap_enabled?`<p class="pc-muted">Salary after: ${E(o.proposing_team)} $${E(Number(o.proposer_after).toLocaleString())} · ${E(o.receiving_team)} $${E(Number(o.receiver_after).toLocaleString())} · Cap $${E(Number(o.salary_cap).toLocaleString())}</p>`:''}${o.note?`<p>${E(o.note)}</p>`:''}<p class="pc-muted">${E(o.next_action)}</p>${o.status==='pending_team'?`<form data-action="trade-decision">${hidden('proposal_id',o.id)}<label>Decision<select name="decision">${o.receiving_team===t.team?'<option value="accept">Accept offer</option><option value="decline">Decline offer</option>':'<option value="cancel">Cancel offer</option>'}</select></label><button>Confirm decision</button></form>`:''}</article>`).join('') || '<div class="pc-card">No trade offers for your team yet.</div>'}`;
  }
  function tradeReviewView(t) {
    const pending=t.offers.filter(o=>o.status==='accepted_team');
    const packageText=(o,side)=>[...(o['players_from_'+side] || []),...(o['picks_from_'+side] || []).map(p=>p.label)].map(E).join(', ') || 'None';
    const card=(o,review)=>`<article class="pc-card"><h3>${E(o.proposing_team)} ↔ ${E(o.receiving_team)}</h3><span class="pc-pill">${E(o.status_label)}</span><div class="pc-columns"><p><strong>${E(o.proposing_team)} sends</strong><br>${packageText(o,'proposer')}</p><p><strong>${E(o.receiving_team)} sends</strong><br>${packageText(o,'receiver')}</p></div>${o.salary_cap_enabled?`<p>Salary after: ${E(o.proposing_team)} $${E(Number(o.proposer_after).toLocaleString())} · ${E(o.receiving_team)} $${E(Number(o.receiver_after).toLocaleString())} · Cap $${E(Number(o.salary_cap).toLocaleString())}</p>`:''}${o.note?`<p>Offer note: ${E(o.note)}</p>`:''}<p class="pc-muted">${E(o.next_action)}</p>${o.reviewed_by?`<p>Reviewed by ${E(o.reviewed_by)} · ${E(o.reviewed_at)}</p>`:''}${o.admin_note?`<p>League note: ${E(o.admin_note)}</p>`:''}${review?`<form data-action="trade-review">${hidden('proposal_id',o.id)}<label>League note<textarea name="admin_note" maxlength="1000" rows="2"></textarea></label><label>Decision<select name="decision" required><option value="">Choose a decision</option><option value="approve">Approve and apply trade</option><option value="reject">Reject trade</option></select></label><button ${t.error?'disabled':''}>Confirm trade decision</button></form>`:''}</article>`;
    return `<div class="pc-card"><h3>Trade Approvals · ${pending.length} pending</h3><p>Review trades agreed by both teams. Approval applies the trade and keeps its backend history.</p><button type="button" data-command="trade-reviews">Refresh status</button></div>${t.error?`<p class="pc-notice" role="alert">${E(t.error)}</p>`:''}<h3>Pending approvals</h3>${pending.map(o=>card(o,true)).join('') || '<p>No trades are waiting for league approval.</p>'}<details class="pc-card"><summary>Recent trade history</summary>${t.offers.filter(o=>o.status!=='accepted_team').map(o=>card(o,false)).join('') || '<p>No trade history yet.</p>'}</details>`;
  }
  let draftData=null, draftReceivedAt=0, draftServerTime=0, draftPolling=false, draftStale=false;
  function draftView(d) {
    const t=d.draft;
    const status=t.draft_paused?'Draft paused for a break':!d.enabled?'Draft is not open':t.ownership_error?'Ownership needs review':t.complete?'Draft complete':t.busy?'Saving the previous pick…':t.next_team?`${t.next_team} is picking`:'Waiting for starting order';
    const controls=d.admin && t.order.length ? `<div class="pc-actions"><form data-action="draft-pause">${hidden('turn_key',t.turn_key)}${hidden('action',t.draft_paused?'resume':'pause')}<button data-draft-control>${t.draft_paused?'Resume draft':'Pause draft'}</button></form>${d.enabled && t.clock.seconds && !t.draft_paused && !t.busy && !t.ownership_error && t.next_team?`<form data-action="draft-restart">${hidden('turn_key',t.turn_key)}<button data-draft-control>Restart pick clock</button></form>`:''}</div>`:'';
    const picker=d.can_pick?`<form data-action="draft-pick">${hidden('cursor',t.cursor)}${hidden('turn_key',t.turn_key)}<label>Choose a player for ${E(t.next_team)}<select name="auction_id" required><option value="">Select a player</option>${d.players.map(p=>option(p.id,p.name+' · '+(p.position || 'Position not listed'),null)).join('')}</select></label><button data-draft-pick ${d.players.length?'':'disabled'}>Draft selected player</button></form>`:`<p class="pc-muted">${t.draft_paused?'An admin will resume the draft after the break.':t.clock.expired?'Time expired. An admin can pick or restart the clock.':t.next_team?'Waiting for '+E(t.next_team)+'. Picks are available only on your team’s turn.':'An admin must prepare the draft before picks can begin.'}</p>`;
    const rows=d.history.map(p=>`<tr><td>${Math.floor(p.slot/t.order.length)+1} / ${p.slot%t.order.length+1}</td><td>${E(p.original_team)}</td><td>${E(p.team)}</td><td>${E(p.player_name)}</td><td>${p.status==='closed'?'Saved to roster':p.status==='error'?'Needs admin attention':'Saving…'}</td></tr>`).join('');
    return `<section class="pc-card pc-draft-head"><div><h3>${E(status)}</h3><p>${E(t.season_label || 'Snake draft')}${t.round?' · Round '+E(t.round)+' · Pick '+E(t.pick):''}</p><p class="pc-muted">${t.original_team?E(t.original_team)+' original pick · ':''}Your team: ${E(d.team || 'League admin')}</p></div><div class="pc-draft-clock" role="timer" aria-label="Pick time remaining">—</div></section><p id="pc-draft-sync" class="pc-muted" role="status">Live updates connected</p>${d.error || t.ownership_error?`<p class="pc-notice" role="alert">${E(d.error || t.ownership_error)}</p>`:''}${controls}<div class="pc-dashboard"><section class="pc-panel"><div class="pc-panel-head"><h3>Make your pick</h3></div><div class="pc-draft-picker">${picker}<p class="pc-muted">Salary per pick: $${E(Number(d.salary).toLocaleString())}</p></div><div class="pc-scroll pc-table"><table><thead><tr><th>Available player</th><th>Position</th><th>Availability</th></tr></thead><tbody>${d.players.map(p=>`<tr><td>${E(p.name)}</td><td>${E(p.position)}</td><td>${E(p.availability)}</td></tr>`).join('') || '<tr><td colspan="3">No players available.</td></tr>'}</tbody></table></div></section><section class="pc-panel"><div class="pc-panel-head"><h3>Pick history</h3></div><div class="pc-scroll pc-table"><table><thead><tr><th>Round / Pick</th><th>Original</th><th>Owner</th><th>Player</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No picks yet.</td></tr>'}</tbody></table></div></section></div>`;
  }
  function draftClockText(clock, remaining) {
    const format=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
    if(clock.on_break)return 'Paused'+(clock.seconds?' · '+format(Math.ceil(clock.remaining || 0)):'');
    if(!clock.seconds)return 'No clock';
    if(clock.paused)return 'Waiting';
    if(clock.expired || remaining<=0)return 'Time expired';
    return format(remaining);
  }
  function tickDraft() {
    if(!active || tab!=='draft' || !draftData)return;
    const clock=draftData.draft.clock;
    const remaining=clock.deadline?Math.max(0,Math.ceil((Date.parse(clock.deadline)-draftServerTime-(performance.now()-draftReceivedAt))/1000)):0;
    const stale=draftStale || performance.now()-draftReceivedAt>15000;
    const expired=clock.expired || (clock.deadline && remaining<=0);
    const display=root.querySelector('.pc-draft-clock');
    if(display){display.textContent=draftClockText(clock,remaining);display.classList.toggle('urgent',!clock.on_break && !!clock.deadline && remaining<=15);}
    const sync=root.querySelector('#pc-draft-sync');if(sync)sync.textContent=stale?'Live updates delayed. Picking is disabled until reconnected.':'Live updates connected';
    const pick=root.querySelector('[data-draft-pick]');
    if(pick)pick.disabled=busy || stale || !draftData.can_pick || !draftData.players.length || (!draftData.admin && !!expired);
    root.querySelectorAll('[data-draft-control]').forEach(button=>button.disabled=busy || stale);
  }
  function receiveDraft(d, initial=false) {
    const sameTurn=draftData?.draft.turn_key===d.draft.turn_key;
    const selection=sameTurn?root.querySelector('select[name="auction_id"]')?.value:'';
    const comparable=value=>JSON.stringify(value && {...value,server_time:''});
    const changed=initial || comparable(draftData)!==comparable(d);
    draftData=d;draftReceivedAt=performance.now();draftServerTime=Date.parse(d.server_time);draftStale=false;
    if(changed){if(initial)shell(draftView(d));else root.querySelector('#pc-content').innerHTML=draftView(d);const select=root.querySelector('select[name="auction_id"]');if(select && selection && d.players.some(p=>String(p.id)===selection))select.value=selection;}
    tickDraft();
  }
  async function refreshDraft() {
    if(!active || tab!=='draft' || !token || document.hidden || busy || draftPolling)return;
    const generation=viewGeneration, sessionToken=token;
    draftPolling=true;
    try {const d=await call('draft');if(active && !busy && tab==='draft' && generation===viewGeneration && token===sessionToken)receiveDraft(d);}
    catch(error){if(active && tab==='draft' && generation===viewGeneration){draftStale=true;if(!token){notice=error.message;signedOut();}else tickDraft();}}
    finally {draftPolling=false;}
  }
  setInterval(tickDraft,250);
  setInterval(refreshDraft,3000);
  document.addEventListener('visibilitychange',refreshDraft);
  window.addEventListener('focus',refreshDraft);
  const linePositions=['LW','C','RW','LD','RD','G'];
  function linesView(t) {
    linesTeam=t.team;

    const connection=league==='continental-virtual-hockey-league' ? `<details class="pc-card"><summary>Team Discord connection</summary><p>${t.server?.guild ? 'Connected to Discord. Lineups post to channel '+E(t.server.channel)+'.' : 'Connect Statbot to your team server to post lineups.'}</p><p>Invite Statbot to the team server, then generate a code here. A server manager runs /team-setup with that code and selects the lineup channel. Codes expire after 10 minutes. Generating a new code disconnects the previous connection.</p>${pairingCode?`<p class="pc-notice">Connection code: <code style="overflow-wrap:anywhere">${E(pairingCode)}</code></p>`:''}<form data-action="team-server">${hidden('team',t.team)}<button name="intent" value="connect">Generate connection code</button> <button name="intent" value="disconnect">Disconnect team server</button></form></details>` : '<p class="pc-muted">Discord team-server posting is currently supported by CVHL Statbot.</p>';
    const statuses={draft:'Draft',queued:'Queued for Discord — refresh for delivery status',posted:'Posted to Discord','needs-review':'Needs review — check availability or the Discord message before reposting'};
    return `<div class="pc-card"><h3>${E(t.team)} · Team Lines</h3><p>Choose six players marked Available for each game. Game codes come from the schedule.</p><button type="button" data-command="lines">Refresh status</button></div>${connection}${t.games.map(g=>{
      const line=g.line, slots=line?.slots || {}, eligible=g.eligible;
      const invalid=Object.values(slots).some(k=>k && !Object.hasOwn(eligible,k));
      return `<article class="pc-card"><h3>${E(g.time)} · ${E(g.away)} @ ${E(g.home)}</h3><p class="pc-muted">${E(g.date)} · ${E(g.timezone)} · Server: ${E(g.server || 'Not selected')}</p><span class="pc-pill">${E(statuses[line?.status] || 'Not set')}</span><p>Game code: <strong>${E(g.game_code || 'Not set in schedule')}</strong></p>${invalid?'<p class="pc-notice" role="alert">A selected player is no longer Available. Choose a replacement before posting.</p>':''}<form data-action="lines">${hidden('team',t.team)}${hidden('game',g.key)}${hidden('revision',line?.revision || 0)}<div class="pc-lines-grid">${linePositions.map(pos=>`<label><span class="pc-line-position" data-position="${pos}">${pos}</span><select name="${pos}" data-line-position aria-label="${pos}" required><option value="">Choose available player</option>${Object.entries(eligible).map(([key,name])=>`<option value="${E(key)}" ${slots[pos]===key?'selected':''}>${E(name)} · Available</option>`).join('')}</select></label>`).join('')}</div>${Object.keys(eligible).length<6?`<p class="pc-muted">${Object.keys(eligible).length} available players. Six are required to post.</p>`:''}<div class="pc-actions"><button name="intent" value="draft" formnovalidate ${line?.status==='queued'?'disabled':''}>Save Draft</button><button name="intent" value="post" ${!t.server?.guild || line?.status==='queued'?'disabled':''}>${line?.status==='posted'?'Update Discord Post':'Post to Team Discord'}</button>${line?.status==='needs-review'?'<button name="intent" value="replace">Post replacement message (may duplicate)</button>':''}</div>${line?`<p class="pc-muted">Saved by ${E(line.updated_by)} · ${E(new Date(line.updated_at*1000).toLocaleString())}</p>`:''}</form></article>`;
    }).join('') || '<p>No upcoming games.</p>'}`;
  }
  function constrainLines() {
    root.querySelectorAll('form[data-action="lines"]').forEach(form=>{
      const selects=[...form.querySelectorAll('[data-line-position]')];
      selects.forEach(select=>{const others=selects.filter(s=>s!==select).map(s=>s.value);[...select.options].forEach(option=>option.disabled=!!option.value && others.includes(option.value));});
    });
  }
  async function load(team='') {
    token = localStorage.getItem(storageKey) || '';
    const generation = ++viewGeneration;
    if (!token) { draftData=null;signedOut(); return; }
    try {
      message('Loading your player area…');
      if (!profile || tab==='profile') profile = await call('profile');
      if(tab==='draft'){const d=await call('draft');if(active && generation===viewGeneration)receiveDraft(d,true);return;}
      const content = tab==='lines' ? linesView(await call('lines?team='+encodeURIComponent(team || linesTeam))) : tab==='trade-reviews' ? tradeReviewView(await call('trade-reviews')) : tab==='trades' ? tradeView(await call('trades')) : tab==='team' ? teamView(await call('team'+(team?'?team='+encodeURIComponent(team):''))) : profileView(profile);
      if (active && generation===viewGeneration) { shell(content); if(tab==='lines')constrainLines(); if(tab==='profile' && profile.link) {renderResults(); loadResults(generation);} }
    } catch(error) {
      if (generation!==viewGeneration) return;
      if (!token) { notice=error.message; signedOut(); }
      else message(error.message,true);
    }
  }
  async function open() {
    const isProfile = location.hash.split('?')[0]==='#profile';
    if (!isProfile) {
      if (active) {
        active=false;page.classList.remove('active');
        const id=location.hash.slice(1) || 'home';
        if (['home','standings','players','goalies','teams','schedule','bracket','games'].includes(id) && typeof window.showPage==='function') {
          window.showPage(id,document.querySelector(`nav button[onclick*="'${id}'"]`));
        }
      }
      return;
    }
    active=true;
    if (typeof window.setMobileMenuOpen==='function') window.setMobileMenuOpen(false);
    document.querySelectorAll('main > .page').forEach(p=>p.classList.toggle('active',p===page));
    document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));
    page.classList.add('active');
    try { await exchange(); await load(); } catch(error) {notice=error.message;signedOut();}
  }
  const links = [...document.querySelectorAll('a.player-centre-nav, #player-signup-link')];
  links.forEach(link=>{link.href='#profile';link.addEventListener('click',event=>{event.preventDefault();if(location.hash==='#profile')open();else location.hash='profile';});});
  root.addEventListener('change',event=>{
    if(event.target.matches('[data-line-position]')){constrainLines();return;}
    if(event.target.matches('[data-trade-team]')) {root.querySelector('#pc-trade-receiver').innerHTML=tradeChoices(event.target.value,'receiver');return;}
    const kind=event.target.dataset.week;
    if(kind==='schedule') {scheduleWeek=event.target.value;shell(profileView(profile));renderResults();}
    if(kind==='results') {resultsWeek=event.target.value;renderResults();}
  });
  root.addEventListener('click',async event=>{
    const response=event.target.closest('[data-game]');
    if(response && !busy) {
      const game=profile.games.find(g=>g.key===response.dataset.game);
      if(!game)return;
      busy=true;
      root.querySelectorAll('[data-game]').forEach(b=>b.disabled=true);
      try {
        await call('action/availability',{game_key:game.key,status:response.dataset.status,note:game.response.note || ''});
        game.response.status=response.dataset.status;notice='Availability saved.';
        shell(profileView(profile));renderResults();
      } catch(error) {notice=error.message;await load();}
      finally {busy=false;root.querySelectorAll('[data-game]').forEach(b=>b.disabled=false);}
      return;
    }
    const command=event.target.closest('[data-command]')?.dataset.command;
    if (!command || busy) return;
    if (command==='login') {try {await signIn();} catch {message('Sign-in could not start. Please enable website storage and try again.',true);}return;}
    if (command==='logout') {++viewGeneration;draftData=null;try {await call('action/logout',{});} catch {} token='';profile=null;sessionStorage.removeItem(storageKey); localStorage.removeItem(storageKey);notice='';signedOut();return;}
    tab=command;notice='';await load();
  });
  root.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const form=event.target;
    if(form.hasAttribute('data-team-selector')) {pairingCode='';await load(new FormData(form).get('team'));return;}
    busy=true;
    form.querySelector('button').disabled=true;
    try {const values=new FormData(form);if(event.submitter?.name)values.set(event.submitter.name,event.submitter.value);const result=await call(['lines','team-server'].includes(form.dataset.action)?form.dataset.action:'action/'+form.dataset.action,values);if(form.dataset.action==='team-server')pairingCode=result.code || ''; notice=form.dataset.action==='lines'?(['post','replace'].includes(values.get('intent'))?'Lineup queued. Refresh status to confirm Discord delivery.':'Lineup draft saved.'):form.dataset.action==='team-server'?(result.code?'Connection code ready below.':'Team server disconnected.'):form.dataset.action==='trade-review'?'Trade decision recorded. Check the trade status below for roster completion.':form.dataset.action==='draft-pick'?'Pick submitted. Check its roster status in pick history.':form.dataset.action==='draft-pause'?'Draft status updated.':form.dataset.action==='draft-restart'?'Pick clock restarted.':result.duplicate?'This offer already exists. Check its status below.':form.dataset.action==='trade-propose'?'Trade offer sent.':'Saved.';await load();}
    catch(error) {notice=error.message;await load();}
    finally {busy=false;if(form.isConnected)form.querySelector('button').disabled=false;tickDraft();}
  });
  window.addEventListener('storage',event=>{
    if(event.key!==storageKey && event.key!==null)return;
    token=localStorage.getItem(storageKey) || '';profile=null;
    if(active)load();
  });
  window.addEventListener('hashchange',open);
  open();
})();
