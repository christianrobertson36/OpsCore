import type {Pool} from 'pg';
import type express from 'express';

type Role='Administrator'|'Service Desk'|'Engineer'|'Infrastructure'|'Auditor'|'Read Only';

type RoleMiddleware=(...roles:Role[])=>express.RequestHandler;

function n(prefix:string,id:number){return `${prefix}${String(id).padStart(6,'0')}`}

export async function ensureEnterpriseModulesV18(pool:Pool){
 await pool.query(`
  CREATE TABLE IF NOT EXISTS problems(
   id SERIAL PRIMARY KEY,
   number VARCHAR(20) UNIQUE NOT NULL,
   title TEXT NOT NULL,
   description TEXT DEFAULT '',
   root_cause TEXT DEFAULT '',
   workaround TEXT DEFAULT '',
   priority VARCHAR(5) NOT NULL DEFAULT 'P3',
   status VARCHAR(30) NOT NULL DEFAULT 'Open',
   owner VARCHAR(120) DEFAULT 'Service Desk',
   related_incident VARCHAR(20) DEFAULT '',
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS changes(
   id SERIAL PRIMARY KEY,
   number VARCHAR(20) UNIQUE NOT NULL,
   title TEXT NOT NULL,
   description TEXT DEFAULT '',
   change_type VARCHAR(30) NOT NULL DEFAULT 'Normal',
   risk VARCHAR(20) NOT NULL DEFAULT 'Medium',
   status VARCHAR(40) NOT NULL DEFAULT 'Draft',
   owner VARCHAR(120) DEFAULT 'Change Management',
   planned_start TIMESTAMPTZ,
   planned_end TIMESTAMPTZ,
   implementation_plan TEXT DEFAULT '',
   rollback_plan TEXT DEFAULT '',
   approval_status VARCHAR(30) NOT NULL DEFAULT 'Pending',
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS knowledge_articles(
   id SERIAL PRIMARY KEY,
   number VARCHAR(20) UNIQUE NOT NULL,
   title TEXT NOT NULL,
   summary TEXT DEFAULT '',
   content TEXT DEFAULT '',
   category VARCHAR(80) DEFAULT 'General',
   status VARCHAR(30) NOT NULL DEFAULT 'Draft',
   author VARCHAR(120) DEFAULT '',
   published_at TIMESTAMPTZ,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS compliance_audits(
   id SERIAL PRIMARY KEY,
   number VARCHAR(20) UNIQUE NOT NULL,
   title TEXT NOT NULL,
   framework VARCHAR(100) DEFAULT 'Internal',
   scope TEXT DEFAULT '',
   site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
   owner VARCHAR(120) DEFAULT 'Compliance',
   status VARCHAR(30) NOT NULL DEFAULT 'Planned',
   scheduled_at TIMESTAMPTZ,
   completed_at TIMESTAMPTZ,
   finding_count INTEGER NOT NULL DEFAULT 0,
   notes TEXT DEFAULT '',
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS inspections(
   id SERIAL PRIMARY KEY,
   number VARCHAR(20) UNIQUE NOT NULL,
   title TEXT NOT NULL,
   inspection_type VARCHAR(100) DEFAULT 'Operational',
   site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
   asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
   inspector VARCHAR(120) DEFAULT 'Compliance',
   status VARCHAR(30) NOT NULL DEFAULT 'Scheduled',
   scheduled_at TIMESTAMPTZ,
   completed_at TIMESTAMPTZ,
   result VARCHAR(30) DEFAULT 'Pending',
   notes TEXT DEFAULT '',
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS evidence_records(
   id SERIAL PRIMARY KEY,
   number VARCHAR(20) UNIQUE NOT NULL,
   title TEXT NOT NULL,
   evidence_type VARCHAR(80) DEFAULT 'Document',
   reference_type VARCHAR(40) DEFAULT 'Audit',
   reference_number VARCHAR(30) DEFAULT '',
   site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
   asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
   owner VARCHAR(120) DEFAULT 'Compliance',
   status VARCHAR(30) NOT NULL DEFAULT 'Current',
   file_name VARCHAR(255) DEFAULT '',
   file_url TEXT DEFAULT '',
   notes TEXT DEFAULT '',
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS projects(
   id SERIAL PRIMARY KEY,
   number VARCHAR(20) UNIQUE NOT NULL,
   name TEXT NOT NULL,
   description TEXT DEFAULT '',
   owner VARCHAR(120) DEFAULT '',
   status VARCHAR(30) NOT NULL DEFAULT 'Planned',
   priority VARCHAR(20) DEFAULT 'Medium',
   start_date DATE,
   target_date DATE,
   progress INTEGER NOT NULL DEFAULT 0 CHECK(progress>=0 AND progress<=100),
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS procurement_records(
   id SERIAL PRIMARY KEY,
   number VARCHAR(20) UNIQUE NOT NULL,
   title TEXT NOT NULL,
   supplier VARCHAR(160) DEFAULT '',
   requested_by VARCHAR(120) DEFAULT '',
   status VARCHAR(30) NOT NULL DEFAULT 'Requested',
   amount NUMERIC(12,2) NOT NULL DEFAULT 0,
   currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
   required_date DATE,
   notes TEXT DEFAULT '',
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
 `);
}

async function list(pool:Pool,table:string,order='id DESC'){return (await pool.query(`SELECT * FROM ${table} ORDER BY ${order}`)).rows}

export function registerEnterpriseModulesV18(app:express.Application,pool:Pool,requireRoles:RoleMiddleware){
 const writeService=requireRoles('Administrator','Service Desk','Engineer','Infrastructure');
 const writeChange=requireRoles('Administrator','Service Desk','Engineer','Infrastructure');
 const writeCompliance=requireRoles('Administrator','Auditor','Infrastructure');
 const writeAdmin=requireRoles('Administrator');

 app.get('/api/problems',async(_req,res,next)=>{try{res.json(await list(pool,'problems'))}catch(e){next(e)}});
 app.post('/api/problems',writeService,async(req,res,next)=>{try{const b=req.body||{};if(!b.title)return res.status(400).json({error:'title required'});const id=(await pool.query("SELECT nextval(pg_get_serial_sequence('problems','id')) AS id")).rows[0].id;const number=n('PRB',Number(id));const r=await pool.query(`INSERT INTO problems(id,number,title,description,root_cause,workaround,priority,status,owner,related_incident) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[id,number,b.title,b.description||'',b.rootCause||'',b.workaround||'',b.priority||'P3',b.status||'Open',b.owner||'Service Desk',b.relatedIncident||'']);res.status(201).json(r.rows[0])}catch(e){next(e)}});
 app.patch('/api/problems/:id',writeService,async(req,res,next)=>{try{const old=(await pool.query('SELECT * FROM problems WHERE id=$1',[req.params.id])).rows[0];if(!old)return res.status(404).json({error:'problem not found'});const b=req.body||{};const r=await pool.query(`UPDATE problems SET title=$1,description=$2,root_cause=$3,workaround=$4,priority=$5,status=$6,owner=$7,related_incident=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,[b.title??old.title,b.description??old.description,b.rootCause??old.root_cause,b.workaround??old.workaround,b.priority??old.priority,b.status??old.status,b.owner??old.owner,b.relatedIncident??old.related_incident,req.params.id]);res.json(r.rows[0])}catch(e){next(e)}});

 app.get('/api/changes',async(_req,res,next)=>{try{res.json(await list(pool,'changes'))}catch(e){next(e)}});
 app.post('/api/changes',writeChange,async(req,res,next)=>{try{const b=req.body||{};if(!b.title)return res.status(400).json({error:'title required'});const id=(await pool.query("SELECT nextval(pg_get_serial_sequence('changes','id')) AS id")).rows[0].id;const number=n('CHG',Number(id));const r=await pool.query(`INSERT INTO changes(id,number,title,description,change_type,risk,status,owner,planned_start,planned_end,implementation_plan,rollback_plan,approval_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[id,number,b.title,b.description||'',b.changeType||'Normal',b.risk||'Medium',b.status||'Draft',b.owner||'Change Management',b.plannedStart||null,b.plannedEnd||null,b.implementationPlan||'',b.rollbackPlan||'',b.approvalStatus||'Pending']);res.status(201).json(r.rows[0])}catch(e){next(e)}});
 app.patch('/api/changes/:id',writeChange,async(req,res,next)=>{try{const old=(await pool.query('SELECT * FROM changes WHERE id=$1',[req.params.id])).rows[0];if(!old)return res.status(404).json({error:'change not found'});const b=req.body||{};const r=await pool.query(`UPDATE changes SET title=$1,description=$2,change_type=$3,risk=$4,status=$5,owner=$6,planned_start=$7,planned_end=$8,implementation_plan=$9,rollback_plan=$10,approval_status=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,[b.title??old.title,b.description??old.description,b.changeType??old.change_type,b.risk??old.risk,b.status??old.status,b.owner??old.owner,b.plannedStart??old.planned_start,b.plannedEnd??old.planned_end,b.implementationPlan??old.implementation_plan,b.rollbackPlan??old.rollback_plan,b.approvalStatus??old.approval_status,req.params.id]);res.json(r.rows[0])}catch(e){next(e)}});

 app.get('/api/knowledge',async(_req,res,next)=>{try{res.json(await list(pool,'knowledge_articles'))}catch(e){next(e)}});
 app.post('/api/knowledge',writeService,async(req,res,next)=>{try{const b=req.body||{};if(!b.title)return res.status(400).json({error:'title required'});const id=(await pool.query("SELECT nextval(pg_get_serial_sequence('knowledge_articles','id')) AS id")).rows[0].id;const number=n('KB',Number(id));const r=await pool.query(`INSERT INTO knowledge_articles(id,number,title,summary,content,category,status,author,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $7='Published' THEN NOW() ELSE NULL END) RETURNING *`,[id,number,b.title,b.summary||'',b.content||'',b.category||'General',b.status||'Draft',b.author||req.authUser?.name||'']);res.status(201).json(r.rows[0])}catch(e){next(e)}});
 app.patch('/api/knowledge/:id',writeService,async(req,res,next)=>{try{const old=(await pool.query('SELECT * FROM knowledge_articles WHERE id=$1',[req.params.id])).rows[0];if(!old)return res.status(404).json({error:'article not found'});const b=req.body||{};const status=b.status??old.status;const r=await pool.query(`UPDATE knowledge_articles SET title=$1,summary=$2,content=$3,category=$4,status=$5,author=$6,published_at=CASE WHEN $5='Published' AND published_at IS NULL THEN NOW() ELSE published_at END,updated_at=NOW() WHERE id=$7 RETURNING *`,[b.title??old.title,b.summary??old.summary,b.content??old.content,b.category??old.category,status,b.author??old.author,req.params.id]);res.json(r.rows[0])}catch(e){next(e)}});

 app.get('/api/audits',async(_req,res,next)=>{try{const r=await pool.query(`SELECT a.*,s.name AS site_name FROM compliance_audits a LEFT JOIN sites s ON s.id=a.site_id ORDER BY a.id DESC`);res.json(r.rows)}catch(e){next(e)}});
 app.post('/api/audits',writeCompliance,async(req,res,next)=>{try{const b=req.body||{};if(!b.title)return res.status(400).json({error:'title required'});const id=(await pool.query("SELECT nextval(pg_get_serial_sequence('compliance_audits','id')) AS id")).rows[0].id;const number=n('AUD',Number(id));const r=await pool.query(`INSERT INTO compliance_audits(id,number,title,framework,scope,site_id,owner,status,scheduled_at,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[id,number,b.title,b.framework||'Internal',b.scope||'',b.siteId||null,b.owner||'Compliance',b.status||'Planned',b.scheduledAt||null,b.notes||'']);res.status(201).json(r.rows[0])}catch(e){next(e)}});
 app.patch('/api/audits/:id',writeCompliance,async(req,res,next)=>{try{const old=(await pool.query('SELECT * FROM compliance_audits WHERE id=$1',[req.params.id])).rows[0];if(!old)return res.status(404).json({error:'audit not found'});const b=req.body||{};const status=b.status??old.status;const r=await pool.query(`UPDATE compliance_audits SET title=$1,framework=$2,scope=$3,site_id=$4,owner=$5,status=$6,scheduled_at=$7,completed_at=CASE WHEN $6='Completed' THEN COALESCE(completed_at,NOW()) ELSE completed_at END,finding_count=$8,notes=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,[b.title??old.title,b.framework??old.framework,b.scope??old.scope,b.siteId??old.site_id,b.owner??old.owner,status,b.scheduledAt??old.scheduled_at,b.findingCount??old.finding_count,b.notes??old.notes,req.params.id]);res.json(r.rows[0])}catch(e){next(e)}});

 app.get('/api/inspections',async(_req,res,next)=>{try{const r=await pool.query(`SELECT i.*,s.name AS site_name,a.name AS asset_name FROM inspections i LEFT JOIN sites s ON s.id=i.site_id LEFT JOIN assets a ON a.id=i.asset_id ORDER BY i.id DESC`);res.json(r.rows)}catch(e){next(e)}});
 app.post('/api/inspections',writeCompliance,async(req,res,next)=>{try{const b=req.body||{};if(!b.title)return res.status(400).json({error:'title required'});const id=(await pool.query("SELECT nextval(pg_get_serial_sequence('inspections','id')) AS id")).rows[0].id;const number=n('INSP',Number(id));const r=await pool.query(`INSERT INTO inspections(id,number,title,inspection_type,site_id,asset_id,inspector,status,scheduled_at,result,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[id,number,b.title,b.inspectionType||'Operational',b.siteId||null,b.assetId||null,b.inspector||req.authUser?.name||'Compliance',b.status||'Scheduled',b.scheduledAt||null,b.result||'Pending',b.notes||'']);res.status(201).json(r.rows[0])}catch(e){next(e)}});
 app.patch('/api/inspections/:id',writeCompliance,async(req,res,next)=>{try{const old=(await pool.query('SELECT * FROM inspections WHERE id=$1',[req.params.id])).rows[0];if(!old)return res.status(404).json({error:'inspection not found'});const b=req.body||{};const status=b.status??old.status;const r=await pool.query(`UPDATE inspections SET title=$1,inspection_type=$2,site_id=$3,asset_id=$4,inspector=$5,status=$6,scheduled_at=$7,completed_at=CASE WHEN $6='Completed' THEN COALESCE(completed_at,NOW()) ELSE completed_at END,result=$8,notes=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,[b.title??old.title,b.inspectionType??old.inspection_type,b.siteId??old.site_id,b.assetId??old.asset_id,b.inspector??old.inspector,status,b.scheduledAt??old.scheduled_at,b.result??old.result,b.notes??old.notes,req.params.id]);res.json(r.rows[0])}catch(e){next(e)}});

 app.get('/api/evidence',async(_req,res,next)=>{try{const r=await pool.query(`SELECT e.*,s.name AS site_name,a.name AS asset_name FROM evidence_records e LEFT JOIN sites s ON s.id=e.site_id LEFT JOIN assets a ON a.id=e.asset_id ORDER BY e.id DESC`);res.json(r.rows)}catch(e){next(e)}});
 app.post('/api/evidence',writeCompliance,async(req,res,next)=>{try{const b=req.body||{};if(!b.title)return res.status(400).json({error:'title required'});const id=(await pool.query("SELECT nextval(pg_get_serial_sequence('evidence_records','id')) AS id")).rows[0].id;const number=n('EVD',Number(id));const r=await pool.query(`INSERT INTO evidence_records(id,number,title,evidence_type,reference_type,reference_number,site_id,asset_id,owner,status,file_name,file_url,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[id,number,b.title,b.evidenceType||'Document',b.referenceType||'Audit',b.referenceNumber||'',b.siteId||null,b.assetId||null,b.owner||req.authUser?.name||'Compliance',b.status||'Current',b.fileName||'',b.fileUrl||'',b.notes||'']);res.status(201).json(r.rows[0])}catch(e){next(e)}});
 app.patch('/api/evidence/:id',writeCompliance,async(req,res,next)=>{try{const old=(await pool.query('SELECT * FROM evidence_records WHERE id=$1',[req.params.id])).rows[0];if(!old)return res.status(404).json({error:'evidence not found'});const b=req.body||{};const r=await pool.query(`UPDATE evidence_records SET title=$1,evidence_type=$2,reference_type=$3,reference_number=$4,site_id=$5,asset_id=$6,owner=$7,status=$8,file_name=$9,file_url=$10,notes=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,[b.title??old.title,b.evidenceType??old.evidence_type,b.referenceType??old.reference_type,b.referenceNumber??old.reference_number,b.siteId??old.site_id,b.assetId??old.asset_id,b.owner??old.owner,b.status??old.status,b.fileName??old.file_name,b.fileUrl??old.file_url,b.notes??old.notes,req.params.id]);res.json(r.rows[0])}catch(e){next(e)}});

 app.get('/api/projects',async(_req,res,next)=>{try{res.json(await list(pool,'projects'))}catch(e){next(e)}});
 app.post('/api/projects',writeAdmin,async(req,res,next)=>{try{const b=req.body||{};if(!b.name)return res.status(400).json({error:'name required'});const id=(await pool.query("SELECT nextval(pg_get_serial_sequence('projects','id')) AS id")).rows[0].id;const number=n('PRJ',Number(id));const r=await pool.query(`INSERT INTO projects(id,number,name,description,owner,status,priority,start_date,target_date,progress) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[id,number,b.name,b.description||'',b.owner||'',b.status||'Planned',b.priority||'Medium',b.startDate||null,b.targetDate||null,Math.max(0,Math.min(100,Number(b.progress||0)))]);res.status(201).json(r.rows[0])}catch(e){next(e)}});

 app.get('/api/procurement',async(_req,res,next)=>{try{res.json(await list(pool,'procurement_records'))}catch(e){next(e)}});
 app.post('/api/procurement',writeAdmin,async(req,res,next)=>{try{const b=req.body||{};if(!b.title)return res.status(400).json({error:'title required'});const id=(await pool.query("SELECT nextval(pg_get_serial_sequence('procurement_records','id')) AS id")).rows[0].id;const number=n('PO',Number(id));const r=await pool.query(`INSERT INTO procurement_records(id,number,title,supplier,requested_by,status,amount,currency,required_date,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[id,number,b.title,b.supplier||'',b.requestedBy||req.authUser?.name||'',b.status||'Requested',Number(b.amount||0),b.currency||'GBP',b.requiredDate||null,b.notes||'']);res.status(201).json(r.rows[0])}catch(e){next(e)}});

 app.get('/api/reporting/summary',async(_req,res,next)=>{try{const qs=await Promise.all([
  pool.query("SELECT COUNT(*)::int c FROM incidents WHERE status<>'Closed'"),pool.query("SELECT COUNT(*)::int c FROM problems WHERE status<>'Closed'"),pool.query("SELECT COUNT(*)::int c FROM changes WHERE status NOT IN ('Completed','Cancelled')"),pool.query("SELECT COUNT(*)::int c FROM knowledge_articles WHERE status='Published'"),pool.query("SELECT COUNT(*)::int c FROM compliance_audits WHERE status<>'Completed'"),pool.query("SELECT COUNT(*)::int c FROM inspections WHERE status<>'Completed'"),pool.query("SELECT COUNT(*)::int c FROM evidence_records WHERE status='Current'"),pool.query('SELECT COUNT(*)::int c FROM assets'),pool.query('SELECT COUNT(*)::int c FROM sites'),pool.query('SELECT COUNT(*)::int c FROM server_rooms'),pool.query('SELECT COUNT(*)::int c FROM racks'),pool.query("SELECT COUNT(*)::int c FROM projects WHERE status NOT IN ('Completed','Cancelled')")
 ]);const [incidents,problems,changes,knowledge,audits,inspections,evidence,assets,sites,serverRooms,racks,projects]=qs.map(x=>x.rows[0].c);res.json({incidents,problems,changes,knowledge,audits,inspections,evidence,assets,sites,serverRooms,racks,projects,generatedAt:new Date().toISOString()})}catch(e){next(e)}});
}
