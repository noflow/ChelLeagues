const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('CVHL/player-centre.js','utf8');
const functions=source.slice(source.indexOf('  const E ='),source.indexOf('  let token'))+
  source.slice(source.indexOf('  const hidden ='),source.indexOf('  const pill ='))+
  source.slice(source.indexOf('  let draftData='),source.indexOf('  setInterval(tickDraft'));
function base(){return {enabled:true,admin:false,can_pick:true,team:'AAA',salary:0,error:'',server_time:'2030-01-01T00:00:00Z',
  players:[{id:1,name:'<unsafe>',position:'C',availability:'All'}],history:[],draft:{order:['AAA','BBB'],cursor:0,round:1,pick:1,turn_key:'turn',next_team:'AAA',original_team:'BBB',season_label:'Season 2',complete:false,busy:false,draft_paused:false,ownership_error:'',clock:{seconds:120,deadline:'2030-01-01T00:02:00Z',paused:false,expired:false}}};}
function context(extra={}){return vm.createContext({data:base(),...extra});}
function render(data){const c=context({data});vm.runInContext(functions+';html=draftView(data);',c);return c.html;}
test('website renders escaped pick choices, original ownership, and admin-only controls',()=>{
  const data=base(),html=render(data);assert.ok(html.includes('&lt;unsafe&gt;'));assert.ok(!html.includes('<unsafe>'));
  assert.ok(html.includes('data-action="draft-pick"'));assert.ok(html.includes('BBB original pick'));
  assert.ok(!html.includes('data-action="draft-pause"'));
  data.admin=true;assert.ok(render(data).includes('Pause draft'));
  data.draft.draft_paused=true;data.draft.clock.on_break=true;data.can_pick=false;
  const paused=render(data);assert.ok(paused.includes('Resume draft'));assert.ok(!paused.includes('data-action="draft-pick"'));
});
test('server-time clock expires, break time stays frozen, and stale updates disable picking',()=>{
  let now=0;const button={disabled:false},sync={},display={classList:{toggle(){}},textContent:''};
  const root={querySelector:s=>s==='.pc-draft-clock'?display:s==='#pc-draft-sync'?sync:s==='[data-draft-pick]'?button:null,querySelectorAll:()=>[]};
  const c=context({root,active:true,tab:'draft',busy:false,performance:{now:()=>now}});
  vm.runInContext(functions+";draftData=data;draftServerTime=Date.parse(data.server_time);tickDraft();",c);
  assert.equal(display.textContent,'2:00');assert.equal(button.disabled,false);
  now=16000;vm.runInContext('tickDraft()',c);assert.equal(button.disabled,true);assert.match(sync.textContent,/delayed/);
  now=120000;vm.runInContext('draftReceivedAt=performance.now();draftServerTime+=120000;tickDraft()',c);
  assert.equal(display.textContent,'Time expired');assert.equal(button.disabled,true);
  vm.runInContext('data.draft.clock={seconds:120,on_break:true,remaining:85};tickDraft()',c);assert.equal(display.textContent,'Paused · 1:25');
});
test('polling preserves player selection on unchanged turns and ignores responses after leaving draft',async()=>{
  let resolve;let rendered=0;const select={value:'1'},content={set innerHTML(value){rendered++;}};
  const root={querySelector:s=>s==='select[name="auction_id"]'?select:s==='#pc-content'?content:null,querySelectorAll:()=>[]};
  const c=context({root,active:true,tab:'draft',busy:false,token:'session',viewGeneration:1,document:{hidden:false},performance:{now:()=>0},call:()=>new Promise(r=>{resolve=r;})});
  vm.runInContext(functions+';receiveDraft(data);',c);assert.equal(select.value,'1');
  const pending=vm.runInContext('refreshDraft()',c);c.tab='profile';resolve(base());await pending;assert.equal(rendered,1);
  c.tab='draft';c.data={...base(),draft:{...base().draft,turn_key:'next'}};select.value='';vm.runInContext('receiveDraft(data)',c);assert.equal(select.value,'');
});
test('all league scripts parse and have identical website draft behaviour',()=>{
  for(const league of ['CVHL','NBHL','CWHL']){const code=fs.readFileSync(league+'/player-centre.js','utf8');new vm.Script(code);assert.equal(code,source);}
});
