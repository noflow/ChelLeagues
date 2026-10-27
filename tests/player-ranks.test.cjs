const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const context = {
  window:{}, URL,
  document:{currentScript:{src:'https://chelleagues.com/player-ranks.js?v=1'},addEventListener:()=>{}}
};
vm.runInNewContext(fs.readFileSync(path.join(root,'player-ranks.js'),'utf8'),context);
const ranks = context.window.ChelRanks;
test('all 15 tiers are reachable in order, including role-specific endpoints',()=>{
  const expected = ['Silver III','Silver II','Silver I','Gold III','Gold II','Gold I','Platinum III','Platinum II','Platinum I','Diamond III','Diamond II','Diamond I','Elite III','Elite II','Elite I'];
  ranks.thresholds.forEach((score,index)=>assert.equal(ranks.rank(score,20).label,expected[index]));
  assert.equal(ranks.rank(72,20,true).label,'Silver III');
  assert.equal(ranks.rank(95,20,true).label,'Elite I');
  assert.equal(ranks.rank(-100,20).label,'Silver III');
  assert.equal(ranks.rank(150,20).label,'Elite I');
});
test('unqualified or invalid samples never receive an earned rank',()=>{
  for (const [score,gp,goalie] of [[96,0,false],[96,3,false],[95,2,true],[NaN,20,false],[96,NaN,false]]) {
    assert.equal(ranks.rank(score,gp,goalie).label,'Provisional');
  }
  assert.equal(ranks.rank(80,4).provisional,false);
  assert.equal(ranks.rank(80,3,true).provisional,false);
});
test('badge crops stay within the approved image and include accessible labels',()=>{
  const png = fs.readFileSync(path.join(root,'assets/player-ranks-v2.png'));
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  assert.equal(width,1536); assert.equal(height,1024);
  for (const score of ranks.thresholds) {
    const html = ranks.render({score,gp:20,compact:true});
    assert.match(html,/aria-label="(Silver|Gold|Platinum|Diamond|Elite) I{1,3}"/);
    assert.ok(!html.includes('OVR'));
    const [,x,y,w,h]=html.match(/viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/).map(Number);
    assert.ok(x>=0&&y>=0&&x+w<=width&&y+h<=height);
    assert.match(html,/https:\/\/chelleagues.com\/assets\/player-ranks-v2.png/);
    assert.match(html,/clipPathUnits="userSpaceOnUse"/);
    assert.match(html,/clip-path="url\(#cl-rank-crop-\d+\)"/);
  }
});
test('each league connects cards and clickable player cells to shared badges',()=>{
  for (const league of ['CVHL','NBHL','CWHL']) {
    const html=fs.readFileSync(path.join(root,league,'index.html'),'utf8');
    assert.match(html,/src="\.\.\/player-ranks.js\?v=\d+"/);
    assert.match(html,/window.ChelRanks.render/);
    assert.match(html,/isGoalie \? "goalie" : "player", name, true/);
    assert.ok(!html.includes('<strong>${overall}</strong> OVR'));
    // Check all inline scripts without executing the site's network/UI code.
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1]);
  }
});
