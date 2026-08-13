import type {Express} from 'express';
import {syncDcam} from './phase17-v43.js';
type DcamRequest=(path:string,options?:RequestInit)=>Promise<any>;
const intervalMs=Math.max(60000,Number(process.env.SHARED_DATA_SYNC_INTERVAL_MS||300000));
let timer:NodeJS.Timeout|null=null,running=false;

export async function ensurePhase18V44(pool:any){
 await pool.query(`CREATE TABLE IF NOT EXISTS shared_sync_runs(id BIGSERIAL PRIMARY KEY,source_app TEXT NOT NULL,trigger_type TEXT NOT NULL,status TEXT NOT NULL,records_checked INTEGER NOT NULL DEFAULT 0,records_created INTEGER NOT NULL DEFAULT 0,records_updated INTEGER NOT NULL DEFAULT 0,error_detail TEXT,started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),finished_at TIMESTAMPTZ)`);
 await pool.query(`CREATE INDEX IF NOT EXISTS idx_shared_sync_runs_time ON shared_sync_runs(started_at DESC)`);
 await pool.query(`ALTER TABLE shared_apps ADD COLUMN IF NOT EXISTS auto_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
 await pool.query(`ALTER TABLE shared_apps ADD COLUMN IF NOT EXISTS sync_interval_seconds INTEGER NOT NULL DEFAULT 300`);
 await pool.query(`ALTER TABLE shared_apps ADD COLUMN IF NOT EXISTS next_sync_at TIMESTAMPTZ`);
 await pool.query(`UPDATE shared_apps SET auto_sync_enabled=TRUE,sync_interval_seconds=$1 WHERE app_code='DCAM'`,[Math.round(intervalMs/1000)]);
 await pool.query(`INSERT INTO schema_migrations(migration_key,description) VALUES('044-phase18','Automatic shared data synchronisation and history') ON CONFLICT(migration_key) DO NOTHING`);
}

export function registerPhase18V44(app:Express,pool:any,requireRoles:any){
 app.get('/api/shared-data/sync-history',async(_req:any,res:any,next:any)=>{try{const runs=(await pool.query(`SELECT * FROM shared_sync_runs ORDER BY started_at DESC LIMIT 100`)).rows;res.json({ok:true,intervalSeconds:Math.round(intervalMs/1000),runs})}catch(error){next(error)}});
 app.patch('/api/shared-data/apps/:code/auto-sync',requireRoles('Administrator'),async(req:any,res:any,next:any)=>{try{const code=String(req.params.code||'').toUpperCase(),enabled=Boolean(req.body?.enabled);const row=(await pool.query(`UPDATE shared_apps SET auto_sync_enabled=$1,updated_at=NOW() WHERE app_code=$2 RETURNING *`,[enabled,code])).rows[0];if(!row)return res.status(404).json({error:'connected app not found'});res.json({ok:true,app:row})}catch(error){next(error)}});
}

export function startPhase18AutoSync(pool:any,dcamRequest:DcamRequest){
 if(timer)return;
 const run=async()=>{if(running)return;running=true;try{const app=(await pool.query(`SELECT auto_sync_enabled FROM shared_apps WHERE app_code='DCAM'`)).rows[0];if(app?.auto_sync_enabled){await pool.query(`UPDATE shared_apps SET next_sync_at=NOW()+($1::int*INTERVAL '1 second') WHERE app_code='DCAM'`,[Math.round(intervalMs/1000)]);await syncDcam(pool,dcamRequest,'Automatic synchronisation','Scheduled')}}catch(error:any){console.error('Phase 18 automatic DCAM sync failed',error?.message||error)}finally{running=false}};
 const initial=setTimeout(run,15000);initial.unref();timer=setInterval(run,intervalMs);timer.unref();
}
