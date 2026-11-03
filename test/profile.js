/* Database test profile: verified account identity, isolated roster and stats. */
(() => {
  'use strict';
  const league = 'continental-virtual-hockey-league';
  const service = 'https://admin.chelleagues.com';
  const key = 'chelleagues-session';
  const verifierKey = 'cvhl-test-profile-verifier';
  const panel = document.getElementById('test-profile-content');
  const nav = document.querySelector('#main-nav [data-page="profile"]');
  if (!panel || !nav) return;
  const escape = value => String(value ?? '').replace(/[&<>"']/g,
    ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let generation = 0;
  let loading = false;
  const pageActive = () => location.hash.split('?')[0] === '#profile';
  const info = message => { panel.innerHTML = '<div class="tp-hero"><p class="tp-muted">'+escape(message)+'</p></div>'; };
  const niceTime = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' :
      new Intl.DateTimeFormat('en-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'America/New_York'}).format(date)+' ET';
  };
  async function login() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const base64 = data => btoa(String.fromCharCode(...data)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const verifier = base64(bytes);
    sessionStorage.setItem(verifierKey, verifier);
    const challenge = base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    const site = location.origin + location.pathname.replace(/\/?$/,'/');
    location.assign(service+'/website/auth/'+league+'?challenge='+challenge+'&site='+encodeURIComponent(site));
  }
  async function exchange() {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    if (!params.has('code')) return;
    const code = params.get('code');
    history.replaceState(null,'','#profile');
    const verifier = sessionStorage.getItem(verifierKey);
    sessionStorage.removeItem(verifierKey);
    if (!verifier) throw new Error('Sign-in expired. Please start again.');
    const response = await fetch(service+'/api/website/'+league+'/session',{
      method:'POST',credentials:'omit',cache:'no-store',body:new URLSearchParams({code,verifier})
    });
    const data = await response.json();
    if (!response.ok || !data.token) throw new Error(data.error || 'Sign-in could not finish.');
    localStorage.setItem(key,data.token);
  }
  function signedOut(message='') {
    panel.innerHTML = '<div class="tp-hero"><p class="tp-kicker">Database test league</p><h2>Your player area</h2><p class="tp-muted">Sign in with Discord to see your verified player, test roster, stats, and upcoming games.</p>'+
      (message ? '<p class="tp-muted" role="alert">'+escape(message)+'</p>' : '')+
      '<div class="tp-actions"><button class="tp-button" type="button" data-profile-login>Sign in with Discord</button></div></div>';
  }
  let currentProfile;
  const availabilityLabels={none:'No response',available:'Available',unavailable:'Unavailable'};
  function weekGames(data, weekNumber) {
    const games=(data.schedule_games || data.upcoming_games || []).filter(game=>Number(game.week_number)===Number(weekNumber));
    if(!games.length) return '<p class="tp-muted">No games for your team this week.</p>';
    return '<ul class="tp-games">'+games.map(game=>{
      const status=(data.availability || {})[game.id] || 'none';
      const open=game.status==='scheduled' && new Date(game.starts_at).getTime()>Date.now();
      return '<li><span>'+escape(niceTime(game.starts_at))+'<br><strong>'+
        escape((game.home_team_id===data.player.team_id ? 'vs ' : '@ ')+game.opponent_name)+
        '</strong></span><div class="tp-response" data-availability-game="'+escape(game.id)+'" data-saved-status="'+escape(status)+'"><span>Availability</span>'+
        '<span data-response-label class="availability-'+escape(status)+'">'+escape(availabilityLabels[status])+'</span>'+
        '<div class="tp-quick-response" role="group" aria-label="Availability for '+escape(game.opponent_name)+'">'+
        [['available','Available'],['unavailable','Unavailable']].map(([value,label])=>
          '<button type="button" data-quick-game="'+escape(game.id)+'" data-quick-status="'+value+'" class="'+value+'" title="Click again to clear your response" aria-pressed="'+(status===value)+'"'+(open?'':' disabled')+'>'+label+'</button>').join('')+
        '</div></div></li>';
    }).join('')+'</ul>';
  }
  function selectedWeek(data) {
    const weeks=data.schedule_weeks || [];
    const next=(data.schedule_games || data.upcoming_games || [])
      .filter(game=>game.status==='scheduled' && new Date(game.starts_at).getTime()>Date.now())
      .sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))[0];
    return next?.week_number || weeks.at(-1)?.number || 1;
  }
  function results(data) {
    const games=data.recent_results || [];
    if(!games.length) return '<p class="tp-muted">No completed team games in the test database yet.</p>';
    return '<ul class="tp-games tp-results">'+games.map(game=>{
      const home=game.home_team_id===data.player.team_id;
      const ours=home?game.home_score:game.away_score;
      const theirs=home?game.away_score:game.home_score;
      return '<li><span>'+escape(niceTime(game.starts_at))+'<br><strong>'+
        escape((home?'vs ':'@ ')+game.opponent_name)+'</strong></span><strong>'+
        escape(ours)+' – '+escape(theirs)+(game.overtime?' · OT':'')+'</strong></li>';
    }).join('')+'</ul>';
  }
  function paintResponse(row,status) {
    const label=row.querySelector('[data-response-label]');
    label.className='availability-'+status;
    label.textContent=availabilityLabels[status];
    row.querySelectorAll('[data-quick-status]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.quickStatus===status));
    });
  }
  function statMetrics(data, regular, isGoalie) {
    const p=data.player;
    return isGoalie ? [['GP',regular.games_played],['Wins',regular.wins],['Saves',regular.saves],
      ['Save %',regular.save_pct],['GAA',regular.gaa],['Shots against',regular.shots_against]]
      : [['GP',regular?.games_played ?? p?.gp ?? 0],['Goals',regular?.goals ?? p?.goals ?? 0],
        ['Assists',regular?.assists ?? p?.assists ?? 0],['Points',regular?.points ?? p?.points ?? 0],
        ['Points / GP',regular?.points_per_game],['Shots',regular?.shots ?? p?.shots ?? 0],
        ['Shot %',regular?.shot_pct]];
  }
  let activeProfileTab='player';
  let managerTeamId='';
  let managerWeek='';
  let managerCollapsed=false;
  const roleLabel={team_manager:'Team manager',league_admin:'League admin',owner:'Owner',gm:'GM',agm:'AGM'};
  function managerWeeks(data,team) {
    const numbers=[...new Set(team.games.map(game=>Number(game.week_number)).filter(Boolean))].sort((a,b)=>a-b);
    return numbers.map(number=>data.schedule_weeks?.find(item=>item.number===number) || {number});
  }
  function managerGames(team,week) {
    const games=team.games.filter(game=>Number(game.week_number)===Number(week));
    if(!games.length) return '<p class="tp-muted">No upcoming games for this team this week.</p>';
    return games.map(game=>{
      const counts={available:0,unavailable:0,none:0};
      game.players.forEach(player=>{counts[player.status]=(counts[player.status] || 0)+1;});
      return '<details class="tp-manager-game"><summary>'+escape(niceTime(game.starts_at))+' · '+
        escape((game.home?'vs ':'@ ')+game.opponent_name)+
        '<span class="tp-manager-counts"><b class="available">'+counts.available+' available</b><b class="unavailable">'+counts.unavailable+
        ' unavailable</b><b>'+counts.none+' no response</b></span></summary>'+
        '<div class="tp-manager-roster">'+game.players.map(player=>
          '<div><span>'+escape(player.name)+' <small>'+escape(player.section)+(player.position?' · '+escape(player.position):'')+
          '</small></span><strong class="availability-'+escape(player.status)+'">'+
          escape(({available:'Available',unavailable:'Unavailable',none:'No response'})[player.status] || 'No response')+
          '</strong></div>').join('')+'</div></details>';
    }).join('');
  }
  function managerControls(data,team) {
    const weeks=managerWeeks(data,team);
    if(!weeks.some(item=>String(item.number)===String(managerWeek))) managerWeek=String(weeks[0]?.number || '');
    const weekSelect=weeks.length ? '<label>Week <select data-management-week aria-label="Management week">'+
      weeks.map(item=>'<option value="'+item.number+'"'+(String(item.number)===managerWeek?' selected':'')+'>Week '+item.number+
        (item.start?' · '+escape(item.start)+' to '+escape(item.end):'')+'</option>').join('')+
      '</select></label>' : '';
    return '<div class="tp-manager-toolbar">'+weekSelect+
      '<button type="button" class="tp-button secondary" data-management-toggle aria-expanded="'+(!managerCollapsed)+'">'+
      (managerCollapsed?'Show games':'Minimize games')+'</button></div>'+
      '<div data-management-games'+(managerCollapsed?' hidden':'')+'>'+
      (weeks.length?managerGames(team,managerWeek):'<p class="tp-muted">No upcoming games for this team.</p>')+'</div>';
  }
  function management(data) {
    const teams=data.management?.teams || [];
    if(!teams.length) return '';
    if(!teams.some(team=>String(team.id)===managerTeamId)) managerTeamId=String(teams[0].id);
    const selected=teams.find(team=>String(team.id)===managerTeamId);
    return '<section class="tp-card tp-management"><h3>Team management</h3><p class="tp-muted">Private availability for your assigned team. Responses update when you refresh this profile.</p>'+
      (teams.length>1 ? '<label class="tp-manager-picker">Team <select data-management-team aria-label="Management team">'+
        teams.map(team=>'<option value="'+escape(team.id)+'"'+(String(team.id)===managerTeamId?' selected':'')+'>'+escape(team.name)+'</option>').join('')+
        '</select></label>' : '')+
      '<div class="tp-manager-team"><h4>'+escape(selected.name)+' · '+escape(roleLabel[selected.role] || selected.role)+'</h4>'+
      '<div data-management-content>'+managerControls(data,selected)+'</div></div></section>';
  }

  let shortlistTeam='';
  let shortlistBusy=false;
  let shortlistTimer=null;
  let shortlistGeneration=0;
  const draftDays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  function draftPlayers(list) {
    const shared=list.shortlist;
    const canScout=Boolean(shared?.available && shared?.teams?.length);
    if(canScout)shortlistTeam=String(shared.team_id);
    return '<section class="tp-card"><h3>Draft Eligible Players</h3><p class="tp-muted">Approved players available for the draft.</p>'+
      (canScout?'<div class="tp-shortlist-toolbar"><label>Team shortlist<select data-shortlist-team aria-label="Team shortlist">'+shared.teams.map(t=>'<option value="'+escape(t.id)+'"'+(String(t.id)===shortlistTeam?' selected':'')+'>'+escape(t.name)+'</option>').join('')+'</select></label><p class="tp-muted">Private to your team’s managers. Changes sync every 15 seconds.</p></div><p class="tp-muted" data-shortlist-status role="status">Team shortlist ready.</p>':'')+
      '<div class="tp-draft-filters"><label>Search<input type="search" data-draft-filter="search" placeholder="Player or gaming ID"></label>'+
      '<label>Position<select data-draft-filter="position"><option value="">Any position</option>'+['LW','C','RW','LD','RD','G'].map(p=>'<option>'+p+'</option>').join('')+'</select></label>'+
      '<label>Available day<select data-draft-filter="day"><option value="">Any day</option>'+list.game_days.map(day=>'<option value="'+day+'">'+draftDays[day]+'</option>').join('')+'</select></label></div>'+
      '<p class="tp-muted" data-draft-count role="status">'+list.players.length+' players shown</p>'+
      '<div class="tp-draft-scroll"><table class="tp-draft-table"><thead><tr>'+['Player','PSN / Xbox ID','Primary position','Secondary position','Availability',...(canScout?['Team shortlist']:[])].map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+
      list.players.map(p=>'<tr data-draft-player="'+escape(p.id)+'"><td><strong>'+escape(p.name)+'</strong></td><td>'+escape(p.gaming_id?((p.console==='psn'?'PSN: ':p.console==='xbox'?'Xbox: ':'')+p.gaming_id):'Not linked yet')+'</td><td>'+escape(p.primary)+'</td><td>'+escape(p.secondary || '—')+'</td><td>'+
        escape(list.game_days.length===p.days.length&&list.game_days.every(d=>p.days.includes(d))?'All game days':p.days.map(d=>draftDays[d]).join(', '))+'</td>'+(canScout?shortlistCell(p):'')+'</tr>').join('')+
      '</tbody></table></div><p class="tp-muted" data-draft-empty'+(list.players.length?' hidden':'')+'>No draft eligible players match.</p></section>';
  }

  const priorityLabels={0:'Not highlighted',1:'Top Pick',2:'Interested',3:'Backup'};
  function shortlistCell(player) {
    return '<td class="tp-shortlist-cell"><label class="tp-shortlist-check"><input type="checkbox" data-shortlist-highlight aria-label="Highlight '+escape(player.name)+'"> Highlight</label>'+
      '<label>Priority<select data-shortlist-priority aria-label="Draft priority for '+escape(player.name)+'">'+Object.entries(priorityLabels).map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join('')+'</select></label>'+
      '<small data-shortlist-actor></small><details><summary>Shared team notes</summary>'+
      '<textarea data-shortlist-note maxlength="2000" rows="3" aria-label="Team notes for '+escape(player.name)+'"></textarea>'+
      '<button class="tp-button secondary" type="button" data-shortlist-save>Save notes</button>'+
      '<button class="tp-button secondary" type="button" data-shortlist-reload hidden>Reload changes</button></details>'+
      '<p class="tp-muted" data-shortlist-row-status role="status"></p></td>';
  }
  function paintShortlist() {
    const entries=currentProfile?.draft_players?.shortlist?.entries || [];
    panel.querySelectorAll('[data-draft-player]').forEach(row=>{
      const cell=row.querySelector('.tp-shortlist-cell');
      if(!cell || row.dataset.shortlistDirty==='1' || row.dataset.shortlistSaving==='1')return;
      const entry=entries.find(e=>String(e.player_id)===row.dataset.draftPlayer) || {};
      const priority=Number(entry.priority || 0);
      row.dataset.revision=String(entry.revision || 0);
      row.classList.toggle('is-shortlisted',priority>0);
      cell.querySelector('[data-shortlist-highlight]').checked=priority>0;
      cell.querySelector('[data-shortlist-priority]').value=String(priority>3?2:priority);
      cell.querySelector('[data-shortlist-note]').value=entry.note || '';
      cell.querySelector('[data-shortlist-actor]').textContent=(priority?'Highlighted by '+(entry.highlighted_by || 'Team manager')+'. ':'')+
        (entry.updated_by?'Updated by '+entry.updated_by+(entry.updated_at?' · '+niceTime(entry.updated_at):''):'');
      cell.querySelector('[data-shortlist-reload]').hidden=true;
    });
  }
  async function refreshShortlist(force=false) {
    if(shortlistBusy || !pageActive() || (!force && (activeProfileTab!=='draft' || document.hidden)))return;
    const token=localStorage.getItem(key);
    if(!token || !currentProfile?.draft_players?.shortlist?.teams?.length)return;
    const generation=shortlistGeneration, team=shortlistTeam;
    shortlistBusy=true;
    try {
      const response=await fetch(service+'/api/website/'+league+'/test-profile/shortlist?team='+encodeURIComponent(team),{
        headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)});
      const data=await response.json();
      if(generation!==shortlistGeneration)return;
      if(!response.ok)throw new Error(data.error || 'Could not sync team shortlist.');
      if(!data.enabled){await load();return;}
      currentProfile.draft_players.shortlist=data.shortlist;
      const target=panel.querySelector('[data-profile-panel="draft"]');
      if(!data.shortlist?.teams?.length || String(data.shortlist.team_id)!==team){
        currentProfile.draft_players=data;
        if(target)target.innerHTML=draftPlayers(data);
      } else {
        const oldIds=currentProfile.draft_players.players.map(p=>p.id).join(',');
        const newIds=data.players.map(p=>p.id).join(',');
        if(oldIds!==newIds && !panel.querySelector('[data-shortlist-dirty="1"]')){
          const filters={};
          panel.querySelectorAll('[data-draft-filter]').forEach(input=>filters[input.dataset.draftFilter]=input.value);
          currentProfile.draft_players=data;
          if(target)target.innerHTML=draftPlayers(data);
          panel.querySelectorAll('[data-draft-filter]').forEach(input=>input.value=filters[input.dataset.draftFilter] || '');
          filterDraftPlayers();
        }
      }
      paintShortlist();
      const message=panel.querySelector('[data-shortlist-status]');
      if(message)message.textContent='Team shortlist synced. '+(panel.querySelector('[data-shortlist-dirty="1"]')?'Your unsaved notes are kept.':'');
      return true;
    } catch(error) {
      const message=panel.querySelector('[data-shortlist-status]');
      if(message)message.textContent=error.message || 'Sync failed. Retrying automatically.';
      return false;
    } finally { shortlistBusy=false; }
  }
  async function saveShortlist(row) {
    if(shortlistBusy){
      if(row.dataset.shortlistSaving==='1')return;
      row.querySelector('[data-shortlist-row-status]').textContent='Waiting for sync, then saving…';
      if(!row.dataset.shortlistQueued){
        row.dataset.shortlistQueued='1';
        setTimeout(()=>{
          delete row.dataset.shortlistQueued;
          if(row.isConnected && row.dataset.shortlistDirty==='1')saveShortlist(row);
        },300);
      }
      return;
    }
    const message=row.querySelector('[data-shortlist-row-status]');
    const generation=shortlistGeneration;
    shortlistBusy=true;
    row.dataset.shortlistSaving='1';
    row.querySelectorAll('input,select,textarea,button').forEach(input=>input.disabled=true);
    message.textContent='Saving for your team…';
    try {
      const response=await fetch(service+'/api/website/'+league+'/test-profile/shortlist',{
        method:'POST',headers:{Authorization:'Bearer '+localStorage.getItem(key)},credentials:'omit',cache:'no-store',
        signal:AbortSignal.timeout(12000),
        body:new URLSearchParams({team_id:shortlistTeam,player_id:row.dataset.draftPlayer,
          priority:row.querySelector('[data-shortlist-priority]').value,
          note:row.querySelector('[data-shortlist-note]').value,revision:row.dataset.revision || '0'})});
      const data=await response.json();
      if(generation!==shortlistGeneration)return;
      if(!response.ok){
        if(response.status===409)row.querySelector('[data-shortlist-reload]').hidden=false;
        throw new Error(data.error || 'Could not save team shortlist.');
      }
      currentProfile.draft_players.shortlist=data.shortlist;
      delete row.dataset.shortlistDirty;
      message.textContent='Saved for all team managers.';
    } catch(error) {
      row.querySelector('[data-shortlist-reload]').hidden=false;
      message.textContent=error.message || 'Save failed. Your edits are kept; reload changes before retrying.';
    }
    finally {
      delete row.dataset.shortlistSaving;
      row.querySelectorAll('input,select,textarea,button').forEach(input=>input.disabled=false);
      shortlistBusy=false;
      if(row.dataset.shortlistDirty!=='1')paintShortlist();
    }
  }

  function filterDraftPlayers() {
    const value=kind=>panel.querySelector('[data-draft-filter="'+kind+'"]')?.value || '';
    const search=value('search').trim().toLowerCase(), position=value('position'), day=value('day');
    let count=0;
    panel.querySelectorAll('[data-draft-player]').forEach(row=>{
      const player=currentProfile.draft_players.players.find(p=>String(p.id)===row.dataset.draftPlayer);
      const show=(!search||(player.name+' '+(player.gaming_id || '')).toLowerCase().includes(search))&&
        (!position||[player.primary,player.secondary].includes(position))&&(!day||player.days.includes(Number(day)));
      row.hidden=!show;if(show)count++;
    });
    panel.querySelector('[data-draft-count]').textContent=count+' players shown';
    panel.querySelector('[data-draft-empty]').hidden=count>0;
  }

  function render(data) {
    currentProfile=data;
    shortlistGeneration++;
    if(shortlistTimer)clearInterval(shortlistTimer);
    shortlistTimer=null;
    const p=data.player, team=data.team, stats=data.stats || []; const prefs=data.preferences || {};
    const weeks=data.schedule_weeks || [];
    const week=selectedWeek(data);
    const heading=p ? p.name : data.account_name;
    const hasManagement=Boolean(data.management?.teams?.length);
    const hasDraftPlayers=Boolean(data.draft_players?.enabled);
    if((activeProfileTab==='management'&&!hasManagement)||(activeProfileTab==='draft'&&!hasDraftPlayers))activeProfileTab='player';
    let note='';
    if(data.status==='unlinked') note='Your Discord account has no verified CVHL player claim yet.';
    if(data.status==='missing') note='Your verified CVHL player, '+data.linked_name+', is not on the current test roster yet.';
    if(data.status==='ambiguous') note='More than one test player matches '+data.linked_name+'. Ask a league admin to resolve it.';
    const regular=stats.find(s=>s.phase==='regular' && s.kind==='skater') || stats.find(s=>s.phase==='regular' && s.kind==='goalie');
    const isGoalie=regular?.kind==='goalie';
    const metrics=statMetrics(data,regular,isGoalie);
    panel.innerHTML='<div class="tp-hero"><p class="tp-kicker">CVHL database test · '+escape(data.season?.name || 'League')+'</p><h2>'+escape(heading)+'</h2>'+
      '<p class="tp-muted">'+(p ? (data.status==='training_camp' ? 'Training Camp (TC) with '+escape(team?.name || 'your team')+'. Your TC placement comes from the test database.' : 'Your roster and game totals below come from the test database.') : escape(note))+'</p>'+
      '<div class="tp-actions"><button class="tp-button secondary" type="button" data-profile-refresh>Refresh</button><a class="tp-button secondary" href="draft.html">Team Draft Board</a><button class="tp-button secondary" type="button" data-profile-logout>Sign out</button></div></div>'+
      (hasManagement||hasDraftPlayers?'<div class="tp-profile-tabs" role="tablist" aria-label="Profile sections">'+
        '<button type="button" role="tab" data-profile-tab="player" aria-selected="'+(activeProfileTab==='player')+'">My Profile</button>'+
        (hasManagement?'<button type="button" role="tab" data-profile-tab="management" aria-selected="'+(activeProfileTab==='management')+'">Team Management</button>':'')+
        (hasDraftPlayers?'<button type="button" role="tab" data-profile-tab="draft" aria-selected="'+(activeProfileTab==='draft')+'">Draft Eligible Players</button>':'')+'</div>':'')+
      '<div data-profile-panel="player"'+(activeProfileTab==='player'?'':' hidden')+'>'+
      (p ? '<div class="tp-grid"><section class="tp-card"><h3>'+(data.status==='training_camp'?'Training Camp (TC)':'Roster')+'</h3><dl><div><dt>Team</dt><dd>'+escape(team?.name || 'Unassigned')+'</dd></div><div><dt>Position</dt><dd>'+escape(p.position || 'Not listed')+'</dd></div><div><dt>Salary</dt><dd>'+escape(p.salary == null ? 'Not listed' : '$'+Number(p.salary).toLocaleString('en-US'))+'</dd></div><div><dt>Account</dt><dd>'+escape(data.account_name)+'</dd></div></dl></section>'+
      '<section class="tp-card"><h3>Regular season</h3><div class="tp-stat-grid">'+metrics.map(([label,value])=>'<div class="tp-stat"><strong>'+escape(value ?? '—')+'</strong><span>'+escape(label)+'</span></div>').join('')+'</div></section>'+
      '<section class="tp-card"><h3>Player settings</h3><form data-test-preferences><label>Platform<select name="platform"><option value="">Select platform</option>'+['Xbox','PlayStation'].map(value=>'<option value="'+value+'"'+(prefs.platform===value?' selected':'')+'>'+value+'</option>').join('')+'</select></label><label>Preferred positions<input name="positions" maxlength="80" placeholder="C, RW" value="'+escape(prefs.positions || '')+'"></label><label>Stream URL<input name="stream_url" type="url" maxlength="300" placeholder="https://twitch.tv/yourchannel" value="'+escape(prefs.stream_url || '')+'"></label><button class="tp-button" type="submit">Save settings</button><p class="tp-muted" role="status" data-test-message></p></form></section>'+
      '<section class="tp-card"><div class="tp-availability-header"><h3>Upcoming games & availability</h3>'+
      (weeks.length ? '<label class="tp-week-picker">Week <select data-week-select aria-label="Choose schedule week">'+
        weeks.map(item=>'<option value="'+item.number+'"'+(item.number===week?' selected':'')+'>Week '+item.number+
          ' · '+escape(item.start)+' to '+escape(item.end)+'</option>').join('')+'</select></label>' : '')+
      '</div><div data-week-games>'+(weeks.length ? weekGames(data,week) : '<p class="tp-muted">No games on the test schedule.</p>')+
      '</div><p class="tp-muted" role="status" data-availability-message></p></section>'+
      '<section class="tp-card"><h3>Recent team results</h3>'+results(data)+'</section>'+
      '<section class="tp-card"><h3>Test profile</h3><p class="tp-muted">This page reads the separate database league. Your live CVHL profile and availability settings remain as they are.</p></section></div>' :
      '<div class="tp-grid"><section class="tp-card"><h3>Player connection</h3><p class="tp-muted">'+escape(note)+'</p></section></div>')+
      '</div>'+(hasManagement?'<div data-profile-panel="management"'+(activeProfileTab==='management'?'':' hidden')+'>'+management(data)+'</div>':'')+
      (hasDraftPlayers?'<div data-profile-panel="draft"'+(activeProfileTab==='draft'?'':' hidden')+'>'+draftPlayers(data.draft_players)+'</div>':'');
    paintShortlist();
    if(data.draft_players?.enabled && data.draft_players?.shortlist?.teams?.length)
      shortlistTimer=setInterval(()=>refreshShortlist(),15000);
  }
  async function load() {
    if (!pageActive() || loading) return;
    const current=++generation;
    loading=true;
    try {
      await exchange();
      const token=localStorage.getItem(key);
      if (!token) { signedOut(); return; }
      info('Loading your test profile…');
      const response=await fetch(service+'/api/website/'+league+'/test-profile',{
        headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store'
      });
      const data=await response.json();
      if(current!==generation || !pageActive()) return;
      if(response.status===401){localStorage.removeItem(key);signedOut('Session expired. Please sign in again.');return;}
      if(!response.ok)throw new Error(data.error || 'Could not load your test profile.');
      render(data);
    } catch(error) { if(current===generation) info(error.message || 'Could not load your test profile.'); }
    finally { loading=false; }
  }
  async function save(action, values, message) {
    const token=localStorage.getItem(key);
    if (!token) throw new Error('Please sign in again.');
    const response=await fetch(service+'/api/website/'+league+'/test-profile/'+action,{
      method:'POST',headers:{Authorization:'Bearer '+token},
      credentials:'omit',cache:'no-store',body:new URLSearchParams(values)
    });
    const data=await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not save. Please retry.');
    if (message) message.textContent='Saved to the test league.';
  }
  panel.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-test-preferences]');
    if (!form) return;
    event.preventDefault();
    const button=form.querySelector('button[type="submit"]');
    const message=form.querySelector('[data-test-message]');
    button.disabled=true;
    message.textContent='Saving…';
    try { await save('preferences',Object.fromEntries(new FormData(form)),message); }
    catch(error) { message.textContent=error.message || 'Could not save.'; }
    finally { button.disabled=false; }
  });
  panel.addEventListener('input',event=>{
    if(event.target.closest('[data-draft-filter]'))filterDraftPlayers();
    if(event.target.closest('[data-shortlist-note]'))event.target.closest('[data-draft-player]').dataset.shortlistDirty='1';
  });
  panel.addEventListener('change',async event=>{
    const teamSelect=event.target.closest('[data-shortlist-team]');
    if(teamSelect){
      if(shortlistBusy || panel.querySelector('[data-shortlist-dirty="1"]')){
        teamSelect.value=shortlistTeam;
        panel.querySelector('[data-shortlist-status]').textContent=shortlistBusy?'Sync in progress. Please select the team again in a moment.':'Save your notes before switching teams.';
        return;
      }
      const previous=shortlistTeam;
      shortlistTeam=teamSelect.value;
      const controls=panel.querySelectorAll('.tp-shortlist-cell input,.tp-shortlist-cell select,.tp-shortlist-cell textarea,.tp-shortlist-cell button');
      controls.forEach(input=>input.disabled=true);
      teamSelect.disabled=true;
      panel.querySelector('[data-shortlist-status]').textContent='Loading team shortlist…';
      try {
        if(!await refreshShortlist(true)){
          shortlistTeam=previous;
          teamSelect.value=previous;
        }
      } finally {
        controls.forEach(input=>input.disabled=false);
        teamSelect.disabled=false;
      }
      return;
    }
    const scoutControl=event.target.closest('[data-shortlist-highlight],[data-shortlist-priority]');
    if(scoutControl){
      const row=scoutControl.closest('[data-draft-player]');
      row.dataset.shortlistDirty='1';
      const priority=row.querySelector('[data-shortlist-priority]');
      if(scoutControl.matches('[data-shortlist-highlight]'))priority.value=scoutControl.checked?(Number(priority.value)>0?priority.value:'2'):'0';
      await saveShortlist(row);return;
    }
    if(event.target.closest('[data-draft-filter]')){filterDraftPlayers();return;}
    const managerSelect=event.target.closest('[data-management-team]');
    if(managerSelect){
      managerTeamId=managerSelect.value;
      managerWeek='';
      const team=currentProfile.management.teams.find(item=>String(item.id)===managerTeamId);
      const section=panel.querySelector('.tp-manager-team');
      section.querySelector('h4').textContent=team.name+' · '+(roleLabel[team.role] || team.role);
      section.querySelector('[data-management-content]').innerHTML=managerControls(currentProfile,team);
      return;
    }
    const managerWeekSelect=event.target.closest('[data-management-week]');
    if(managerWeekSelect){
      managerWeek=managerWeekSelect.value;
      const team=currentProfile.management.teams.find(item=>String(item.id)===managerTeamId);
      panel.querySelector('[data-management-games]').innerHTML=managerGames(team,managerWeek);
      return;
    }
    const weekSelect=event.target.closest('[data-week-select]');
    if (weekSelect) {
      panel.querySelector('[data-week-games]').innerHTML=weekGames(currentProfile,weekSelect.value);
      panel.querySelector('[data-availability-message]').textContent='';
      return;
    }

  });
  panel.addEventListener('click',async event=>{
    const shortlistSave=event.target.closest('[data-shortlist-save]');
    if(shortlistSave){await saveShortlist(shortlistSave.closest('[data-draft-player]'));return;}
    const shortlistReload=event.target.closest('[data-shortlist-reload]');
    if(shortlistReload){
      const row=shortlistReload.closest('[data-draft-player]');
      delete row.dataset.shortlistDirty;
      await refreshShortlist(true);return;
    }
    const profileTab=event.target.closest('[data-profile-tab]');
    if(profileTab){
      activeProfileTab=profileTab.dataset.profileTab;
      panel.querySelectorAll('[data-profile-tab]').forEach(button=>
        button.setAttribute('aria-selected',String(button.dataset.profileTab===activeProfileTab)));
      panel.querySelectorAll('[data-profile-panel]').forEach(section=>
        section.hidden=section.dataset.profilePanel!==activeProfileTab);
      if(activeProfileTab==='draft')await refreshShortlist(true);
      return;
    }
    const managerToggle=event.target.closest('[data-management-toggle]');
    if(managerToggle){
      managerCollapsed=!managerCollapsed;
      panel.querySelector('[data-management-games]').hidden=managerCollapsed;
      managerToggle.textContent=managerCollapsed?'Show games':'Minimize games';
      managerToggle.setAttribute('aria-expanded',String(!managerCollapsed));
      return;
    }
    const quick=event.target.closest('[data-quick-game]');
    if(quick){
      if(quick.disabled)return;
      const row=quick.closest('[data-availability-game]');
      const previous=row.dataset.savedStatus || 'none';
      const choice=previous===quick.dataset.quickStatus?'none':quick.dataset.quickStatus;
      const message=panel.querySelector('[data-availability-message]');
      const buttons=row.querySelectorAll('[data-quick-status]');
      buttons.forEach(button=>button.disabled=true);
      paintResponse(row,choice);
      message.textContent='Saving availability…';
      try {
        await save('availability',{game_id:row.dataset.availabilityGame,status:choice},message);
        currentProfile.availability[row.dataset.availabilityGame]=choice;
        row.dataset.savedStatus=choice;
      } catch(error) {
        paintResponse(row,previous);
        message.textContent=error.message || 'Could not save.';
      } finally { buttons.forEach(button=>button.disabled=false); }
      return;
    }

    if(event.target.closest('[data-profile-login]'))await login();
    if(event.target.closest('[data-profile-refresh]'))await load();
    if(event.target.closest('[data-profile-logout]')){
      const token=localStorage.getItem(key);
      if(token)await fetch(service+'/api/website/'+league+'/action/logout',{
        method:'POST',headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store'
      }).catch(()=>{});
      if(shortlistTimer)clearInterval(shortlistTimer);
      shortlistGeneration++;
      localStorage.removeItem(key);signedOut();
    }
  });
  nav.addEventListener('click',()=>{load();});
  window.addEventListener('hashchange',load);
  if(pageActive()){
    document.querySelectorAll('main > .page').forEach(p=>p.classList.toggle('active',p.id==='page-profile'));
    nav.classList.add('active');
    load();
  }
})();
