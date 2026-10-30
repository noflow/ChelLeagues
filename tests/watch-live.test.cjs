const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'watch-live.js'),'utf8');
const context={window:{},URL};
vm.runInNewContext(source,context);
const parse=context.window.ChelWatch.parseStream;
test('automatic selection uses only confirmed live embeds and preserves the selected broadcast',()=>{
  const {selectLive}=context.window.ChelWatch;
  const unknown={url:'unknown',embed:'player',state:'unknown'};
  const offline={url:'offline',embed:'player',state:'offline'};
  const first={url:'first',embed:'player1',state:'live'};
  const second={url:'second',embed:'player2',state:'live'};
  assert.equal(selectLive([unknown,offline],''),null);
  assert.equal(selectLive([unknown,first,second],''),first);
  assert.equal(selectLive([first,second],'second'),second);
  assert.equal(selectLive([first,{...second,state:'offline'}],'second'),first);
  assert.equal(selectLive([{state:'live',embed:''}],''),null);
});
test('fullscreen supports the standard API and reports failure for a browser fallback',async()=>{
  const {fullscreen}=context.window.ChelWatch;let calls=0;
  assert.equal(await fullscreen({requestFullscreen:async()=>calls++}),true);
  assert.equal(calls,1);
  assert.equal(await fullscreen({requestFullscreen:async()=>{throw Error('denied');}}),false);
  assert.equal(await fullscreen({}),false);
  assert.equal(await fullscreen({webkitRequestFullscreen:()=>calls++}),true);
});
test('Twitch embeds use the hosting domain and start muted',()=>{
  const result=parse('https://www.twitch.tv/Hockey_Player','chelleagues.com');
  const url=new URL(result.embed);
  assert.equal(url.hostname,'player.twitch.tv');
  assert.equal(url.searchParams.get('channel'),'Hockey_Player');
  assert.equal(url.searchParams.get('parent'),'chelleagues.com');
  assert.equal(url.searchParams.get('muted'),'true');
});
test('YouTube video links embed, channel handles remain external links',()=>{
  for(const link of ['https://youtu.be/abcdefghijk','https://youtube.com/watch?v=abcdefghijk','https://youtube.com/live/abcdefghijk'])
    assert.equal(new URL(parse(link,'example.com').embed).pathname,'/embed/abcdefghijk');
  assert.equal(parse('https://youtube.com/@Hockey','example.com').embed,'');
  assert.equal(parse('https://youtube.com/channel/UC123','example.com').provider,'YouTube');
});
test('unsafe URLs and unsupported providers cannot become embedded players',()=>{
  for(const link of ['javascript:alert(1)','http://twitch.tv/player','https://twitch.tv.evil.com/player','https://user:pass@twitch.tv/player','https://twitch.tv/videos/123','https://evil.com/watch?v=abcdefghijk'])
    assert.equal(parse(link,'example.com'),null);
});
test('every league loads the viewer and exposes its schedule and roster adapters',()=>{
  for(const league of ['CVHL','CWHL','NBHL']){
    const html=fs.readFileSync(path.join(root,league,'index.html'),'utf8');
    assert.match(html,/defer src="\.\.\/watch-live.js\?v=3"/);
    assert.match(html,/href="\.\.\/watch-live.css\?v=3"/);
    for(const name of ['scoreNightDate','officialRosterNameSet','ensureOfficialRosterLoaded','fetchScheduleTab','scheduleTabForPhase','scheduleTimeMinutes'])
      assert.ok(html.includes('function '+name+'('),league+' missing '+name);
  }
});

test('nightly guide auto-populates all games, preserves playback on refresh and stops when leaving',async()=>{
  const ids=new Map();
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.className='';this.hidden=false;this.textContent='';}
    set id(value){this._id=value;ids.set(value,this);} get id(){return this._id;}
    get classList(){const self=this;return {
      contains:value=>self.className.split(' ').includes(value),
      toggle(value,on){const set=new Set(self.className.split(' ').filter(Boolean));const enabled=on??!set.has(value);if(enabled)set.add(value);else set.delete(value);self.className=[...set].join(' ');return enabled;},
      remove:value=>{self.className=self.className.split(' ').filter(x=>x!==value).join(' ');}
    };}
    set innerHTML(value){for(const [,tag,id,cls] of value.matchAll(/<(\w+) id="([^"]+)"(?: class="([^"]+)")?/g)){const el=new Element(tag);el.id=id;el.className=cls||'';this.append(el);}}
    append(...items){for(const item of items){item.remove();item.parentNode=this;this.children.push(item);}}
    prepend(item){item.remove();item.parentNode=this;this.children.unshift(item);}
    remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}}
    replaceChildren(...items){for(const item of this.children)item.parentNode=null;this.children=[];this.append(...items);}
    setAttribute(key,value){this[key]=value;}
    querySelector(tag){for(const child of this.children){if(child.tag===tag)return child;const found=child.querySelector(tag);if(found)return found;}return null;}
  }
  const main=new Element('main'),nav=new Element('nav');for(const id of ['page-home','page-schedule']){const el=new Element('section');el.id=id;}
  const script={dataset:{playerLeague:'league',playerService:'https://service.example'}};
  const listeners={},timers=[];let current='live',requests=0;
  const document={hidden:false,createElement:tag=>new Element(tag),getElementById:id=>ids.get(id),
    querySelector:selector=>selector==='main'?main:selector==='nav'?nav:selector==='script[data-player-league]'?script:null,
    addEventListener:(name,fn)=>listeners[name]=fn};
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const sandbox={URL,Intl,Date,Map,Set,Promise,AbortSignal,document,location:{hash:'#watch-live',hostname:'chelleagues.com'},
    window:{addEventListener(){},showPage(id){for(const el of ids.values())if(el.id?.startsWith('page-'))el.classList.toggle('active',el.id==='page-'+id);}},
    setInterval:fn=>timers.push(fn),fetchScheduleTab:async()=>({cols:['Date','Away','Home','Time'],rows:[[day,'A','B','9:00 PM'],[day,'C','D','9:30 PM']]}),
    scheduleTabForPhase:phase=>phase,getIndexMap:cols=>Object.fromEntries(cols.map((v,i)=>[v,i])),scoreNightDate:value=>value,scheduleTimeMinutes:()=>0,
    ensureOfficialRosterLoaded:async()=>({teams:{A:{names:['one']},C:{names:['two']}}}),
    cleanTeamName:value=>value,nameToAbbr:value=>value,officialRosterNameSet:roster=>new Set(roster?.names||[]),
    fetch:async url=>{requests++;return {ok:true,json:async()=>({stream_url:'https://twitch.tv/'+(url.includes('one')?'one':'two'),state:current})};}
  };
  vm.runInNewContext(source,sandbox);
  async function settle(){for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));}
  await settle();
  const guide=ids.get('wl-guide');assert.equal(guide.children.length,2);
  const first=guide.children[0].querySelector('iframe');assert.ok(first);assert.ok(guide.children[1].querySelector('iframe'));
  assert.equal(first.allowFullscreen,true);assert.match(first.allow,/fullscreen/);
  timers[0]();await settle();assert.equal(guide.children[0].querySelector('iframe'),first);
  current='offline';timers[0]();await settle();assert.equal(guide.children[0].querySelector('iframe'),null);
  assert.equal(guide.children.length,2);assert.ok(requests>=6);
  sandbox.window.showPage('home');assert.equal(guide.children.length,0);
});
