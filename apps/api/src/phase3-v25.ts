import type {Express} from 'express';
type Roles=(...roles:any[])=>any;
const clean=(v:any,n=3000)=>String(v??'').trim().slice(0,n);

export async function ensurePhase3V25(pool:any){await pool.query(`
 ALTER TABLE incidents ADD COLUMN IF NOT EXISTS major_incident BOOLEAN NOT NULL DEFAULT FALSE;
 ALTER TABLE incidents ADD COLUMN IF NOT EXISTS escalation_level INTEGER NOT NULL DEFAULT 0;
 ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
 ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30) NOT NULL DEFAULT 'Not Required';
 ALTER TABLE changes ADD COLUMN IF NOT EXISTS requested_by TEXT DEFAULT '';
 ALTER TABLE changes ADD COLUMN IF NOT EXISTS approved_by TEXT DEFAULT '';
 ALTER TABLE monitoring_events ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
 ALTER TABLE monitoring_events ADD COLUMN IF NOT EXISTS acknowledged_by TEXT DEFAULT '';
 ALTER TABLE monitoring_events ADD COLUMN IF NOT EXISTS incident_number TEXT DEFAULT '';
 ALTER TABLE sla_records ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
 ALTER TABLE sla_records ADD COLUMN IF NOT EXISTS paused_minutes INTEGER NOT NULL DEFAULT 0;
 ALTER TABLE sla_records ADD COLUMN IF NOT EXISTS pause_reason TEXT DEFAULT '';
 CREATE TABLE IF NOT EXISTS record_comments(
  id BIGSERIAL PRIMARY KEY,record_type VARCHAR(30) NOT NULL,record_id TEXT NOT NULL,
  comment_type VARCHAR(20) NOT NULL DEFAULT 'Work note',body TEXT NOT NULL,is_public BOOLEAN NOT NULL DEFAULT FALSE,
  author TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE INDEX IF NOT EXISTS idx_record_comments_record ON record_comments(record_type,record_id,created_at DESC);
 CREATE TABLE IF NOT EXISTS approval_tasks(
  id BIGSERIAL PRIMARY KEY,record_type VARCHAR(30) NOT NULL,record_id TEXT NOT NULL,
  stage VARCHAR(80) NOT NULL DEFAULT 'Manager approval',status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  approver TEXT DEFAULT '',decision_note TEXT DEFAULT '',requested_by TEXT DEFAULT '',decided_by TEXT DEFAULT '',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),decided_at TIMESTAMPTZ);
 CREATE INDEX IF NOT EXISTS idx_approval_tasks_status ON approval_tasks(status,requested_at DESC);
 CREATE TABLE IF NOT EXISTS audit_events(
  id BIGSERIAL PRIMARY KEY,record_type VARCHAR(30) NOT NULL,record_id TEXT NOT NULL,
  action VARCHAR(100) NOT NULL,before_data JSONB,after_data JSONB,actor TEXT DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE INDEX IF NOT EXISTS idx_audit_events_record ON audit_events(record_type,record_id,created_at DESC);
 CREATE TABLE IF NOT EXISTS workflow_categories(
  id BIGSERIAL PRIMARY KEY,record_type VARCHAR(30) NOT NULL,name TEXT NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,
  default_group TEXT DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(record_type,name));
 INSERT INTO workflow_categories(record_type,name,default_group) VALUES
 ('Incident','Service','Service Desk'),('Incident','Infrastructure','Infrastructure'),('Request','Access','Service Desk'),('Request','Hardware','Service Desk') ON CONFLICT DO NOTHING;
`)}

export function registerPhase3V25(app:Express,pool:any,requireRoles:Roles){
 const service=requireRoles('Administrator','Service Desk','Engineer','Infrastructure');
 const approver=requireRoles('Administrator','Service Desk');
 const admin=requireRoles('Administrator');
 const actor=(req:any)=>req.authUser?.email||req.authUser?.name||'Core Ops';
 const audit=(type:string,id:string,action:string,before:any,after:any,user:string)=>pool.query(`INSERT INTO audit_events(record_type,record_id,action,before_data,after_data,actor) VALUES($1,$2,$3,$4,$5,$6)`,[type,id,action,before?JSON.stringify(before):null,after?JSON.stringify(after):null,user]);

 app.get('/api/my-work',async(req:any,res:any,next:any)=>{try{const name=req.authUser?.name||'',email=req.authUser?.email||'',role=req.authUser?.role||'';const [i,r,a]=await Promise.all([
  pool.query(`SELECT number id,title,status,priority,assignee,assignment_group "assignmentGroup",updated_at "updatedAt",'Incident' type FROM incidents WHERE status NOT IN ('Resolved','Closed') AND (assignee IN ($1,$2) OR assignment_group=$3 OR $3='Administrator') ORDER BY priority,updated_at DESC LIMIT 100`,[name,email,role]),
  pool.query(`SELECT number id,title,status,priority,assignee,assignment_group "assignmentGroup",updated_at "updatedAt",'Request' type FROM service_requests WHERE status NOT IN ('Fulfilled','Closed','Cancelled') AND (assignee IN ($1,$2) OR assignment_group=$3 OR $3='Administrator') ORDER BY priority,updated_at DESC LIMIT 100`,[name,email,role]),
  pool.query(`SELECT id,record_type "recordType",record_id "recordId",stage,status,approver,requested_at "requestedAt" FROM approval_tasks WHERE status='Pending' AND (approver IN ('',$1,$2) OR $3='Administrator') ORDER BY requested_at`,[name,email,role])]);res.json({work:[...i.rows,...r.rows],approvals:a.rows})}catch(e){next(e)}});

 app.get('/api/:recordType/:id/comments',async(req:any,res:any,next:any)=>{try{if(!['incidents','requests'].includes(req.params.recordType))return res.status(404).json({error:'record type not found'});const type=req.params.recordType==='incidents'?'Incident':'Request';res.json((await pool.query(`SELECT * FROM record_comments WHERE record_type=$1 AND record_id=$2 ORDER BY created_at DESC`,[type,req.params.id])).rows)}catch(e){next(e)}});
 app.post('/api/:recordType/:id/comments',service,async(req:any,res:any,next:any)=>{try{if(!['incidents','requests'].includes(req.params.recordType))return res.status(404).json({error:'record type not found'});const type=req.params.recordType==='incidents'?'Incident':'Request',body=clean(req.body?.body);if(!body)return res.status(400).json({error:'comment is required'});const r=await pool.query(`INSERT INTO record_comments(record_type,record_id,comment_type,body,is_public,author) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[type,req.params.id,clean(req.body?.commentType,20)||'Work note',body,Boolean(req.body?.isPublic),actor(req)]);await audit(type,req.params.id,'Comment added',null,{commentType:r.rows[0].comment_type},actor(req));res.status(201).json(r.rows[0])}catch(e){next(e)}});

 app.post('/api/approvals',service,async(req:any,res:any,next:any)=>{try{const type=clean(req.body?.recordType,30),id=clean(req.body?.recordId,80);if(!['Request','Change'].includes(type)||!id)return res.status(400).json({error:'valid record type and id required'});const r=await pool.query(`INSERT INTO approval_tasks(record_type,record_id,stage,approver,requested_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[type,id,clean(req.body?.stage,80)||'Manager approval',clean(req.body?.approver,200),actor(req)]);if(type==='Request')await pool.query(`UPDATE service_requests SET approval_status='Pending',updated_at=NOW() WHERE number=$1`,[id]);await audit(type,id,'Approval requested',null,r.rows[0],actor(req));res.status(201).json(r.rows[0])}catch(e){next(e)}});
 app.post('/api/approvals/:id/decision',approver,async(req:any,res:any,next:any)=>{try{const status=clean(req.body?.status,20);if(!['Approved','Rejected'].includes(status))return res.status(400).json({error:'decision must be Approved or Rejected'});const old=(await pool.query('SELECT * FROM approval_tasks WHERE id=$1',[req.params.id])).rows[0];if(!old)return res.status(404).json({error:'approval not found'});const r=await pool.query(`UPDATE approval_tasks SET status=$1,decision_note=$2,decided_by=$3,decided_at=NOW() WHERE id=$4 AND status='Pending' RETURNING *`,[status,clean(req.body?.note),actor(req),req.params.id]);if(!r.rows[0])return res.status(409).json({error:'approval already decided'});if(old.record_type==='Request')await pool.query(`UPDATE service_requests SET approval_status=$1,status=CASE WHEN $1='Approved' AND status='Open' THEN 'Approved' ELSE status END,updated_at=NOW() WHERE number=$2`,[status,old.record_id]);await audit(old.record_type,old.record_id,`Approval ${status}`,old,r.rows[0],actor(req));res.json(r.rows[0])}catch(e){next(e)}});

 app.post('/api/incidents/:number/escalate',service,async(req:any,res:any,next:any)=>{try{const old=(await pool.query('SELECT * FROM incidents WHERE number=$1',[req.params.number])).rows[0];if(!old)return res.status(404).json({error:'incident not found'});const r=await pool.query(`UPDATE incidents SET escalation_level=LEAST(3,escalation_level+1),major_incident=major_incident OR $1,priority=CASE WHEN $1 THEN 'P1' ELSE priority END,updated_at=NOW() WHERE number=$2 RETURNING *`,[Boolean(req.body?.majorIncident),req.params.number]);await audit('Incident',req.params.number,'Escalated',old,r.rows[0],actor(req));await pool.query(`INSERT INTO notifications(title,message,severity,source_type,source_id,link_target,recipient_role,created_by) VALUES($1,$2,'Critical','Incident',$3,'Incidents','Service Desk',$4) ON CONFLICT(source_type,source_id) WHERE source_type<>'' AND source_id<>'' DO UPDATE SET title=EXCLUDED.title,message=EXCLUDED.message,is_read=FALSE,updated_at=NOW()`,[`Incident escalated: ${req.params.number}`,clean(req.body?.reason)||old.title,req.params.number,actor(req)]);res.json(r.rows[0])}catch(e){next(e)}});

 app.post('/api/sla/records/:id/pause',approver,async(req:any,res:any,next:any)=>{try{const r=await pool.query(`UPDATE sla_records SET paused_at=COALESCE(paused_at,NOW()),pause_reason=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,[clean(req.body?.reason),req.params.id]);if(!r.rows[0])return res.status(404).json({error:'SLA record not found'});res.json(r.rows[0])}catch(e){next(e)}});
 app.post('/api/sla/records/:id/resume',approver,async(req:any,res:any,next:any)=>{try{const r=await pool.query(`UPDATE sla_records SET paused_minutes=paused_minutes+COALESCE(EXTRACT(EPOCH FROM (NOW()-paused_at))/60,0)::int,response_due_at=response_due_at+COALESCE(NOW()-paused_at,INTERVAL '0'),resolution_due_at=resolution_due_at+COALESCE(NOW()-paused_at,INTERVAL '0'),paused_at=NULL,pause_reason='',updated_at=NOW() WHERE id=$1 RETURNING *`,[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'SLA record not found'});res.json(r.rows[0])}catch(e){next(e)}});

 app.post('/api/monitoring/events/:id/acknowledge',service,async(req:any,res:any,next:any)=>{try{const r=await pool.query(`UPDATE monitoring_events SET acknowledged_at=COALESCE(acknowledged_at,NOW()),acknowledged_by=$1 WHERE id=$2 RETURNING *`,[actor(req),req.params.id]);if(!r.rows[0])return res.status(404).json({error:'event not found'});res.json(r.rows[0])}catch(e){next(e)}});
 app.post('/api/monitoring/events/:id/incident',service,async(req:any,res:any,next:any)=>{try{const event=(await pool.query(`SELECT e.*,m.name check_name,m.target FROM monitoring_events e JOIN monitoring_checks m ON m.id=e.check_id WHERE e.id=$1`,[req.params.id])).rows[0];if(!event)return res.status(404).json({error:'event not found'});if(event.incident_number)return res.status(409).json({error:'incident already created',incidentNumber:event.incident_number});const seq=Number((await pool.query('SELECT COALESCE(MAX(id),0)+1 next FROM incidents')).rows[0].next),number=`INC${String(seq).padStart(6,'0')}`;await pool.query(`INSERT INTO incidents(number,title,description,priority,status,assignment_group,caller,asset) VALUES($1,$2,$3,'P1','Open','Infrastructure','Monitoring',$4)`,[number,`Monitoring alert: ${event.check_name}`,`${event.target} · ${event.message}`,event.check_name]);await pool.query(`UPDATE monitoring_events SET incident_number=$1,acknowledged_at=COALESCE(acknowledged_at,NOW()),acknowledged_by=$2 WHERE id=$3`,[number,actor(req),event.id]);res.status(201).json({incidentNumber:number})}catch(e){next(e)}});

 app.get('/api/audit',admin,async(req:any,res:any,next:any)=>{try{const values:any[]=[];let where='';if(req.query.recordType&&req.query.recordId){values.push(req.query.recordType,req.query.recordId);where='WHERE record_type=$1 AND record_id=$2'}res.json((await pool.query(`SELECT * FROM audit_events ${where} ORDER BY created_at DESC LIMIT 500`,values)).rows)}catch(e){next(e)}});
 app.get('/api/exports/:type.csv',async(req:any,res:any,next:any)=>{try{const type=req.params.type;const configs:any={incidents:['incidents','number,title,priority,status,assignment_group,assignee,opened_at,updated_at'],requests:['service_requests','number,title,priority,status,approval_status,requested_for,assignment_group,assignee,created_at,updated_at'],assets:['assets','asset_number,name,type,state,site,owner,serial_number,model']};const cfg=configs[type];if(!cfg)return res.status(404).json({error:'export not found'});const rows=(await pool.query(`SELECT ${cfg[1]} FROM ${cfg[0]} ORDER BY 1 DESC LIMIT 5000`)).rows,keys=cfg[1].split(',');const csv=[keys.join(','),...rows.map((row:any)=>keys.map((key:string)=>`"${String(row[key]??'').replace(/"/g,'""')}"`).join(','))].join('\r\n');res.type('text/csv').setHeader('Content-Disposition',`attachment; filename="coreops-${type}.csv"`);res.send(csv)}catch(e){next(e)}});
 app.get('/api/administration/categories',admin,async(_req:any,res:any,next:any)=>{try{res.json((await pool.query('SELECT * FROM workflow_categories ORDER BY record_type,name')).rows)}catch(e){next(e)}});
 app.post('/api/administration/categories',admin,async(req:any,res:any,next:any)=>{try{const r=await pool.query(`INSERT INTO workflow_categories(record_type,name,default_group) VALUES($1,$2,$3) RETURNING *`,[clean(req.body?.recordType,30),clean(req.body?.name,100),clean(req.body?.defaultGroup,100)]);res.status(201).json(r.rows[0])}catch(e){next(e)}});
}
