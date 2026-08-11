import type {Express} from 'express';
import net from 'net';

type RoleMiddleware=(...roles:any[])=>any;

function cleanText(value:any,max=500){const text=String(value??'').trim();return text?text.slice(0,max):''}
function positiveInt(value:any,fallback:number){const n=Number(value);return Number.isInteger(n)&&n>0?n:fallback}

export async function ensureMonitoringV21(pool:any){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitoring_checks(
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      check_type VARCHAR(20) NOT NULL DEFAULT 'HTTP' CHECK(check_type IN ('HTTP','TCP','Manual')),
      target TEXT NOT NULL,
      port INTEGER,
      site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
      asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      interval_seconds INTEGER NOT NULL DEFAULT 300,
      timeout_ms INTEGER NOT NULL DEFAULT 5000,
      expected_status INTEGER,
      status VARCHAR(20) NOT NULL DEFAULT 'Unknown',
      last_response_ms INTEGER,
      last_message TEXT DEFAULT '',
      last_checked_at TIMESTAMPTZ,
      last_ok_at TIMESTAMPTZ,
      created_by TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS monitoring_events(
      id BIGSERIAL PRIMARY KEY,
      check_id BIGINT NOT NULL REFERENCES monitoring_checks(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL,
      response_ms INTEGER,
      message TEXT DEFAULT '',
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_monitoring_events_check_time ON monitoring_events(check_id,checked_at DESC);
  `);
}

async function runHttp(target:string,timeoutMs:number,expectedStatus:number|null){
  const started=Date.now();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(target,{method:'GET',redirect:'follow',signal:controller.signal,headers:{'User-Agent':'CoreOps-Monitoring/1.0'}});
    const responseMs=Date.now()-started;
    const expected=expectedStatus||200;
    return {ok:response.status===expected,responseMs,message:`HTTP ${response.status} · expected ${expected}`};
  }catch(error:any){
    return {ok:false,responseMs:Date.now()-started,message:error?.name==='AbortError'?'HTTP check timed out':String(error?.message||error)};
  }finally{clearTimeout(timer)}
}

async function runTcp(target:string,port:number,timeoutMs:number){
  const started=Date.now();
  return await new Promise<{ok:boolean,responseMs:number,message:string}>(resolve=>{
    const socket=net.createConnection({host:target,port});
    let done=false;
    const finish=(ok:boolean,message:string)=>{if(done)return;done=true;socket.destroy();resolve({ok,responseMs:Date.now()-started,message})};
    socket.setTimeout(timeoutMs);
    socket.once('connect',()=>finish(true,`TCP ${port} connected`));
    socket.once('timeout',()=>finish(false,`TCP ${port} timed out`));
    socket.once('error',err=>finish(false,err.message));
  });
}

export function registerMonitoringV21(app:Express,pool:any,requireRoles:RoleMiddleware){
  const write=requireRoles('Administrator','Infrastructure','Engineer');

  app.get('/api/monitoring/summary',async(_req:any,res:any,next:any)=>{
    try{
      const r=await pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE enabled)::int enabled,COUNT(*) FILTER(WHERE status='Up')::int up,COUNT(*) FILTER(WHERE status='Down')::int down,COUNT(*) FILTER(WHERE status='Unknown')::int unknown,COUNT(*) FILTER(WHERE last_checked_at IS NOT NULL AND last_checked_at<NOW()-INTERVAL '1 hour')::int stale FROM monitoring_checks`);
      res.json({ok:true,summary:r.rows[0]});
    }catch(e){next(e)}
  });

  app.get('/api/monitoring/checks',async(_req:any,res:any,next:any)=>{
    try{
      const r=await pool.query(`SELECT m.*,s.name site_name,a.name asset_name FROM monitoring_checks m LEFT JOIN sites s ON s.id=m.site_id LEFT JOIN assets a ON a.id=m.asset_id ORDER BY m.name,m.id`);
      res.json({ok:true,checks:r.rows});
    }catch(e){next(e)}
  });

  app.get('/api/monitoring/checks/:id/events',async(req:any,res:any,next:any)=>{
    try{
      const r=await pool.query(`SELECT id,status,response_ms,message,checked_at FROM monitoring_events WHERE check_id=$1 ORDER BY checked_at DESC LIMIT 100`,[req.params.id]);
      res.json({ok:true,events:r.rows});
    }catch(e){next(e)}
  });

  app.post('/api/monitoring/checks',write,async(req:any,res:any,next:any)=>{
    try{
      const b=req.body||{};const name=cleanText(b.name,160),type=cleanText(b.checkType,20)||'HTTP',target=cleanText(b.target,500);
      if(!name||!target)return res.status(400).json({error:'name and target required'});
      if(!['HTTP','TCP','Manual'].includes(type))return res.status(400).json({error:'invalid check type'});
      const port=type==='TCP'?positiveInt(b.port,0):null;if(type==='TCP'&&!port)return res.status(400).json({error:'valid TCP port required'});
      if(type==='HTTP'&&!/^https?:\/\//i.test(target))return res.status(400).json({error:'HTTP target must start with http:// or https://'});
      const r=await pool.query(`INSERT INTO monitoring_checks(name,check_type,target,port,site_id,asset_id,enabled,interval_seconds,timeout_ms,expected_status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[name,type,target,port,b.siteId||null,b.assetId||null,b.enabled!==false,positiveInt(b.intervalSeconds,300),positiveInt(b.timeoutMs,5000),type==='HTTP'?positiveInt(b.expectedStatus,200):null,req.authUser?.email||req.authUser?.name||'Core Ops']);
      res.status(201).json({ok:true,check:r.rows[0]});
    }catch(e){next(e)}
  });

  app.patch('/api/monitoring/checks/:id',write,async(req:any,res:any,next:any)=>{
    try{
      const old=(await pool.query('SELECT * FROM monitoring_checks WHERE id=$1',[req.params.id])).rows[0];if(!old)return res.status(404).json({error:'monitoring check not found'});
      const b=req.body||{};const type=cleanText(b.checkType,20)||old.check_type,target=cleanText(b.target,500)||old.target;
      if(!['HTTP','TCP','Manual'].includes(type))return res.status(400).json({error:'invalid check type'});
      const r=await pool.query(`UPDATE monitoring_checks SET name=$1,check_type=$2,target=$3,port=$4,site_id=$5,asset_id=$6,enabled=$7,interval_seconds=$8,timeout_ms=$9,expected_status=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,[cleanText(b.name,160)||old.name,type,target,type==='TCP'?positiveInt(b.port,old.port||0):null,b.siteId===undefined?old.site_id:(b.siteId||null),b.assetId===undefined?old.asset_id:(b.assetId||null),b.enabled===undefined?old.enabled:Boolean(b.enabled),positiveInt(b.intervalSeconds,old.interval_seconds),positiveInt(b.timeoutMs,old.timeout_ms),type==='HTTP'?positiveInt(b.expectedStatus,old.expected_status||200):null,req.params.id]);
      res.json({ok:true,check:r.rows[0]});
    }catch(e){next(e)}
  });

  app.delete('/api/monitoring/checks/:id',requireRoles('Administrator','Infrastructure'),async(req:any,res:any,next:any)=>{try{await pool.query('DELETE FROM monitoring_checks WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){next(e)}});

  app.post('/api/monitoring/checks/:id/run',write,async(req:any,res:any,next:any)=>{
    try{
      const check=(await pool.query('SELECT * FROM monitoring_checks WHERE id=$1',[req.params.id])).rows[0];if(!check)return res.status(404).json({error:'monitoring check not found'});
      let result:{ok:boolean,responseMs:number,message:string};
      if(check.check_type==='HTTP')result=await runHttp(check.target,check.timeout_ms,check.expected_status);
      else if(check.check_type==='TCP')result=await runTcp(check.target,check.port,check.timeout_ms);
      else result={ok:true,responseMs:0,message:'Manual check acknowledged'};
      const status=result.ok?'Up':'Down';
      await pool.query(`UPDATE monitoring_checks SET status=$1,last_response_ms=$2,last_message=$3,last_checked_at=NOW(),last_ok_at=CASE WHEN $1='Up' THEN NOW() ELSE last_ok_at END,updated_at=NOW() WHERE id=$4`,[status,result.responseMs,result.message,check.id]);
      await pool.query(`INSERT INTO monitoring_events(check_id,status,response_ms,message) VALUES($1,$2,$3,$4)`,[check.id,status,result.responseMs,result.message]);
      res.json({ok:true,status,responseMs:result.responseMs,message:result.message,checkedAt:new Date().toISOString()});
    }catch(e){next(e)}
  });
}
