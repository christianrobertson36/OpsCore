import type {Express} from 'express';

type Roles=(...roles:any[])=>any;
const DEFAULTS={theme:'system',font:'standard',fontSize:'normal',density:'comfortable',highContrast:false,reducedMotion:false,underlineLinks:false,sidebar:'expanded',language:'en-GB'};
const clean=(value:any,max=4000)=>String(value??'').trim().slice(0,max);

export async function ensurePhase13V39(pool:any){await pool.query(`
 CREATE TABLE IF NOT EXISTS user_preferences(
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS release_notices(
  notice_key VARCHAR(80) PRIMARY KEY,title TEXT NOT NULL,message TEXT NOT NULL,severity VARCHAR(20) NOT NULL DEFAULT 'Information',enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS release_notice_acknowledgements(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,notice_key VARCHAR(80) NOT NULL REFERENCES release_notices(notice_key) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(user_id,notice_key));
 INSERT INTO release_notices(notice_key,title,message,severity) VALUES(
  'pre-release-testing','OpsCore testing environment','OpsCore is currently being tested. Please verify workflows carefully and report unexpected behaviour to the application owner. Do not enter production-only or highly sensitive information until testing is complete.','Warning')
 ON CONFLICT(notice_key) DO NOTHING;
 INSERT INTO schema_migrations(migration_key,description) VALUES('039-phase13','User experience, accessibility preferences and managed tester notice') ON CONFLICT(migration_key) DO NOTHING;
`)}

export function registerPhase13V39(app:Express,pool:any,requireRoles:Roles){
 const admin=requireRoles('Administrator');
 app.get('/api/user-experience',async(req:any,res:any,next:any)=>{try{
  const [prefs,notice]=await Promise.all([
   pool.query('SELECT preferences,updated_at FROM user_preferences WHERE user_id=$1',[req.authUser.id]),
   pool.query(`SELECT n.notice_key,n.title,n.message,n.severity,n.updated_at
    FROM release_notices n LEFT JOIN release_notice_acknowledgements a ON a.notice_key=n.notice_key AND a.user_id=$1
    WHERE n.enabled=TRUE AND a.user_id IS NULL ORDER BY n.updated_at DESC LIMIT 1`,[req.authUser.id])
  ]);
  res.json({preferences:{...DEFAULTS,...(prefs.rows[0]?.preferences||{})},notice:notice.rows[0]||null,canManageNotice:req.authUser.role==='Administrator'});
 }catch(e){next(e)}});
 app.put('/api/user-experience/preferences',async(req:any,res:any,next:any)=>{try{
  const source=req.body?.preferences||{},preferences={
   theme:['light','dark','system'].includes(source.theme)?source.theme:DEFAULTS.theme,
   font:['standard','readable','dyslexia'].includes(source.font)?source.font:DEFAULTS.font,
   fontSize:['normal','large','extra-large'].includes(source.fontSize)?source.fontSize:DEFAULTS.fontSize,
   density:['comfortable','compact'].includes(source.density)?source.density:DEFAULTS.density,
   highContrast:Boolean(source.highContrast),reducedMotion:Boolean(source.reducedMotion),underlineLinks:Boolean(source.underlineLinks),
   sidebar:['expanded','compact'].includes(source.sidebar)?source.sidebar:DEFAULTS.sidebar,
   language:['en-GB','ro-RO'].includes(source.language)?source.language:DEFAULTS.language
  };
  const row=(await pool.query(`INSERT INTO user_preferences(user_id,preferences) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET preferences=EXCLUDED.preferences,updated_at=NOW() RETURNING *`,[req.authUser.id,JSON.stringify(preferences)])).rows[0];
  res.json(row);
 }catch(e){next(e)}});
 app.post('/api/user-experience/notices/:key/acknowledge',async(req:any,res:any,next:any)=>{try{
  await pool.query(`INSERT INTO release_notice_acknowledgements(user_id,notice_key) SELECT $1,notice_key FROM release_notices WHERE notice_key=$2 ON CONFLICT(user_id,notice_key) DO UPDATE SET acknowledged_at=NOW()`,[req.authUser.id,req.params.key]);res.json({ok:true});
 }catch(e){next(e)}});
 app.get('/api/administration/tester-notice',admin,async(_req:any,res:any,next:any)=>{try{res.json((await pool.query(`SELECT * FROM release_notices WHERE notice_key='pre-release-testing'`)).rows[0])}catch(e){next(e)}});
 app.put('/api/administration/tester-notice',admin,async(req:any,res:any,next:any)=>{try{
  const enabled=Boolean(req.body?.enabled),title=clean(req.body?.title,200)||'OpsCore testing environment',message=clean(req.body?.message)||'OpsCore is currently being tested.';
  const row=(await pool.query(`UPDATE release_notices SET title=$1,message=$2,severity=$3,enabled=$4,updated_by=$5,updated_at=NOW() WHERE notice_key='pre-release-testing' RETURNING *`,[title,message,clean(req.body?.severity,20)||'Warning',enabled,req.authUser.email])).rows[0];
  if(enabled&&req.body?.showAgain===true)await pool.query(`DELETE FROM release_notice_acknowledgements WHERE notice_key='pre-release-testing'`);
  res.json(row);
 }catch(e){next(e)}});
}
