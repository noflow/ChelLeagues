/* Isolated database-test trades. Uses test-profile APIs exclusively. */
(() => {
  'use strict';
  const service='https://admin.chelleagues.com/api/website/continental-virtual-hockey-league/test-profile/trades';
  const esc=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>value==null?'Not listed':'$'+Number(value).toLocaleString('en-US');
  const hidden=(name,value)=>'<input type="hidden" name="'+name+'" value="'+esc(value)+'">';
  let host,active='',data=null,team='',timer=null,generation=0,loading=false,saving=false,composerStale=false;
  const bound=new WeakSet();
  const root=()=>['trades','trade-reviews'].includes(active)?host?.querySelector(active==='trade-reviews'?'[data-test-trade-reviews]':'[data-test-trades]'):null;
  const isReview=()=>active==='trade-reviews';
  const teamName=id=>data?.teams.find(t=>t.id===Number(id))?.name || 'Team';
  function choices(id,side){
    if(!id)return '<fieldset class="tp-trade-assets"><legend>Other team sends</legend><p class="tp-muted">Choose the other team to see its players.</p></fieldset>';
    const future=data.pick_ledger?.enabled?(data.pick_ledger.picks.filter(p=>p.owner_team===Number(id)).map(p=>'<label class="tp-trade-choice"><input type="checkbox" name="picks_'+side+'" value="'+esc(p.id)+'"><span><strong>'+esc(p.label)+'</strong><small>Future draft pick</small></span></label>').join('') || '<p class="tp-muted">No available future picks.</p>'):'<p class="tp-muted">Future-pick trading is disabled.</p>';
    return '<fieldset class="tp-trade-assets"><legend>'+esc(teamName(id))+' sends</legend><h4>Future picks</h4>'+future+'<h4>Roster & training camp</h4>'+
      (data.players.filter(p=>p.team_id===Number(id)).map(p=>'<label class="tp-trade-choice"><input type="checkbox" name="players_'+side+'" value="'+p.id+'"><span><strong>'+esc(p.name)+'</strong><small>'+esc(p.section)+' · '+esc(money(p.salary))+'</small></span></label>').join('') || '<p class="tp-muted">No tradable players on this team.</p>')+'</fieldset>';
  }
  function offerCard(offer,review){
    const pickText=rows=>(rows || []).map(p=>'<br>'+esc(p.label)+' <small>(Draft pick)</small>').join('');
    const packageText=rows=>rows.map(p=>esc(p.name)+' <small>('+esc(p.section)+' · '+esc(money(p.salary))+')</small>').join('<br>');
    let form='';
    const fields=hidden('season_id',data.season.id)+hidden('team_id',review?offer.proposing_team:data.team_id)+hidden('offer_id',offer.id)+hidden('revision',offer.revision);
    if(review && offer.status==='accepted_team')form='<form data-test-trade-action>'+fields+
      '<label>League note<textarea name="admin_note" maxlength="1000" rows="2"></textarea></label><div class="tp-actions"><button class="tp-button" name="trade_action" value="approve">Approve and apply trade</button><button class="tp-button secondary" name="trade_action" value="reject">Reject trade</button></div></form>';
    else if(!isReview() && !review && offer.status==='pending_team')form='<form data-test-trade-action>'+fields+'<div class="tp-actions">'+
      (offer.receiving_team===data.team_id?'<button class="tp-button" name="trade_action" value="accept">Accept offer</button><button class="tp-button secondary" name="trade_action" value="decline">Decline offer</button>':'<button class="tp-button secondary" name="trade_action" value="cancel">Cancel offer</button>')+'</div></form>';
    return '<article class="tp-card tp-trade-offer"><h4>'+esc(teamName(offer.proposing_team))+' ↔ '+esc(teamName(offer.receiving_team))+'</h4><p class="tp-trade-status">'+esc(offer.status_label)+'</p><div class="tp-trade-columns"><section><strong>'+esc(teamName(offer.proposing_team))+' sends</strong><p>'+packageText(offer.assets_a)+pickText(offer.picks_a)+'</p></section><section><strong>'+esc(teamName(offer.receiving_team))+' sends</strong><p>'+packageText(offer.assets_b)+pickText(offer.picks_b)+'</p></section></div>'+
      (offer.summary.cap!=null?'<p class="tp-muted">Salary after: '+offer.summary.teams.map(t=>esc(teamName(t.id))+' '+esc(money(t.after))).join(' · ')+' · Cap '+esc(money(offer.summary.cap))+'</p>':'')+
      (offer.note?'<p class="tp-trade-note">Offer note: '+esc(offer.note)+'</p>':'')+
      '<p class="tp-muted">Proposed by '+esc(offer.proposed_by)+(offer.decided_by?' · Team decision by '+esc(offer.decided_by):'')+(offer.reviewed_by?' · Reviewed by '+esc(offer.reviewed_by):'')+'</p>'+
      (offer.admin_note?'<p class="tp-trade-note">League note: '+esc(offer.admin_note)+'</p>':'')+form+'</article>';
  }
  function history(){
    if(isReview())return '<h3>Pending league approvals</h3>'+(data.offers.filter(o=>o.status==='accepted_team').map(o=>offerCard(o,true)).join('') || '<p class="tp-muted">No trades awaiting league approval.</p>')+
      '<details><summary>Recent trade history</summary>'+data.offers.filter(o=>o.status!=='accepted_team').map(o=>offerCard(o,false)).join('')+'</details>';
    return '<h3>Offers & history</h3>'+(data.offers.map(o=>offerCard(o,false)).join('') || '<p class="tp-muted">No offers for this team yet.</p>');
  }
  function render(){
    const target=root();if(!target || !data)return;
    if(!data.configured){target.innerHTML='<section class="tp-card"><h3>Trades</h3><p class="tp-muted">Test trade database setup is required before offers can be sent.</p></section>';return;}
    const reviews=isReview();
    target.innerHTML='<section class="tp-card"><h3>'+(reviews?'Trade Approvals':'Team trades')+'</h3><p class="tp-muted">Both teams agree first. League approval applies the trade to the test rosters.</p>'+
      (!reviews?'<label class="tp-trade-team-label">Your team<select data-test-trade-team>'+data.managed_teams.map(t=>'<option value="'+t.id+'"'+(t.id===data.team_id?' selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select></label>':'')+
      '<button class="tp-button secondary" type="button" data-test-trade-refresh>Refresh status</button><p class="tp-muted" data-test-trade-message role="status">Offers update every 15 seconds.</p></section>'+
      (!reviews?'<section class="tp-card"><h3>Propose a trade</h3><p class="tp-muted">Trade roster players, training-camp players and available future picks.</p><form data-test-trade-action data-trade-composer>'+hidden('trade_action','propose')+hidden('season_id',data.season.id)+hidden('team_id',data.team_id)+
        '<label class="tp-trade-partner">Trade with<select name="receiving_team" data-test-trade-receiver required><option value="">Choose a team</option>'+data.teams.filter(t=>t.id!==data.team_id).map(t=>'<option value="'+t.id+'">'+esc(t.name)+'</option>').join('')+'</select></label><div class="tp-trade-columns tp-trade-composer-columns"><section>'+choices(data.team_id,'a')+'</section><section><div data-test-trade-receiver-choices>'+choices('','b')+'</div></section></div><label>Offer note<textarea name="note" maxlength="1000" rows="2"></textarea></label><p class="tp-muted">Select at least one player or future pick from each team. Players keep their salary and roster/TC section. Protected staff cannot be traded.</p><button class="tp-button" type="submit">Send trade offer</button></form></section>':'')+
      (reviews?ledgerControls():'')+'<div data-test-trade-history>'+history()+'</div>';
  }
  function ledgerControls(){
    const ledger=data.pick_ledger || {},settings=ledger.settings,fields=hidden('season_id',data.season.id);
    return '<section class="tp-card"><h3>Future draft picks</h3><p class="tp-muted">Create each future draft once. Each team receives one pick per round. Trading transfers ownership only after league approval. Reserved picks stay unavailable until the offer is completed or declined.</p>'+
      '<form data-test-trade-action>'+fields+hidden('pick_action','save')+'<label>Pick trading<select name="enabled"><option value="no">Disabled</option><option value="yes"'+(settings?.enabled?' selected':'')+'>Enabled</option></select></label><button class="tp-button">Save pick settings</button></form>'+
      '<form data-test-trade-action>'+fields+hidden('pick_action','create')+'<label>Future draft name<input name="label" maxlength="80" required placeholder="Example: Season 3 draft"></label><label>Rounds<input name="rounds" type="number" min="1" max="30" required></label><button class="tp-button">Create future picks</button></form>'+
      (settings?'<p>Active draft: '+esc(settings.label)+'</p><details><summary>Advance to a new draft</summary><p class="tp-muted">Use when its roster season is active and before opening its snake draft. Match the draft round count to the ledger. This cannot be rewound.</p><form data-test-trade-action>'+fields+hidden('pick_action','activate')+'<label>Next active draft<select name="draft_id" required><option value="">Choose a later draft</option>'+ledger.drafts.filter(d=>d.ordinal>settings.ordinal).map(d=>'<option value="'+esc(d.id)+'">'+esc(d.label)+' ('+d.rounds+' rounds)</option>').join('')+'</select></label><button class="tp-button">Activate draft for this season</button></form></details>':'')+'</section>';
  }
  const rosterSignature=value=>JSON.stringify([value.players,value.rules,value.pick_ledger]);
  async function refresh(background=false){
    if(!root() || loading || saving || (background && document.hidden))return;
    const current=generation;loading=true;
    try{
      const token=localStorage.getItem('chelleagues-session');
      const response=await fetch(service+'?'+new URLSearchParams(isReview()?{reviews:'1'}:team?{team}:{}),{
        headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000)});
      const next=await response.json();
      if(current!==generation)return;
      if(!response.ok){if(response.status===401 || response.status===403)data=null;throw new Error(next.error || 'Could not load test trades.');}
      const changed=data && rosterSignature(data)!==rosterSignature(next);
      const previous=data;data=next;if(!isReview())team=String(next.team_id || '');
      if(!background || !previous || !next.configured || previous.configured!==next.configured){composerStale=false;render();}
      else {
        const target=root();
        if(!target.querySelector('[data-trade-review-dirty]') && !target.querySelector('[data-test-trade-history]')?.contains(document.activeElement))
          target.querySelector('[data-test-trade-history]').innerHTML=history();
        composerStale ||= changed;
        if(composerStale && !isReview()){
          const button=target.querySelector('[data-trade-composer] button[type="submit"]');if(button)button.disabled=true;
        }
        const message=target.querySelector('[data-test-trade-message]');
        if(message)message.textContent=composerStale?'Roster information changed. Refresh status before sending a new offer.':'Trade status synced. Your unsent offer is kept.';
      }
    }catch(error){
      if(current!==generation)return;
      if(!data)root().innerHTML='<section class="tp-card"><p class="tp-muted" role="alert">'+esc(error.message)+'</p><button class="tp-button" data-test-trade-refresh>Retry</button></section>';
      else {const message=root().querySelector('[data-test-trade-message]');if(message)message.textContent=error.message;}
    }finally{if(current===generation)loading=false;}
  }
  function show(tab){
    active=tab;generation++;loading=false;data=null;composerStale=false;
    if(timer)clearInterval(timer);timer=null;
    if(!root() || !['trades','trade-reviews'].includes(tab))return;
    root().innerHTML='<section class="tp-card"><p class="tp-muted">Loading test trades…</p></section>';
    refresh();timer=setInterval(()=>refresh(true),15000);
  }
  function mount(panel,tab,preferredTeam){
    host=panel;
    if(preferredTeam)team=String(preferredTeam);
    if(!bound.has(panel)){
      bound.add(panel);
      panel.addEventListener('input',event=>{
        const form=event.target.closest('[data-test-trade-history] form');if(form)form.dataset.tradeReviewDirty='1';
      });
      panel.addEventListener('change',event=>{
        if(event.target.matches('[data-test-trade-team]')){
          if(saving || loading){event.target.value=team;return;}
          team=event.target.value;generation++;data=null;
          root().innerHTML='<section class="tp-card"><p class="tp-muted">Loading team trades…</p></section>';
          refresh();
        }
        if(event.target.matches('[data-test-trade-receiver]'))root().querySelector('[data-test-trade-receiver-choices]').innerHTML=choices(event.target.value,'b');
      });
      panel.addEventListener('click',event=>{if(event.target.closest('[data-test-trade-refresh]'))refresh();});
      panel.addEventListener('submit',async event=>{
        const form=event.target.closest('[data-test-trade-action]');if(!form)return;
        event.preventDefault();if(saving || loading)return;
        const values=new URLSearchParams(new FormData(form));
        if(event.submitter?.name)values.set(event.submitter.name,event.submitter.value);
        const action=values.get('trade_action');
        if(values.get('pick_action')==='activate' && !confirm('Advance the test pick ledger to this draft? This cannot be rewound.'))return;
        if(action==='approve' && !confirm('Approve this agreed trade and transfer the selected players and draft picks?'))return;
        const current=generation;saving=true;
        form.querySelectorAll('button').forEach(b=>b.disabled=true);
        const message=root().querySelector('[data-test-trade-message]');if(message)message.textContent='Saving test trade…';
        try{
          const response=await fetch(values.has('pick_action')?service.replace('/trades','/pick-ledger'):service,{method:'POST',headers:{Authorization:'Bearer '+localStorage.getItem('chelleagues-session')},
            credentials:'omit',cache:'no-store',body:values,signal:AbortSignal.timeout(15000)});
          const result=await response.json();if(!response.ok)throw new Error(result.error || 'Could not save the trade.');
          if(current!==generation)return;
          saving=false;await refresh();
          const notice=root().querySelector('[data-test-trade-message]');if(notice)notice.textContent=action==='propose'?'Offer sent. The other team must agree before league approval.':'Trade decision saved.';
        }catch(error){if(current===generation && message)message.textContent=error.message || 'Could not save. Refresh status before retrying.';}
        finally{saving=false;form.querySelectorAll('button').forEach(b=>b.disabled=false);if(current!==generation && root())refresh();}
      });
    }
    show(tab);
  }
  function destroy(){generation++;if(timer)clearInterval(timer);timer=null;data=null;team='';active='';host=null;}
  window.ChelTestTrades={mount,show,destroy};
})();

