const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const m=require('./model.cjs');const snapshot=require('./snapshot.json');
const source=fs.readFileSync(path.join(__dirname,'../CVHL/index.html'),'utf8');
const start=source.indexOf('const RATING_CFG ='),end=source.indexOf('const POSITION_CHART_COLORS',start);
if(start<0||end<0)throw Error('Live formula boundaries changed');
const playerRows=m.records(snapshot.players),goalieRows=m.records(snapshot.goalies),logRows=m.records(snapshot.skaterLog);
const oldContext={parseStatNumber:m.num,statGpValue:s=>m.num(s.GP),playerData:{cols:snapshot.players[0],rows:snapshot.players.slice(1)},goalieData:{cols:snapshot.goalies[0],rows:snapshot.goalies.slice(1)},posShort:p=>{const group=m.position(p);return group==='W'?(String(p).toLowerCase().includes('left')?'LW':'RW'):group;},buildSkaterPositionBreakdown:name=>{const counts={};logRows.filter(r=>r.Username.toLowerCase()===name.toLowerCase()).forEach(r=>{const p=m.position(r.Position);counts[p]=(counts[p]||0)+1;});return Object.entries(counts).map(([short,games])=>({short,games}));}};
vm.createContext(oldContext);vm.runInContext(source.slice(start,end),oldContext);
const results=m.evaluate(snapshot);
for(const r of results){const old=(r.role==='Goalie'?goalieRows:playerRows).find(p=>m.key(p)===r.key);if(!old)throw Error('No published comparison for '+r.name);
  if(m.num(old.GP)!==r.gp)throw Error('Published/log games mismatch for '+r.name);
  r.oldScore=oldContext.calculatePlayerOverall(old,r.role==='Goalie'?'goalie':'player',r.name);
  r.oldBadgeScore=r.role==='Goalie'?70+(r.oldScore-72)*26/23:r.oldScore;r.oldTier=m.badge(r.oldBadgeScore);r.delta=+(r.score-r.oldBadgeScore).toFixed(1);r.points=m.num(old.PTS);r.team=old.Team;
}
const summary={games:new Set(logRows.map(r=>r['Match ID'])).size,skaters:results.filter(r=>r.role==='Skater').length,goalies:results.filter(r=>r.role==='Goalie').length,qualified:results.filter(r=>r.qualified).length,groups:{}};
for(const pos of ['C','W','D','G']){const splits=results.flatMap(p=>p.splits.filter(s=>s.pos===pos).map(s=>({name:p.name,gp:s.gp,newScore:Math.round(70+26*s.composite/100),oldScore:p.oldBadgeScore})));summary.groups[pos]={count:splits.length,oldMean: +(splits.reduce((a,s)=>a+s.oldScore,0)/splits.length).toFixed(1),newMean:+(splits.reduce((a,s)=>a+s.newScore,0)/splits.length).toFixed(1)};}
fs.writeFileSync(path.join(__dirname,'comparison.json'),JSON.stringify({summary,results},null,2));
const html=fs.readFileSync(path.join(__dirname,'template.html'),'utf8').replace('/*SNAPSHOT*/',JSON.stringify({capturedAt:snapshot.capturedAt,summary,results}).replace(/</g,'\\u003c'));
fs.writeFileSync(path.join(__dirname,'index.html'),html);
console.log(JSON.stringify({summary,defense:results.filter(r=>r.splits.some(s=>s.pos==='D')).sort((a,b)=>b.delta-a.delta).slice(0,6).map(({name,oldTier,tier,delta,points})=>({name,oldTier,tier,delta,points})),largestDrops:results.filter(r=>r.role==='Skater').sort((a,b)=>a.delta-b.delta).slice(0,4).map(({name,oldTier,tier,delta})=>({name,oldTier,tier,delta}))},null,2));
