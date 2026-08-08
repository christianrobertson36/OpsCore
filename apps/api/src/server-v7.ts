import express from 'express';
import pg from 'pg';
import { registerEquipmentV7 } from './equipment-v7.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type Role = 'Administrator' | 'Service Desk' | 'Engineer' | 'Infrastructure' | 'Auditor' | 'Read Only';

function requireRoles(...roles:Role[]){
  return (req:any,res:any,next:any)=>{
    if(!req.authUser||!roles.includes(req.authUser.role))return res.status(403).json({error:'permission denied'});
    next();
  };
}

const originalGet=(express.application as any).get;
(express.application as any).get=function(path:any,...handlers:any[]){
  if(handlers.length===0)return originalGet.call(this,path);
  if(path==='/health'){
    const wrapped=handlers.map((handler:any)=>(req:any,res:any,next:any)=>{
      const originalJson=res.json.bind(res);
      res.json=(body:any)=>originalJson({...body,version:'v7',infrastructure:'rack-equipment-placement',equipment:'enabled'});
      return handler(req,res,next);
    });
    return originalGet.call(this,path,...wrapped);
  }
  if(path==='/api/platform'){
    const wrapped=handlers.map((handler:any)=>(req:any,res:any,next:any)=>{
      const originalJson=res.json.bind(res);
      res.json=(body:any)=>originalJson({...body,version:'v7',modules:(body?.modules||[]).map((module:any)=>module.key==='infrastructure'?{...module,status:'rack-equipment-live'}:module)});
      return handler(req,res,next);
    });
    return originalGet.call(this,path,...wrapped);
  }
  return originalGet.call(this,path,...handlers);
};

const originalListen=(express.application as any).listen;
let equipmentRegistered=false;
(express.application as any).listen=function(...args:any[]){
  if(!equipmentRegistered){
    registerEquipmentV7(this,pool,requireRoles as any);
    this.use((error:any,_req:any,res:any,_next:any)=>{
      console.error('OpsCore v7 equipment error',error);
      if(!res.headersSent)res.status(500).json({error:'internal server error'});
    });
    equipmentRegistered=true;
  }
  const last=args[args.length-1];
  if(typeof last==='function'){
    args[args.length-1]=()=>{last();console.log('OpsCore API v7 equipment placement enabled')};
  }
  return originalListen.apply(this,args);
};

await import('./server.js');
