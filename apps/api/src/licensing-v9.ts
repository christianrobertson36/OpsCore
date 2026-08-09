import type express from 'express';
import type pg from 'pg';
import { randomBytes } from 'crypto';

type Role='Administrator'|'Service Desk'|'Engineer'|'Infrastructure'|'Auditor'|'Read Only';
type RequireRoles=(...roles:Role[])=>express.RequestHandler;

const PRODUCTS=['OPSCORE','DCAM','SERVER_MANAGER'] as const;
type ProductCode=typeof PRODUCTS[number];
type LimitCode='users'|'sites'|'assets';

function installationId(){return `OPS-${randomBytes(6).toString('hex').toUpperCase()}`}
function licenceKey(){const raw=randomBytes(10).toString('hex').toUpperCase();return `OPS-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}`}

export function createLicensingV9(pool:pg.Pool){
 const centralServerUrl=String(process.env.LICENSING_SERVER_URL||'').replace(/\/+$/,'');
 const centralClientSecret=String(process.env.LICENSING_CLIENT_SECRET||'');
 const centralLicenceKey=String(process.env.LICENSING_LICENCE_KEY||'');
 let ready=false;
 async function ensureSchema(){
  if(ready)return;
  await pool.query(`
   CREATE TABLE IF NOT EXISTS organisations(
    id SERIAL PRIMARY KEY,
    organisation_code VARCHAR(40) UNIQUE NOT NULL,
    name VARCHAR(180) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Active',
    installation_id VARCHAR(80) UNIQUE NOT NULL,
    licensing_mode VARCHAR(30) NOT NULL DEFAULT 'Local',
    central_server_url TEXT,
    last_licence_check_at TIMESTAMPTZ,
    last_central_check_at TIMESTAMPTZ,
    central_status VARCHAR(40) NOT NULL DEFAULT 'Not configured',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ALTER TABLE organisations ADD COLUMN IF NOT EXISTS licensing_mode VARCHAR(30) NOT NULL DEFAULT 'Local';
   ALTER TABLE organisations ADD COLUMN IF NOT EXISTS central_server_url TEXT;
   ALTER TABLE organisations ADD COLUMN IF NOT EXISTS last_licence_check_at TIMESTAMPTZ;
   ALTER TABLE organisations ADD COLUMN IF NOT EXISTS last_central_check_at TIMESTAMPTZ;
   ALTER TABLE organisations ADD COLUMN IF NOT EXISTS central_status VARCHAR(40) NOT NULL DEFAULT 'Not configured';
   CREATE TABLE IF NOT EXISTS licences(
    id SERIAL PRIMARY KEY,
    organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    licence_key VARCHAR(120) UNIQUE NOT NULL,
    licence_type VARCHAR(30) NOT NULL DEFAULT 'Trial',
    plan_name VARCHAR(60) NOT NULL DEFAULT 'Trial',
    status VARCHAR(30) NOT NULL DEFAULT 'Active',
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_ends_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    grace_ends_at TIMESTAMPTZ,
    max_users INTEGER NOT NULL DEFAULT 10,
    max_sites INTEGER NOT NULL DEFAULT 5,
    max_assets INTEGER NOT NULL DEFAULT 1000,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE TABLE IF NOT EXISTS licence_entitlements(
    id SERIAL PRIMARY KEY,
    licence_id INTEGER NOT NULL REFERENCES licences(id) ON DELETE CASCADE,
    product_code VARCHAR(60) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(licence_id,product_code)
   );
   CREATE TABLE IF NOT EXISTS licence_audit(
    id BIGSERIAL PRIMARY KEY,
    licence_id INTEGER REFERENCES licences(id) ON DELETE SET NULL,
    action VARCHAR(80) NOT NULL,
    detail TEXT DEFAULT '',
    actor VARCHAR(180) DEFAULT 'System',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
  `);
  const orgCount=Number((await pool.query('SELECT COUNT(*)::int AS count FROM organisations')).rows[0].count);
  if(orgCount===0){
   const org=(await pool.query(`INSERT INTO organisations(organisation_code,name,installation_id) VALUES('LOCAL-001','Core Ops Workflow Local Organisation',$1) RETURNING id`,[installationId()])).rows[0];
   const lic=(await pool.query(`INSERT INTO licences(organisation_id,licence_key,licence_type,plan_name,status,trial_ends_at,grace_ends_at,max_users,max_sites,max_assets,notes)
    VALUES($1,$2,'Trial','Full Suite Trial','Active',NOW()+INTERVAL '30 days',NOW()+INTERVAL '37 days',10,5,1000,'Automatically created by Core Ops Workflow licensing foundation.') RETURNING id`,[org.id,licenceKey()])).rows[0];
   for(const product of PRODUCTS)await pool.query('INSERT INTO licence_entitlements(licence_id,product_code,enabled) VALUES($1,$2,TRUE)',[lic.id,product]);
   await pool.query(`INSERT INTO licence_audit(licence_id,action,detail,actor) VALUES($1,'TRIAL_CREATED','30-day full-suite trial created automatically','System')`,[lic.id]);
  }
  ready=true;
 }

 async function audit(licenceId:number|null,action:string,detail:string,actor='System'){
  await ensureSchema();
  await pool.query('INSERT INTO licence_audit(licence_id,action,detail,actor) VALUES($1,$2,$3,$4)',[licenceId,action,detail,actor]);
 }

 async function current(){
  await ensureSchema();
  const row=(await pool.query(`SELECT l.id,l.licence_key AS "licenceKey",l.licence_type AS "licenceType",l.plan_name AS "planName",l.status,l.starts_at AS "startsAt",l.trial_ends_at AS "trialEndsAt",l.expires_at AS "expiresAt",l.grace_ends_at AS "graceEndsAt",l.max_users AS "maxUsers",l.max_sites AS "maxSites",l.max_assets AS "maxAssets",l.notes,o.id AS "organisationId",o.organisation_code AS "organisationCode",o.name AS "organisationName",o.installation_id AS "installationId",o.licensing_mode AS "licensingMode",o.central_server_url AS "centralServerUrl",o.last_licence_check_at AS "lastLicenceCheckAt",o.last_central_check_at AS "lastCentralCheckAt",o.central_status AS "centralStatus"
   FROM licences l JOIN organisations o ON o.id=l.organisation_id ORDER BY l.id DESC LIMIT 1`)).rows[0];
  if(!row)return null;
  const ent=(await pool.query('SELECT product_code AS "productCode",enabled FROM licence_entitlements WHERE licence_id=$1 ORDER BY product_code',[row.id])).rows;
  const [users,sites,assets]=await Promise.all([pool.query('SELECT COUNT(*)::int AS count FROM users WHERE active=TRUE'),pool.query("SELECT COUNT(*)::int AS count FROM sites WHERE status<>'Retired'"),pool.query('SELECT COUNT(*)::int AS count FROM assets')]);
  const now=Date.now();const trialEnd=row.trialEndsAt?new Date(row.trialEndsAt).getTime():null;const expiry=row.expiresAt?new Date(row.expiresAt).getTime():null;const grace=row.graceEndsAt?new Date(row.graceEndsAt).getTime():null;
  let effectiveStatus=row.status;let mode='Active';
  if(row.status!=='Active')mode='Blocked';
  else if(row.licenceType==='Trial'&&trialEnd&&now>trialEnd){mode=grace&&now<=grace?'Read Only':'Expired';effectiveStatus=mode==='Read Only'?'Grace':'Expired'}
  else if(expiry&&now>expiry){mode=grace&&now<=grace?'Read Only':'Expired';effectiveStatus=mode==='Read Only'?'Grace':'Expired'}
  const daysRemaining=trialEnd?Math.max(0,Math.ceil((trialEnd-now)/86400000)):null;
  await pool.query('UPDATE organisations SET last_licence_check_at=NOW(),updated_at=NOW() WHERE id=$1',[row.organisationId]);
  return {...row,status:effectiveStatus,mode,daysRemaining,lastLicenceCheckAt:new Date().toISOString(),centralConfigured:Boolean(centralServerUrl&&centralClientSecret&&centralLicenceKey),entitlements:Object.fromEntries(PRODUCTS.map(p=>[p,Boolean(ent.find((e:any)=>e.productCode===p)?.enabled)])),usage:{users:users.rows[0].count,sites:sites.rows[0].count,assets:assets.rows[0].count}};
 }

 async function entitlement(product:ProductCode){const licence=await current();return Boolean(licence&&licence.mode!=='Expired'&&licence.mode!=='Blocked'&&licence.entitlements[product])}
 async function writable(product:ProductCode){const licence=await current();return Boolean(licence&&licence.mode==='Active'&&licence.entitlements[product])}

 function requireEntitlement(product:ProductCode,write=false):express.RequestHandler{
  return async(req:any,res,next)=>{try{
   const licence=await current();
   const actor=req.authUser?.email||'Unknown user';
   if(!licence)return res.status(402).json({error:'licence required',code:'LICENCE_REQUIRED'});
   if(!licence.entitlements[product]){await audit(licence.id,'PRODUCT_BLOCKED',`${product} access denied for ${req.method} ${req.originalUrl}`,actor);return res.status(403).json({error:`${product} is not included in this licence`,code:'PRODUCT_NOT_LICENSED',product})}
   if(licence.mode==='Expired'||licence.mode==='Blocked'){await audit(licence.id,'LICENCE_BLOCKED',`${req.method} ${req.originalUrl} denied because licence mode is ${licence.mode}`,actor);return res.status(402).json({error:'licence expired or unavailable',code:'LICENCE_EXPIRED'})}
   if(write&&licence.mode==='Read Only'){await audit(licence.id,'READ_ONLY_BLOCKED',`${req.method} ${req.originalUrl} denied during read-only grace period`,actor);return res.status(403).json({error:'licence is in read-only grace period',code:'LICENCE_READ_ONLY'})}
   next();
  }catch(error){next(error)}};
 }

 function requireLimit(limit:LimitCode):express.RequestHandler{
  return async(req:any,res,next)=>{try{
   const licence=await current();
   if(!licence)return res.status(402).json({error:'licence required',code:'LICENCE_REQUIRED'});
   const map={users:{used:Number(licence.usage.users),max:Number(licence.maxUsers),label:'user'},sites:{used:Number(licence.usage.sites),max:Number(licence.maxSites),label:'site'},assets:{used:Number(licence.usage.assets),max:Number(licence.maxAssets),label:'asset'}} as const;
   const state=map[limit];
   if(state.max>0&&state.used>=state.max){
    await audit(licence.id,'LIMIT_BLOCKED',`${state.label} limit reached (${state.used}/${state.max}) for ${req.method} ${req.originalUrl}`,req.authUser?.email||'Unknown user');
    return res.status(409).json({error:`licence ${state.label} limit reached (${state.used}/${state.max})`,code:'LICENCE_LIMIT_REACHED',limit,used:state.used,max:state.max});
   }
   next();
  }catch(error){next(error)}};
 }

 async function centralCheckIn(lic:any,actor:string){
  if(!centralServerUrl||!centralClientSecret||!centralLicenceKey)return null;
  const response=await fetch(`${centralServerUrl}/api/client/check-in`,{
   method:'POST',
   headers:{'Content-Type':'application/json','X-CoreOps-Client-Secret':centralClientSecret},
   body:JSON.stringify({licenceKey:centralLicenceKey,installationId:lic.installationId,hostname:process.env.HOSTNAME||'',appVersion:'v14',usage:lic.usage||{},metadata:{product:'Core Ops Workflow'}})
  });
  const body:any=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||`Central licensing HTTP ${response.status}`);
  const remote=body.licence||{};
  await pool.query(`UPDATE licences SET licence_key=$1,licence_type=$2,plan_name=$3,status=$4,trial_ends_at=$5,expires_at=$6,grace_ends_at=$7,max_users=$8,max_sites=$9,max_assets=$10,notes=$11,updated_at=NOW() WHERE id=$12`,[
   centralLicenceKey,remote.type||lic.licenceType,remote.planName||lic.planName,remote.status||lic.status,remote.trialEndsAt||null,remote.expiresAt||null,remote.graceEndsAt||null,Math.max(1,Number(remote.maxUsers||lic.maxUsers)),Math.max(1,Number(remote.maxSites||lic.maxSites)),Math.max(1,Number(remote.maxAssets||lic.maxAssets)),'Cached from Core Ops Licensing Portal',lic.id
  ]);
  if(remote.entitlements&&typeof remote.entitlements==='object')for(const p of PRODUCTS)await pool.query(`INSERT INTO licence_entitlements(licence_id,product_code,enabled) VALUES($1,$2,$3) ON CONFLICT(licence_id,product_code) DO UPDATE SET enabled=EXCLUDED.enabled`,[lic.id,p,Boolean(remote.entitlements[p])]);
  await pool.query(`UPDATE organisations SET name=COALESCE(NULLIF($1,''),name),licensing_mode='Central',central_server_url=$2,last_central_check_at=NOW(),central_status='Connected',updated_at=NOW() WHERE id=$3`,[String(body.customer?.name||''),centralServerUrl,lic.organisationId]);
  await audit(lic.id,'CENTRAL_CHECK_IN',`Central licence synced successfully from ${centralServerUrl}`,actor);
  return body;
 }

 function registerRoutes(app:express.Application,requireRoles:RequireRoles){
  app.get('/api/licensing/status',async(_req,res,next)=>{try{res.json(await current())}catch(error){next(error)}});
  app.get('/api/licensing/audit',requireRoles('Administrator'),async(_req,res,next)=>{try{await ensureSchema();const r=await pool.query(`SELECT id,action,detail,actor,created_at AS "createdAt" FROM licence_audit ORDER BY id DESC LIMIT 100`);res.json(r.rows)}catch(error){next(error)}});
  app.get('/api/licensing/installation',requireRoles('Administrator'),async(_req,res,next)=>{try{const lic=await current();if(!lic)return res.status(404).json({error:'licence not found'});res.json({installationId:lic.installationId,licensingMode:lic.licensingMode||'Local',centralConfigured:Boolean(centralServerUrl&&centralClientSecret&&centralLicenceKey),centralServerUrl:centralServerUrl||lic.centralServerUrl||null,lastLicenceCheckAt:lic.lastLicenceCheckAt||null,lastCentralCheckAt:lic.lastCentralCheckAt||null,centralStatus:lic.centralStatus||'Not configured',product:'Core Ops Workflow',version:'v14'})}catch(error){next(error)}});
  app.post('/api/licensing/check-in',requireRoles('Administrator'),async(req:any,res,next)=>{const actor=req.authUser?.email||'Administrator';try{const lic=await current();if(!lic)return res.status(404).json({error:'licence not found'});if(!centralServerUrl||!centralClientSecret||!centralLicenceKey){await audit(lic.id,'LOCAL_CHECK_IN','Local licensing check-in completed; central licensing is not configured',actor);return res.json({ok:true,installationId:lic.installationId,mode:'Local',centralStatus:'Not configured',checkedAt:new Date().toISOString()})}try{await centralCheckIn(lic,actor);const synced=await current();return res.json({ok:true,installationId:lic.installationId,mode:'Central',centralStatus:'Connected',checkedAt:new Date().toISOString(),licence:synced})}catch(error:any){await pool.query(`UPDATE organisations SET licensing_mode='Central',central_server_url=$1,last_central_check_at=NOW(),central_status='Unavailable',updated_at=NOW() WHERE id=$2`,[centralServerUrl,lic.organisationId]);await audit(lic.id,'CENTRAL_CHECK_IN_FAILED',String(error?.message||error),actor);return res.status(502).json({error:'central licensing check-in failed',detail:String(error?.message||error),cachedLicenceRetained:true})}}catch(error){next(error)}});
  app.patch('/api/licensing',requireRoles('Administrator'),async(req:any,res,next)=>{try{
   await ensureSchema();const lic=await current();if(!lic)return res.status(404).json({error:'licence not found'});
   const type=req.body?.licenceType!==undefined?String(req.body.licenceType):lic.licenceType;const plan=req.body?.planName!==undefined?String(req.body.planName):lic.planName;const status=req.body?.status!==undefined?String(req.body.status):'Active';
   const maxUsers=req.body?.maxUsers!==undefined?Math.max(1,Number(req.body.maxUsers)):lic.maxUsers;const maxSites=req.body?.maxSites!==undefined?Math.max(1,Number(req.body.maxSites)):lic.maxSites;const maxAssets=req.body?.maxAssets!==undefined?Math.max(1,Number(req.body.maxAssets)):lic.maxAssets;
   const trialEndsAt=req.body?.trialEndsAt!==undefined?(req.body.trialEndsAt||null):lic.trialEndsAt;const expiresAt=req.body?.expiresAt!==undefined?(req.body.expiresAt||null):lic.expiresAt;
   await pool.query(`UPDATE licences SET licence_type=$1,plan_name=$2,status=$3,max_users=$4,max_sites=$5,max_assets=$6,trial_ends_at=$7,expires_at=$8,updated_at=NOW() WHERE id=$9`,[type,plan,status,maxUsers,maxSites,maxAssets,trialEndsAt,expiresAt,lic.id]);
   if(req.body?.entitlements&&typeof req.body.entitlements==='object')for(const p of PRODUCTS)if(req.body.entitlements[p]!==undefined)await pool.query(`INSERT INTO licence_entitlements(licence_id,product_code,enabled) VALUES($1,$2,$3) ON CONFLICT(licence_id,product_code) DO UPDATE SET enabled=EXCLUDED.enabled`,[lic.id,p,Boolean(req.body.entitlements[p])]);
   await audit(lic.id,'LICENCE_UPDATED','Licence settings, limits or entitlements updated',req.authUser?.email||'Administrator');
   res.json(await current());
  }catch(error){next(error)}});
 }
 return {ensureSchema,current,entitlement,writable,requireEntitlement,requireLimit,registerRoutes,products:PRODUCTS};
}
