'use strict';
// Preview only. No live badge code imports this module.
const WEIGHTS = {C:{offense:25,defense:30,puck:25,faceoffs:15,discipline:5},W:{offense:30,defense:35,puck:25,discipline:10},D:{offense:15,defense:45,puck:30,discipline:10}};
const num = v => {const n=parseFloat(String(v??'').replace(/[%+,]/g,''));return Number.isFinite(n)?n:0;};
const records = rows => rows.slice(1).filter(r=>r.some(v=>v!=='' )).map(r=>Object.fromEntries(rows[0].map((h,i)=>[h,r[i]??''])));
const key = r => `${String(r.Username).trim().toLowerCase()}|${String(r.Platform).toLowerCase()}`;
function position(p){p=String(p).toLowerCase();return p.includes('defen')||['ld','rd','d'].includes(p)?'D':p.includes('center')||p==='c'?'C':p.includes('wing')||['lw','rw','w'].includes(p)?'W':p.includes('goal')||p==='g'?'G':null;}
function percentile(value, peers, lower=false){
  const values=peers.filter(Number.isFinite);if(!Number.isFinite(value)||values.length<2)return 50;
  const less=values.filter(v=>v<value-1e-9).length, equal=values.filter(v=>Math.abs(v-value)<1e-9).length;
  const p=100*(less+(equal-1)/2)/(values.length-1);return lower?100-p:p;
}
function quality(value,peers,opportunities,prior,lower=false){return 50+(percentile(value,peers,lower)-50)*opportunities/(opportunities+prior);}
function average(parts){const valid=parts.filter(([v])=>Number.isFinite(v));return valid.length?valid.reduce((s,[v,w])=>s+v*w,0)/valid.reduce((s,[,w])=>s+w,0):50;}
function badge(score){const bounds=[70,72,74,76,78,80,82,84,86,88,90,92,94,95,96];let level=0;bounds.forEach((b,i)=>{if(score>=b)level=i;});return ['Silver','Gold','Platinum','Diamond','Elite'][Math.floor(level/3)]+' '+['III','II','I'][level%3];}
function aggregate(rows){
  const groups=new Map(),seen=new Set();
  for(const r of rows){const pos=position(r.Position);if(!pos)throw Error(`Unknown position: ${r.Position}`);
    if(!r.Username||!r.Platform||!r['Match ID']||!r['Player ID'])throw Error('Missing player/game identity');
    const fields=pos==='G'?['Goals Against','Saves','Shots Against']:['Goals','Assists','Takeaways','Interceptions','Blocked Shots','Hits','Passes','Pass Attempts','Giveaways','Faceoff Wins','Faceoff Losses','PIMs'];
    for(const field of fields)if(String(r[field]??'').trim()===''||!Number.isFinite(Number(r[field]))||Number(r[field])<0)throw Error(`Invalid ${field} for ${r.Username}`);
    if(pos==='G'&&num(r.Saves)>num(r['Shots Against']))throw Error('Saves exceed shots');
    if(pos!=='G'&&num(r.Passes)>num(r['Pass Attempts']))throw Error('Passes exceed attempts');
    const identity=`${r['Player ID']||key(r)}|${r.Platform}|${r['Match ID']}`;
    if(seen.has(identity))throw Error(`Duplicate player game: ${identity}`);seen.add(identity);
    const k=key(r)+'|'+pos;if(!groups.has(k))groups.set(k,{key:key(r),name:r.Username,platform:r.Platform,pos,gp:0,teams:new Set(),totals:{}});
    const g=groups.get(k);g.gp++;g.teams.add(r.Team);for(const [h,v] of Object.entries(r))g.totals[h]=(g.totals[h]||0)+num(v);
  }
  return [...groups.values()];
}
function evaluate(snapshot){
  const skaters=aggregate(records(snapshot.skaterLog)), goalies=aggregate(records(snapshot.goalieLog));
  for(const g of skaters){const t=g.totals;g.metrics={points:(t.Goals+t.Assists)/g.gp,takeaways:t.Takeaways/g.gp,interceptions:t.Interceptions/g.gp,blocks:t['Blocked Shots']/g.gp,hits:Math.min(5,t.Hits/g.gp),pass:t['Pass Attempts']?t.Passes/t['Pass Attempts']:null,giveaways:t.Giveaways/g.gp,faceoffs:(t['Faceoff Wins']+t['Faceoff Losses'])?t['Faceoff Wins']/(t['Faceoff Wins']+t['Faceoff Losses']):null,pim:t.PIMs/g.gp};}
  for(const g of skaters){const cohort=skaters.filter(p=>p.pos===g.pos);const q=(m,opp=g.gp,prior=4,lower=false)=>g.metrics[m]===null?null:quality(g.metrics[m],cohort.map(p=>p.metrics[m]),opp,prior,lower);
    g.categories={offense:q('points'),defense:average([[q('interceptions'),35],[q('takeaways'),35],[q('blocks'),20],[q('hits'),10]]),puck:average([[q('pass',g.totals['Pass Attempts'],30),60],[q('giveaways',g.gp,4,true),40]]),faceoffs:q('faceoffs',g.totals['Faceoff Wins']+g.totals['Faceoff Losses'],30),discipline:q('pim',g.gp,4,true)};
    // Missing opportunities redistribute within the category / position, never score zero.
    g.composite=average(Object.entries(WEIGHTS[g.pos]).map(([k,w])=>[g.categories[k],w]));g.peerCount=cohort.length;
  }
  const combined=new Map();for(const g of skaters){if(!combined.has(g.key))combined.set(g.key,{key:g.key,name:g.name,role:'Skater',gp:0,splits:[]});let p=combined.get(g.key);p.gp+=g.gp;p.splits.push({...g,teams:[...g.teams]});}
  const results=[...combined.values()].map(p=>({...p,position:p.splits.map(s=>`${s.pos} (${s.gp})`).join(' / '),composite:p.splits.reduce((sum,s)=>sum+s.composite*s.gp,0)/p.gp}));
  for(const g of goalies){const t=g.totals;g.metrics={save:t['Shots Against']?t.Saves/t['Shots Against']:null,gaa:t['Goals Against']/g.gp};}
  for(const g of goalies){g.categories={save:g.metrics.save===null?null:quality(g.metrics.save,goalies.map(p=>p.metrics.save),g.totals['Shots Against'],50),gaa:quality(g.metrics.gaa,goalies.map(p=>p.metrics.gaa),g.gp,4,true)};g.composite=average([[g.categories.save,70],[g.categories.gaa,20]]);g.peerCount=goalies.length;results.push({key:g.key,name:g.name,role:'Goalie',gp:g.gp,position:'G',composite:g.composite,splits:[{...g,teams:[...g.teams]}]});}
  return results.map(p=>({...p,score:Math.round(70+26*p.composite/100),qualified:p.gp>=(p.role==='Goalie'?3:4)})).map(p=>({...p,tier:badge(p.score)}));
}
module.exports={WEIGHTS,num,records,key,position,percentile,quality,average,badge,aggregate,evaluate};
