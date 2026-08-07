import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const port = Number(process.env.PORT || 5058);

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, app: 'OpsCore API', version: 'v1' });
});

app.get('/api/platform', (_req, res) => {
  res.json({
    name: 'OpsCore',
    version: 'v1',
    modules: [
      { key: 'service', name: 'OpsCore Service', status: 'active' },
      { key: 'infrastructure', name: 'OpsCore Infrastructure', status: 'planned' },
      { key: 'compliance', name: 'OpsCore Compliance', status: 'planned' }
    ]
  });
});

app.get('/api/incidents', (_req, res) => {
  res.json([
    { id: 'INC000001', title: 'Example incident', priority: 'P3', status: 'Open', assignmentGroup: 'Service Desk' }
  ]);
});

app.get('/api/requests', (_req, res) => {
  res.json([
    { id: 'REQ000001', title: 'Example service request', status: 'New', requestedFor: 'Demo User' }
  ]);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`OpsCore API v1 listening on ${port}`);
});
