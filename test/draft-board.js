(() => {
  'use strict';
  const service='https://admin.chelleagues.com';
  const api=service+'/api/website/continental-virtual-hockey-league/test-profile/draft-board';
  const viewer=new URLSearchParams(location.search).get('view')==='public';
  let token=viewer?null:localStorage.getItem('chelleagues-session');
  let board=null, team='', busy=false, generation=0, offset=0, renderedPick=null;
  const drafts=new Map();
  const $=id=>document.getElementById(id);
  const esc=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const modes={snake:'Snake draft',batch_bid:'Timed bidding',live_auction:'Live auction'};
  const priorities={1:'Top Pick',2:'Interested',3:'Backup'};
  const teamName=id=>board?.teams.find(t=>t.id===id)?.name || 'Team';
  const message=text=>$('board-message').textContent=text;
  const money=value=>Number(value || 0).toLocaleString('en-US');
  const remaining=closes=>Math.max(0,Math.ceil((new Date(closes).getTime()-Date.now()-offset)/1000));
  const clock=seconds=>seconds>0?Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'Closed · awaiting admin settlement';
  $('board-title').textContent=viewer?'Draft Viewer':'Team Draft Board';
  function render() {
    if(!board)return;
    const privateTeam=!viewer && Boolean(token && board.team_id);
    renderedPick=board.turn?.pick;
    $('board-mode').textContent=board.season.name+' · '+(modes[board.settings?.mode] || 'Format not configured')+' · '+board.status;
    $('team-picker').hidden=!privateTeam;
    $('shortlist-filter').hidden=!privateTeam;
    if(privateTeam){
      $('board-team').innerHTML=board.managed_teams.map(t=>'<option value="'+t.id+'"'+(t.id===board.team_id?' selected':'')+'>'+esc(t.name)+'</option>').join('');
      team=String(board.team_id);
    }
    const onClock=board.status==='open' && board.settings?.mode==='snake' && board.turn;
    $('board-summary').innerHTML='<div class="summary"><strong>'+esc(onClock?teamName(board.turn.team_id)+' on the clock · Round '+board.turn.round+' · Pick '+board.turn.pick:
      board.status==='open'?'Draft is open':board.status==='complete'?'Draft complete':'Draft preparation · awaiting league admin')+'</strong><br>'+
      (privateTeam?'Private '+esc(teamName(board.team_id))+' scouting is shown below. <a href="./#profile">Edit team shortlist</a>.':
        viewer?'Viewer mode · no team highlights or notes are sent to this page.':'<a href="./#profile">Sign in through My Profile</a> for your team controls and private scouting.')+'</div>';
    const search=$('board-search').value.trim().toLowerCase();
    const highlighted=privateTeam && $('highlight-only').checked;
    let shown=0;
    $('board-players').innerHTML=board.players.map(player=>{
      const scout=privateTeam?(board.scouting || []).find(s=>s.player_id===player.id):null;
      if((search && !(player.name+' '+(player.primary || '')+' '+(player.secondary || '')).toLowerCase().includes(search)) || (highlighted && !scout?.priority))return '';
      shown++;
      const nomination=board.nominations.find(n=>n.player_id===player.id);
      const open=nomination && remaining(nomination.closes_at)>0;
      const minimum=Math.max(board.settings?.minimum_bid || 0,(nomination?.amount || 0)+Math.max(1,board.settings?.bid_increment || 1));
      let controls='';
      if(privateTeam && board.status==='open'){
        if(board.settings.mode==='snake')controls='<button type="button" data-move="pick" data-player="'+player.id+'"'+(board.turn?.team_id===board.team_id?'':' disabled')+'>Draft player</button>';
        else if(open)controls='<label>Your bid<input type="number" min="'+minimum+'" step="1" data-bid="'+player.id+'" value="'+esc(drafts.get(player.id) || minimum)+'"></label><button type="button" data-move="bid" data-player="'+player.id+'">Place bid</button>';
        else if(!nomination)controls='<button type="button" data-move="nominate" data-player="'+player.id+'"'+(board.settings.mode==='live_auction' && board.nominations.length?' disabled':'')+'>Nominate player</button>';
      }
      return '<article class="player-card'+(scout?.priority?' highlighted':'')+'"><div class="player-heading"><h3>'+esc(player.name)+'</h3>'+
        (scout?.priority?'<span class="priority">★ '+esc(priorities[scout.priority] || 'Interested')+'</span>':'')+'</div><p class="muted">Primary: '+esc(player.primary || 'Not listed')+' · Secondary: '+esc(player.secondary || '—')+'</p>'+
        (scout?.note?'<div class="team-notes"><strong>Private team notes</strong><br>'+esc(scout.note)+'</div>':'')+
        (scout?.highlighted_by?'<p><small>Highlighted by '+esc(scout.highlighted_by)+'</small></p>':'')+
        (nomination?'<div class="bid-state">Highest bid: <strong>'+(nomination.amount==null?'No bids':money(nomination.amount)+' · '+esc(teamName(nomination.team_id)))+'</strong><br><span data-closes="'+esc(nomination.closes_at)+'">'+clock(remaining(nomination.closes_at))+'</span></div>':'')+
        (controls?'<div class="controls">'+controls+'</div>':'')+'</article>';
    }).join('') || '<p class="muted">No available players match. Approved signups enter the draft pool when the admin saves draft preparation.</p>';
    $('player-count').textContent=shown+' available players shown';
    $('board-order').innerHTML=board.order.map(id=>'<li'+(onClock && board.turn.team_id===id?' class="on-clock"':'')+'>'+esc(teamName(id))+'</li>').join('') || '<li class="muted">Draft order has not been saved.</li>';
    $('board-awards').innerHTML=[...board.awards].reverse().map(a=>'<div class="award"><strong>'+esc(a.name)+'</strong><br>'+esc(teamName(a.team_id))+' · '+(a.pick?'Pick '+a.pick:'Winning bid '+money(a.amount))+'</div>').join('') || '<p class="muted">No picks or auction awards yet.</p>';
  }
  async function refresh(force=false) {
    if(busy || (!force && document.hidden))return;
    busy=true;
    const current=generation;
    try{
      const response=await fetch(token?api+(team?'?team='+encodeURIComponent(team):''):service+'/api/database-test/cvhl/draft-board',
        {headers:token?{Authorization:'Bearer '+token}:{},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)});
      const data=await response.json();
      if(current!==generation)return;
      if(!response.ok){
        if(response.status===401 || response.status===403){board=null;$('board-players').innerHTML='';$('board-summary').innerHTML='';}
        throw new Error(data.error || 'Could not load the draft board.');
      }
      board=data;offset=new Date(data.server_time).getTime()-Date.now();
      if(force || !document.activeElement?.matches('[data-bid]'))render();
      message('Live board synced. Updates every 5 seconds.');
    }catch(error){message(error.message || 'Connection interrupted. Retrying automatically.');}
    finally{busy=false;}
  }
  $('board-refresh').addEventListener('click',()=>refresh(true));
  $('board-search').addEventListener('input',render);
  $('highlight-only').addEventListener('change',render);
  $('board-team').addEventListener('change',async event=>{
    if(busy){event.target.value=team;return;}
    team=event.target.value;generation++;drafts.clear();board=null;
    $('board-players').innerHTML='';$('board-summary').innerHTML='';
    await refresh(true);
  });
  $('board-players').addEventListener('input',event=>{if(event.target.matches('[data-bid]'))drafts.set(Number(event.target.dataset.bid),event.target.value);});
  $('board-players').addEventListener('click',async event=>{
    const button=event.target.closest('[data-move]');
    if(!button || button.disabled || busy || !token || viewer)return;
    const player=board.players.find(p=>p.id===Number(button.dataset.player));
    if(button.dataset.move==='pick' && !confirm('Draft '+player.name+' for '+teamName(board.team_id)+'?'))return;
    const values={move:button.dataset.move,player_id:player.id,team_id:board.team_id,season_id:board.season.id,expected_pick:renderedPick || 0};
    if(values.move==='bid')values.amount=button.closest('article').querySelector('[data-bid]').value;
    busy=true;button.disabled=true;message('Saving draft action…');
    try{
      const response=await fetch(api,{method:'POST',headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',
        body:new URLSearchParams(values),signal:AbortSignal.timeout(12000)});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error || 'Could not save. Refresh before retrying.');
      board=data.board;drafts.delete(player.id);offset=new Date(board.server_time).getTime()-Date.now();render();message('Saved to the database test draft.');
    }catch(error){message(error.message || 'Could not save. Refresh before retrying.');button.disabled=false;}
    finally{busy=false;}
  });
  setInterval(()=>refresh(),5000);
  setInterval(()=>document.querySelectorAll('[data-closes]').forEach(el=>el.textContent=clock(remaining(el.dataset.closes))),1000);
  refresh(true);
})();
