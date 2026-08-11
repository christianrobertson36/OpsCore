import type {Express} from 'express';

type RoleMiddleware=(...roles:any[])=>any;

function clean(v:any,max=1000){return String(v??'').trim().slice(0,max)}

export async function ensureNotificationsV23(pool:any){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications(
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT DEFAULT '',
      severity VARCHAR(20) NOT NULL DEFAULT 'Info' CHECK(severity IN ('Info','Warning','Critical','Success')),
      source_type VARCHAR(40) DEFAULT '',
      source_id TEXT DEFAULT '',
      link_target TEXT DEFAULT '',
      recipient_role VARCHAR(40) DEFAULT '',
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      read_at TIMESTAMPTZ,
      created_by TEXT DEFAULT 'System',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_source_unique
      ON notifications(source_type,source_id) WHERE source_type<>'' AND source_id<>'';
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
  `);
}

async function syncSystemNotifications(pool:any){
  const down=(await pool.query(`SELECT id,name,target,last_message FROM monitoring_checks WHERE enabled=TRUE AND status='Down'`)).rows;
  for(const c of down){
    await pool.query(`INSERT INTO notifications(title,message,severity,source_type,source_id,link_target,recipient_role,created_by)
      VALUES($1,$2,'Critical','Monitoring',$3,'Monitoring','Infrastructure','System')
      ON CONFLICT(source_type,source_id) WHERE source_type<>'' AND source_id<>''
      DO UPDATE SET title=EXCLUDED.title,message=EXCLUDED.message,severity='Critical',is_read=FALSE,read_at=NULL,updated_at=NOW()`,
      [`Monitoring check down: ${c.name}`,`${c.target}${c.last_message?' · '+c.last_message:''}`,String(c.id)]);
  }
  const breached=(await pool.query(`SELECT s.id,s.record_type,s.record_id,s.title,p.name policy_name FROM sla_records s JOIN sla_policies p ON p.id=s.policy_id WHERE s.response_state='Breached' OR s.resolution_state='Breached'`)).rows;
  for(const s of breached){
    await pool.query(`INSERT INTO notifications(title,message,severity,source_type,source_id,link_target,recipient_role,created_by)
      VALUES($1,$2,'Warning','SLA',$3,'SLA Management','Service Desk','System')
      ON CONFLICT(source_type,source_id) WHERE source_type<>'' AND source_id<>''
      DO UPDATE SET title=EXCLUDED.title,message=EXCLUDED.message,severity='Warning',is_read=FALSE,read_at=NULL,updated_at=NOW()`,
      [`SLA breached: ${s.record_type} ${s.record_id}`,`${s.title||''}${s.policy_name?' · '+s.policy_name:''}`,String(s.id)]);
  }
}

export function registerNotificationsV23(app:Express,pool:any,requireRoles:RoleMiddleware){
  const write=requireRoles('Administrator','Service Desk','Engineer','Infrastructure','Auditor');

  app.get('/api/notifications/summary',async(_req:any,res:any,next:any)=>{try{const r=await pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE NOT is_read)::int unread,COUNT(*) FILTER(WHERE NOT is_read AND severity='Critical')::int critical,COUNT(*) FILTER(WHERE NOT is_read AND severity='Warning')::int warning FROM notifications`);res.json({ok:true,summary:r.rows[0]})}catch(e){next(e)}});
  app.get('/api/notifications',async(_req:any,res:any,next:any)=>{try{const r=await pool.query(`SELECT * FROM notifications ORDER BY is_read ASC,created_at DESC LIMIT 300`);res.json({ok:true,notifications:r.rows})}catch(e){next(e)}});
  app.post('/api/notifications',write,async(req:any,res:any,next:any)=>{try{const b=req.body||{};const title=clean(b.title,200);if(!title)return res.status(400).json({error:'title required'});const severity=['Info','Warning','Critical','Success'].includes(String(b.severity))?String(b.severity):'Info';const r=await pool.query(`INSERT INTO notifications(title,message,severity,source_type,source_id,link_target,recipient_role,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[title,clean(b.message),severity,clean(b.sourceType,40),clean(b.sourceId,80),clean(b.linkTarget,80),clean(b.recipientRole,40),req.authUser?.email||req.authUser?.name||'Core Ops']);res.status(201).json({ok:true,notification:r.rows[0]})}catch(e){next(e)}});
  app.post('/api/notifications/sync',write,async(_req:any,res:any,next:any)=>{try{await syncSystemNotifications(pool);res.json({ok:true})}catch(e){next(e)}});
  app.patch('/api/notifications/:id/read',async(req:any,res:any,next:any)=>{try{const r=await pool.query(`UPDATE notifications SET is_read=TRUE,read_at=COALESCE(read_at,NOW()),updated_at=NOW() WHERE id=$1 RETURNING id`,[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'notification not found'});res.json({ok:true})}catch(e){next(e)}});
  app.post('/api/notifications/read-all',async(_req:any,res:any,next:any)=>{try{await pool.query(`UPDATE notifications SET is_read=TRUE,read_at=COALESCE(read_at,NOW()),updated_at=NOW() WHERE is_read=FALSE`);res.json({ok:true})}catch(e){next(e)}});
}
