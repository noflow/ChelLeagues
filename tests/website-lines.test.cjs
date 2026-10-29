const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('CVHL/player-centre.js','utf8');
const helpers=src.slice(src.indexOf('  const E ='),src.indexOf('  let token'))+src.slice(src.indexOf('  const hidden ='),src.indexOf('  const pill ='))+src.slice(src.indexOf('  const linePositions='),src.indexOf('  function constrainLines'));
function render(data){const ctx=vm.createContext({data,league:'continental-virtual-hockey-league',pairingCode:'',linesTeam:''});vm.runInContext(helpers+';html=linesView(data);',ctx);return ctx.html;}
test('line editor uses six available-only slots and escaped schedule codes',()=>{
 const html=render({team:'BUF',admin:false,games:[{key:'x',date:'2026-10-30',time:'9 PM',home:'BUF',away:'TOR',game_code:'<secret>',eligible:{player:'<player>'},line:null}],server:null});
 for(const p of ['LW','C','RW','LD','RD','G'])assert.ok(html.includes('name="'+p+'"'));
 assert.ok(html.includes('&lt;player&gt;'));assert.ok(html.includes('&lt;secret&gt;'));
 assert.ok(!html.includes('<player>'));assert.ok(html.includes('Save Draft'));
 assert.ok(/value="post" disabled/.test(html));
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
