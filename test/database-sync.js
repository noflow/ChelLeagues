/* Database-test feed refreshes: one request at a time, preserving current view state. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.ChelDatabaseSync=factory();
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  function create({load,readState,commit,onError}){
    let inFlight=null,hasData=false;
    function refresh({background=false}={}){
      if(inFlight)return inFlight;
      inFlight=Promise.resolve().then(load).then(data=>{
        if(data?.league?.id!=='cvhl-db-test'||!['teams','players','games'].every(key=>Array.isArray(data[key])))
          throw Error('Unexpected database test feed.');
        // Read at commit time: navigation may change while a request is pending.
        commit(data,readState(),{background});
        hasData=true;
        return true;
      }).catch(error=>{
        onError(error,{background,hasData});
        return false;
      }).finally(()=>{inFlight=null;});
      return inFlight;
    }
    return {refresh};
  }
  return {create};
});
