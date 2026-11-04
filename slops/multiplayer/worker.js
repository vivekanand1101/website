// The original relay protocol, hosted in one Durable Object per race room.
const places = new Set(['gate','aqua','pul']);
const finite = a => Array.isArray(a) && a.length >= 6 && a.length <= 8 && a.every(Number.isFinite);
export class KeraiRoom {
  constructor(ctx) {
    this.ctx=ctx;this.players=new Map();
    this.room={host:null,from:'gate',to:'pul',bots:3,racing:false,finished:[]};
    for(const ws of ctx.getWebSockets()){const p=ws.deserializeAttachment();if(p)this.players.set(p.id,{...p,ws});}
    ctx.blockConcurrencyWhile(async()=>{Object.assign(this.room,await ctx.storage.get('room')||{});if(!this.players.has(this.room.host))this.room.host=this.players.keys().next().value||null;});
  }
  send(ws,m){try{ws.send(JSON.stringify(m));}catch{}}
  all(m,except){for(const p of this.players.values())if(p.ws!==except)this.send(p.ws,m);}
  lobby(){return {t:'lobby',host:this.room.host,from:this.room.from,to:this.room.to,bots:this.room.bots,racing:this.room.racing,players:[...this.players.values()].map(({id,name})=>({id,name}))};}
  save(){return this.ctx.storage.put('room',this.room);}
  async fetch(request){
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
    if(this.players.size>=16)return new Response('Room is full',{status:429});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    const id=crypto.randomUUID(),player={id,name:'',ws:server};
    this.ctx.acceptWebSocket(server);server.serializeAttachment({id,name:''});this.players.set(id,player);
    if(!this.room.host)this.room.host=id;await this.save();
    this.send(server,{t:'hello',id});this.all(this.lobby());
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,raw){
    if(typeof raw!=='string'||raw.length>32768)return;
    let m;try{m=JSON.parse(raw);}catch{return;}
    if(!m||typeof m!=='object')return;
    const id=ws.deserializeAttachment()?.id,me=this.players.get(id),r=this.room;if(!me)return;
    if(m.t==='join'){
      me.name=String(m.name||'').slice(0,16);ws.serializeAttachment({id,name:me.name});this.all(this.lobby());
    }else if(m.t==='cfg'&&id===r.host){
      if(!places.has(m.from)||!places.has(m.to)||m.from===m.to||!Number.isInteger(m.bots)||m.bots<0||m.bots>5)return;
      Object.assign(r,{from:m.from,to:m.to,bots:m.bots});await this.save();this.all(this.lobby());
    }else if(m.t==='go'&&id===r.host){
      if(!places.has(m.from)||!places.has(m.to)||m.from===m.to||!Array.isArray(m.entrants)||m.entrants.length>21)return;
      const entrants=[];
      for(const e of m.entrants){
        if(!e||typeof e.id!=='string'||e.id.length>64||!/^#[0-9a-f]{6}$/i.test(e.color||''))return;
        const known=this.players.get(e.id);if(!known&&!e.bot)return;
        entrants.push({id:e.id,name:known?(known.name||'Rider'):String(e.name||'Bot').slice(0,32),color:e.color,...(!known?{bot:true}:{})});
      }
      if(new Set(entrants.map(e=>e.id)).size!==entrants.length||![...this.players.keys()].every(id=>entrants.some(e=>e.id===id)))return;
      Object.assign(r,{racing:true,finished:[],from:m.from,to:m.to});await this.save();this.all({t:'go',entrants,from:r.from,to:r.to,host:r.host});
    }else if(m.t==='st'&&finite(m.p)){
      const bots=id===r.host&&Array.isArray(m.bots)?m.bots.filter(b=>Array.isArray(b)&&b.length===7&&typeof b[0]==='string'&&b.slice(1).every(Number.isFinite)).slice(0,5):undefined;
      this.all({t:'st',id,p:m.p,bots},ws);
    }else if(m.t==='kick'&&(m.side==='left'||m.side==='right'))this.all({t:'kick',id,side:m.side},ws);
    else if(m.t==='kickhit'&&typeof m.to==='string'&&(m.side==='left'||m.side==='right')){
      const target=this.players.get(m.to)||this.players.get(r.host);if(target)this.send(target.ws,{t:'kickhit',from:id,to:m.to,side:m.side});
    }else if(m.t==='fin'&&r.racing&&Number.isFinite(m.time)&&m.time>=0){
      const who=id===r.host&&typeof m.id==='string'?m.id:id;
      if(!r.finished.includes(who)){r.finished.push(who);await this.save();this.all({t:'fin',id:who,time:m.time,place:r.finished.length});}
    }else if(m.t==='lobbyback'){r.racing=false;await this.save();this.all(this.lobby());}
  }
  async webSocketClose(ws){
    const id=ws.deserializeAttachment()?.id;if(!id||!this.players.has(id))return;
    this.players.delete(id);if(this.room.host===id)this.room.host=this.players.keys().next().value||null;
    this.all({t:'left',id});this.all(this.lobby());
    if(this.players.size)await this.save();else{this.room={host:null,from:'gate',to:'pul',bots:3,racing:false,finished:[]};await this.ctx.storage.deleteAll();}
    try{ws.close(1000,'Disconnected');}catch{}
  }
  webSocketError(ws){return this.webSocketClose(ws);}
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health')return Response.json({ok:true,game:'kerai-race'});
    const room=(url.searchParams.get('room')||'default').slice(0,64);
    return env.KERAI_ROOMS.get(env.KERAI_ROOMS.idFromName(room)).fetch(request);
  }
};
