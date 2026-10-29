const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('CVHL/player-centre.js','utf8');
const helpers=src.slice(src.indexOf('  const E ='),src.indexOf('  let token'))+src.slice(src.indexOf('  const hidden ='),src.indexOf('  function statCards'));
function render(claim){const ctx=vm.createContext({p:{joined:true,link:null,claim,details:{},choices:[{key:'p',name:'Player'}]}});return vm.runInContext(helpers+';profileView(p)',ctx);}
test('pending claims show approval message and no claim form',()=>{const html=render({status:'pending',name:'<Player>'});assert.ok(html.includes('Waiting for league approval'));assert.ok(html.includes('&lt;Player&gt;'));assert.ok(!html.includes('data-action="claim"'));assert.ok(!html.includes('Submit player claim'));});
test('rejected and new claims show the player selection form',()=>{for(const claim of [null,{status:'rejected',name:'Player'}]){const html=render(claim);assert.ok(html.includes('data-action="claim"'));assert.ok(html.includes('Submit player claim'));assert.ok(!html.includes('Waiting for league approval'));}});
