const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(viewer){
  const elements=new Map();
  const el=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',checked:false,addEventListener(){}});return elements.get(id)};
  const context={document:{getElementById:el},location:{search:viewer?'?view=public':''},localStorage:{getItem:()=> 'signed-in-token'},URLSearchParams,Date,Map,
    setInterval(){},window:{}};
  vm.createContext(context);
  const source=fs.readFileSync(__dirname+'/draft-board.js','utf8').replace('  refresh(true);\n})();',
    '  window.draw=value=>{board=value;render();};\n})();');
  vm.runInContext(source,context);
  return {draw:context.window.draw,el};
}
function data(mode){return {season:{id:1,name:'Test Season'},status:'open',settings:{mode,minimum_bid:10,bid_increment:5},team_id:1,
  managed_teams:[{id:1,name:'New York'}],teams:[{id:1,name:'New York'}],players:[{id:10,name:'Player <One>',primary:'C',secondary:'LW'}],
  turn:{team_id:1,round:1,pick:1},scouting:[{player_id:10,note:'PRIVATE <notes>',priority:1,highlighted_by:'Manager'}],
  nominations:mode==='snake'?[]:[{player_id:10,closes_at:new Date(Date.now()+60000).toISOString(),amount:10,team_id:1}],order:[1],awards:[]};}
test('private highlights and notes follow eligible players in every format',()=>{
  for(const mode of ['snake','batch_bid','live_auction']){
    const {draw,el}=setup(false);draw(data(mode));
    const html=el('board-players').innerHTML;
    assert.match(html,/highlighted/);assert.match(html,/Top Pick/);assert.match(html,/PRIVATE &lt;notes&gt;/);
    assert.match(html,mode==='snake'?/Draft player/:/Place bid/);
  }
});
test('viewer never displays scouting even with a stored sign-in or accidental private fields',()=>{
  const {draw,el}=setup(true);draw(data('live_auction'));
  const html=el('board-players').innerHTML;
  assert.doesNotMatch(html,/PRIVATE|Top Pick|highlighted|Place bid|Nominate player/);
  assert.match(html,/Highest bid/);assert.equal(el('team-picker').hidden,true);
});
