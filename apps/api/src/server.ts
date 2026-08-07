import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const port = Number(process.env.PORT || 5058);

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, app: 'OpsCore API', version: 'v2' });
});

app.get('/api/platform', (_req, res) => {
  res.json({
    name: 'OpsCore',
    version: 'v2',
    modules: [
      { key: 'service', name: 'OpsCore Service', status: 'active' },
      { key: 'infrastructure', name: 'OpsCore Infrastructure', status: 'integration-ready' },
      { key: 'compliance', name: 'OpsCore Compliance', status: 'integration-ready' }
    ]
  });
});

app.get('/api/incidents', (_req, res) => {
  res.json([
    { id: 'INC000001', title: 'VPN access unavailable', priority: 'P2', status: 'In Progress', assignmentGroup: 'Service Desk', asset: 'LT-0142' },
    { id: 'INC000002', title: 'Printer offline in Finance', priority: 'P3', status: 'Open', assignmentGroup: 'Deskside', asset: 'PRN-FIN-01' },
    { id: 'INC000003', title: 'Hypervisor storage alert', priority: 'P1', status: 'Open', assignmentGroup: 'Infrastructure', asset: 'SRV-HV-004' }
  ]);
});

app.get('/api/requests', (_req, res) => {
  res.json([
    { id: 'REQ000001', title: 'New starter equipment', status: 'Awaiting Approval', requestedFor: 'M. Brown' },
    { id: 'REQ000002', title: 'Microsoft 365 licence', status: 'Fulfilment', requestedFor: 'S. Wilson' }
  ]);
});

app.get('/api/assets', (_req, res) => {
  res.json([
    { id: 'AST-000142', name: 'SRV-HV-004', type: 'Server', site: 'Workington', owner: 'Infrastructure', state: 'Operational' },
    { id: 'AST-000143', name: 'LT-0142', type: 'Laptop', site: 'Workington', owner: 'A. User', state: 'Operational' },
    { id: 'AST-000144', name: 'SW-R04-01', type: 'Network Switch', site: 'Workington', owner: 'Networks', state: 'Operational' }
  ]);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`OpsCore API v2 listening on ${port}`);
});
