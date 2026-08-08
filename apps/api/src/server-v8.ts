import express from 'express';
import pg from 'pg';
import { registerEquipmentV8 } from './equipment-v8.js';

const {Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL});
type Role='Administrator'|'Service Desk'|'Engineer'|'Infrastructure'|'Auditor'|'Read Only';
function requireRoles(...roles:Role[]){return(req:any,res:any,next:any)=>{if(!req.authUser||!roles.includes(req.authUser.role))return res.status(403).json({error:'permission denied'});next()}}

const originalGet=(express.application as any).get;
(express.application as any).get=function(path:any,...handlers:any[]){
 if(handlers.length===0)return originalGet.call(this,path);
 if(path==='/health'){
  const wrapped=handlers.map((handler:any)=>(req:any,res:any,next:any)=>{const old=res.json.bind(res);res.json=(body:any)=>old({...body,version:'v8',infrastructure:'advanced-rack-placement',equipment:'half-u-depth-aware'});return handler(req,res,next)});
  return originalGet.call(this,path,...wrapped);
 }
 if(path==='/api/platform'){
  const wrapped=handlers.map((handler:any)=>(req:any,res:any,next:any)=>{const old=res.json.bind(res);res.json=(body:any)=>old({...body,version:'v8',modules:(body?.modules||[]).map((m:any)=>m.key==='infrastructure'?{...m,status:'advanced-rack-placement-live'}:m)});return handler(req,res,next)});
  return originalGet.call(this,path,...wrapped);
 }
 return originalGet.call(this,path,...handlers);
};

const originalListen=(express.application as any).listen;
let registered=false;
(express.application as any).listen=function(...args:any[]){
 if(!registered){registerEquipmentV8(this,pool,requireRoles as any);registered=true}
 const last=args[args.length-1];if(typeof last==='function')args[args.length-1]=()=>{last();console.log('OpsCore API v8 advanced rack placement enabled')};
 return originalListen.apply(this,args);
};

await import('./server.js');
