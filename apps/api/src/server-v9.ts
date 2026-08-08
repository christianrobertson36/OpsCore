import express from 'express';
import pg from 'pg';
import { registerEquipmentV8 } from './equipment-v8.js';
import { createLicensingV9 } from './licensing-v9.js';

const {Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL});
type Role='Administrator'|'Service Desk'|'Engineer'|'Infrastructure'|'Auditor'|'Read Only';
function requireRoles(...roles:Role[]){return(req:any,res:any,next:any)=>{if(!req.authUser||!roles.includes(req.authUser.role))return res.status(403).json({error:'permission denied'});next()}}
const licensing=createLicensingV9(pool);

function productForPath(path:string){
 if(path.startsWith('/api/licensing'))return null;
 if(path.startsWith('/api/server-rooms')||path.startsWith('/api/racks')||path.startsWith('/api/rack-equipment'))return 'SERVER_MANAGER' as const;
 if(path.startsWith('/api/audits')||path.startsWith('/api/inspections')||path.startsWith('/api/evidence'))return 'DCAM' as const;
 if(path.startsWith('/api/incidents')||path.startsWith('/api/requests')||path.startsWith('/api/problems')||path.startsWith('/api/changes')||path.startsWith('/api/knowledge'))return 'OPSCORE' as const;
 return null;
}

for(const method of ['get','post','patch','put','delete'] as const){
 const original=(express.application as any)[method];
 (express.application as any)[method]=function(path:any,...handlers:any[]){
  if(handlers.length===0)return original.call(this,path);
  if(typeof path==='string'){
   if(path==='/health'&&method==='get'){
    const wrapped=handlers.map((handler:any)=>(req:any,res:any,next:any)=>{const old=res.json.bind(res);res.json=(body:any)=>old({...body,version:'v9',licensing:'enabled',products:['OPSCORE','DCAM','SERVER_MANAGER']});return handler(req,res,next)});
    return original.call(this,path,...wrapped);
   }
   if(path==='/api/platform'&&method==='get'){
    const wrapped=handlers.map((handler:any)=>(req:any,res:any,next:any)=>{const old=res.json.bind(res);res.json=(body:any)=>old({...body,version:'v9',licensing:'enabled'});return handler(req,res,next)});
    return original.call(this,path,...wrapped);
   }
   const product=productForPath(path);
   if(product){const write=method!=='get';return original.call(this,path,licensing.requireEntitlement(product,write),...handlers)}
  }
  return original.call(this,path,...handlers);
 };
}

const originalListen=(express.application as any).listen;
let registered=false;
(express.application as any).listen=function(...args:any[]){
 if(!registered){
  registerEquipmentV8(this,pool,requireRoles as any);
  licensing.registerRoutes(this,requireRoles as any);
  this.use((error:any,_req:any,res:any,_next:any)=>{console.error('OpsCore v9 extension error',error);if(!res.headersSent)res.status(500).json({error:'internal server error'})});
  licensing.ensureSchema().catch(error=>console.error('OpsCore v9 licensing initialisation failed',error));
  registered=true;
 }
 const last=args[args.length-1];if(typeof last==='function')args[args.length-1]=()=>{last();console.log('OpsCore API v9 licensing foundation enabled')};
 return originalListen.apply(this,args);
};

await import('./server.js');
