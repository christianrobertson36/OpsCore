import type {Express} from 'express';

type Roles=(...roles:any[])=>any;
const clean=(value:any,max=2000)=>String(value??'').trim().slice(0,max);
const AUDITED_TABLES=['users','sites','locations','server_rooms','racks','rack_equipment','incidents','service_requests','assets','problems','changes','knowledge_articles','compliance_audits','inspections','evidence_records','projects','procurement_records','monitoring_checks','monitoring_events','sla_policies','sla_records','notifications','problem_incidents','asset_relationships','workflow_history','platform_settings','record_comments','approval_tasks','workflow_categories','service_catalogue_items','automation_rules','automation_runs','change_blackout_windows','operational_risks','maintenance_schedules','supplier_contracts','asset_contracts','continuity_plans','recurring_tasks','business_services','service_assets','service_feedback','service_status_updates','cost_centres','capacity_budgets','cost_allocations','capacity_snapshots','capacity_thresholds','assignment_groups','assignment_group_members','record_watchers','record_attachments','response_templates','saved_views','change_tasks','change_cab_decisions','knowledge_versions','software_products','asset_software','asset_lifecycle_events'];

export async function ensurePhase8V32(pool:any){
 await pool.query(`
  CREATE TABLE IF NOT EXISTS rack_equipment(
   id SERIAL PRIMARY KEY,rack_id INTEGER NOT NULL REFERENCES racks(id) ON DELETE CASCADE,asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
   equipment_code VARCHAR(60) NOT NULL,name VARCHAR(160) NOT NULL,equipment_type VARCHAR(80) NOT NULL DEFAULT 'Server',manufacturer VARCHAR(120) DEFAULT '',model VARCHAR(160) DEFAULT '',serial_number VARCHAR(160) DEFAULT '',asset_tag VARCHAR(120) DEFAULT '',
   start_u NUMERIC(6,1),height_u NUMERIC(6,1) NOT NULL DEFAULT 1,mount_side VARCHAR(30) NOT NULL DEFAULT 'Front',depth_mm INTEGER NOT NULL DEFAULT 0,weight_kg NUMERIC(10,2) NOT NULL DEFAULT 0,power_draw_w NUMERIC(10,2) NOT NULL DEFAULT 0,
   status VARCHAR(40) NOT NULL DEFAULT 'Installed',owner VARCHAR(120) DEFAULT '',notes TEXT DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(rack_id,equipment_code));
  ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS table_name VARCHAR(80) DEFAULT '';
  ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS operation VARCHAR(20) DEFAULT '';
  ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS changed_fields TEXT[] DEFAULT '{}';
  ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'Application';
  CREATE INDEX IF NOT EXISTS idx_audit_events_table_time ON audit_events(table_name,created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_events_operation ON audit_events(operation,created_at DESC);
  CREATE TABLE IF NOT EXISTS cost_centres(
   id BIGSERIAL PRIMARY KEY,code VARCHAR(50) UNIQUE NOT NULL,name TEXT NOT NULL,owner TEXT DEFAULT '',currency CHAR(3) NOT NULL DEFAULT 'GBP',active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS capacity_budgets(
   id BIGSERIAL PRIMARY KEY,cost_centre_id BIGINT REFERENCES cost_centres(id) ON DELETE SET NULL,name TEXT NOT NULL,financial_year VARCHAR(20) NOT NULL,budget_amount NUMERIC(14,2) NOT NULL DEFAULT 0,warning_percent NUMERIC(5,2) NOT NULL DEFAULT 80,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(cost_centre_id,name,financial_year));
  CREATE TABLE IF NOT EXISTS cost_allocations(
   id BIGSERIAL PRIMARY KEY,cost_centre_id BIGINT REFERENCES cost_centres(id) ON DELETE SET NULL,budget_id BIGINT REFERENCES capacity_budgets(id) ON DELETE SET NULL,record_type VARCHAR(30) NOT NULL,record_id TEXT NOT NULL,category VARCHAR(50) DEFAULT 'Operating',description TEXT DEFAULT '',amount NUMERIC(14,2) NOT NULL DEFAULT 0,currency CHAR(3) NOT NULL DEFAULT 'GBP',effective_date DATE NOT NULL DEFAULT CURRENT_DATE,recurring VARCHAR(20) DEFAULT 'One-off',created_by TEXT DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE INDEX IF NOT EXISTS idx_cost_allocations_record ON cost_allocations(record_type,record_id);
  CREATE TABLE IF NOT EXISTS capacity_snapshots(
   id BIGSERIAL PRIMARY KEY,resource_type VARCHAR(40) NOT NULL,resource_id TEXT NOT NULL,resource_name TEXT NOT NULL,metric VARCHAR(60) NOT NULL,used_value NUMERIC(14,2) NOT NULL,capacity_value NUMERIC(14,2) NOT NULL,unit VARCHAR(30) DEFAULT 'items',captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),captured_by TEXT DEFAULT 'System');
  CREATE INDEX IF NOT EXISTS idx_capacity_snapshot_resource ON capacity_snapshots(resource_type,resource_id,captured_at DESC);
  CREATE TABLE IF NOT EXISTS capacity_thresholds(
   id BIGSERIAL PRIMARY KEY,resource_type VARCHAR(40) NOT NULL,metric VARCHAR(60) NOT NULL,warning_percent NUMERIC(5,2) NOT NULL DEFAULT 80,critical_percent NUMERIC(5,2) NOT NULL DEFAULT 90,notify_role VARCHAR(50) DEFAULT 'Infrastructure',active BOOLEAN NOT NULL DEFAULT TRUE,UNIQUE(resource_type,metric));
  INSERT INTO cost_centres(code,name,owner) VALUES('OPS','Operations','Operations') ON CONFLICT(code) DO NOTHING;
  INSERT INTO capacity_thresholds(resource_type,metric,warning_percent,critical_percent) VALUES('Rack','Rack units',80,90),('Licence','Users',80,95),('Licence','Assets',80,95) ON CONFLICT(resource_type,metric) DO NOTHING;
  CREATE OR REPLACE FUNCTION coreops_record_audit() RETURNS TRIGGER AS $$
  DECLARE old_row JSONB; new_row JSONB; safe_old JSONB; safe_new JSONB; identity TEXT; fields TEXT[];
  BEGIN
   old_row=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
   new_row=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
   safe_old=old_row-ARRAY['password_hash','licence_key','token','secret','client_secret'];
   safe_new=new_row-ARRAY['password_hash','licence_key','token','secret','client_secret'];
   identity=COALESCE(safe_new->>'number',safe_new->>'asset_number',safe_new->>'code',safe_new->>'reference',safe_new->>'id',safe_old->>'number',safe_old->>'asset_number',safe_old->>'code',safe_old->>'reference',safe_old->>'id','unknown');
   IF TG_OP='UPDATE' THEN SELECT COALESCE(array_agg(key ORDER BY key),'{}') INTO fields FROM (SELECT key FROM jsonb_each(safe_old) WHERE safe_old->key IS DISTINCT FROM safe_new->key) changed; ELSE fields=ARRAY[]::TEXT[]; END IF;
   INSERT INTO audit_events(record_type,record_id,action,before_data,after_data,actor,table_name,operation,changed_fields,source)
   VALUES(initcap(replace(TG_TABLE_NAME,'_',' ')),identity,TG_OP,safe_old,safe_new,COALESCE(safe_new->>'updated_by',safe_new->>'created_by',safe_new->>'author',safe_old->>'updated_by',safe_old->>'created_by','System/API'),TG_TABLE_NAME,TG_OP,fields,'Database');
   RETURN COALESCE(NEW,OLD);
  END; $$ LANGUAGE plpgsql;
  CREATE OR REPLACE FUNCTION coreops_protect_audit() RETURNS TRIGGER AS $$
  BEGIN RAISE EXCEPTION 'audit history is append-only'; END; $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS coreops_audit_append_only ON audit_events;
  CREATE TRIGGER coreops_audit_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION coreops_protect_audit();
 `);
 for(const table of AUDITED_TABLES){
  const exists=(await pool.query(`SELECT to_regclass($1) name`,[`public.${table}`])).rows[0]?.name;
  if(!exists)continue;
  await pool.query(`DROP TRIGGER IF EXISTS coreops_audit_trigger ON ${table}; CREATE TRIGGER coreops_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW) EXECUTE FUNCTION coreops_record_audit()`);
 }
 await pool.query(`INSERT INTO schema_migrations(migration_key,description) VALUES('032-phase8','Capacity, cost management and comprehensive record audit') ON CONFLICT(migration_key) DO NOTHING`);
}

export function registerPhase8V32(app:Express,pool:any,requireRoles:Roles){
 const auditReader=requireRoles('Administrator','Auditor'),admin=requireRoles('Administrator'),write=requireRoles('Administrator','Infrastructure');
 const actor=(req:any)=>req.authUser?.email||req.authUser?.name||'Core Ops';
 app.get('/api/capacity/summary',async(_req:any,res:any,next:any)=>{try{const [summary,centres,budgets,allocations,snapshots,thresholds]=await Promise.all([
  pool.query(`SELECT (SELECT COUNT(*) FROM assets)::int assets,(SELECT COUNT(*) FROM assets WHERE state='In Service')::int active_assets,(SELECT COUNT(*) FROM racks)::int racks,(SELECT COALESCE(SUM(rack_units),0) FROM racks)::numeric rack_capacity,(SELECT COUNT(*) FROM rack_equipment)::int rack_equipment,(SELECT COALESCE(SUM(amount),0) FROM cost_allocations WHERE effective_date>=date_trunc('year',CURRENT_DATE))::numeric year_cost,(SELECT COALESCE(SUM(budget_amount),0) FROM capacity_budgets WHERE financial_year IN (EXTRACT(YEAR FROM CURRENT_DATE)::text,EXTRACT(YEAR FROM CURRENT_DATE)::text||'/'||(EXTRACT(YEAR FROM CURRENT_DATE)+1)::text))::numeric year_budget`),
  pool.query(`SELECT c.*,COALESCE(SUM(a.amount),0)::numeric allocated FROM cost_centres c LEFT JOIN cost_allocations a ON a.cost_centre_id=c.id GROUP BY c.id ORDER BY c.name`),
  pool.query(`SELECT b.*,c.code cost_centre_code,COALESCE(SUM(a.amount),0)::numeric spent FROM capacity_budgets b LEFT JOIN cost_centres c ON c.id=b.cost_centre_id LEFT JOIN cost_allocations a ON a.budget_id=b.id GROUP BY b.id,c.code ORDER BY b.financial_year DESC,b.name`),
  pool.query(`SELECT a.*,c.code cost_centre_code,b.name budget_name FROM cost_allocations a LEFT JOIN cost_centres c ON c.id=a.cost_centre_id LEFT JOIN capacity_budgets b ON b.id=a.budget_id ORDER BY a.effective_date DESC,a.id DESC LIMIT 250`),
  pool.query(`SELECT *,CASE WHEN capacity_value=0 THEN 0 ELSE ROUND(used_value*100/capacity_value,1) END utilisation_percent FROM capacity_snapshots ORDER BY captured_at DESC LIMIT 100`),
  pool.query(`SELECT * FROM capacity_thresholds ORDER BY resource_type,metric`)
 ]);res.json({summary:summary.rows[0],costCentres:centres.rows,budgets:budgets.rows,allocations:allocations.rows,snapshots:snapshots.rows,thresholds:thresholds.rows,generatedAt:new Date().toISOString()})}catch(e){next(e)}});
 app.post('/api/capacity/cost-centres',admin,async(req:any,res:any,next:any)=>{try{const b=req.body||{};const r=await pool.query(`INSERT INTO cost_centres(code,name,owner,currency) VALUES($1,$2,$3,$4) RETURNING *`,[clean(b.code,50).toUpperCase(),clean(b.name,200),clean(b.owner,200),clean(b.currency,3).toUpperCase()||'GBP']);res.status(201).json(r.rows[0])}catch(e){next(e)}});
 app.post('/api/capacity/budgets',admin,async(req:any,res:any,next:any)=>{try{const b=req.body||{};const r=await pool.query(`INSERT INTO capacity_budgets(cost_centre_id,name,financial_year,budget_amount,warning_percent) VALUES($1,$2,$3,$4,$5) RETURNING *`,[b.costCentreId||null,clean(b.name,200),clean(b.financialYear,20),Number(b.budgetAmount||0),Number(b.warningPercent||80)]);res.status(201).json(r.rows[0])}catch(e){next(e)}});
 app.post('/api/capacity/allocations',write,async(req:any,res:any,next:any)=>{try{const b=req.body||{};if(!clean(b.recordType,30)||!clean(b.recordId,100))return res.status(400).json({error:'record type and record id are required'});const r=await pool.query(`INSERT INTO cost_allocations(cost_centre_id,budget_id,record_type,record_id,category,description,amount,currency,effective_date,recurring,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[b.costCentreId||null,b.budgetId||null,clean(b.recordType,30),clean(b.recordId,100),clean(b.category,50)||'Operating',clean(b.description),Number(b.amount||0),clean(b.currency,3).toUpperCase()||'GBP',b.effectiveDate||new Date().toISOString().slice(0,10),clean(b.recurring,20)||'One-off',actor(req)]);res.status(201).json(r.rows[0])}catch(e){next(e)}});
 app.post('/api/capacity/snapshots/capture',write,async(req:any,res:any,next:any)=>{try{await pool.query(`INSERT INTO capacity_snapshots(resource_type,resource_id,resource_name,metric,used_value,capacity_value,unit,captured_by) SELECT 'Rack',r.id::text,COALESCE(r.name,r.id::text),'Rack units',COALESCE(SUM(e.height_u),0),r.rack_units,'U',$1 FROM racks r LEFT JOIN rack_equipment e ON e.rack_id=r.id AND e.status<>'Retired' GROUP BY r.id,r.name,r.rack_units`,[actor(req)]);const rows=(await pool.query(`SELECT *,CASE WHEN capacity_value=0 THEN 0 ELSE ROUND(used_value*100/capacity_value,1) END utilisation_percent FROM capacity_snapshots ORDER BY captured_at DESC LIMIT 100`)).rows;res.status(201).json(rows)}catch(e){next(e)}});
 app.get('/api/audit/summary',auditReader,async(_req:any,res:any,next:any)=>{try{const [totals,tables]=await Promise.all([pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE created_at>NOW()-INTERVAL '24 hours')::int last_24h,COUNT(DISTINCT table_name)::int tables FROM audit_events`),pool.query(`SELECT table_name,COUNT(*)::int events,MAX(created_at) last_change FROM audit_events GROUP BY table_name ORDER BY events DESC`)]);res.json({...totals.rows[0],coverage:AUDITED_TABLES,tables:tables.rows})}catch(e){next(e)}});
 app.get('/api/audit/records',auditReader,async(req:any,res:any,next:any)=>{try{const values:any[]=[],clauses:string[]=[];for(const [query,column] of [['table','table_name'],['recordId','record_id'],['operation','operation'],['actor','actor']] as const){if(req.query[query]){values.push(`%${clean(req.query[query],100)}%`);clauses.push(`${column} ILIKE $${values.length}`)}}if(req.query.from){values.push(req.query.from);clauses.push(`created_at >= $${values.length}::timestamptz`)}if(req.query.to){values.push(req.query.to);clauses.push(`created_at <= $${values.length}::timestamptz`)}if(req.query.search){values.push(`%${clean(req.query.search,200)}%`);clauses.push(`(record_type ILIKE $${values.length} OR action ILIKE $${values.length} OR before_data::text ILIKE $${values.length} OR after_data::text ILIKE $${values.length})`)}values.push(Math.min(1000,Math.max(1,Number(req.query.limit||250))));res.json((await pool.query(`SELECT * FROM audit_events ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY created_at DESC LIMIT $${values.length}`,values)).rows)}catch(e){next(e)}});
 app.get('/api/audit/history/:table/:recordId',auditReader,async(req:any,res:any,next:any)=>{try{res.json((await pool.query(`SELECT * FROM audit_events WHERE table_name=$1 AND record_id=$2 ORDER BY created_at DESC LIMIT 1000`,[req.params.table,req.params.recordId])).rows)}catch(e){next(e)}});
 app.get('/api/audit/export.csv',auditReader,async(req:any,res:any,next:any)=>{try{const rows=(await pool.query(`SELECT id,created_at,table_name,record_type,record_id,operation,action,actor,source,changed_fields FROM audit_events ORDER BY created_at DESC LIMIT 10000`)).rows,keys=['id','created_at','table_name','record_type','record_id','operation','action','actor','source','changed_fields'];const csv=[keys.join(','),...rows.map((row:any)=>keys.map(key=>`"${String(row[key]??'').replace(/"/g,'""')}"`).join(','))].join('\r\n');res.type('text/csv').setHeader('Content-Disposition','attachment; filename="coreops-record-audit.csv"');res.send(csv)}catch(e){next(e)}});
}
