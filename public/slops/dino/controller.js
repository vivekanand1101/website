import { requestRunnerPlan } from './modules/runner-client.js';
import { mountKeySettings } from './key-settings.js';
let keys, relay = false;
const audit=[];function record(kind,details){audit.push({kind,time:Math.round(performance.now()),...details});if(audit.length>80)audit.shift();$('trace').textContent=JSON.stringify(audit);}
const $ = id => document.getElementById(id);
let runner, enabled=false, generation=0, space=false, down=false, previousLatency=250, count=0,latencies=[],failures=0,planTimers=[],planVersion=0,cleared=0,obstacleIds=new WeakMap(),nextObstacleId=1,plannedIds=new Set(),seenObstacles=new Map(),motion=new WeakMap(),policyCache=new Map(),cachedUses=0;
// Chromium's game is unchanged. Only its browser-specific sound resource hook is disabled.
Runner.prototype.loadSounds=function(){};
function keyEvent(type, code) { return {type,keyCode:code,preventDefault(){},target:runner.canvas}; }
function setSpace(held) { if(space===held)return; space=held; runner[held?'onKeyDown':'onKeyUp'](keyEvent(held?'keydown':'keyup',32)); }
function setDown(held) { if(down===held)return; down=held; runner[held?'onKeyDown':'onKeyUp'](keyEvent(held?'keydown':'keyup',40)); }
function apply(action){record('key',{action,y:runner.tRex.yPos,jumping:runner.tRex.jumping,obstacles:runner.horizon.obstacles.map(o=>({x:o.xPos,width:o.width}))});
  if(action==='tap_space'){setSpace(false);setDown(false);setSpace(true);}
  else if(action==='press_space'){setDown(false);setSpace(true);}
  else if(action==='hold_space'){}
  else if(action==='release_space'){setSpace(false);setDown(false);}
  else if(action==='duck'){setSpace(false);setDown(true);}
  else {setSpace(false);setDown(false);}
}
function snapshot(){for(const o of runner.horizon.obstacles)if(!obstacleIds.has(o))obstacleIds.set(o,nextObstacleId++);const t=runner.tRex;return {
  speedPxPerSecond:runner.currentSpeed*60, previousLatencyMs:previousLatency, expectedLatencyMs:latencies.length?[...latencies].sort((a,b)=>a-b)[Math.floor((latencies.length-1)*.75)]:350,
  physics:{gravity:t.config.GRAVITY,initialJumpVelocity:t.config.INIITAL_JUMP_VELOCITY,minJumpHeight:t.config.MIN_JUMP_HEIGHT,maxJumpY:t.config.MAX_JUMP_HEIGHT},
  dinosaur:{x:t.xPos,y:t.yPos,width:t.config.WIDTH,height:t.config.HEIGHT,groundY:t.groundYPos,jumpVelocity:t.jumpVelocity||0,jumping:t.jumping,ducking:t.ducking,spaceHeld:space,downHeld:down,reachedMinHeight:!!t.reachedMinHeight,speedDrop:!!t.speedDrop},
  obstacles:runner.horizon.obstacles.slice(0,3).filter(o=>!plannedIds.has(obstacleIds.get(o))&&(motion.get(o)?.span||0)>=40).map(o=>({id:obstacleIds.get(o),type:o.typeConfig.type,x:o.xPos,y:o.yPos,width:o.width,height:o.typeConfig.height,speedPxPerSecond:motion.get(o)?.speed||(runner.currentSpeed+(o.speedOffset||0))*60,distance:o.xPos-(t.xPos+t.config.WIDTH)}))
};}
function cancelPlan(){planVersion++;for(const timer of planTimers)clearTimeout(timer);planTimers=[];}
function policyKey(o){return `${o.typeConfig.type}:${o.yPos}:${o.width}`;}
function schedulePlan(plan,observedAt,token,cached=false){
 if(plan.obstacleIds?.length&&plan.obstacleIds.every(id=>plannedIds.has(id)))return true;
 if(!cached)for(const id of plan.obstacleIds||[]){const o=runner.horizon.obstacles.find(o=>obstacleIds.get(o)===id);const event=plan.events.find(e=>e.obstacleId===id);if(o)policyCache.set(policyKey(o),event?{action:event.action,leadMs:event.leadMs,hold:280}:{action:'pass',leadMs:200});}

 record('plan',{plan,observedAt,age:performance.now()-observedAt,state:snapshot()});
 const age=performance.now()-observedAt;
 if(!plan.events.some(e=>e.obstacleId)&&plan.events.some(e=>e.atMs<age-80))return false;
 const version=planVersion;for(const id of plan.obstacleIds||[])plannedIds.add(id);
 for(let i=0;i<plan.events.length;i++){
 const event=plan.events[i];
 if((event.action==='tap_space'||event.action==='duck')&&event.obstacleId){
  const hold=plan.events[i+1]?.action==='release_space'?plan.events[++i].atMs-event.atMs:280;
  const execute=()=>{if(!enabled||token!==generation||version!==planVersion||runner.crashed)return;
   const o=runner.horizon.obstacles.find(o=>obstacleIds.get(o)===event.obstacleId);
   if(!o)return;
   const velocity=motion.get(o)?.speed||runner.currentSpeed*60;
   const remaining=(o.xPos-runner.tRex.xPos-runner.tRex.config.WIDTH)/velocity*1000;
   if(remaining<=event.leadMs&&!runner.tRex.jumping){apply(event.action);$('action').textContent=event.action.replaceAll('_',' ');if(event.action==='duck'){const release=()=>{if(!enabled||token!==generation||version!==planVersion||runner.crashed)return;if(!runner.horizon.obstacles.includes(o)||o.xPos+o.width<runner.tRex.xPos+2)apply('release_all');else planTimers.push(setTimeout(release,12));};release();}else planTimers.push(setTimeout(()=>{if(enabled&&token===generation&&version===planVersion&&!runner.crashed)apply('release_space');},hold));}
   else planTimers.push(setTimeout(execute,12));
  };execute();
 }else planTimers.push(setTimeout(()=>{if(enabled&&token===generation&&version===planVersion&&!runner.crashed){apply(event.action);$('action').textContent=event.action.replaceAll('_',' ');}},Math.max(0,event.atMs-age)));
 }

 return true;
}
function relinquish(message){cancelPlan();enabled=false;generation++;apply('release_all');$('start').disabled=!keys?.getKey();$('stop').disabled=true;$('status').textContent=message;}
async function decide(token){
  while(enabled&&token===generation&&!runner.crashed){
    if(runner.paused){relinquish('Chrome paused the game because the tab lost focus. Return here and start another run.');return;}
    if(snapshot().obstacles.length===0){await new Promise(resolve=>setTimeout(resolve,40));continue;}
    const started=performance.now();
    try{
      const data=await requestRunnerPlan(snapshot(),keys.getKey(),keys.getSignal(),fetch,relay);
      if(!enabled||token!==generation||runner.crashed)return;
      previousLatency=Math.round(performance.now()-started);latencies.push(previousLatency);if(latencies.length>12)latencies.shift();failures=0;
      if(!data.plan){apply(data.action);}else if(!schedulePlan(data.plan,started,token)){$('status').textContent='Plan arrived too late. Requesting fresh state.';continue;}
      $('status').textContent='Jev is planning timed moves. The game keeps running.';count++;
      $('action').textContent=data.planId||data.action.replaceAll('_',' ');$('latency').textContent=previousLatency+' ms';$('count').textContent=count;

    }catch(error){if(token!==generation||!enabled)return;if(error.retryable&&failures<3){failures++;$('status').textContent='Jev is temporarily unavailable. Retrying with fresh state.';await new Promise(resolve=>setTimeout(resolve,Math.min(800,100*failures)));continue;}relinquish(error.message+' You can continue manually with Space and ArrowDown.');return;}
  }
}
$('start').onclick=()=>{
  if(!keys?.getKey()){keys?.open();return;}
  cancelPlan();plannedIds.clear();seenObstacles.clear();cleared=0;cachedUses=0;$('cached').textContent='0';generation++;if(enabled)apply('release_all');enabled=true;count=0;failures=0;space=false;down=false;previousLatency=250;
  $('cleared').textContent='0';$('count').textContent='0';$('action').textContent='—';$('latency').textContent='—';$('start').disabled=true;$('stop').disabled=false;$('status').textContent='Jev is playing. The game continues during every decision.';
  if(runner.crashed)runner.restart();
  else if(runner.paused)runner.play();
  const token=generation;
  decide(token);
};
$('stop').onclick=()=>relinquish('Your turn. Space to jump, ArrowDown to duck. The game keeps running.');
// Cancel an in-flight decision on collision; never let a late answer restart the game.
setInterval(()=>{if(runner&&enabled){for(const o of runner.horizon.obstacles){const now=performance.now(),last=motion.get(o);const samples=last?.samples||[];samples.push({x:o.xPos,time:now});while(samples.length>2&&now-samples[0].time>280)samples.shift();const first=samples[0],span=now-first.time;motion.set(o,{samples,span,speed:span>0?(first.x-o.xPos)*1000/span+8:runner.currentSpeed*54});if(!obstacleIds.has(o))obstacleIds.set(o,nextObstacleId++);if(!seenObstacles.has(o))seenObstacles.set(o,{id:obstacleIds.get(o),passed:false});}for(const o of runner.horizon.obstacles){const id=obstacleIds.get(o),policy=policyCache.get(policyKey(o));if(plannedIds.has(id)||!policy)continue;const remaining=(o.xPos-runner.tRex.xPos-runner.tRex.config.WIDTH)/(motion.get(o)?.speed||runner.currentSpeed*60)*1000;if(remaining<=policy.leadMs+90){const events=policy.action==='pass'?[]:[{atMs:0,action:policy.action,obstacleId:id,leadMs:policy.leadMs},{atMs:280,action:'release_space'}];if(policy.action==='duck')events.pop();schedulePlan({obstacleIds:[id],events},performance.now(),generation,true);cachedUses++;$('cached').textContent=cachedUses;record('cached_policy',{id,policy});}}for(const [o,record] of seenObstacles){if(!record.passed&&!runner.crashed&&o.xPos+o.width<=runner.tRex.xPos){record.passed=true;cleared++;$('cleared').textContent=cleared;}}}if(enabled&&runner?.crashed){record('crash',{state:snapshot()});relinquish('Game over. Jev crashed. Start another run or play manually.');}},50);
window.addEventListener('keydown',e=>{if(e.target?.closest?.('#key-dialog'))return;if(enabled&&(e.code==='Space'||e.code==='ArrowDown')){e.preventDefault();e.stopImmediatePropagation();}},true);
window.addEventListener('keyup',e=>{if(e.target?.closest?.('#key-dialog'))return;if(enabled&&(e.code==='Space'||e.code==='ArrowDown')){e.preventDefault();e.stopImmediatePropagation();}},true);
window.addEventListener('load',async()=>{
 const hostedRelay = document.querySelector('meta[name=game-relay]')?.content;
 if (hostedRelay === 'https://dino-jev.vivekanand1101.workers.dev/api/plan') relay = hostedRelay;
 else try { const response = await fetch('./api/config', {cache:'no-store'}); relay = response.ok && (await response.json()).relay === true; } catch {}
 runner=new Runner('.interstitial-wrapper');
 // Start running without inserting an automatic jump. Jev chooses the first Space press.
 const originalStart=$('start').onclick;
 $('start').onclick=()=>{if(!runner.activated){runner.activated=true;runner.startGame();runner.play();}originalStart();};
 const updateKey=()=>{policyCache.clear();plannedIds.clear();$('start').disabled=!keys.getKey();$('status').textContent=keys.getKey()?'Key saved. Let Jev play, or press Space to play yourself.':'No Jev key saved. Play manually with Space.';};
 keys=mountKeySettings({relay,offlineLabel:'Play manually',onOpen:()=>{if(enabled)relinquish('AI stopped while editing the key.');},onChange:()=>{if(enabled)relinquish('Key changed. Start a new Jev run when ready.');updateKey();}});
 updateKey();
});
