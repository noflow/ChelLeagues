const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('draft tab works without management and disappears when disabled',()=>{
  const panel={innerHTML:'',addEventListener(){},querySelectorAll(){return []}};
  const nav={addEventListener(){}};
  const context={document:{getElementById:()=>panel,querySelector:()=>nav},location:{hash:'#home'},
    window:{addEventListener(){}},Intl,Date,setInterval(){return 1},clearInterval(){}};
  vm.createContext(context);
  const source=fs.readFileSync(__dirname+'/profile.js','utf8').replace('  async function load() {','  window.testRender=render;\n  async function load() {');
  vm.runInContext(source,context);
  const data={account_name:'Player',status:'unlinked',management:{teams:[]},
    draft_players:{enabled:true,game_days:[2,3],players:[{id:1,name:'<Player>',console:'psn',gaming_id:'Test',primary:'C',secondary:'LW',days:[2,3]}]}};
  context.window.testRender(data);
  assert.match(panel.innerHTML,/data-profile-tab="draft"/);
  assert.doesNotMatch(panel.innerHTML,/data-profile-tab="management"/);
  assert.match(panel.innerHTML,/All game days/);
  assert.match(panel.innerHTML,/&lt;Player&gt;/);
  assert.doesNotMatch(panel.innerHTML,/Manage signups/);
  data.draft_players.shortlist={available:true,team_id:1,teams:[{id:1,name:'New York'}],entries:[]};
  context.window.testRender(data);
  assert.match(panel.innerHTML,/Team shortlist/);
  assert.match(panel.innerHTML,/data-shortlist-highlight/);
  assert.match(panel.innerHTML,/Top Pick/);
  assert.match(panel.innerHTML,/Shared team notes/);
  data.draft_players={enabled:false,players:[],game_days:[]};
  context.window.testRender(data);
  assert.doesNotMatch(panel.innerHTML,/data-profile-tab="draft"|data-draft-player/);
});
