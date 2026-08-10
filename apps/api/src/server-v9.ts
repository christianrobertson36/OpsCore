import express from 'express';
import pg from 'pg';
import { registerEquipmentV8 } from './equipment-v8.js';
import { createLicensingV9 } from './licensing-v9.js';
import {ensureEnterpriseModulesV18,registerEnterpriseModulesV18} from './enterprise-modules-v18.js';
import {registerDcamBridgeV20} from './dcam-bridge-v20.js';

const {Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL});
type Role='Administrator'|'Service Desk'|'Engineer'|'Infrastructure'|'Auditor'|'Read Only';
function requireRoles(...roles:Role[]){return(req:any,res:any,next:any)=>{if(!req.authUser||!roles.includes(req.authUser.role))return res.status(403).json({error:'permission denied'});next()}}
const licensing=createLicensingV9(pool);
const centralServerUrl=String(process.env.LICENSING_SERVER_URL||'').replace(/\/+$/,'');
const centralClientSecret=String(process.env.LICENSING_CLIENT_SECRET||'');
const API_VERSION='v20';
const WEB_VERSION='v23';
const PRODUCTS=['OPSCORE','DCAM','SERVER_MANAGER'] as const;

function productForPath(path:string){
 if(path.startsWith('/api/licensing')||path.startsWith('/api/reporting'))return null;
 if(path.startsWith('/api/server-rooms')||path.startsWith('/api/racks')||path.startsWith('/api/rack-equipment'))return 'SERVER_MANAGER' as const;
 if(path.startsWith('/api/dcam')||path.startsWith('/api/audits')||path.startsWith('/api/inspections')||path.startsWith('/api/evidence'))return 'DCAM' as const;
 if(path.startsWith('/api/incidents')||path.startsWith('/api/requests')||path.startsWith('/api/problems')||path.startsWith('/api/changes')||path.startsWith('/api/knowledge')||path.startsWith('/api/projects')||path.startsWith('/api/procurement'))return 'OPSCORE' as const;
 return null;
}

function limitForPath(path:string,method:string){
 if(method!=='post')return null;
 if(path==='/api/users')return 'users' as const;
 if(path==='/api/sites')return 'sites' as const;
 if(path==='/api/assets')return 'assets' as const;
 return null;
}

async function activateCentralLicence(key:string,actor:string){
 if(!centralServerUrl||!centralClientSecret)throw new Error('central licensing server is not configured');
 const lic:any=await licensing.current();
 if(!lic)throw new Error('local licence not found');
 const response=await fetch(`${centralServerUrl}/api/client/check-in`,{
  method:'POST',headers:{'Content-Type':'application/json','X-CoreOps-Client-Secret':centralClientSecret},
  body:JSON.stringify({licenceKey:key,installationId:lic.installationId,hostname:process.env.HOSTNAME||'',appVersion:API_VERSION,usage:lic.usage||{},metadata:{product:'Core Ops Workflow',activation:'admin-ui',webVersion:WEB_VERSION,apiVersion:API_VERSION}})
 });
 const body:any=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(body.error||`Central licensing HTTP ${response.status}`);
 const remote=body.licence||{};
 const cachedStatus=remote.status==='Grace'||remote.status==='Expired'?'Active':(remote.status||'Active');
 await pool.query(`UPDATE licences SET licence_key=$1,licence_type=$2,plan_name=$3,status=$4,trial_ends_at=$5,expires_at=$6,grace_ends_at=$7,max_users=$8,max_sites=$9,max_assets=$10,notes=$11,updated_at=NOW() WHERE id=$12`,[key,remote.licenceType||remote.type||lic.licenceType,remote.planName||lic.planName,cachedStatus,remote.trialEndsAt||null,remote.expiresAt||null,remote.graceEndsAt||null,Math.max(1,Number(remote.maxUsers||lic.maxUsers)),Math.max(1,Number(remote.maxSites||lic.maxSites)),Math.max(1,Number(remote.maxAssets||lic.maxAssets)),'Activated and cached from Core Ops Licensing Portal',lic.id]);
 if(remote.entitlements&&typeof remote.entitlements==='object')for(const p of PRODUCTS)await pool.query(`INSERT INTO licence_entitlements(licence_id,product_code,enabled) VALUES($1,$2,$3) ON CONFLICT(licence_id,product_code) DO UPDATE SET enabled=EXCLUDED.enabled`,[lic.id,p,Boolean(remote.entitlements[p])]);
 await pool.query(`UPDATE organisations SET name=COALESCE(NULLIF($1,''),name),licensing_mode='Central',central_server_url=$2,last_central_check_at=NOW(),central_status='Connected',updated_at=NOW() WHERE id=$3`,[String(body.customer?.name||''),centralServerUrl,lic.organisationId]);
 await pool.query(`INSERT INTO licence_audit(licence_id,action,detail,actor) VALUES($1,'CENTRAL_ACTIVATION',$2,$3)`,[lic.id,`Central licence ${key} activated from ${centralServerUrl}`,actor]);
 return {...body,installationId:lic.installationId};
}

for(const method of ['get','post','patch','put','delete'] as const){
 const original=(express.application as any)[method];
 (express.application as any)[method]=function(path:any,...handlers:any[]){
  if(handlers.length===0)return original.call(this,path);
  if(typeof path==='string'){
   if(path==='/health'&&method==='get'){
    const wrapped=handlers.map((handler:any)=>(req:any,res:any,next:any)=>{const old=res.json.bind(res);res.json=(body:any)=>old({...body,app:'Core Ops Workflow API',version:API_VERSION,webVersion:WEB_VERSION,licensing:'activation-and-sync',limits:'enforced',installation:'tracked',enterpriseModules:'complete',dcamBridge:'live-read-only-identity',products:['OPSCORE','DCAM','SERVER_MANAGER']});return handler(req,res,next)});
    return original.call(this,path,...wrapped);
   }
   if(path==='/api/platform'&&method==='get'){
    const wrapped=handlers.map((handler:any)=>(req:any,res:any,next:any)=>{const old=res.json.bind(res);res.json=(body:any)=>old({...body,brand:'Core Ops Workflow',version:API_VERSION,webVersion:WEB_VERSION,licensing:'activation-and-sync',limits:'enforced',enterpriseModules:'complete',dcamBridge:'live-read-only-identity'});return handler(req,res,next)});
    return original.call(this,path,...wrapped);
   }
   const middleware:any[]=[];
   const product=productForPath(path);
   if(product)middleware.push(licensing.requireEntitlement(product,method!=='get'));
   const limit=limitForPath(path,method);
   if(limit)middleware.push(licensing.requireLimit(limit));
   if(middleware.length)return original.call(this,path,...middleware,...handlers);
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
  registerEnterpriseModulesV18(this,pool,requireRoles as any);
  registerDcamBridgeV20(this,pool,requireRoles as any);
  this.get('/api/licensing/activation',requireRoles('Administrator'),async(_req:any,res:any,next:any)=>{try{const lic:any=await licensing.current();if(!lic)return res.status(404).json({error:'licence not found'});const centralKey=String(lic.licenceKey||'').startsWith('COW-')?String(lic.licenceKey):'';res.json({serverConfigured:Boolean(centralServerUrl&&centralClientSecret),centralServerUrl:centralServerUrl||null,activated:Boolean(centralKey),licenceKeyMasked:centralKey?`${centralKey.slice(0,8)}••••${centralKey.slice(-4)}`:null,centralStatus:lic.centralStatus||'Not configured',lastCentralCheckAt:lic.lastCentralCheckAt||null,version:API_VERSION,webVersion:WEB_VERSION})}catch(error){next(error)}});
  this.post('/api/licensing/activate',requireRoles('Administrator'),async(req:any,res:any)=>{const actor=req.authUser?.email||'Administrator';try{const current:any=await licensing.current();const supplied=String(req.body?.licenceKey||'').trim().toUpperCase();const stored=String(current?.licenceKey||'').startsWith('COW-')?String(current.licenceKey):'';const key=supplied||stored;if(!/^COW-[A-Z0-9-]{8,}$/i.test(key))return res.status(400).json({error:'enter a valid COW licence key'});const result=await activateCentralLicence(key,actor);res.json({ok:true,centralStatus:'Connected',checkedAt:new Date().toISOString(),licenceKeyMasked:`${key.slice(0,8)}••••${key.slice(-4)}`,customer:result.customer,licence:result.licence,versions:{web:WEB_VERSION,api:API_VERSION}})}catch(error:any){const current:any=await licensing.current().catch(()=>null);if(current)await pool.query(`UPDATE organisations SET licensing_mode='Central',central_server_url=$1,last_central_check_at=NOW(),central_status='Unavailable',updated_at=NOW() WHERE id=$2`,[centralServerUrl||null,current.organisationId]).catch(()=>{});res.status(502).json({error:'central licence activation failed',detail:String(error?.message||error),cachedLicenceRetained:true})}});
  this.use((error:any,_req:any,res:any,_next:any)=>{console.error('Core Ops Workflow v20 extension error',error);if(!res.headersSent)res.status(500).json({error:'internal server error'})});
  Promise.all([licensing.ensureSchema(),ensureEnterpriseModulesV18(pool)]).catch(error=>console.error('Core Ops Workflow v20 initialisation failed',error));
  registered=true;
 }
 const last=args[args.length-1];if(typeof last==='function')args[args.length-1]=()=>{last();console.log('Core Ops Workflow API v20 DCAM identity bridge enabled')};
 return originalListen.apply(this,args);
};

await import('./server.js');