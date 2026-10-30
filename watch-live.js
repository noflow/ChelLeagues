/* Every nightly matchup gets its own live player, sourced from profile links. */
(() => {
  'use strict';
  function parseStream(value, parent) {
    let u; try { u = new URL(value); } catch { return null; }
    if(u.protocol!=='https:' || u.username || u.password || (u.port && u.port!=='443'))return null;
    const host=u.hostname.replace(/^www\./,''), p=u.pathname.split('/').filter(Boolean);
    if(host==='twitch.tv' && p.length===1 && /^[a-z0-9_]{1,25}$/i.test(p[0]) && !['videos','directory','settings'].includes(p[0].toLowerCase()))
      return {url:u.href,provider:'Twitch',embed:`https://player.twitch.tv/?channel=${encodeURIComponent(p[0])}&parent=${encodeURIComponent(parent)}&muted=true&autoplay=true`};
    if(!['youtube.com','m.youtube.com','youtu.be'].includes(host))return null;
    const id=host==='youtu.be'?p[0]:u.searchParams.get('v')||(['live','embed','shorts'].includes(p[0])?p[1]:'');
    return {url:u.href,provider:'YouTube',embed:/^[\w-]{11}$/.test(id||'')?`https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1`:''};
  }
  function selectLive(candidates,current){
    const live=candidates.filter(item=>item.state==='live' && item.embed);
    return live.find(item=>item.url===current) || live[0] || null;
  }
  async function fullscreen(card,frame){
    try{
      if(card.requestFullscreen)await card.requestFullscreen();
      else if(card.webkitRequestFullscreen)card.webkitRequestFullscreen();
      else if(frame?.webkitEnterFullscreen)frame.webkitEnterFullscreen();
      else return false;
      return true;
    }catch{return false;}
  }
  window.ChelWatch={parseStream,selectLive,fullscreen};
  if(typeof document==='undefined')return;
  const config=document.querySelector('script[data-player-league]');if(!config)return;
  const page=document.createElement('section');page.id='page-watch-live';page.className='page';
  page.innerHTML='<div class="section-title">Watch Live</div><p id="wl-status" role="status"></p><div id="wl-guide" class="wl-screens"></div>';
  document.querySelector('main').append(page);
  const status=text=>document.getElementById('wl-status').textContent=text;
  const cards=new Map(),buttons=[];let busy=false,epoch=0;
  function active(){return page.classList.contains('active');}
  function clear(){epoch++;for(const view of cards.values())view.media.replaceChildren();cards.clear();document.getElementById('wl-guide').replaceChildren();}
  function open(){window.showPage('watch-live');refresh();}
  for(const target of [document.querySelector('nav'),document.getElementById('page-home'),document.getElementById('page-schedule')]){
    if(!target)continue;const b=document.createElement('button');b.type='button';b.className='wl-onair';b.textContent='\u25cf WATCH LIVE';b.hidden=true;b.onclick=open;target.prepend(b);buttons.push(b);
  }
  function element(tag,text,className){const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;}
  function gameView(game){
    const key=[game.date,game.away,game.home,game.time].join('|');
    if(cards.has(key))return cards.get(key);
    const card=element('article','','wl-match'),heading=element('h3',`${game.away} @ ${game.home}`),time=element('p',game.time+' (Eastern)'),badge=element('p','Checking roster streams…','wl-state');
    const media=element('div','','wl-media'),controls=element('div','','wl-controls');
    const select=element('select');select.setAttribute('aria-label','Choose broadcast for '+game.away+' at '+game.home);select.hidden=true;
    const full=element('button','Fullscreen');full.type='button';full.disabled=true;
    const expand=element('button','Expand game');expand.type='button';expand.hidden=true;
    const external=element('a','Open broadcast');external.target='_blank';external.rel='noopener noreferrer';external.hidden=true;
    const view={key,card,media,badge,select,full,expand,external,current:'',embed:'',candidates:[]};
    select.onchange=()=>play(view,view.candidates.find(item=>item.url===select.value));
    full.onclick=async()=>{if(!await fullscreen(card,media.querySelector('iframe'))){expand.hidden=false;view.badge.textContent='Use Expand game or the video player’s fullscreen control on this browser.';}};
    expand.onclick=()=>{const expanded=card.classList.toggle('wl-expanded');expand.textContent=expanded?'Close expanded view':'Expand game';};
    controls.append(select,full,expand,external);card.append(heading,time,badge,media,controls);cards.set(key,view);return view;
  }
  function play(view,item){
    if(!item){view.current='';view.embed='';view.media.replaceChildren();view.full.disabled=true;view.external.hidden=true;return;}
    view.current=item.url;view.select.value=item.url;view.external.href=item.url;view.external.hidden=false;view.full.disabled=false;
    if(view.embed===item.embed)return;
    view.embed=item.embed;const frame=element('iframe');frame.src=item.embed;frame.title=view.card.querySelector('h3').textContent+' - '+item.name;frame.allow='autoplay; fullscreen; encrypted-media; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';view.media.replaceChildren(frame);
  }
  function populate(view,candidates){
    view.candidates=candidates;const live=candidates.filter(item=>item.state==='live'&&item.embed);
    const selected=selectLive(candidates,view.current);
    view.select.replaceChildren();for(const item of live){const option=element('option',item.name+' - '+item.provider);option.value=item.url;view.select.append(option);}
    view.select.hidden=live.length<2;
    view.badge.textContent=live.length?'LIVE - '+selected.name:candidates.some(item=>item.state==='unknown')?'Live status unavailable. Waiting for a confirmed broadcast.':'Waiting for streams - no confirmed roster broadcast yet.';
    view.badge.classList.toggle('wl-is-live',live.length>0);play(view,selected);
  }
  async function fixtures(){
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const results=await Promise.allSettled(['regular','playoffs'].map(phase=>fetchScheduleTab(scheduleTabForPhase(phase))));
    if(results.every(r=>r.status==='rejected'))throw Error('Schedule unavailable. Refresh to try again.');
    const games=new Map();
    for(const result of results){if(result.status!=='fulfilled')continue;const data=result.value,idx=getIndexMap(data.cols);
      for(const row of data.rows){if(scoreNightDate(row[idx.Date])!==day)continue;const away=String(row[idx.Away]||''),home=String(row[idx.Home]||''),time=String(row[idx.Time]||'');
        if(away&&home)games.set([away,home,time].join('|'),{date:day,away,home,time});}}
    return [...games.values()].sort((a,b)=>scheduleTimeMinutes(a.time)-scheduleTimeMinutes(b.time));
  }
  async function refresh(){
    if(busy||!active())return;busy=true;const owner=epoch;status('Checking tonight’s broadcasts…');
    try{
      const games=await fixtures();if(owner!==epoch||!active())return;buttons.forEach(b=>b.hidden=!games.length);
      const guide=document.getElementById('wl-guide'),current=new Set(),views=games.map(game=>({game,view:gameView(game)}));
      for(const {view} of views){current.add(view.key);if(!view.card.parentNode)guide.append(view.card);}
      for(const [key,view] of cards)if(!current.has(key)){view.card.remove();cards.delete(key);}
      if(!games.length){status('');return;}
      const roster=await ensureOfficialRosterLoaded();if(owner!==epoch||!active())return;
      const targets=new Map(),candidates=new Map(views.map(({view})=>[view,[]]));
      for(const {game,view} of views)for(const team of [game.away,game.home])for(const name of officialRosterNameSet(roster.teams[nameToAbbr(cleanTeamName(team))])){
        if(!targets.has(name))targets.set(name,new Set());targets.get(name).add(view);
      }
      let failures=0,unconfigured=false;const queue=[...targets.keys()];
      await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{
        while(queue.length&&owner===epoch&&active()){
          const name=queue.shift();try{
            const response=await fetch(config.dataset.playerService.replace(/\/$/,'')+'/api/website/'+encodeURIComponent(config.dataset.playerLeague)+'/player-stream?live=1&name='+encodeURIComponent(name),{signal:AbortSignal.timeout(25000)});
            if(!response.ok)throw Error('Unavailable');const data=await response.json(),item=parseStream(data.stream_url,location.hostname);if(!item)continue;
            if(data.reason==='provider_not_configured')unconfigured=true;
            if(item.provider==='YouTube'&&/^[\w-]{11}$/.test(data.video_id||'')){item.embed=`https://www.youtube.com/embed/${data.video_id}?autoplay=1&mute=1&playsinline=1`;item.url='https://www.youtube.com/watch?v='+data.video_id;}
            item.state=data.state||'unknown';item.name=name;
            for(const view of targets.get(name)){
              candidates.get(view).push(item);
              if(owner===epoch&&active()&&!view.current&&item.state==='live'&&item.embed)populate(view,candidates.get(view));
            }
          }catch{failures++;for(const view of targets.get(name))candidates.get(view).push({state:'unknown'});}
        }
      }));
      if(owner!==epoch||!active())return;
      for(const {view} of views)populate(view,candidates.get(view));
      status(`${games.length} games tonight. Auto-refreshes every 60 seconds.${unconfigured?' Live detection needs the streaming provider credentials configured on the server.':''}${failures?' Some streams could not be checked; retrying automatically.':''}`);
    }catch(error){if(owner===epoch&&active())status(error.message);}finally{busy=false;if(owner!==epoch&&active())refresh();}
  }
  const show=window.showPage;window.showPage=function(id,button){show(id,button);if(id!=='watch-live')clear();};
  async function update(){try{const games=await fixtures();buttons.forEach(b=>b.hidden=!games.length);}catch{/* Optional viewing must not block the league site. */}}
  document.addEventListener('keydown',event=>{if(event.key==='Escape')for(const view of cards.values()){view.card.classList.remove('wl-expanded');view.expand.textContent='Expand game';}});
  window.addEventListener('hashchange',()=>{if(location.hash==='#watch-live')open();});
  if(location.hash==='#watch-live')open();else update();
  setInterval(()=>{if(!document.hidden){if(active())refresh();else update();}},60000);
})();
