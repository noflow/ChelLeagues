const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('CVHL/player-centre.js','utf8');
function render(data){
  const context=vm.createContext({data});
  vm.runInContext(source.slice(source.indexOf('  const E ='),source.indexOf('  let token'))+source.slice(source.indexOf('  const hidden ='),source.indexOf('  const pill ='))+source.slice(source.indexOf('  let tradeData;'),source.indexOf('  let draftData='))+';html=tradeView(data);',context);
  return context.html;
}
const base={team:'AAA',teams:[{abbr:'AAA',name:'Own team'},{abbr:'BBB',name:'Other team'}],players:[{name:'<unsafe>',team:'AAA',salary:100},{name:'Other',team:'BBB',salary:200}],picks_enabled:false,picks:[],offers:[]};
test('manager trade controls escape names and use separate touch-friendly package inputs',()=>{
 const html=render(base);assert.ok(html.includes('&lt;unsafe&gt;'));assert.ok(!html.includes('<unsafe>'));
 assert.ok(html.includes('type="checkbox" name="players_from_proposer"'));assert.ok(!html.includes('picks_from_proposer'));
 assert.ok(!html.includes('value="AAA"'));assert.ok(html.includes('value="BBB"'));
 const multiple=new FormData();multiple.append('players_from_proposer','One');multiple.append('players_from_proposer','Two');
 assert.deepEqual(new URLSearchParams(multiple).getAll('players_from_proposer'),['One','Two']);
 assert.ok(source.includes("new FormData(form)"));assert.ok(!source.includes('Object.fromEntries(new FormData(form))'));
});
test('incoming offers have accept/decline and sent offers have cancel, with future picks when enabled',()=>{
 const offer={id:'id',proposing_team:'BBB',receiving_team:'AAA',status:'pending_team',players_from_proposer:['Other'],players_from_receiver:['Own'],picks_from_proposer:[{label:'Season 3 Round 2'}],status_label:'Awaiting decision',next_action:'Review'};
 let html=render({...base,picks_enabled:true,picks:[{id:'p',owner_team:'AAA',label:'Season 4 Round 1'}],offers:[offer]});
 assert.ok(html.includes('picks_from_proposer'));assert.ok(html.includes('Season 3 Round 2'));assert.ok(html.includes('value="accept"'));assert.ok(html.includes('value="decline"'));assert.ok(!html.includes('value="cancel"'));
 html=render({...base,offers:[{...offer,proposing_team:'AAA',receiving_team:'BBB'}]});assert.ok(html.includes('value="cancel"'));assert.ok(!html.includes('value="accept"'));
 html=render({...base,offers:[{...offer,status:'accepted_team'}]});assert.ok(!html.includes('data-action="trade-decision"'));
});
test('all three league sites receive the same trading behaviour',()=>{
 for(const league of ['NBHL','CWHL'])assert.equal(fs.readFileSync(league+'/player-centre.js','utf8'),source);
});

test('trade admins see pending reviews and escaped persistent history separately',()=>{
 const context=vm.createContext({data:{error:'',offers:[{id:'pending',status:'accepted_team',proposing_team:'AAA',receiving_team:'BBB',players_from_proposer:['<player>'],picks_from_receiver:[{label:'Season 4 Round 1'}]},{id:'done',status:'approved',reviewed_by:'Reviewer',reviewed_at:'2026-10-28',admin_note:'<note>',status_label:'Completed'}]}});
 vm.runInContext(source.slice(source.indexOf('  const E ='),source.indexOf('  let token'))+source.slice(source.indexOf('  const hidden ='),source.indexOf('  const pill ='))+source.slice(source.indexOf('  function tradeReviewView'),source.indexOf('  let draftData='))+';html=tradeReviewView(data);',context);
 assert.ok(context.html.includes('1 pending'));assert.equal((context.html.match(/data-action="trade-review"/g)||[]).length,1);
 for(const text of ['&lt;player&gt;','Season 4 Round 1','Reviewer','2026-10-28','&lt;note&gt;','Recent trade history','value="approve"','value="reject"'])assert.ok(context.html.includes(text),text);
 assert.ok(source.includes('profile.can_review_trades ?'));
});
