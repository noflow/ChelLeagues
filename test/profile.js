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
  function render(data) {
    const p=data.player, team=data.team, stats=data.stats || [], games=data.upcoming_games || [];
    const heading=p ? p.name : data.account_name;
    let note='';
    if(data.status==='unlinked') note='Your Discord account has no verified CVHL player claim yet.';
    if(data.status==='missing') note='Your verified CVHL player, '+data.linked_name+', is not on the current test roster yet.';
    if(data.status==='ambiguous') note='More than one test player matches '+data.linked_name+'. Ask a league admin to resolve it.';
    const regular=stats.find(s=>s.phase==='regular' && s.kind==='skater') || stats.find(s=>s.phase==='regular' && s.kind==='goalie');
    const isGoalie=regular?.kind==='goalie';
    const metrics=isGoalie ? [['GP',regular.games_played],['Wins',regular.wins],['Saves',regular.saves],['Save %',regular.save_pct]]
      : [['GP',regular?.games_played ?? 0],['Goals',regular?.goals ?? 0],['Assists',regular?.assists ?? 0],['Points',regular?.points ?? 0]];
    panel.innerHTML='<div class="tp-hero"><p class="tp-kicker">CVHL database test · '+escape(data.season?.name || 'League')+'</p><h2>'+escape(heading)+'</h2>'+
      '<p class="tp-muted">'+(p ? 'Your roster and game totals below come from the test database.' : escape(note))+'</p>'+
      '<div class="tp-actions"><button class="tp-button secondary" type="button" data-profile-refresh>Refresh</button><button class="tp-button secondary" type="button" data-profile-logout>Sign out</button></div></div>'+
      (p ? '<div class="tp-grid"><section class="tp-card"><h3>Roster</h3><dl><div><dt>Team</dt><dd>'+escape(team?.name || 'Unassigned')+'</dd></div><div><dt>Position</dt><dd>'+escape(p.position || 'Not listed')+'</dd></div><div><dt>Salary</dt><dd>'+escape(p.salary == null ? 'Not listed' : '$'+Number(p.salary).toLocaleString('en-US'))+'</dd></div><div><dt>Account</dt><dd>'+escape(data.account_name)+'</dd></div></dl></section>'+
      '<section class="tp-card"><h3>Regular season</h3><div class="tp-stat-grid">'+metrics.map(([label,value])=>'<div class="tp-stat"><strong>'+escape(value)+'</strong><span>'+escape(label)+'</span></div>').join('')+'</div></section>'+
      '<section class="tp-card"><h3>Upcoming games</h3>'+(games.length ? '<ul class="tp-games">'+games.slice(0,6).map(game=>'<li><span>'+escape(niceTime(game.starts_at))+'</span><strong>'+escape((game.home_team_id===p.team_id ? 'vs ' : '@ ')+game.opponent_name)+'</strong></li>').join('')+'</ul>' : '<p class="tp-muted">No upcoming games on the test schedule.</p>')+'</section>'+
      '<section class="tp-card"><h3>Test profile</h3><p class="tp-muted">This page reads the separate database league. Your live CVHL profile and availability settings remain as they are.</p></section></div>' :
      '<div class="tp-grid"><section class="tp-card"><h3>Player connection</h3><p class="tp-muted">'+escape(note)+'</p></section></div>');
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
  panel.addEventListener('click',async event=>{
    if(event.target.closest('[data-profile-login]'))await login();
    if(event.target.closest('[data-profile-refresh]'))await load();
    if(event.target.closest('[data-profile-logout]')){
      const token=localStorage.getItem(key);
      if(token)await fetch(service+'/api/website/'+league+'/action/logout',{
        method:'POST',headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store'
      }).catch(()=>{});
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
