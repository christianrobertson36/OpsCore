import type {Express} from 'express';
import {createHash,randomUUID} from 'node:crypto';

type DcamRequest=(path:string,options?:RequestInit)=>Promise<any>;
const text=(value:any,max=1000)=>String(value??'').trim().slice(0,max);
const hash=(value:any)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const actor=(req:any)=>req.authUser?.email||req.authUser?.name||'Core Ops user';

export async function ensurePhase17V43(pool:any){
 await pool.query(`CREATE TABLE IF NOT EXISTS shared_apps(
  app_code TEXT PRIMARY KEY,app_name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Not checked',
  last_sync_at TIMESTAMPTZ,last_error TEXT,record_count INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS shared_records(
  global_id UUID PRIMARY KEY,tenant_key TEXT NOT NULL DEFAULT 'default',record_type TEXT NOT NULL,
  source_app TEXT NOT NULL REFERENCES shared_apps(app_code),source_id TEXT NOT NULL,display_name TEXT NOT NULL,
  natural_key TEXT,source_updated_at TIMESTAMPTZ,payload JSONB NOT NULL DEFAULT '{}'::jsonb,payload_hash TEXT NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'Synced',first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_key,source_app,record_type,source_id))`);
 await pool.query(`CREATE INDEX IF NOT EXISTS idx_shared_records_type ON shared_records(tenant_key,record_type,last_seen_at DESC)`);
 await pool.query(`CREATE TABLE IF NOT EXISTS shared_activity(
  id BIGSERIAL PRIMARY KEY,event_type TEXT NOT NULL,source_app TEXT NOT NULL,record_type TEXT,global_id UUID,
  detail TEXT NOT NULL,actor TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS shared_conflicts(
  id BIGSERIAL PRIMARY KEY,record_type TEXT NOT NULL,natural_key TEXT NOT NULL,left_global_id UUID,right_global_id UUID,
  status TEXT NOT NULL DEFAULT 'Open',detail TEXT NOT NULL,detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),resolved_at TIMESTAMPTZ,
  UNIQUE(record_type,natural_key,left_global_id,right_global_id))`);
 await pool.query(`INSERT INTO shared_apps(app_code,app_name) VALUES('OPSCORE','Core Ops Workflow'),('DCAM','Digital Compliance & Asset Management') ON CONFLICT(app_code) DO UPDATE SET app_name=EXCLUDED.app_name`);
 await pool.query(`INSERT INTO schema_migrations(migration_key,description) VALUES('043-phase17','CTEC shared data platform foundation') ON CONFLICT(migration_key) DO NOTHING`);
}

function dcamRecords(remote:any){
 const rows:any[]=[];
 const add=(recordType:string,source:any,name:any,naturalKey:any=null)=>rows.push({recordType,sourceId:text(source.id,100),displayName:text(name,300)||`${recordType} ${source.id}`,naturalKey:text(naturalKey,300)||null,payload:source,sourceUpdatedAt:source.updated_at||source.updatedAt||null});
 for(const x of remote.users||[])add('User',x,x.name||x.email,x.email?.toLowerCase());
 for(const x of remote.buildings||[])add('Site',x,x.name,x.postcode?.replace(/\s/g,'').toUpperCase()||null);
 for(const x of remote.assets||[])add('Asset',x,x.asset_name||x.name,x.serial_number||x.asset_tag||null);
 for(const x of remote.workOrders||[])add('Work',x,`${x.work_order_reference||''} ${x.title||''}`.trim(),x.work_order_reference||null);
 return rows.filter(x=>x.sourceId);
}

async function syncDcam(pool:any,dcamRequest:DcamRequest,who:string){
 const started=new Date();
 try{
  const remote=await dcamRequest('/api/integration/coreops/collaboration'),records=dcamRecords(remote);
  let created=0,updated=0,unchanged=0;
  await pool.query('BEGIN');
  try{
   for(const item of records){
    const payloadHash=hash(item.payload),existing=(await pool.query(`SELECT global_id,payload_hash FROM shared_records WHERE tenant_key='default' AND source_app='DCAM' AND record_type=$1 AND source_id=$2`,[item.recordType,item.sourceId])).rows[0];
    if(!existing){
     const id=randomUUID();
     await pool.query(`INSERT INTO shared_records(global_id,record_type,source_app,source_id,display_name,natural_key,source_updated_at,payload,payload_hash) VALUES($1,$2,'DCAM',$3,$4,$5,$6,$7,$8)`,[id,item.recordType,item.sourceId,item.displayName,item.naturalKey,item.sourceUpdatedAt,item.payload,payloadHash]);
     await pool.query(`INSERT INTO shared_activity(event_type,source_app,record_type,global_id,detail,actor) VALUES('RECORD_DISCOVERED','DCAM',$1,$2,$3,$4)`,[item.recordType,id,`${item.displayName} added to shared data`,who]);created++;
    }else if(existing.payload_hash!==payloadHash){
     await pool.query(`UPDATE shared_records SET display_name=$1,natural_key=$2,source_updated_at=$3,payload=$4,payload_hash=$5,sync_state='Synced',last_seen_at=NOW() WHERE global_id=$6`,[item.displayName,item.naturalKey,item.sourceUpdatedAt,item.payload,payloadHash,existing.global_id]);
     await pool.query(`INSERT INTO shared_activity(event_type,source_app,record_type,global_id,detail,actor) VALUES('RECORD_UPDATED','DCAM',$1,$2,$3,$4)`,[item.recordType,existing.global_id,`${item.displayName} refreshed from DCAM`,who]);updated++;
    }else{await pool.query(`UPDATE shared_records SET last_seen_at=NOW(),sync_state='Synced' WHERE global_id=$1`,[existing.global_id]);unchanged++}
   }
   await pool.query(`UPDATE shared_records SET sync_state='Not seen' WHERE source_app='DCAM' AND last_seen_at < $1`,[started]);
   await pool.query(`UPDATE shared_apps SET status='Connected',last_sync_at=NOW(),last_error=NULL,record_count=$1,updated_at=NOW() WHERE app_code='DCAM'`,[records.length]);
   await pool.query(`INSERT INTO shared_activity(event_type,source_app,detail,actor) VALUES('SYNC_COMPLETED','DCAM',$1,$2)`,[`${records.length} records checked; ${created} created; ${updated} updated`,who]);
   await pool.query('COMMIT');return {ok:true,source:'DCAM',checked:records.length,created,updated,unchanged};
  }catch(error){await pool.query('ROLLBACK');throw error}
 }catch(error:any){const detail=text(error?.message||error,1000);await pool.query(`UPDATE shared_apps SET status='Error',last_error=$1,updated_at=NOW() WHERE app_code='DCAM'`,[detail]);throw error}
}

export function registerPhase17V43(app:Express,pool:any,requireRoles:any,dcamRequest:DcamRequest){
 const manage=requireRoles('Administrator','Engineer','Infrastructure');
 app.get('/api/shared-data/overview',async(_req:any,res:any,next:any)=>{try{
  const [apps,counts,activity,conflicts]=await Promise.all([
   pool.query(`SELECT * FROM shared_apps ORDER BY app_name`),
   pool.query(`SELECT record_type,COUNT(*)::int AS count,COUNT(*) FILTER(WHERE sync_state<>'Synced')::int AS attention FROM shared_records GROUP BY record_type ORDER BY record_type`),
   pool.query(`SELECT * FROM shared_activity ORDER BY created_at DESC LIMIT 40`),
   pool.query(`SELECT * FROM shared_conflicts WHERE status='Open' ORDER BY detected_at DESC LIMIT 40`)]);
  res.json({ok:true,platform:'CTEC Shared Data',apps:apps.rows,counts:counts.rows,activity:activity.rows,conflicts:conflicts.rows});
 }catch(error){next(error)}});
 app.get('/api/shared-data/records',async(req:any,res:any,next:any)=>{try{
  const type=text(req.query.type,60),source=text(req.query.source,40),search=text(req.query.search,200);const values:any[]=[];let where=`WHERE tenant_key='default'`;
  if(type){values.push(type);where+=` AND record_type=$${values.length}`}
  if(source){values.push(source);where+=` AND source_app=$${values.length}`}
  if(search){values.push(`%${search}%`);where+=` AND (display_name ILIKE $${values.length} OR natural_key ILIKE $${values.length})`}
  const rows=(await pool.query(`SELECT global_id,record_type,source_app,source_id,display_name,natural_key,sync_state,source_updated_at,last_seen_at,payload FROM shared_records ${where} ORDER BY record_type,display_name LIMIT 500`,values)).rows;res.json({ok:true,records:rows});
 }catch(error){next(error)}});
 app.post('/api/shared-data/sync/dcam',manage,async(req:any,res:any,next:any)=>{try{res.json(await syncDcam(pool,dcamRequest,actor(req)))}catch(error){next(error)}});
 app.patch('/api/shared-data/conflicts/:id',requireRoles('Administrator'),async(req:any,res:any,next:any)=>{try{const id=Number(req.params.id),status=['Resolved','Ignored'].includes(req.body?.status)?req.body.status:null;if(!Number.isInteger(id)||!status)return res.status(400).json({error:'valid conflict resolution required'});await pool.query(`UPDATE shared_conflicts SET status=$1,resolved_at=NOW() WHERE id=$2`,[status,id]);res.json({ok:true})}catch(error){next(error)}});
}
