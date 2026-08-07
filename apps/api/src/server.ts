import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 5058);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors());
app.use(express.json());

async function initDatabase() {
  await pool.query(`
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
      owner VARCHAR(120) DEFAULT '',
      state VARCHAR(40) NOT NULL DEFAULT 'Operational',
      serial_number VARCHAR(160) DEFAULT '',
      model VARCHAR(160) DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const incidentCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM incidents')).rows[0].count);
  if (incidentCount === 0) {
    await pool.query(`INSERT INTO incidents (number,title,description,priority,status,assignment_group,caller,asset) VALUES
      ('INC000001','VPN access unavailable','Remote user cannot establish VPN connection.','P2','In Progress','Service Desk','A. User','LT-0142'),
      ('INC000002','Printer offline in Finance','Finance floor printer is unavailable.','P3','Open','Deskside','J. Smith','PRN-FIN-01'),
      ('INC000003','Hypervisor storage alert','Monitoring detected a critical storage alert.','P1','Open','Infrastructure','Monitoring','SRV-HV-004')`);
  }

  const requestCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM service_requests')).rows[0].count);
  if (requestCount === 0) {
    await pool.query(`INSERT INTO service_requests (number,title,status,requested_for) VALUES
      ('REQ000001','New starter equipment','Awaiting Approval','M. Brown'),
      ('REQ000002','Microsoft 365 licence','Fulfilment','S. Wilson')`);
  }

  const assetCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM assets')).rows[0].count);
  if (assetCount === 0) {
    await pool.query(`INSERT INTO assets (asset_number,name,type,site,owner,state,serial_number,model) VALUES
      ('AST-000142','SRV-HV-004','Server','Workington','Infrastructure','Operational','CZ-OPS-004','HPE ProLiant DL380'),
      ('AST-000143','LT-0142','Laptop','Workington','A. User','Operational','LT0142-SN','Dell Latitude'),
      ('AST-000144','SW-R04-01','Network Switch','Workington','Networks','Operational','SWR0401','Aruba Switch')`);
  }
}

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, app: 'OpsCore API', version: 'v3', database: 'connected' });
  } catch (error) {
    res.status(503).json({ ok: false, app: 'OpsCore API', version: 'v3', database: 'unavailable' });
  }
});

app.get('/api/platform', (_req, res) => {
  res.json({ name: 'OpsCore', version: 'v3', modules: [
    { key: 'service', name: 'OpsCore Service', status: 'active' },
    { key: 'infrastructure', name: 'OpsCore Infrastructure', status: 'integration-ready' },
    { key: 'compliance', name: 'OpsCore Compliance', status: 'integration-ready' }
  ]});
});

app.get('/api/dashboard', async (_req, res, next) => {
  try {
    const [incidents, requests, assets] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS count FROM incidents WHERE status <> 'Closed'"),
      pool.query('SELECT COUNT(*)::int AS count FROM service_requests'),
      pool.query('SELECT COUNT(*)::int AS count FROM assets')
    ]);
    res.json({
      incidents: incidents.rows[0].count,
      requests: requests.rows[0].count,
      assets: assets.rows[0].count,
      slaBreaches: 0,
      changes: 0,
      audits: 0,
      serverRooms: 0
    });
  } catch (error) { next(error); }
});

app.get('/api/incidents', async (_req, res, next) => {
  try {
    const result = await pool.query(`SELECT number AS id,title,description,priority,status,assignment_group AS "assignmentGroup",caller,asset,opened_at AS "openedAt",updated_at AS "updatedAt" FROM incidents ORDER BY id DESC`);
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.post('/api/incidents', async (req, res, next) => {
  try {
    const { title, description = '', priority = 'P3', assignmentGroup = 'Service Desk', caller = 'Portal User', asset = 'Unassigned' } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });
    const seq = Number((await pool.query('SELECT COALESCE(MAX(id),0)+1 AS next FROM incidents')).rows[0].next);
    const number = `INC${String(seq).padStart(6, '0')}`;
    const result = await pool.query(`INSERT INTO incidents (number,title,description,priority,status,assignment_group,caller,asset) VALUES ($1,$2,$3,$4,'Open',$5,$6,$7) RETURNING number AS id,title,description,priority,status,assignment_group AS "assignmentGroup",caller,asset,opened_at AS "openedAt"`, [number, String(title).trim(), description, priority, assignmentGroup, caller, asset]);
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.patch('/api/incidents/:number', async (req, res, next) => {
  try {
    const allowed = ['title','description','priority','status','assignment_group','caller','asset'];
    const map: Record<string,string> = { assignmentGroup: 'assignment_group' };
    const entries = Object.entries(req.body || {}).map(([k,v]) => [map[k] || k,v]).filter(([k]) => allowed.includes(String(k)));
    if (!entries.length) return res.status(400).json({ error: 'no valid fields supplied' });
    const values = entries.map(([,v]) => v);
    const sets = entries.map(([k],i) => `${k}=$${i+1}`);
    values.push(req.params.number);
    const result = await pool.query(`UPDATE incidents SET ${sets.join(',')}, updated_at=NOW() WHERE number=$${values.length} RETURNING number AS id,title,description,priority,status,assignment_group AS "assignmentGroup",caller,asset,opened_at AS "openedAt",updated_at AS "updatedAt"`, values);
    if (!result.rows[0]) return res.status(404).json({ error: 'incident not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.get('/api/requests', async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT number AS id,title,status,requested_for AS "requestedFor",created_at AS "createdAt" FROM service_requests ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.get('/api/assets', async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT asset_number AS id,name,type,site,owner,state,serial_number AS "serialNumber",model FROM assets ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.post('/api/assets', async (req, res, next) => {
  try {
    const { name, type = 'Other', site = '', owner = '', state = 'Operational', serialNumber = '', model = '' } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
    const seq = Number((await pool.query('SELECT COALESCE(MAX(id),0)+1 AS next FROM assets')).rows[0].next);
    const assetNumber = `AST-${String(seq).padStart(6, '0')}`;
    const result = await pool.query(`INSERT INTO assets (asset_number,name,type,site,owner,state,serial_number,model) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING asset_number AS id,name,type,site,owner,state,serial_number AS "serialNumber",model`, [assetNumber, String(name).trim(), type, site, owner, state, serialNumber, model]);
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'internal server error' });
});

initDatabase().then(() => {
  app.listen(port, '0.0.0.0', () => console.log(`OpsCore API v3 listening on ${port}`));
}).catch((error) => {
  console.error('OpsCore database initialisation failed', error);
  process.exit(1);
});
