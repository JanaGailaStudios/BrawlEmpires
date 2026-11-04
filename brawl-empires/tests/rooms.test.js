'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path');
const WebSocket=require('ws');
const port=43127;
function client(){return new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),messages=[],waiters=[];const c={ws,send:(type,data={})=>ws.send(JSON.stringify({type,...data})),next:(type,predicate=()=>true,timeout=3000)=>new Promise((resolve,reject)=>{let idx=messages.findIndex(m=>m.type===type&&predicate(m));if(idx>=0)return resolve(messages.splice(idx,1)[0]);let waiter={type,predicate,resolve,reject};waiter.timer=setTimeout(()=>{let i=waiters.indexOf(waiter);if(i>=0)waiters.splice(i,1);reject(new Error('Timed out waiting for '+type))},timeout);waiters.push(waiter)})};ws.on('message',raw=>{let m=JSON.parse(raw);let idx=waiters.findIndex(w=>w.type===m.type&&w.predicate(m));if(idx>=0){let w=waiters.splice(idx,1)[0];clearTimeout(w.timer);w.resolve(m)}else messages.push(m)});ws.once('open',()=>resolve(c));ws.once('error',reject)})}
test('room codes, capacity, chat isolation, host-only snapshots, sender identity, teardown',async()=>{
 const server=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});let peers=[];
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server did not start')),5000);server.stdout.on('data',d=>{if(String(d).includes('listening')){clearTimeout(timer);resolve()}});server.on('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code))})});
 const a=await client(),b=await client(),c=await client(),d=await client(),e=await client();peers=[a,b,c,d,e];const aid=(await a.next('hello')).id,bid=(await b.next('hello')).id;
 a.send('create',{name:'Host',settings:{bots:0,seed:'TEST',world:'islands',difficulty:0}});let r=(await a.next('room')).room;assert.match(r.code,/^[A-Z2-9]{6}$/);assert.equal(r.settings.bots,0);
 e.send('join',{name:'Missing',code:'000000'});assert.match((await e.next('error')).message,/Room not found/);
 for(const [i,p]of [b,c,d].entries()){p.send('join',{name:'Guest '+i,code:r.code});await a.next('room',m=>m.room.players.length===i+2)}
 e.send('join',{code:r.code,name:'Fifth'});assert.match((await e.next('error')).message,/full/);
 e.send('create',{name:'Other room'});await e.next('room');b.send('chat',{text:'<script>plain text only</script>'});assert.equal((await a.next('chat')).message.text,'<script>plain text only</script>');await assert.rejects(e.next('chat',()=>true,150));
 a.send('start',{settings:{bots:0}});assert.match((await a.next('error')).message,/ready/);
 for(const p of[b,c,d])p.send('ready',{ready:true});await a.next('room',m=>m.room.players.every(p=>p.ready));
 b.send('start');assert.match((await b.next('error')).message,/Only the host/);a.send('start',{settings:{bots:0,seed:'TEST'}});const match=await a.next('match_start');await b.next('match_start');assert.equal(match.room.players.length,4);
 b.send('snapshot',{state:{seq:999}});await assert.rejects(a.next('snapshot',()=>true,150));a.send('snapshot',{state:{seq:1,test:true}});assert.equal((await b.next('snapshot')).state.seq,1);
 b.send('command',{playerId:aid,nation:0,action:'build',data:{t:10,kind:'city'}});let cmd=await a.next('command');assert.equal(cmd.playerId,bid);assert.equal(cmd.nation,1);
 c.send('leave');assert.equal((await a.next('player_left')).name,'Guest 1');
 a.send('leave');assert.match((await b.next('room_closed')).reason,/host ended/);
 const health=await (await fetch(`http://127.0.0.1:${port}/health`)).json();assert.equal(health.ok,true);
 }finally{for(const p of peers)p.ws.terminate();server.kill('SIGTERM')}
});
