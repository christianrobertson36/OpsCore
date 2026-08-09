import express from 'express';
import pg from 'pg';
import crypto from 'crypto';
import path from 'path';
import {fileURLToPath} from 'url';

const {Pool}=pg;
const app=express();
const port=Number(process.env.PORT||5060);
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const adminToken=String(process.env.LICENSING_ADMIN_TOKEN||'');
const adminPassword=String(process.env.LICENSING_ADMIN_PASSWORD||adminToken||'');
const clientSecret=String(process.env.LICENSING_CLIENT_SECRET||'');
const sessionTtlMs=8*60*60*1000;
const sessions=new Map();
const __dirname=path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({limit:'256kb'}));

function licenceKey(){const raw=crypto.randomBytes(10).toString('hex').toUpperCase();return `COW-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}`}
function secureEqual(a,b){const aa=Buffer.from(String(a));const bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)}
function parseCookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const p=v.indexOf('=');return p<0?[v,'']:[v.slice(0,p),decodeURIComponent(v.slice(p+1))]}))}
function sessionFrom(req){const id=parseCookies(req).coreops_licensing_session;if(!id)return null;const s=sessions.get(id);if(!s||s.expiresAt<Date.now()){if(id)sessions.delete(id);return null}return s}
function requireAdmin(req,res,next){const bearer=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(adminToken&&bearer&&secureEqual(bearer,adminToken))return next();if(sessionFrom(req))return next();return res.status(401).json({error:'unauthorised'})}
function requireClient(req,res,next){if(!clientSecret)return res.status(503).json({error:'licensing client secret not configured'});if(!secureEqual(String(req.headers['x-coreops-client-secret']||''),clientSecret))return res.status(401).json({error:'unauthorised installation'});next()}

async function ensureSchema(){
 await pool.query(`
 CREATE TABLE IF NOT EXISTS licensing_customers(
  id SERIAL PRIMARY KEY,
  customer_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(180) NOT NULL,
  contact_email VARCHAR(180) DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'Active',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS central_licences(
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES licensing_customers(id) ON DELETE CASCADE,
  licence_key VARCHAR(120) UNIQUE NOT NULL,
  licence_type VARCHAR(30) NOT NULL DEFAULT 'Trial',
  plan_name VARCHAR(80) NOT NULL DEFAULT 'Full Suite Trial',
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
 CREATE TABLE IF NOT EXISTS central_entitlements(
  id SERIAL PRIMARY KEY,
  licence_id INTEGER NOT NULL REFERENCES central_licences(id) ON DELETE CASCADE,
  product_code VARCHAR(60) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(licence_id,product_code)
 );
 CREATE TABLE IF NOT EXISTS central_installations(
  id BIGSERIAL PRIMARY KEY,
  licence_id INTEGER NOT NULL REFERENCES central_licences(id) ON DELETE CASCADE,
  installation_id VARCHAR(100) UNIQUE NOT NULL,
  hostname VARCHAR(180) DEFAULT '',
  app_version VARCHAR(60) DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'Active',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ip VARCHAR(100) DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
 );
 CREATE TABLE IF NOT EXISTS central_licence_audit(
  id BIGSERIAL PRIMARY KEY,
  licence_id INTEGER REFERENCES central_licences(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  detail TEXT DEFAULT '',
  actor VARCHAR(180) DEFAULT 'System',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 `);
}

async function audit(licenceId,action,detail,actor='System'){await pool.query('INSERT INTO central_licence_audit(licence_id,action,detail,actor) VALUES($1,$2,$3,$4)',[licenceId,action,detail,actor])}
async function getLicenceByKey(key){
 const r=await pool.query(`SELECT l.*,c.customer_code,c.name AS customer_name,c.status AS customer_status FROM central_licences l JOIN licensing_customers c ON c.id=l.customer_id WHERE l.licence_key=$1`,[key]);
 if(!r.rowCount)return null;
 const row=r.rows[0];
 const ent=(await pool.query('SELECT product_code,enabled FROM central_entitlements WHERE licence_id=$1 ORDER BY product_code',[row.id])).rows;
 return {...row,entitlements:Object.fromEntries(ent.map(e=>[e.product_code,e.enabled]))};
}
function effective(lic){
 const now=Date.now();const trial=lic.trial_ends_at?new Date(lic.trial_ends_at).getTime():null;const expiry=lic.expires_at?new Date(lic.expires_at).getTime():null;const grace=lic.grace_ends_at?new Date(lic.grace_ends_at).getTime():null;
 let mode='Active';let status=lic.status;
 if(lic.customer_status!=='Active'||lic.status!=='Active')mode='Blocked';
 else if(lic.licence_type==='Trial'&&trial&&now>trial){mode=grace&&now<=grace?'Read Only':'Expired';status=mode==='Read Only'?'Grace':'Expired'}
 else if(expiry&&now>expiry){mode=grace&&now<=grace?'Read Only':'Expired';status=mode==='Read Only'?'Grace':'Expired'}
 return {mode,status};
}

app.get('/health',async(_req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,app:'Core Ops Licensing Portal',version:'v2',database:'connected',gui:'admin-session'})}catch{res.status(503).json({ok:false,app:'Core Ops Licensing Portal',version:'v2',database:'unavailable'})}});

app.post('/api/admin/login',(req,res)=>{if(!adminPassword)return res.status(503).json({error:'licensing admin password not configured'});const password=String(req.body?.password||'');if(!secureEqual(password,adminPassword))return res.status(401).json({error:'invalid password'});const id=crypto.randomBytes(32).toString('hex');sessions.set(id,{createdAt:Date.now(),expiresAt:Date.now()+sessionTtlMs});res.setHeader('Set-Cookie',`coreops_licensing_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionTtlMs/1000)}`);res.json({ok:true,expiresIn:Math.floor(sessionTtlMs/1000),version:'v2'})});
app.get('/api/admin/session',(req,res)=>res.json({authenticated:Boolean(sessionFrom(req)),version:'v2'}));
app.post('/api/admin/logout',(req,res)=>{const id=parseCookies(req).coreops_licensing_session;if(id)sessions.delete(id);res.setHeader('Set-Cookie','coreops_licensing_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');res.json({ok:true})});

app.get('/api/admin/customers',requireAdmin,async(_req,res,next)=>{try{const r=await pool.query(`SELECT c.*,COUNT(DISTINCT l.id)::int AS licence_count,COUNT(DISTINCT i.id)::int AS installation_count FROM licensing_customers c LEFT JOIN central_licences l ON l.customer_id=c.id LEFT JOIN central_installations i ON i.licence_id=l.id GROUP BY c.id ORDER BY c.name`);res.json(r.rows)}catch(e){next(e)}});
app.post('/api/admin/customers',requireAdmin,async(req,res,next)=>{try{const {customerCode,name,contactEmail='',notes=''}=req.body||{};if(!customerCode||!name)return res.status(400).json({error:'customerCode and name required'});const r=await pool.query(`INSERT INTO licensing_customers(customer_code,name,contact_email,notes) VALUES($1,$2,$3,$4) RETURNING *`,[String(customerCode).trim(),String(name).trim(),String(contactEmail).trim(),String(notes)]);res.status(201).json(r.rows[0])}catch(e){next(e)}});
app.patch('/api/admin/customers/:id',requireAdmin,async(req,res,next)=>{try{const id=Number(req.params.id);const old=(await pool.query('SELECT * FROM licensing_customers WHERE id=$1',[id])).rows[0];if(!old)return res.status(404).json({error:'customer not found'});const b=req.body||{};const r=await pool.query(`UPDATE licensing_customers SET customer_code=$1,name=$2,contact_email=$3,status=$4,notes=$5,updated_at=NOW() WHERE id=$6 RETURNING *`,[String(b.customerCode??old.customer_code).trim(),String(b.name??old.name).trim(),String(b.contactEmail??old.contact_email).trim(),String(b.status??old.status),String(b.notes??old.notes),id]);res.json(r.rows[0])}catch(e){next(e)}});

app.get('/api/admin/licences',requireAdmin,async(_req,res,next)=>{try{const r=await pool.query(`SELECT l.*,c.customer_code,c.name AS customer_name,(SELECT COUNT(*)::int FROM central_installations i WHERE i.licence_id=l.id) AS installation_count,(SELECT COALESCE(jsonb_object_agg(e.product_code,e.enabled),'{}'::jsonb) FROM central_entitlements e WHERE e.licence_id=l.id) AS entitlements FROM central_licences l JOIN licensing_customers c ON c.id=l.customer_id ORDER BY l.id DESC`);res.json(r.rows)}catch(e){next(e)}});
app.post('/api/admin/licences',requireAdmin,async(req,res,next)=>{try{const b=req.body||{};if(!b.customerId)return res.status(400).json({error:'customerId required'});const key=licenceKey();const type=b.licenceType||'Trial';const trialDays=Math.max(1,Number(b.trialDays||30));const r=await pool.query(`INSERT INTO central_licences(customer_id,licence_key,licence_type,plan_name,status,trial_ends_at,grace_ends_at,expires_at,max_users,max_sites,max_assets,notes) VALUES($1,$2,$3,$4,'Active',CASE WHEN $3='Trial' THEN NOW()+($5||' days')::interval ELSE NULL END,CASE WHEN $3='Trial' THEN NOW()+(($5+7)||' days')::interval ELSE NULL END,$6,$7,$8,$9,$10) RETURNING *`,[Number(b.customerId),key,type,String(b.planName||'Full Suite Trial'),trialDays,b.expiresAt||null,Math.max(1,Number(b.maxUsers||10)),Math.max(1,Number(b.maxSites||5)),Math.max(1,Number(b.maxAssets||1000)),String(b.notes||'')]);const lic=r.rows[0];const ent=b.entitlements||{OPSCORE:true,DCAM:true,SERVER_MANAGER:true};for(const p of ['OPSCORE','DCAM','SERVER_MANAGER'])await pool.query('INSERT INTO central_entitlements(licence_id,product_code,enabled) VALUES($1,$2,$3)',[lic.id,p,Boolean(ent[p])]);await audit(lic.id,'LICENCE_CREATED',`${type} licence created`,'Portal Administrator');res.status(201).json({...lic,entitlements:ent})}catch(e){next(e)}});
app.patch('/api/admin/licences/:id',requireAdmin,async(req,res,next)=>{try{const id=Number(req.params.id);const existing=(await pool.query('SELECT * FROM central_licences WHERE id=$1',[id])).rows[0];if(!existing)return res.status(404).json({error:'licence not found'});const b=req.body||{};await pool.query(`UPDATE central_licences SET licence_type=$1,plan_name=$2,status=$3,trial_ends_at=$4,expires_at=$5,grace_ends_at=$6,max_users=$7,max_sites=$8,max_assets=$9,notes=$10,updated_at=NOW() WHERE id=$11`,[b.licenceType??existing.licence_type,b.planName??existing.plan_name,b.status??existing.status,b.trialEndsAt??existing.trial_ends_at,b.expiresAt??existing.expires_at,b.graceEndsAt??existing.grace_ends_at,Math.max(1,Number(b.maxUsers??existing.max_users)),Math.max(1,Number(b.maxSites??existing.max_sites)),Math.max(1,Number(b.maxAssets??existing.max_assets)),b.notes??existing.notes,id]);if(b.entitlements)for(const p of ['OPSCORE','DCAM','SERVER_MANAGER'])if(b.entitlements[p]!==undefined)await pool.query(`INSERT INTO central_entitlements(licence_id,product_code,enabled) VALUES($1,$2,$3) ON CONFLICT(licence_id,product_code) DO UPDATE SET enabled=EXCLUDED.enabled`,[id,p,Boolean(b.entitlements[p])]);await audit(id,'LICENCE_UPDATED','Licence settings updated','Portal Administrator');res.json(await getLicenceByKey(existing.licence_key))}catch(e){next(e)}});

app.get('/api/admin/installations',requireAdmin,async(_req,res,next)=>{try{const r=await pool.query(`SELECT i.*,l.licence_key,c.name AS customer_name,c.customer_code FROM central_installations i JOIN central_licences l ON l.id=i.licence_id JOIN licensing_customers c ON c.id=l.customer_id ORDER BY i.last_seen_at DESC`);res.json(r.rows)}catch(e){next(e)}});
app.get('/api/admin/audit',requireAdmin,async(_req,res,next)=>{try{const r=await pool.query(`SELECT a.*,l.licence_key,c.name AS customer_name FROM central_licence_audit a LEFT JOIN central_licences l ON l.id=a.licence_id LEFT JOIN licensing_customers c ON c.id=l.customer_id ORDER BY a.id DESC LIMIT 250`);res.json(r.rows)}catch(e){next(e)}});

app.post('/api/client/check-in',requireClient,async(req,res,next)=>{try{const {licenceKey:key,installationId,hostname='',appVersion='',usage={},metadata={}}=req.body||{};if(!key||!installationId)return res.status(400).json({error:'licenceKey and installationId required'});const lic=await getLicenceByKey(String(key));if(!lic)return res.status(404).json({error:'licence not found',code:'LICENCE_NOT_FOUND'});const state=effective(lic);await pool.query(`INSERT INTO central_installations(licence_id,installation_id,hostname,app_version,last_ip,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(installation_id) DO UPDATE SET licence_id=EXCLUDED.licence_id,hostname=EXCLUDED.hostname,app_version=EXCLUDED.app_version,last_seen_at=NOW(),last_ip=EXCLUDED.last_ip,metadata=EXCLUDED.metadata`,[lic.id,String(installationId),String(hostname),String(appVersion),String(req.ip||''),JSON.stringify({usage,metadata})]);await audit(lic.id,'INSTALLATION_CHECK_IN',`${installationId} checked in as ${appVersion||'unknown version'}`,String(installationId));res.json({ok:true,licenceKey:lic.licence_key,customer:{code:lic.customer_code,name:lic.customer_name},licence:{type:lic.licence_type,planName:lic.plan_name,status:state.status,mode:state.mode,trialEndsAt:lic.trial_ends_at,expiresAt:lic.expires_at,graceEndsAt:lic.grace_ends_at,maxUsers:lic.max_users,maxSites:lic.max_sites,maxAssets:lic.max_assets,entitlements:lic.entitlements},serverTime:new Date().toISOString()})}catch(e){next(e)}});

app.use('/portal',express.static(path.join(__dirname,'public'),{etag:true,maxAge:0}));
app.get('/',(_req,res)=>res.redirect('/portal/'));
app.use((e,_req,res,_next)=>{console.error('Licensing portal error',e);if(!res.headersSent)res.status(500).json({error:'internal server error'})});

ensureSchema().then(()=>app.listen(port,'0.0.0.0',()=>console.log(`Core Ops Licensing Portal v2 listening on ${port}`))).catch(e=>{console.error('Licensing portal startup failed',e);process.exit(1)});
