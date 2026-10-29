const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('CVHL/player-centre.js','utf8');
const helpers=src.slice(src.indexOf('  const E ='),src.indexOf('  let token'))+src.slice(src.indexOf('  const hidden ='),src.indexOf('  const pill ='))+src.slice(src.indexOf('  function connectionView'),src.indexOf('  let checkingConnection'));
function render(data){const ctx=vm.createContext({data,league:'continental-virtual-hockey-league',pairingCode:'',linesTeam:''});vm.runInContext(helpers+';html=linesView(data);',ctx);return ctx.html;}
test('line editor uses six available-only slots and escaped schedule codes',()=>{
 const html=render({team:'BUF',admin:false,games:[{key:'x',date:'2026-10-30',time:'9 PM',home:'BUF',away:'TOR',game_code:'<secret>',eligible:{player:'<player>'},line:null}],server:null});
 for(const p of ['LW','C','RW','LD','RD','G'])assert.ok(html.includes('name="'+p+'"'));
 assert.ok(html.includes('&lt;player&gt;'));assert.ok(html.includes('&lt;secret&gt;'));
 assert.ok(!html.includes('<player>'));assert.ok(html.includes('Post Lines'));assert.ok(!html.includes('Save Draft'));
 assert.ok(/value="post-night" disabled/.test(html));
});
test('unavailable saved player is flagged and cannot remain a selectable option',()=>{
 const html=render({team:'BUF',admin:false,games:[{key:'x',eligible:{yes:'Available player'},line:{revision:2,status:'draft',slots:{LW:'no'},updated_at:0}}]});
 assert.ok(html.includes('no longer Available'));assert.ok(!html.includes('value="no"'));
});
test('all league editors remain in sync and use responsive controls',()=>{
 for(const league of ['NBHL','CWHL'])assert.equal(fs.readFileSync(league+'/player-centre.js','utf8'),src);
 assert.ok(fs.readFileSync('CVHL/player-centre.css','utf8').includes('@media(max-width:600px)'));
});

test('line tab requires management assignment and has no team switcher even for admins',()=>{
 assert.ok(src.includes('${profile.can_manage_lines ?'));
 const html=render({team:'BUF',admin:true,teams:[{abbr:'TOR',name:'Toronto'}],games:[]});
 assert.ok(!html.includes('data-team-selector'));
 const css=fs.readFileSync('CVHL/player-centre.css','utf8');
 for(const [pos,colour] of Object.entries({C:'#ed174c',LW:'#00c853',RW:'#1736a6',LD:'#00bcd4',RD:'#ffdc00',G:'#a83ee8'})) {
  assert.ok(css.includes('[data-position="'+pos+'"]{background:'+colour));
 }
});

test('healthy Discord connections hide setup while broken ones show reconnection',()=>{
 const healthy=render({team:'BUF',games:[],server:{guild:'123',channel:'456',healthy:true}});
 assert.ok(!healthy.includes('<summary>Team Discord connection</summary>'));
 const broken=render({team:'BUF',games:[],server:{guild:'123',channel:'456',healthy:false}});
 assert.ok(broken.includes('<summary>Team Discord connection</summary>'));
 assert.ok(broken.includes('connection needs attention'));
 const absent=render({team:'BUF',games:[],server:null});
 assert.ok(absent.includes('Generate connection code'));
 assert.ok(src.includes("panel.innerHTML=connectionView(state)"));
});

test('copy line clears unavailable destination players and retains positions',()=>{
 const c=vm.createContext({source:{LW:'a',C:'b',RW:'c',LD:'d',RD:'e',G:'f'},eligible:{a:true,c:true,d:true,e:true,f:true}});
 vm.runInContext(helpers+';result=copyLineSlots(source,eligible);',c);
 assert.equal(c.result.slots.LW,'a');assert.equal(c.result.slots.C,'');assert.equal(c.result.slots.G,'f');
 assert.deepEqual(Array.from(c.result.missing),['C']);
});
test('nightly controls group dates and copy destinations stay within the same night',()=>{
 const game=(key,date,time)=>({key,date,time,home:'BUF',away:'TOR',eligible:{a:'Player'},line:null});
 const html=render({team:'BUF',server:{guild:'1',healthy:true},games:[game('one','2026-11-01','9 PM'),game('two','2026-11-01','10 PM'),game('three','2026-11-02','9 PM')]});
 assert.equal((html.match(/value="post-night"/g)||[]).length,2);
 assert.equal((html.match(/data-copy-target/g)||[]).length,2);
 assert.ok(!html.includes('<option value="three">'));
 assert.ok(html.includes('All remaining games this night'));
 assert.ok(!html.includes('Post to Team Discord'));
});

test('each night has game tabs, one visible panel and a readable date',()=>{const game=(key)=>({key,date:'2026-11-04',time:'9 PM',home:'BUF',away:'TOR',eligible:{},line:null});const html=render({team:'BUF',games:[game('one'),game('two'),game('three')]});for(const n of [1,2,3])assert.ok(html.includes('>Game '+n+'</button>'));assert.equal((html.match(/role="tabpanel"/g)||[]).length,3);assert.equal((html.match(/aria-labelledby="line-tab-[^"]+" hidden/g)||[]).length,2);assert.ok(html.includes('Nov 4, 2026'));assert.ok(!html.includes('Save Night'));});
test('posting validation lists each incomplete game and its positions',()=>{const ctx=vm.createContext({entries:[{time:'9 PM',slots:{LW:'a',C:'b',RW:'c',LD:'d',RD:'e',G:'f'}},{time:'10 PM',slots:{LW:'a'}},{slots:{}}]});vm.runInContext(helpers+';issues=incompleteLineups(entries)',ctx);assert.equal(ctx.issues.length,2);assert.ok(ctx.issues[0].includes('Game 2 (10 PM): missing C, RW, LD, RD, G'));assert.ok(ctx.issues[1].includes('Game 3'));});

 test('delivery polling updates only the matching queued revision without replacing forms',async()=>{
 const button={textContent:''},help={},badge={},control={disabled:true};
 const form={elements:{night_revision:{value:'2'}},querySelector:s=>s==='.pc-muted'?help:button};
 const section={dataset:{lineNight:'2026-11-04',deliveryPending:'true'},querySelector:()=>form,querySelectorAll:s=>s==='button,select'?[control]:[badge]};
 const panel={dataset:{connectionState:'null'}};
 const ctx=vm.createContext({active:true,tab:'lines',token:'token',busy:false,document:{hidden:false},viewGeneration:1,
 root:{querySelector:()=>panel,querySelectorAll:()=>[section]},call:async()=>({nights:{'2026-11-04':{status:'posted',revision:1}}}),nightSaveNotice:()=>{},constrainLines:()=>{}});
 vm.runInContext(src.slice(src.indexOf('  let checkingConnection'),src.indexOf('  setInterval(refreshConnection')),ctx);
 await vm.runInContext('refreshConnection()',ctx);assert.equal(control.disabled,true);
 ctx.call=async()=>({nights:{'2026-11-04':{status:'posted',revision:2}}});
 await vm.runInContext('refreshConnection()',ctx);
 assert.equal(button.textContent,'Update Lines');assert.equal(control.disabled,false);assert.equal(section.dataset.deliveryPending,'false');assert.equal(badge.textContent,'Posted to Discord');
 });
