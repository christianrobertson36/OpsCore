import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');

app.get('/health', (_req, res) => res.json({ ok: true, app: 'OpsCore Web', version: 'v1' }));
app.use(express.static(dist));
app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(port, '0.0.0.0', () => console.log(`OpsCore Web v1 listening on ${port}`));
