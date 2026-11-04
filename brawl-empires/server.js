'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {WebSocketServer,WebSocket}=require('ws');
const root=path.join(__dirname,'public'),rooms=new Map(),clients=new Map();
const server=http.createServer((req,res)=>{let url;try{url=new URL(req.url,'http://local')}catch{return res.writeHead(400).end()}
 if(url.pathname==='/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,rooms:rooms.size}))}
 const allowed={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/multiplayer.js':'multiplayer.js','/three.min.js':'three.min.js'};let file=allowed[url.pathname];if(!file)return res.writeHead(404).end('Not found');
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');fs.createReadStream(path.join(root,file)).pipe(res);
});
const wss=new WebSocketServer({server,path:'/ws',maxPayload:2*1024*1024});
function send(c,m){if(c?.ws.readyState===WebSocket.OPEN)c.ws.send(JSON.stringify(m))}
function broadcast(r,m,except){for(const p of r.players)if(p.id!==except)send(clients.get(p.id),m)}
function publicRoom(r){return {code:r.code,hostId:r.hostId,status:r.status,settings:r.settings,players:r.players.map(p=>({id:p.id,name:p.name,ready:p.ready,nation:p.nation,connected:p.connected!==false}))}}
function roomState(r){broadcast(r,{type:'room',room:publicRoom(r)})}
function cleanName(s){return String(s||'Commander').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,24)||'Commander'}
function settings(cfg={}){return {world:['continents','islands','pangaea'].includes(cfg.world)?cfg.world:'continents',seed:String(cfg.seed||'BRAWL-EMPIRES').slice(0,40),bots:[0,4,8,12].includes(+cfg.bots)?+cfg.bots:8,difficulty:[0,1,2].includes(+cfg.difficulty)?+cfg.difficulty:0}}
function code(){let s,chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';do{s=Array.from(crypto.randomBytes(6),x=>chars[x%chars.length]).join('')}while(rooms.has(s));return s}
function leave(c,reason='left'){let r=rooms.get(c.room);c.room=null;if(!r)return;if(r.hostId===c.id){broadcast(r,{type:'room_closed',reason:reason==='disconnected'?'The host disconnected. This prototype cannot continue without its host.':'The host ended the room.'});for(const p of r.players){let other=clients.get(p.id);if(other)other.room=null}rooms.delete(r.code);return}
 let p=r.players.find(p=>p.id===c.id);if(r.status==='match'){if(p)p.connected=false;broadcast(r,{type:'player_left',id:c.id,name:p?.name||'Player'})}else r.players=r.players.filter(p=>p.id!==c.id);roomState(r)}
function error(c,message){send(c,{type:'error',message})}
function rate(c,key,ms,max){let now=Date.now();let a=c.rates[key]||(c.rates[key]=[]);while(a.length&&a[0]<now-ms)a.shift();a.push(now);return a.length<=max}
const actions=new Set(['spawn','attack','build','naval','plane','retreat','recall','recallAll','auto']);
wss.on('connection',ws=>{let c={id:crypto.randomUUID(),ws,room:null,rates:{},alive:true};clients.set(c.id,c);send(c,{type:'hello',id:c.id});ws.on('pong',()=>c.alive=true);
 ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return error(c,'Invalid message.')};if(!m||typeof m.type!=='string')return;
 let r=rooms.get(c.room);
 if(m.type==='create'){if(!rate(c,'room',10000,5))return error(c,'Please wait before creating another room.');if(c.room)leave(c);if(rooms.size>=100)return error(c,'Server is full.');r={code:code(),hostId:c.id,status:'lobby',settings:settings(m.settings||{}),players:[{id:c.id,name:cleanName(m.name),ready:true,connected:true}],chat:[]};rooms.set(r.code,r);c.room=r.code;roomState(r);return}
 if(m.type==='join'){if(!rate(c,'join',10000,10))return error(c,'Too many attempts. Please wait.');let target=rooms.get(String(m.code||'').trim().toUpperCase());if(!target)return error(c,'Room not found. Check the six-character code.');if(target.status!=='lobby')return error(c,'This match has already started. Join a new room.');if(target.players.length>=4)return error(c,'This room is full (4 players maximum).');if(c.room===target.code)return;if(c.room)leave(c);target.players.push({id:c.id,name:cleanName(m.name),ready:false,connected:true});c.room=target.code;send(c,{type:'chat_history',messages:target.chat});roomState(target);return}
 if(m.type==='leave'){leave(c);send(c,{type:'left'});return}if(!r)return error(c,'Create or join a room first.');
 if(m.type==='config'&&c.id===r.hostId&&r.status==='lobby'){r.settings=settings(m.settings||{});roomState(r);return}
 if(m.type==='ready'&&r.status==='lobby'){let p=r.players.find(p=>p.id===c.id);p.ready=c.id===r.hostId?true:!!m.ready;roomState(r);return}
 if(m.type==='chat'){if(!rate(c,'chat',10000,8))return error(c,'Slow down: please wait before sending more chat.');let text=String(m.text||'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,250);if(!text)return;let item={id:crypto.randomUUID(),name:r.players.find(p=>p.id===c.id)?.name||'Player',text,time:Date.now()};r.chat.push(item);r.chat=r.chat.slice(-80);broadcast(r,{type:'chat',message:item});return}
 if(m.type==='start'){if(c.id!==r.hostId)return error(c,'Only the host can start.');if(r.status!=='lobby')return;if(r.players.length<2||r.players.some(p=>!p.ready))return error(c,'At least two players must join and everyone must be ready.');let cfg=m.settings||{};r.settings={world:['continents','islands','pangaea'].includes(cfg.world)?cfg.world:'continents',seed:String(cfg.seed||'BRAWL-EMPIRES').slice(0,40),bots:[0,4,8,12].includes(+cfg.bots)?+cfg.bots:8,difficulty:[0,1,2].includes(+cfg.difficulty)?+cfg.difficulty:0};r.status='match';r.players.forEach((p,i)=>p.nation=i);broadcast(r,{type:'match_start',room:publicRoom(r),settings:r.settings});return}
 if(m.type==='snapshot'){if(c.id!==r.hostId||r.status!=='match'||!rate(c,'snap',1000,10))return;broadcast(r,{type:'snapshot',state:m.state},c.id);return}
 if(m.type==='resync'&&r.status==='match'){send(clients.get(r.hostId),{type:'resync'});return}
 if(m.type==='command'){if(r.status!=='match'||!actions.has(m.action)||!rate(c,'cmd',1000,35))return;let p=r.players.find(p=>p.id===c.id);if(!p||p.connected===false)return;let d=m.data||{},safe={};if(Number.isInteger(d.t)&&d.t>=0&&d.t<138240)safe.t=d.t;if(Number.isInteger(d.target)&&d.target>=-1&&d.target<64)safe.target=d.target;if(Number.isFinite(d.ratio))safe.ratio=Math.max(.01,Math.min(1,d.ratio));if(Number.isInteger(d.source)&&d.source>=-1&&d.source<138240)safe.source=d.source;if(typeof d.kind==='string')safe.kind=d.kind.slice(0,20);if(typeof d.uid==='string')safe.uid=d.uid.slice(0,40);if(typeof d.on==='boolean')safe.on=d.on;send(clients.get(r.hostId),{type:'command',playerId:c.id,nation:p.nation,action:m.action,data:safe});return}
 if(m.type==='notice'&&c.id===r.hostId){if(!r.players.some(p=>p.id===m.to))return;send(clients.get(m.to),{type:'notice',message:String(m.message||'').slice(0,250)});return}
 if(m.type==='match_end'&&c.id===r.hostId&&r.status==='match'){r.status='finished';broadcast(r,{type:'match_end',winner:Number.isInteger(m.winner)?m.winner:-1});return}
 });ws.on('close',()=>{leave(c,'disconnected');clients.delete(c.id)});ws.on('error',()=>{});
});
const heartbeat=setInterval(()=>{for(const c of clients.values()){if(!c.alive){c.ws.terminate();continue}c.alive=false;c.ws.ping()}},15000);heartbeat.unref();
const port=Number(process.env.PORT)||3000;server.listen(port,'0.0.0.0',()=>console.log(`Brawl Empires is listening on 0.0.0.0:${port}`));
process.on('SIGTERM',()=>{for(const c of clients.values())send(c,{type:'room_closed',reason:'The server is shutting down.'});wss.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref()});
