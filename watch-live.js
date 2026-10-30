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
  // A short-lived, link-only preview for the registered CVHL broadcaster.
  const preview=config.dataset.playerLeague==='continental-virtual-hockey-league' && /(?:^|[?&])preview=slur1979(?:&|$)/.test(location.search||'');
  const page=document.createElement('section');page.id='page-watch-live';page.className='page';
  page.innerHTML='<div class="section-title">Watch Live</div><p id="wl-status" role="status"></p><div id="wl-guide" class="wl-screens"></div>';
  document.querySelector('main').append(page);
  const status=text=>document.getElementById('wl-status').textContent=text;
  const cards=new Map(),buttons=[];let busy=false,epoch=0;
  function active(){return page.classList.contains('active');}
  function clear(){epoch++;for(const view of cards.values())view.media.replaceChildren();cards.clear();document.getElementById('wl-guide').replaceChildren();placeholders.length=0;}
  function open(){window.showPage('watch-live');refresh();}
  for(const target of [document.querySelector('nav'),document.getElementById('page-home'),document.getElementById('page-schedule')]){
    if(!target)continue;const b=document.createElement('button');b.type='button';b.className='wl-onair';b.textContent='\u25cf WATCH LIVE';b.hidden=true;b.onclick=open;target.prepend(b);buttons.push(b);
  }
  function element(tag,text,className){const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;}
  function teamBadge(team,side) {
    const box=element('div','','wl-team wl-team-'+side);
    const logo=element('span','','wl-logo'),fallback=element('span',team?nameToAbbr(cleanTeamName(team)):'--','wl-logo-fallback');
    logo.append(fallback);
    if(team&&typeof teamLogoSrc==='function'){
      const image=element('img');image.src=teamLogoSrc(team);image.alt='';image.loading='lazy';
      image.onload=()=>fallback.hidden=true;image.onerror=()=>image.remove();logo.append(image);
    }
    const words=element('span','','wl-team-copy');
    words.append(element('small',side==='away'?'AWAY':'HOME'),element('span',team?(typeof displayTeamName==='function'?displayTeamName(team):team):(side==='away'?'Away team':'Home team'),'wl-team-name'));
    box.append(logo,words);return box;
  }
  function standby(view) {
    const idle=element('div','','wl-standby'),mark=element('span','','wl-signal');
    mark.setAttribute('aria-hidden','true');
    idle.append(mark,element('strong',view.empty?'SCREEN READY':'AWAITING BROADCAST'),element('span',view.empty?'Game feed will appear here':'Stream connects automatically','wl-standby-note'));
    view.media.replaceChildren(idle);
  }
  function gameView(game){
    const key=[game.date,game.away,game.home,game.time].join('|');
    if(!game.empty&&cards.has(key))return cards.get(key);
    const card=element('article','','wl-match'),header=element('div','','wl-match-header');
    const title=game.empty?'Available stream screen':game.away+' vs '+game.home;
    card.setAttribute('aria-label',title);
    const heading=element('h3','','wl-matchup');
    heading.append(teamBadge(game.away,'away'),element('span','VS','wl-versus'),teamBadge(game.home,'home'));
    const meta=element('div','','wl-match-meta'),time=element('span',game.empty?'STREAM '+String(game.slot).padStart(2,'0'):game.preview?'STREAM PREVIEW':game.time+' ET','wl-time');
    const badge=element('span',game.empty?'STANDBY':'CONNECTING','wl-state');badge.setAttribute('role','status');meta.append(time,badge);
    const media=element('div','','wl-media'),controls=element('div','','wl-controls');
    const select=element('select');select.setAttribute('aria-label','Choose broadcast for '+title);select.hidden=true;
    const full=element('button','Fullscreen');full.type='button';full.disabled=true;full.setAttribute('aria-label','Fullscreen '+title);
    const expand=element('button','Expand game');expand.type='button';expand.hidden=true;
    const external=element('a','Open broadcast');external.target='_blank';external.rel='noopener noreferrer';external.hidden=true;
    const view={key,title,empty:!!game.empty,card,media,badge,select,full,expand,external,current:'',embed:'',candidates:[]};
    select.onchange=()=>play(view,view.candidates.find(item=>item.url===select.value));
    full.onclick=async()=>{if(!await fullscreen(card,media.querySelector('iframe'))){expand.hidden=false;view.badge.textContent='Use Expand game or the player fullscreen control.';}};
    expand.onclick=()=>{const expanded=card.classList.toggle('wl-expanded');expand.textContent=expanded?'Close expanded view':'Expand game';};
    controls.append(select,full,expand,external);header.append(meta,heading,controls);card.append(header,media);standby(view);
    if(!game.empty)cards.set(key,view);return view;
  }
  const placeholders=[];
  function fillScreens(count) {
    for(const card of placeholders)card.remove();placeholders.length=0;
    const guide=document.getElementById('wl-guide');
    for(let slot=count+1;slot<=4;slot++){
      const view=gameView({empty:true,slot,away:'',home:'',time:'',date:''});
      placeholders.push(view.card);guide.append(view.card);
    }
  }
  function play(view,item){
    if(!item){view.current='';view.embed='';standby(view);view.full.disabled=true;view.external.hidden=true;return;}
    view.current=item.url;view.select.value=item.url;view.external.href=item.url;view.external.hidden=false;view.full.disabled=false;
    if(view.embed===item.embed)return;
    view.embed=item.embed;const frame=element('iframe');frame.src=item.embed;frame.title=view.title+' - '+item.name;frame.allow='autoplay; fullscreen; encrypted-media; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';view.media.replaceChildren(frame);
  }
  function populate(view,candidates){
    view.candidates=candidates;const live=candidates.filter(item=>item.state==='live'&&item.embed);
    const selected=selectLive(candidates,view.current);
    view.select.replaceChildren();for(const item of live){const option=element('option',item.name+' - '+item.provider);option.value=item.url;view.select.append(option);}
    view.select.hidden=live.length<2;
    view.badge.textContent=live.length?'LIVE - '+selected.name:candidates.some(item=>item.state==='unknown')?'STATUS UNAVAILABLE':'STANDBY';
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
    if(!games.size&&preview)games.set('preview',{date:day,away:'New York Rangers',home:'Stream Preview',time:'',preview:true});
    return [...games.values()].sort((a,b)=>scheduleTimeMinutes(a.time)-scheduleTimeMinutes(b.time));
  }
  async function refresh(){
    if(busy||!active())return;busy=true;const owner=epoch;status('Checking tonight’s broadcasts…');
    try{
      const games=await fixtures();if(owner!==epoch||!active())return;buttons.forEach(b=>b.hidden=!games.length);
      const guide=document.getElementById('wl-guide'),current=new Set(),views=games.map(game=>({game,view:gameView(game)}));
      for(const {view} of views){current.add(view.key);if(!view.card.parentNode)guide.append(view.card);}
      for(const [key,view] of cards)if(!current.has(key)){view.card.remove();cards.delete(key);}
      fillScreens(games.length);
      if(!games.length){status('');return;}
      const roster=views.every(({game})=>game.preview)?{teams:{}}:await ensureOfficialRosterLoaded();if(owner!==epoch||!active())return;
      const targets=new Map(),candidates=new Map(views.map(({view})=>[view,[]]));
      for(const {game,view} of views)for(const team of [game.away,game.home])for(const name of game.preview?(team===game.away?['XxSlur1979xX']:[]):officialRosterNameSet(roster.teams[nameToAbbr(cleanTeamName(team))])){
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
      status(unconfigured?'Live detection needs the streaming provider credentials configured on the server.':failures?'Some streams could not be checked; retrying automatically.':'');
    }catch(error){if(owner===epoch&&active())status(error.message);}finally{busy=false;if(owner!==epoch&&active())refresh();}
  }
  const show=window.showPage;window.showPage=function(id,button){show(id,button);if(id!=='watch-live')clear();};
  async function update(){try{const games=await fixtures();buttons.forEach(b=>b.hidden=!games.length);}catch{/* Optional viewing must not block the league site. */}}
  document.addEventListener('keydown',event=>{if(event.key==='Escape')for(const view of cards.values()){view.card.classList.remove('wl-expanded');view.expand.textContent='Expand game';}});
  window.addEventListener('hashchange',()=>{if(location.hash==='#watch-live')open();});
  if(location.hash==='#watch-live')open();else update();
  setInterval(()=>{if(!document.hidden){if(active())refresh();else update();}},60000);
})();


