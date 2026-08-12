import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 5058);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const jwtSecret = process.env.JWT_SECRET || '';
const adminEmail = (process.env.OPSCORE_ADMIN_EMAIL || 'admin@opscore.local').toLowerCase();
const adminPassword = process.env.OPSCORE_ADMIN_PASSWORD || '';

app.use(cors());
app.use(express.json());

type Role = 'Administrator' | 'Service Desk' | 'Engineer' | 'Infrastructure' | 'Auditor' | 'Read Only';
type AuthUser = { id:number; email:string; name:string; role:Role; active:boolean };

declare global {
  namespace Express { interface Request { authUser?: AuthUser } }
}

function hashPassword(password:string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password:string, stored:string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(hash, 'hex');
  return storedBuffer.length === derived.length && timingSafeEqual(storedBuffer, derived);
}

function signToken(user:AuthUser) {
  if (!jwtSecret) throw new Error('JWT_SECRET is required');
  return jwt.sign({ sub:user.id, email:user.email, name:user.name, role:user.role }, jwtSecret, { expiresIn:'8h' });
}

async function authRequired(req:express.Request, res:express.Response, next:express.NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !jwtSecret) return res.status(401).json({ error:'authentication required' });
    const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    const result = await pool.query('SELECT id,email,name,role,active FROM users WHERE id=$1', [Number(decoded.sub)]);
    const user = result.rows[0] as AuthUser | undefined;
    if (!user || !user.active) return res.status(401).json({ error:'account unavailable' });
    req.authUser = user;
    next();
  } catch { res.status(401).json({ error:'invalid or expired session' }); }
}

function requireRoles(...roles:Role[]) {
  return (req:express.Request, res:express.Response, next:express.NextFunction) => {
    if (!req.authUser || !roles.includes(req.authUser.role)) return res.status(403).json({ error:'permission denied' });
    next();
  };
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(180) UNIQUE NOT NULL,
      name VARCHAR(160) NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(40) NOT NULL DEFAULT 'Read Only',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS sites (
      id SERIAL PRIMARY KEY,
      code VARCHAR(30) UNIQUE NOT NULL,
      name VARCHAR(160) NOT NULL,
      site_type VARCHAR(60) NOT NULL DEFAULT 'Office',
      address1 VARCHAR(180) DEFAULT '',
      city VARCHAR(120) DEFAULT '',
      postcode VARCHAR(30) DEFAULT '',
      country VARCHAR(80) DEFAULT 'United Kingdom',
      owner VARCHAR(120) DEFAULT '',
      status VARCHAR(40) NOT NULL DEFAULT 'Operational',
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS locations (
      id SERIAL PRIMARY KEY,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      code VARCHAR(40) NOT NULL,
      name VARCHAR(160) NOT NULL,
      location_type VARCHAR(60) NOT NULL DEFAULT 'Room',
      parent_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
      floor VARCHAR(40) DEFAULT '',
      status VARCHAR(40) NOT NULL DEFAULT 'Operational',
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(site_id, code)
    );

    CREATE TABLE IF NOT EXISTS server_rooms (
      id SERIAL PRIMARY KEY,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
      code VARCHAR(40) NOT NULL,
      name VARCHAR(160) NOT NULL,
      floor VARCHAR(40) DEFAULT '',
      owner VARCHAR(120) DEFAULT '',
      status VARCHAR(40) NOT NULL DEFAULT 'Operational',
      max_racks INTEGER NOT NULL DEFAULT 20,
      power_capacity_kw NUMERIC(10,2) NOT NULL DEFAULT 0,
      cooling_capacity_kw NUMERIC(10,2) NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(site_id, code)
    );

    CREATE TABLE IF NOT EXISTS racks (
      id SERIAL PRIMARY KEY,
      server_room_id INTEGER NOT NULL REFERENCES server_rooms(id) ON DELETE CASCADE,
      rack_code VARCHAR(40) NOT NULL,
      name VARCHAR(160) NOT NULL,
      manufacturer VARCHAR(120) DEFAULT '',
      model VARCHAR(160) DEFAULT '',
      rack_units INTEGER NOT NULL DEFAULT 42,
      width_mm INTEGER NOT NULL DEFAULT 600,
      depth_mm INTEGER NOT NULL DEFAULT 1000,
      max_weight_kg NUMERIC(10,2) NOT NULL DEFAULT 0,
      power_capacity_kw NUMERIC(10,2) NOT NULL DEFAULT 0,
      cooling_capacity_kw NUMERIC(10,2) NOT NULL DEFAULT 0,
      asset_tag VARCHAR(120) DEFAULT '',
      serial_number VARCHAR(160) DEFAULT '',
      owner VARCHAR(120) DEFAULT '',
      department VARCHAR(120) DEFAULT '',
      status VARCHAR(40) NOT NULL DEFAULT 'Operational',
      lifecycle_state VARCHAR(40) NOT NULL DEFAULT 'Installed',
      position_label VARCHAR(80) DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(server_room_id, rack_code)
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id SERIAL PRIMARY KEY,
      number VARCHAR(20) UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      priority VARCHAR(5) NOT NULL DEFAULT 'P3',
      status VARCHAR(30) NOT NULL DEFAULT 'Open',
      assignment_group VARCHAR(80) NOT NULL DEFAULT 'Service Desk',
      caller VARCHAR(120) DEFAULT 'Portal User',
      asset VARCHAR(120) DEFAULT 'Unassigned',
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS service_requests (
      id SERIAL PRIMARY KEY,
      number VARCHAR(20) UNIQUE NOT NULL,
      title TEXT NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'New',
      requested_for VARCHAR(120) DEFAULT 'Portal User',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      asset_number VARCHAR(30) UNIQUE NOT NULL,
      name VARCHAR(160) NOT NULL,
      type VARCHAR(80) NOT NULL,
      site VARCHAR(120) DEFAULT '',
      site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
      location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
      owner VARCHAR(120) DEFAULT '',
      state VARCHAR(40) NOT NULL DEFAULT 'Operational',
      serial_number VARCHAR(160) DEFAULT '',
      model VARCHAR(160) DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE assets ADD COLUMN IF NOT EXISTS site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL;
    ALTER TABLE assets ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL;
  `);

  const userCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count);
  if (userCount === 0) {
    if (!adminPassword) throw new Error('OPSCORE_ADMIN_PASSWORD must be set for first startup');
    await pool.query('INSERT INTO users (email,name,password_hash,role) VALUES ($1,$2,$3,$4)', [adminEmail,'Platform Administrator',hashPassword(adminPassword),'Administrator']);
  }

  const siteCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM sites')).rows[0].count);
  if (siteCount === 0) {
    const site = (await pool.query(`INSERT INTO sites (code,name,site_type,city,postcode,owner,status,notes)
      VALUES ('WKG-01','Workington Main Site','Office / Data Centre','Workington','CA14','Infrastructure','Operational','Shared OpsCore seed site for service, infrastructure and compliance.') RETURNING id`)).rows[0];
    const building = (await pool.query(`INSERT INTO locations (site_id,code,name,location_type,status) VALUES ($1,'BLDG-A','Main Building','Building','Operational') RETURNING id`, [site.id])).rows[0];
    await pool.query(`INSERT INTO locations (site_id,code,name,location_type,parent_location_id,floor,status) VALUES
      ($1,'SR-01','Server Room 1','Server Room',$2,'Ground','Operational'),
      ($1,'OFF-01','Main Office','Office',$2,'Ground','Operational')`, [site.id, building.id]);
  }

  const roomCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM server_rooms')).rows[0].count);
  if (roomCount === 0) {
    const site = (await pool.query("SELECT id FROM sites WHERE code='WKG-01' LIMIT 1")).rows[0];
    const location = site ? (await pool.query("SELECT id,floor FROM locations WHERE site_id=$1 AND code='SR-01' LIMIT 1", [site.id])).rows[0] : null;
    if (site) {
      const room = (await pool.query(`INSERT INTO server_rooms (site_id,location_id,code,name,floor,owner,status,max_racks,power_capacity_kw,cooling_capacity_kw,notes)
        VALUES ($1,$2,'SR-01','Server Room 1',$3,'Infrastructure','Operational',20,80,65,'Seed server room created from the v5 location model.') RETURNING id`, [site.id, location?.id || null, location?.floor || 'Ground'])).rows[0];
      await pool.query(`INSERT INTO racks (server_room_id,rack_code,name,manufacturer,model,rack_units,width_mm,depth_mm,max_weight_kg,power_capacity_kw,cooling_capacity_kw,asset_tag,owner,department,status,lifecycle_state,position_label)
        VALUES ($1,'RACK-01','Core Rack 01','APC','NetShelter SX',42,600,1070,1360,8,8,'RACK-WKG-001','Infrastructure','Infrastructure','Operational','Installed','Row A / Position 01')`, [room.id]);
    }
  }

  const incidentCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM incidents')).rows[0].count);
  if (incidentCount === 0) await pool.query(`INSERT INTO incidents (number,title,description,priority,status,assignment_group,caller,asset) VALUES
    ('INC000001','VPN access unavailable','Remote user cannot establish VPN connection.','P2','In Progress','Service Desk','A. User','LT-0142'),
    ('INC000002','Printer offline in Finance','Finance floor printer is unavailable.','P3','Open','Deskside','J. Smith','PRN-FIN-01'),
    ('INC000003','Hypervisor storage alert','Monitoring detected a critical storage alert.','P1','Open','Infrastructure','Monitoring','SRV-HV-004')`);

  const requestCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM service_requests')).rows[0].count);
  if (requestCount === 0) await pool.query(`INSERT INTO service_requests (number,title,status,requested_for) VALUES
    ('REQ000001','New starter equipment','Awaiting Approval','M. Brown'),
    ('REQ000002','Microsoft 365 licence','Fulfilment','S. Wilson')`);

  const assetCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM assets')).rows[0].count);
  if (assetCount === 0) {
    const site = (await pool.query("SELECT id,name FROM sites WHERE code='WKG-01' LIMIT 1")).rows[0];
    const room = site ? (await pool.query("SELECT id FROM locations WHERE site_id=$1 AND code='SR-01' LIMIT 1", [site.id])).rows[0] : null;
    await pool.query(`INSERT INTO assets (asset_number,name,type,site,site_id,location_id,owner,state,serial_number,model) VALUES
      ('AST-000142','SRV-HV-004','Server',$1,$2,$3,'Infrastructure','Operational','CZ-OPS-004','HPE ProLiant DL380'),
      ('AST-000143','LT-0142','Laptop',$1,$2,NULL,'A. User','Operational','LT0142-SN','Dell Latitude'),
      ('AST-000144','SW-R04-01','Network Switch',$1,$2,$3,'Networks','Operational','SWR0401','Aruba Switch')`, [site?.name || 'Workington Main Site', site?.id || null, room?.id || null]);
  } else {
    const site = (await pool.query("SELECT id,name FROM sites WHERE code='WKG-01' LIMIT 1")).rows[0];
    if (site) await pool.query("UPDATE assets SET site_id=$1, site=$2 WHERE site_id IS NULL AND LOWER(site)='workington'", [site.id, site.name]);
  }
}

app.get('/health', async (_req,res) => {
  try { await pool.query('SELECT 1'); res.json({ ok:true, app:'Core Ops Workflow API', database:'connected', auth:'enabled', infrastructure:'server-rooms-racks' }); }
  catch { res.status(503).json({ ok:false, app:'Core Ops Workflow API', database:'unavailable' }); }
});

app.post('/auth/login', async (req,res,next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const result = await pool.query('SELECT id,email,name,password_hash,role,active FROM users WHERE email=$1', [email]);
    const row = result.rows[0];
    if (!row || !row.active || !verifyPassword(password,row.password_hash)) return res.status(401).json({ error:'invalid email or password' });
    const user:AuthUser = { id:row.id,email:row.email,name:row.name,role:row.role,active:row.active };
    await pool.query('UPDATE users SET last_login_at=NOW() WHERE id=$1',[row.id]);
    res.json({ token:signToken(user), user });
  } catch(error) { next(error); }
});

app.get('/auth/me', authRequired, (req,res) => res.json({ user:req.authUser }));
app.get('/api/platform', authRequired, (_req,res) => res.json({ name:'Core Ops Workflow', modules:[{key:'service',name:'Core Ops Service',status:'active'},{key:'infrastructure',name:'Core Ops Infrastructure',status:'server-rooms-racks-live'},{key:'compliance',name:'Core Ops Compliance',status:'site-foundation-active'}] }));

app.use('/api', authRequired);

app.get('/api/dashboard', async (_req,res,next) => { try {
  const [incidents,requests,assets,users,sites,locations,serverRooms,racks] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM incidents WHERE status <> 'Closed'"),
    pool.query('SELECT COUNT(*)::int AS count FROM service_requests'),
    pool.query('SELECT COUNT(*)::int AS count FROM assets'),
    pool.query('SELECT COUNT(*)::int AS count FROM users WHERE active=TRUE'),
    pool.query("SELECT COUNT(*)::int AS count FROM sites WHERE status <> 'Retired'"),
    pool.query("SELECT COUNT(*)::int AS count FROM locations WHERE status <> 'Retired'"),
    pool.query("SELECT COUNT(*)::int AS count FROM server_rooms WHERE status <> 'Retired'"),
    pool.query("SELECT COUNT(*)::int AS count FROM racks WHERE lifecycle_state <> 'Retired'")]);
  res.json({incidents:incidents.rows[0].count,requests:requests.rows[0].count,assets:assets.rows[0].count,users:users.rows[0].count,sites:sites.rows[0].count,locations:locations.rows[0].count,serverRooms:serverRooms.rows[0].count,racks:racks.rows[0].count,slaBreaches:0,changes:0,audits:0});
} catch(error){next(error);} });

app.get('/api/sites', async (_req,res,next)=>{ try {
  const r=await pool.query(`SELECT s.id,s.code,s.name,s.site_type AS "siteType",s.address1,s.city,s.postcode,s.country,s.owner,s.status,s.notes,s.created_at AS "createdAt",COUNT(DISTINCT l.id)::int AS "locationCount",COUNT(DISTINCT a.id)::int AS "assetCount"
    FROM sites s LEFT JOIN locations l ON l.site_id=s.id LEFT JOIN assets a ON a.site_id=s.id
    GROUP BY s.id ORDER BY s.name`);
  res.json(r.rows);
} catch(error){next(error);} });

app.post('/api/sites', requireRoles('Administrator','Infrastructure'), async (req,res,next)=>{ try {
  const code=String(req.body?.code||'').trim().toUpperCase(); const name=String(req.body?.name||'').trim(); const siteType=String(req.body?.siteType||'Office').trim();
  const address1=String(req.body?.address1||'').trim(); const city=String(req.body?.city||'').trim(); const postcode=String(req.body?.postcode||'').trim().toUpperCase();
  const country=String(req.body?.country||'United Kingdom').trim(); const owner=String(req.body?.owner||'').trim(); const status=String(req.body?.status||'Operational').trim(); const notes=String(req.body?.notes||'').trim();
  if(!code||!name)return res.status(400).json({error:'site code and name are required'});
  const r=await pool.query(`INSERT INTO sites (code,name,site_type,address1,city,postcode,country,owner,status,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id,code,name,site_type AS "siteType",address1,city,postcode,country,owner,status,notes`,[code,name,siteType,address1,city,postcode,country,owner,status,notes]); res.status(201).json(r.rows[0]);
} catch(error:any){ if(error?.code==='23505')return res.status(409).json({error:'site code already exists'}); next(error);} });

app.patch('/api/sites/:id', requireRoles('Administrator','Infrastructure'), async (req,res,next)=>{ try {
  const allowed=['name','site_type','address1','city','postcode','country','owner','status','notes']; const map:Record<string,string>={siteType:'site_type'};
  const entries=Object.entries(req.body||{}).map(([k,v])=>[map[k]||k,v]).filter(([k])=>allowed.includes(String(k))); if(!entries.length)return res.status(400).json({error:'no valid fields supplied'});
  const values=entries.map(([,v])=>v); const sets=entries.map(([k],i)=>`${k}=$${i+1}`); values.push(Number(req.params.id));
  const r=await pool.query(`UPDATE sites SET ${sets.join(',')},updated_at=NOW() WHERE id=$${values.length} RETURNING id,code,name,site_type AS "siteType",address1,city,postcode,country,owner,status,notes`,values);
  if(!r.rows[0])return res.status(404).json({error:'site not found'}); res.json(r.rows[0]);
} catch(error){next(error);} });

app.get('/api/locations', async (_req,res,next)=>{ try {
  const r=await pool.query(`SELECT l.id,l.site_id AS "siteId",s.name AS "siteName",l.code,l.name,l.location_type AS "locationType",l.parent_location_id AS "parentLocationId",p.name AS "parentName",l.floor,l.status,l.notes
    FROM locations l JOIN sites s ON s.id=l.site_id LEFT JOIN locations p ON p.id=l.parent_location_id ORDER BY s.name,l.location_type,l.name`); res.json(r.rows);
} catch(error){next(error);} });

app.get('/api/sites/:id/locations', async (req,res,next)=>{ try {
  const r=await pool.query(`SELECT l.id,l.site_id AS "siteId",l.code,l.name,l.location_type AS "locationType",l.parent_location_id AS "parentLocationId",p.name AS "parentName",l.floor,l.status,l.notes,COUNT(a.id)::int AS "assetCount"
    FROM locations l LEFT JOIN locations p ON p.id=l.parent_location_id LEFT JOIN assets a ON a.location_id=l.id
    WHERE l.site_id=$1 GROUP BY l.id,p.name ORDER BY l.location_type,l.name`,[Number(req.params.id)]); res.json(r.rows);
} catch(error){next(error);} });

app.post('/api/sites/:id/locations', requireRoles('Administrator','Infrastructure'), async (req,res,next)=>{ try {
  const siteId=Number(req.params.id); const code=String(req.body?.code||'').trim().toUpperCase(); const name=String(req.body?.name||'').trim();
  const locationType=String(req.body?.locationType||'Room').trim(); const floor=String(req.body?.floor||'').trim(); const status=String(req.body?.status||'Operational').trim(); const notes=String(req.body?.notes||'').trim();
  const parentLocationId=req.body?.parentLocationId ? Number(req.body.parentLocationId) : null; if(!code||!name)return res.status(400).json({error:'location code and name are required'});
  const siteExists=(await pool.query('SELECT id FROM sites WHERE id=$1',[siteId])).rows[0]; if(!siteExists)return res.status(404).json({error:'site not found'});
  if(parentLocationId){const parent=(await pool.query('SELECT id FROM locations WHERE id=$1 AND site_id=$2',[parentLocationId,siteId])).rows[0];if(!parent)return res.status(400).json({error:'parent location must belong to the same site'});}
  const r=await pool.query(`INSERT INTO locations (site_id,code,name,location_type,parent_location_id,floor,status,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING id,site_id AS "siteId",code,name,location_type AS "locationType",parent_location_id AS "parentLocationId",floor,status,notes`,[siteId,code,name,locationType,parentLocationId,floor,status,notes]); res.status(201).json(r.rows[0]);
} catch(error:any){ if(error?.code==='23505')return res.status(409).json({error:'location code already exists at this site'}); next(error);} });

app.get('/api/server-rooms', async (_req,res,next)=>{ try {
  const r=await pool.query(`SELECT sr.id,sr.site_id AS "siteId",s.name AS "siteName",sr.location_id AS "locationId",l.name AS "locationName",sr.code,sr.name,sr.floor,sr.owner,sr.status,sr.max_racks AS "maxRacks",sr.power_capacity_kw::float AS "powerCapacityKw",sr.cooling_capacity_kw::float AS "coolingCapacityKw",sr.notes,COUNT(r.id)::int AS "rackCount"
    FROM server_rooms sr JOIN sites s ON s.id=sr.site_id LEFT JOIN locations l ON l.id=sr.location_id LEFT JOIN racks r ON r.server_room_id=sr.id
    GROUP BY sr.id,s.name,l.name ORDER BY s.name,sr.name`); res.json(r.rows);
} catch(error){next(error);} });

app.post('/api/server-rooms', requireRoles('Administrator','Infrastructure'), async (req,res,next)=>{ try {
  const siteId=Number(req.body?.siteId); const locationId=req.body?.locationId ? Number(req.body.locationId) : null; const code=String(req.body?.code||'').trim().toUpperCase(); const name=String(req.body?.name||'').trim();
  const floor=String(req.body?.floor||'').trim(); const owner=String(req.body?.owner||'').trim(); const status=String(req.body?.status||'Operational').trim(); const maxRacks=Math.max(1,Number(req.body?.maxRacks||20));
  const powerCapacityKw=Math.max(0,Number(req.body?.powerCapacityKw||0)); const coolingCapacityKw=Math.max(0,Number(req.body?.coolingCapacityKw||0)); const notes=String(req.body?.notes||'').trim();
  if(!siteId||!code||!name)return res.status(400).json({error:'site, room code and room name are required'});
  const site=(await pool.query('SELECT id FROM sites WHERE id=$1',[siteId])).rows[0]; if(!site)return res.status(400).json({error:'invalid site'});
  if(locationId){const loc=(await pool.query('SELECT id,site_id FROM locations WHERE id=$1',[locationId])).rows[0];if(!loc||loc.site_id!==siteId)return res.status(400).json({error:'location must belong to the selected site'});}
  const r=await pool.query(`INSERT INTO server_rooms (site_id,location_id,code,name,floor,owner,status,max_racks,power_capacity_kw,cooling_capacity_kw,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING id,site_id AS "siteId",location_id AS "locationId",code,name,floor,owner,status,max_racks AS "maxRacks",power_capacity_kw::float AS "powerCapacityKw",cooling_capacity_kw::float AS "coolingCapacityKw",notes`,[siteId,locationId,code,name,floor,owner,status,maxRacks,powerCapacityKw,coolingCapacityKw,notes]); res.status(201).json(r.rows[0]);
} catch(error:any){if(error?.code==='23505')return res.status(409).json({error:'server room code already exists at this site'});next(error);} });

app.patch('/api/server-rooms/:id', requireRoles('Administrator','Infrastructure'), async (req,res,next)=>{ try {
  const allowed=['name','floor','owner','status','max_racks','power_capacity_kw','cooling_capacity_kw','notes']; const map:Record<string,string>={maxRacks:'max_racks',powerCapacityKw:'power_capacity_kw',coolingCapacityKw:'cooling_capacity_kw'};
  const entries=Object.entries(req.body||{}).map(([k,v])=>[map[k]||k,v]).filter(([k])=>allowed.includes(String(k))); if(!entries.length)return res.status(400).json({error:'no valid fields supplied'});
  const values=entries.map(([,v])=>v); const sets=entries.map(([k],i)=>`${k}=$${i+1}`); values.push(Number(req.params.id));
  const r=await pool.query(`UPDATE server_rooms SET ${sets.join(',')},updated_at=NOW() WHERE id=$${values.length} RETURNING id,site_id AS "siteId",location_id AS "locationId",code,name,floor,owner,status,max_racks AS "maxRacks",power_capacity_kw::float AS "powerCapacityKw",cooling_capacity_kw::float AS "coolingCapacityKw",notes`,values);
  if(!r.rows[0])return res.status(404).json({error:'server room not found'}); res.json(r.rows[0]);
} catch(error){next(error);} });

app.get('/api/racks', async (req,res,next)=>{ try {
  const roomId=req.query.serverRoomId ? Number(req.query.serverRoomId) : null;
  const params:any[]=[]; let where=''; if(roomId){params.push(roomId);where='WHERE r.server_room_id=$1';}
  const result=await pool.query(`SELECT r.id,r.server_room_id AS "serverRoomId",sr.name AS "serverRoomName",sr.code AS "serverRoomCode",s.name AS "siteName",r.rack_code AS "rackCode",r.name,r.manufacturer,r.model,r.rack_units AS "rackUnits",r.width_mm AS "widthMm",r.depth_mm AS "depthMm",r.max_weight_kg::float AS "maxWeightKg",r.power_capacity_kw::float AS "powerCapacityKw",r.cooling_capacity_kw::float AS "coolingCapacityKw",r.asset_tag AS "assetTag",r.serial_number AS "serialNumber",r.owner,r.department,r.status,r.lifecycle_state AS "lifecycleState",r.position_label AS "positionLabel",r.notes,0::int AS "occupiedUnits"
    FROM racks r JOIN server_rooms sr ON sr.id=r.server_room_id JOIN sites s ON s.id=sr.site_id ${where} ORDER BY s.name,sr.name,r.rack_code`,params); res.json(result.rows);
} catch(error){next(error);} });

app.post('/api/racks', requireRoles('Administrator','Infrastructure'), async (req,res,next)=>{ try {
  const serverRoomId=Number(req.body?.serverRoomId); const rackCode=String(req.body?.rackCode||'').trim().toUpperCase(); const name=String(req.body?.name||'').trim(); const rackUnits=Number(req.body?.rackUnits||42);
  const manufacturer=String(req.body?.manufacturer||'').trim(); const model=String(req.body?.model||'').trim(); const widthMm=Number(req.body?.widthMm||600); const depthMm=Number(req.body?.depthMm||1000);
  const maxWeightKg=Math.max(0,Number(req.body?.maxWeightKg||0)); const powerCapacityKw=Math.max(0,Number(req.body?.powerCapacityKw||0)); const coolingCapacityKw=Math.max(0,Number(req.body?.coolingCapacityKw||0));
  const assetTag=String(req.body?.assetTag||'').trim(); const serialNumber=String(req.body?.serialNumber||'').trim(); const owner=String(req.body?.owner||'').trim(); const department=String(req.body?.department||'').trim();
  const status=String(req.body?.status||'Operational').trim(); const lifecycleState=String(req.body?.lifecycleState||'Installed').trim(); const positionLabel=String(req.body?.positionLabel||'').trim(); const notes=String(req.body?.notes||'').trim();
  if(!serverRoomId||!rackCode||!name)return res.status(400).json({error:'server room, rack code and name are required'}); if(!Number.isInteger(rackUnits)||rackUnits<1||rackUnits>60)return res.status(400).json({error:'rack units must be between 1 and 60'});
  const room=(await pool.query('SELECT id,max_racks FROM server_rooms WHERE id=$1',[serverRoomId])).rows[0]; if(!room)return res.status(400).json({error:'invalid server room'});
  const current=Number((await pool.query('SELECT COUNT(*)::int AS count FROM racks WHERE server_room_id=$1',[serverRoomId])).rows[0].count); if(current>=Number(room.max_racks))return res.status(409).json({error:'server room rack capacity reached'});
  const r=await pool.query(`INSERT INTO racks (server_room_id,rack_code,name,manufacturer,model,rack_units,width_mm,depth_mm,max_weight_kg,power_capacity_kw,cooling_capacity_kw,asset_tag,serial_number,owner,department,status,lifecycle_state,position_label,notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    RETURNING id,server_room_id AS "serverRoomId",rack_code AS "rackCode",name,manufacturer,model,rack_units AS "rackUnits",width_mm AS "widthMm",depth_mm AS "depthMm",max_weight_kg::float AS "maxWeightKg",power_capacity_kw::float AS "powerCapacityKw",cooling_capacity_kw::float AS "coolingCapacityKw",asset_tag AS "assetTag",serial_number AS "serialNumber",owner,department,status,lifecycle_state AS "lifecycleState",position_label AS "positionLabel",notes`,[serverRoomId,rackCode,name,manufacturer,model,rackUnits,widthMm,depthMm,maxWeightKg,powerCapacityKw,coolingCapacityKw,assetTag,serialNumber,owner,department,status,lifecycleState,positionLabel,notes]); res.status(201).json(r.rows[0]);
} catch(error:any){if(error?.code==='23505')return res.status(409).json({error:'rack code already exists in this server room'});next(error);} });

app.patch('/api/racks/:id', requireRoles('Administrator','Infrastructure'), async (req,res,next)=>{ try {
  const allowed=['name','manufacturer','model','rack_units','width_mm','depth_mm','max_weight_kg','power_capacity_kw','cooling_capacity_kw','asset_tag','serial_number','owner','department','status','lifecycle_state','position_label','notes'];
  const map:Record<string,string>={rackUnits:'rack_units',widthMm:'width_mm',depthMm:'depth_mm',maxWeightKg:'max_weight_kg',powerCapacityKw:'power_capacity_kw',coolingCapacityKw:'cooling_capacity_kw',assetTag:'asset_tag',serialNumber:'serial_number',lifecycleState:'lifecycle_state',positionLabel:'position_label'};
  const entries=Object.entries(req.body||{}).map(([k,v])=>[map[k]||k,v]).filter(([k])=>allowed.includes(String(k))); if(!entries.length)return res.status(400).json({error:'no valid fields supplied'});
  const values=entries.map(([,v])=>v); const sets=entries.map(([k],i)=>`${k}=$${i+1}`); values.push(Number(req.params.id));
  const r=await pool.query(`UPDATE racks SET ${sets.join(',')},updated_at=NOW() WHERE id=$${values.length} RETURNING id,server_room_id AS "serverRoomId",rack_code AS "rackCode",name,manufacturer,model,rack_units AS "rackUnits",width_mm AS "widthMm",depth_mm AS "depthMm",max_weight_kg::float AS "maxWeightKg",power_capacity_kw::float AS "powerCapacityKw",cooling_capacity_kw::float AS "coolingCapacityKw",asset_tag AS "assetTag",serial_number AS "serialNumber",owner,department,status,lifecycle_state AS "lifecycleState",position_label AS "positionLabel",notes`,values);
  if(!r.rows[0])return res.status(404).json({error:'rack not found'}); res.json(r.rows[0]);
} catch(error){next(error);} });

app.get('/api/incidents', async (_req,res,next)=>{ try { const r=await pool.query(`SELECT number AS id,title,description,priority,status,assignment_group AS "assignmentGroup",caller,asset,opened_at AS "openedAt",updated_at AS "updatedAt" FROM incidents ORDER BY id DESC`); res.json(r.rows);} catch(error){next(error);} });
app.post('/api/incidents', requireRoles('Administrator','Service Desk','Engineer','Infrastructure'), async (req,res,next)=>{ try { const {title,description='',priority='P3',assignmentGroup='Service Desk',caller='Portal User',asset='Unassigned'}=req.body||{}; if(!title||!String(title).trim())return res.status(400).json({error:'title is required'}); const seq=Number((await pool.query('SELECT COALESCE(MAX(id),0)+1 AS next FROM incidents')).rows[0].next); const number=`INC${String(seq).padStart(6,'0')}`; const r=await pool.query(`INSERT INTO incidents (number,title,description,priority,status,assignment_group,caller,asset) VALUES ($1,$2,$3,$4,'Open',$5,$6,$7) RETURNING number AS id,title,description,priority,status,assignment_group AS "assignmentGroup",caller,asset`,[number,String(title).trim(),description,priority,assignmentGroup,caller,asset]); res.status(201).json(r.rows[0]); } catch(error){next(error);} });
app.patch('/api/incidents/:number', requireRoles('Administrator','Service Desk','Engineer','Infrastructure'), async (req,res,next)=>{ try { const allowed=['title','description','priority','status','assignment_group','caller','asset']; const map:Record<string,string>={assignmentGroup:'assignment_group'}; const entries=Object.entries(req.body||{}).map(([k,v])=>[map[k]||k,v]).filter(([k])=>allowed.includes(String(k))); if(!entries.length)return res.status(400).json({error:'no valid fields supplied'}); const values=entries.map(([,v])=>v); const sets=entries.map(([k],i)=>`${k}=$${i+1}`); values.push(req.params.number); const r=await pool.query(`UPDATE incidents SET ${sets.join(',')},updated_at=NOW() WHERE number=$${values.length} RETURNING number AS id,title,priority,status,assignment_group AS "assignmentGroup",caller,asset`,values); if(!r.rows[0])return res.status(404).json({error:'incident not found'}); res.json(r.rows[0]); } catch(error){next(error);} });
app.get('/api/requests', async (_req,res,next)=>{ try { const r=await pool.query(`SELECT number AS id,title,description,status,priority,requested_for AS "requestedFor",assignment_group AS "assignmentGroup",assignee,due_at AS "dueAt",created_at AS "createdAt",updated_at AS "updatedAt" FROM service_requests ORDER BY created_at DESC,number DESC`); res.json(r.rows);} catch(error){next(error);} });

app.get('/api/assets', async (_req,res,next)=>{ try {
  const r=await pool.query(`SELECT a.id AS "dbId",a.asset_number AS id,a.name,a.type,COALESCE(s.name,a.site) AS site,a.site_id AS "siteId",l.id AS "locationId",l.name AS location,a.owner,a.state,a.serial_number AS "serialNumber",a.model
    FROM assets a LEFT JOIN sites s ON s.id=a.site_id LEFT JOIN locations l ON l.id=a.location_id ORDER BY a.id DESC`); res.json(r.rows);
} catch(error){next(error);} });
app.post('/api/assets', requireRoles('Administrator','Engineer','Infrastructure'), async (req,res,next)=>{ try {
  const {name,type='Other',owner='',state='Operational',serialNumber='',model=''}=req.body||{}; if(!name||!String(name).trim())return res.status(400).json({error:'name is required'});
  const siteId=req.body?.siteId ? Number(req.body.siteId) : null; const locationId=req.body?.locationId ? Number(req.body.locationId) : null; let siteName=String(req.body?.site||'').trim();
  if(siteId){const site=(await pool.query('SELECT id,name FROM sites WHERE id=$1',[siteId])).rows[0];if(!site)return res.status(400).json({error:'invalid site'});siteName=site.name;}
  if(locationId){const location=(await pool.query('SELECT id,site_id FROM locations WHERE id=$1',[locationId])).rows[0];if(!location|| (siteId && location.site_id!==siteId))return res.status(400).json({error:'invalid location for selected site'});}
  const seq=Number((await pool.query('SELECT COALESCE(MAX(id),0)+1 AS next FROM assets')).rows[0].next); const assetNumber=`AST-${String(seq).padStart(6,'0')}`;
  const r=await pool.query(`INSERT INTO assets (asset_number,name,type,site,site_id,location_id,owner,state,serial_number,model) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id AS "dbId",asset_number AS id,name,type,site,site_id AS "siteId",location_id AS "locationId",owner,state,serial_number AS "serialNumber",model`,[assetNumber,String(name).trim(),type,siteName,siteId,locationId,owner,state,serialNumber,model]); res.status(201).json(r.rows[0]);
} catch(error){next(error);} });

app.get('/api/users', requireRoles('Administrator'), async (_req,res,next)=>{ try { const r=await pool.query('SELECT id,email,name,role,active,created_at AS "createdAt",last_login_at AS "lastLoginAt" FROM users ORDER BY name'); res.json(r.rows);} catch(error){next(error);} });
app.post('/api/users', requireRoles('Administrator'), async (req,res,next)=>{ try { const email=String(req.body?.email||'').trim().toLowerCase(); const name=String(req.body?.name||'').trim(); const password=String(req.body?.password||''); const role=String(req.body?.role||'Read Only') as Role; const roles:Role[]=['Administrator','Service Desk','Engineer','Infrastructure','Auditor','Read Only']; if(!email||!name||password.length<10||!roles.includes(role))return res.status(400).json({error:'valid email, name, role and password of at least 10 characters are required'}); const r=await pool.query('INSERT INTO users (email,name,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id,email,name,role,active',[email,name,hashPassword(password),role]); res.status(201).json(r.rows[0]); } catch(error:any){ if(error?.code==='23505')return res.status(409).json({error:'email already exists'}); next(error);} });

app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{ console.error(error); res.status(500).json({error:'internal server error'}); });

initDatabase().then(()=>app.listen(port,'0.0.0.0',()=>console.log(`Core Ops Workflow base API listening on ${port}`))).catch(error=>{ console.error('Core Ops database initialisation failed',error); process.exit(1); });
