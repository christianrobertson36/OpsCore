import type {Express} from 'express';

const REQUIRED_TABLES=['users','incidents','service_requests','assets','sites','locations','racks','sla_policies','notifications','operational_risks'];
const MIGRATIONS=[
 ['001-core','Core platform schema'],['018-enterprise','Enterprise workflow modules'],['021-monitoring','Monitoring foundation'],
 ['022-sla','SLA tracking'],['023-notifications','Notification centre'],['024-phase2','Connected workflows and CMDB'],
 ['025-phase3','Operational maturity'],['026-phase4','Service operations automation'],['027-phase5','Governance and resilience'],
 ['028-hardening','Production hardening and migration tracking']
];

export async function ensureHardeningV28(pool:any){
 await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations(
  migration_key VARCHAR(80) PRIMARY KEY,description TEXT NOT NULL,checksum TEXT DEFAULT '',applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS platform_diagnostics(
  id BIGSERIAL PRIMARY KEY,check_name VARCHAR(100) NOT NULL,status VARCHAR(20) NOT NULL,detail TEXT DEFAULT '',checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  CREATE INDEX IF NOT EXISTS idx_platform_diagnostics_time ON platform_diagnostics(checked_at DESC);`);
 for(const [key,description] of MIGRATIONS)await pool.query(`INSERT INTO schema_migrations(migration_key,description) VALUES($1,$2) ON CONFLICT(migration_key) DO NOTHING`,[key,description]);
}

async function readiness(pool:any){
 const started=Date.now();
 try{
  await pool.query('SELECT 1');
  const rows=(await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[])`,[REQUIRED_TABLES])).rows.map((r:any)=>r.table_name);
  const missing=REQUIRED_TABLES.filter(t=>!rows.includes(t));
  const migrationCount=Number((await pool.query('SELECT COUNT(*) count FROM schema_migrations')).rows[0].count);
  return {ok:missing.length===0,database:'connected',latencyMs:Date.now()-started,migrations:migrationCount,missingTables:missing};
 }catch(error:any){return {ok:false,database:'unavailable',latencyMs:Date.now()-started,migrations:0,missingTables:[],error:String(error?.message||error)}}
}

export function registerHardeningV28(app:Express,pool:any,requireRoles:(...roles:any[])=>any){
 app.get('/ready',async(_req:any,res:any)=>{const state=await readiness(pool);res.status(state.ok?200:503).json({...state,app:'Core Ops Workflow API',version:'v28',webVersion:'v35'})});
 app.get('/api/administration/diagnostics',requireRoles('Administrator'),async(_req:any,res:any,next:any)=>{try{const state=await readiness(pool);const migrations=(await pool.query('SELECT * FROM schema_migrations ORDER BY migration_key')).rows;const counts=(await pool.query(`SELECT (SELECT COUNT(*) FROM users)::int users,(SELECT COUNT(*) FROM incidents)::int incidents,(SELECT COUNT(*) FROM service_requests)::int requests,(SELECT COUNT(*) FROM assets)::int assets,(SELECT COUNT(*) FROM audit_events)::int audit_events`)).rows[0];res.json({state,migrations,counts,node:process.version,environment:process.env.NODE_ENV||'development',checkedAt:new Date().toISOString()})}catch(e){next(e)}});
 app.post('/api/administration/diagnostics/run',requireRoles('Administrator'),async(req:any,res:any,next:any)=>{try{const state=await readiness(pool),status=state.ok?'Passed':'Failed';await pool.query(`INSERT INTO platform_diagnostics(check_name,status,detail) VALUES('Production readiness',$1,$2)`,[status,JSON.stringify(state)]);res.status(state.ok?200:503).json(state)}catch(e){next(e)}});
 app.get('/api/administration/migrations',requireRoles('Administrator'),async(_req:any,res:any,next:any)=>{try{res.json((await pool.query('SELECT * FROM schema_migrations ORDER BY migration_key')).rows)}catch(e){next(e)}});
}
