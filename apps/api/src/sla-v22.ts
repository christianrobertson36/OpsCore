import type {Express} from 'express';

type RoleMiddleware=(...roles:any[])=>any;

export async function ensureSlaV22(pool:any){
  await pool.query(`CREATE TABLE IF NOT EXISTS sla_policies(
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    record_type VARCHAR(20) NOT NULL DEFAULT 'Incident',
    priority VARCHAR(10) NOT NULL DEFAULT 'P3',
    response_minutes INTEGER NOT NULL DEFAULT 240,
    resolution_minutes INTEGER NOT NULL DEFAULT 1440,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT DEFAULT '',
    created_by TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS sla_records(
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT NOT NULL REFERENCES sla_policies(id) ON DELETE CASCADE,
    record_type VARCHAR(20) NOT NULL,
    record_id TEXT NOT NULL,
    title TEXT DEFAULT '',
    priority VARCHAR(10) DEFAULT '',
    status VARCHAR(30) DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    response_due_at TIMESTAMPTZ,
    resolution_due_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    response_state VARCHAR(20) NOT NULL DEFAULT 'Running',
    resolution_state VARCHAR(20) NOT NULL DEFAULT 'Running',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(record_type,record_id,policy_id)
  );`);
}

async function refreshStates(pool:any){
  await pool.query(`UPDATE sla_records SET
    response_state=CASE WHEN responded_at IS NOT NULL AND responded_at<=response_due_at THEN 'Met' WHEN responded_at IS NOT NULL OR response_due_at<NOW() THEN 'Breached' ELSE 'Running' END,
    resolution_state=CASE WHEN resolved_at IS NOT NULL AND resolved_at<=resolution_due_at THEN 'Met' WHEN resolved_at IS NOT NULL OR resolution_due_at<NOW() THEN 'Breached' ELSE 'Running' END,
    updated_at=NOW()`);
}

function clean(v:any,max=500){return String(v??'').trim().slice(0,max)}
function mins(v:any,fallback:number){const n=Number(v);return Number.isInteger(n)&&n>0?n:fallback}

export function registerSlaV22(app:Express,pool:any,requireRoles:RoleMiddleware){
  const write=requireRoles('Administrator','Service Desk');

  app.get('/api/sla/summary',async(_req:any,res:any,next:any)=>{try{await refreshStates(pool);const p=await pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE enabled)::int enabled FROM sla_policies`);const r=await pool.query(`SELECT COUNT(*)::int tracked,COUNT(*) FILTER(WHERE response_state='Breached' OR resolution_state='Breached')::int breached,COUNT(*) FILTER(WHERE response_state='Running' OR resolution_state='Running')::int running,COUNT(*) FILTER(WHERE response_state='Met' AND resolution_state='Met')::int met FROM sla_records`);res.json({ok:true,summary:{...p.rows[0],...r.rows[0]}})}catch(e){next(e)}});
  app.get('/api/sla/policies',async(_req:any,res:any,next:any)=>{try{const r=await pool.query('SELECT * FROM sla_policies ORDER BY record_type,priority,name');res.json({ok:true,policies:r.rows})}catch(e){next(e)}});
  app.get('/api/sla/records',async(_req:any,res:any,next:any)=>{try{await refreshStates(pool);const r=await pool.query(`SELECT s.*,p.name policy_name FROM sla_records s JOIN sla_policies p ON p.id=s.policy_id ORDER BY s.resolution_due_at ASC NULLS LAST LIMIT 500`);res.json({ok:true,records:r.rows})}catch(e){next(e)}});

  app.post('/api/sla/policies',write,async(req:any,res:any,next:any)=>{try{const b=req.body||{};const name=clean(b.name,160),recordType=clean(b.recordType,20)||'Incident';if(!name)return res.status(400).json({error:'name required'});if(!['Incident','Request'].includes(recordType))return res.status(400).json({error:'invalid record type'});const r=await pool.query(`INSERT INTO sla_policies(name,record_type,priority,response_minutes,resolution_minutes,enabled,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[name,recordType,clean(b.priority,10)||'P3',mins(b.responseMinutes,240),mins(b.resolutionMinutes,1440),b.enabled!==false,clean(b.description,1000),req.authUser?.email||req.authUser?.name||'Core Ops']);res.status(201).json({ok:true,policy:r.rows[0]})}catch(e){next(e)}});
  app.patch('/api/sla/policies/:id',write,async(req:any,res:any,next:any)=>{try{const old=(await pool.query('SELECT * FROM sla_policies WHERE id=$1',[req.params.id])).rows[0];if(!old)return res.status(404).json({error:'SLA policy not found'});const b=req.body||{};const r=await pool.query(`UPDATE sla_policies SET name=$1,record_type=$2,priority=$3,response_minutes=$4,resolution_minutes=$5,enabled=$6,description=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,[clean(b.name,160)||old.name,clean(b.recordType,20)||old.record_type,clean(b.priority,10)||old.priority,mins(b.responseMinutes,old.response_minutes),mins(b.resolutionMinutes,old.resolution_minutes),b.enabled===undefined?old.enabled:Boolean(b.enabled),b.description===undefined?old.description:clean(b.description,1000),req.params.id]);res.json({ok:true,policy:r.rows[0]})}catch(e){next(e)}});
  app.delete('/api/sla/policies/:id',requireRoles('Administrator'),async(req:any,res:any,next:any)=>{try{await pool.query('DELETE FROM sla_policies WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});

  app.post('/api/sla/sync',write,async(_req:any,res:any,next:any)=>{try{const policies=(await pool.query('SELECT * FROM sla_policies WHERE enabled=TRUE')).rows;for(const p of policies){const rows=p.record_type==='Incident'?(await pool.query('SELECT id,title,priority,status,created_at FROM incidents WHERE priority=$1',[p.priority])).rows:(await pool.query('SELECT id,title,priority,status,created_at FROM requests WHERE priority=$1',[p.priority])).rows;for(const row of rows){const started=new Date(row.created_at||Date.now());const responseDue=new Date(started.getTime()+Number(p.response_minutes)*60000);const resolutionDue=new Date(started.getTime()+Number(p.resolution_minutes)*60000);const closed=['Closed','Resolved','Completed','Fulfilled'].includes(String(row.status));await pool.query(`INSERT INTO sla_records(policy_id,record_type,record_id,title,priority,status,started_at,response_due_at,resolution_due_at,resolved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(record_type,record_id,policy_id) DO UPDATE SET title=EXCLUDED.title,priority=EXCLUDED.priority,status=EXCLUDED.status,resolved_at=CASE WHEN EXCLUDED.resolved_at IS NOT NULL THEN COALESCE(sla_records.resolved_at,EXCLUDED.resolved_at) ELSE sla_records.resolved_at END,updated_at=NOW()`,[p.id,p.record_type,String(row.id),row.title||'',row.priority||'',row.status||'',started,responseDue,resolutionDue,closed?new Date():null])}}await refreshStates(pool);res.json({ok:true})}catch(e){next(e)}});
  app.post('/api/sla/records/:id/respond',write,async(req:any,res:any,next:any)=>{try{const r=await pool.query('UPDATE sla_records SET responded_at=COALESCE(responded_at,NOW()),updated_at=NOW() WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'SLA record not found'});await refreshStates(pool);res.json({ok:true})}catch(e){next(e)}});
}
