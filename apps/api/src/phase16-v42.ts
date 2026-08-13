import type {Express} from 'express';

type DcamRequest = (path:string,options?:RequestInit)=>Promise<any>;
const clean=(value:any,max=500)=>String(value??'').trim().slice(0,max);
const positive=(value:any)=>{const n=Number(value);return Number.isInteger(n)&&n>0?n:null};

export async function ensurePhase16V42(pool:any){
 await pool.query(`CREATE TABLE IF NOT EXISTS dcam_user_mappings(id BIGSERIAL PRIMARY KEY,coreops_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,dcam_user_id BIGINT NOT NULL,dcam_email TEXT NOT NULL,dcam_name TEXT NOT NULL DEFAULT '',match_method TEXT NOT NULL DEFAULT 'manual',created_by TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(coreops_user_id),UNIQUE(dcam_user_id))`);
 await pool.query(`CREATE TABLE IF NOT EXISTS dcam_workflow_handoffs(id BIGSERIAL PRIMARY KEY,source_type TEXT NOT NULL CHECK(source_type IN ('Incident','Request')),source_id TEXT NOT NULL,dcam_work_order_id BIGINT NOT NULL,dcam_reference TEXT NOT NULL,dcam_status TEXT NOT NULL DEFAULT 'Open',dcam_assigned_user_id BIGINT,dcam_assigned_user_name TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(source_type,source_id),UNIQUE(dcam_work_order_id))`);
 await pool.query(`CREATE INDEX IF NOT EXISTS idx_dcam_handoffs_work_order ON dcam_workflow_handoffs(dcam_work_order_id)`);
 await pool.query(`INSERT INTO schema_migrations(migration_key,description) VALUES('042-phase16','Shared DCAM users and workflow handoffs') ON CONFLICT(migration_key) DO NOTHING`);
}

export function registerPhase16V42(app:Express,pool:any,requireRoles:any,dcamRequest:DcamRequest){
 const admin=requireRoles('Administrator'),workflow=requireRoles('Administrator','Service Desk','Engineer','Infrastructure');
 app.get('/api/dcam/collaboration',async(_req:any,res:any,next:any)=>{try{
  const remote=await dcamRequest('/api/integration/coreops/collaboration');
  const [users,mappings]=await Promise.all([pool.query(`SELECT id,email,name,role,active FROM users ORDER BY active DESC,name`),pool.query(`SELECT * FROM dcam_user_mappings ORDER BY dcam_name,dcam_email`)]);
  const remoteOrders=Array.isArray(remote.workOrders)?remote.workOrders:[];
  for(const order of remoteOrders)await pool.query(`UPDATE dcam_workflow_handoffs SET dcam_status=$1,dcam_assigned_user_id=$2,dcam_assigned_user_name=$3,last_synced_at=NOW() WHERE dcam_work_order_id=$4`,[clean(order.status,60)||'Open',positive(order.assigned_user_id),clean(order.assigned_user_name,200),positive(order.id)]);
  const handoffs=(await pool.query(`SELECT * FROM dcam_workflow_handoffs ORDER BY created_at DESC LIMIT 250`)).rows;
  res.json({ok:true,source:'DCAM',checkedAt:remote.checkedAt,coreopsUsers:users.rows,dcamUsers:remote.users||[],workOrders:remoteOrders,buildings:remote.buildings||[],assets:remote.assets||[],mappings:mappings.rows,handoffs});
 }catch(error){next(error)}});
 app.post('/api/dcam/user-mappings',admin,async(req:any,res:any,next:any)=>{try{
  const coreopsUserId=positive(req.body?.coreopsUserId),dcamUserId=positive(req.body?.dcamUserId),remote=await dcamRequest('/api/integration/coreops/collaboration');
  const local=coreopsUserId?(await pool.query('SELECT id,email,name FROM users WHERE id=$1',[coreopsUserId])).rows[0]:null,dcam=(remote.users||[]).find((x:any)=>Number(x.id)===dcamUserId);
  if(!local||!dcam)return res.status(400).json({error:'invalid shared user mapping'});
  await pool.query('DELETE FROM dcam_user_mappings WHERE coreops_user_id=$1 OR dcam_user_id=$2',[coreopsUserId,dcamUserId]);
  const method=clean(local.email,250).toLowerCase()===clean(dcam.email,250).toLowerCase()?'email':'manual';
  const row=(await pool.query(`INSERT INTO dcam_user_mappings(coreops_user_id,dcam_user_id,dcam_email,dcam_name,match_method,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[coreopsUserId,dcamUserId,clean(dcam.email,250),clean(dcam.name,200),method,req.authUser?.email||'Administrator'])).rows[0];
  res.status(201).json({ok:true,mapping:row});
 }catch(error){next(error)}});
 app.delete('/api/dcam/user-mappings/:id',admin,async(req:any,res:any,next:any)=>{try{const id=positive(req.params.id);if(!id)return res.status(400).json({error:'invalid mapping id'});await pool.query('DELETE FROM dcam_user_mappings WHERE id=$1',[id]);res.json({ok:true})}catch(error){next(error)}});
 app.post('/api/dcam/handoffs',workflow,async(req:any,res:any,next:any)=>{try{
  const sourceType=clean(req.body?.sourceType,20),sourceId=clean(req.body?.sourceId,40);if(!['Incident','Request'].includes(sourceType)||!sourceId)return res.status(400).json({error:'incident or request is required'});
  const table=sourceType==='Incident'?'incidents':'service_requests',record=(await pool.query(`SELECT * FROM ${table} WHERE number=$1 LIMIT 1`,[sourceId])).rows[0];if(!record)return res.status(404).json({error:`${sourceType.toLowerCase()} not found`});
  const existing=(await pool.query('SELECT * FROM dcam_workflow_handoffs WHERE source_type=$1 AND source_id=$2',[sourceType,sourceId])).rows[0];if(existing)return res.status(409).json({error:'record already handed off to DCAM',handoff:existing});
  const priority=sourceType==='Incident'?({P1:'Urgent',P2:'High',P3:'Normal',P4:'Low'} as any)[record.priority]||'Normal':'Normal';
  const remote=await dcamRequest('/api/integration/coreops/handoffs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceType,sourceId,title:clean(record.title,300),description:clean(record.description||`Core Ops ${sourceType} ${sourceId}`,4000),priority,buildingId:positive(req.body?.buildingId),assetId:positive(req.body?.assetId),assignedUserId:positive(req.body?.dcamUserId),dueDate:clean(req.body?.dueDate,10)||null,actor:req.authUser?.email||req.authUser?.name||'Core Ops user'})});
  const order=remote.workOrder;if(!order?.id)throw new Error('DCAM did not return a work order');
  const row=(await pool.query(`INSERT INTO dcam_workflow_handoffs(source_type,source_id,dcam_work_order_id,dcam_reference,dcam_status,dcam_assigned_user_id,dcam_assigned_user_name,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[sourceType,sourceId,order.id,clean(order.work_order_reference,80),clean(order.status,60)||'Open',positive(order.assigned_user_id),clean(order.assigned_user_name,200),req.authUser?.email||'Core Ops user'])).rows[0];
  await pool.query(`INSERT INTO workflow_history(record_type,record_id,action,detail,actor) VALUES($1,$2,'DCAM_HANDOFF',$3,$4)`,[sourceType,sourceId,`Created DCAM work order ${order.work_order_reference}`,req.authUser?.email||'Core Ops user']);res.status(201).json({ok:true,handoff:row,workOrder:order});
 }catch(error){next(error)}});
}
