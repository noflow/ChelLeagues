const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/profile-trades.js','utf8');
function render(value,reviews=false){
  const target={innerHTML:''};
  const context={window:{},target};vm.createContext(context);
  const code=source.replace('window.ChelTestTrades={mount,show,destroy};',
    'window.draw=(value,reviews)=>{data=value;active=reviews?"trade-reviews":"trades";host={querySelector:()=>target};render();};');
  vm.runInContext(code,context);context.window.draw(value,reviews);return target.innerHTML;
}
const offer={id:'abc',proposing_team:2,receiving_team:1,revision:1,status:'pending_team',status_label:'Awaiting team',
  assets_a:[{id:12,name:'Other',section:'TC',salary:20}],assets_b:[{id:10,name:'<Own>',section:'Roster',salary:10}],
  summary:{cap:100,teams:[{id:1,after:20},{id:2,after:10}]},note:'<note>',proposed_by:'Manager'};
const base={configured:true,season:{id:1},team_id:1,managed_teams:[{id:1,name:'New York'}],
  teams:[{id:1,name:'New York'},{id:2,name:'Boston'}],players:[{id:10,name:'<Own>',team_id:1,section:'Roster',salary:10}],offers:[]};
test('test trade form uses roster IDs, preserves multiple selections and escapes names',()=>{
  const html=render(base);
  assert.match(html,/&lt;Own&gt;/);assert.doesNotMatch(html,/<Own>/);
  assert.match(html,/name="players_a" value="10"/);assert.match(html,/Future-pick trading is disabled/);
  assert.ok(source.includes('new URLSearchParams(new FormData(form))'));
  assert.ok(source.includes('/test-profile/trades'));assert.ok(!source.includes('/action/trade-propose'));
});
test('future picks appear only while enabled, with history labels and admin controls',()=>{
  const pick={id:'pick-1',owner_team:1,label:'Season 3 <Round 1>'};
  let html=render({...base,pick_ledger:{enabled:true,picks:[pick]}});
  assert.match(html,/name="picks_a" value="pick-1"/);assert.match(html,/Season 3 &lt;Round 1&gt;/);
  html=render({...base,pick_ledger:{enabled:false,picks:[pick]}});
  assert.doesNotMatch(html,/name="picks_a"/);
  html=render({...base,offers:[{...offer,picks_a:[pick]}]},true);
  assert.match(html,/Create future picks/);assert.match(html,/name="rounds"/);assert.match(html,/Season 3 &lt;Round 1&gt;/);
});
test('incoming team offers have accept/decline and outgoing offers have cancel',()=>{
  let html=render({...base,offers:[offer]});assert.match(html,/value="accept"/);assert.match(html,/value="decline"/);
  assert.doesNotMatch(html,/value="approve"/);assert.match(html,/&lt;note&gt;/);
  html=render({...base,offers:[{...offer,proposing_team:1,receiving_team:2}]});assert.match(html,/value="cancel"/);assert.doesNotMatch(html,/value="accept"/);
});
test('league approvals only act on agreed offers; pending-team history is read only',()=>{
  let html=render({...base,offers:[{...offer,status:'accepted_team'}]},true);
  assert.match(html,/value="approve"/);assert.match(html,/value="reject"/);assert.match(html,/name="revision" value="1"/);
  html=render({...base,offers:[offer]},true);assert.doesNotMatch(html,/value="accept"|value="cancel"|value="approve"/);
});
