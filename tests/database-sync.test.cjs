const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {create}=require('../test/database-sync.js');
const feed=()=>({league:{id:'cvhl-db-test'},teams:[],players:[],games:[],website_design:{title:'Saved heading'}});

test('refresh commits current view state and saved settings together',async()=>{
 let resolve,view={page:'home'},received;
 const sync=create({load:()=>new Promise(done=>resolve=done),readState:()=>view,
   commit:(data,state)=>received={data,state},onError:error=>{throw error;}});
 const pending=sync.refresh();await Promise.resolve();view={page:'schedule',team:'BUF'};resolve(feed());
 assert.equal(await pending,true);assert.deepEqual(received.state,view);
 assert.equal(received.data.website_design.title,'Saved heading');
});
test('concurrent refreshes share one request',async()=>{
 let requests=0,resolve,commits=0;
 const sync=create({load:()=>{requests++;return new Promise(done=>resolve=done);},readState:()=>({}),commit:()=>commits++,onError:()=>{}});
 const first=sync.refresh(),second=sync.refresh({background:true});assert.equal(first,second);
 await Promise.resolve();resolve(feed());await first;assert.equal(requests,1);assert.equal(commits,1);
});
test('temporary failure preserves last successful view and recovers',async()=>{
 let fail=false,commits=0,notice;
 const sync=create({load:async()=>{if(fail)throw Error('Unavailable');return feed();},readState:()=>({}),commit:()=>commits++,onError:(_,state)=>notice=state});
 await sync.refresh();fail=true;assert.equal(await sync.refresh({background:true}),false);
 assert.equal(commits,1);assert.deepEqual(notice,{background:true,hasData:true});
 fail=false;assert.equal(await sync.refresh(),true);assert.equal(commits,2);
});
test('a different league or malformed data never replaces the test website',async()=>{
 for(const data of [{...feed(),league:{id:'continental-virtual-hockey-league'}},{...feed(),teams:null}]){
  let commits=0,error;
  const sync=create({load:async()=>data,readState:()=>({}),commit:()=>commits++,onError:e=>error=e});
  assert.equal(await sync.refresh(),false);assert.equal(commits,0);assert.match(error.message,/Unexpected/);
 }
});
test('database page includes settings renderer and periodic refresh without legacy integrations',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../test/index.html'),'utf8');
 assert.match(html,/ChelDesign\?\.apply\(data.website_design\)/);
 assert.match(html,/setInterval\(refreshVisibleFeed,60000\)/);
 assert.match(html,/select.replaceChildren/);
 assert.match(html,/data-away=/);assert.match(html,/data-home=/);
 assert.doesNotMatch(html,/const divisions =/);
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../CVHL/index.html'),'utf8'),/website-design\.(js|css)|database-sync\.js/);
 for(const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});
