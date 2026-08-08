import express from 'express';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = Number(process.env.PORT || 3000);
const apiUrl = new URL(process.env.API_URL || 'http://opscore-api:5058');
const proxyClient = apiUrl.protocol === 'https:' ? https : http;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');

function proxyToApi(req, res) {
  const targetPath = req.originalUrl;
  const headers = { ...req.headers, host: apiUrl.host };
  delete headers['content-length'];

  const proxyReq = proxyClient.request({
    protocol: apiUrl.protocol,
    hostname: apiUrl.hostname,
    port: apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: targetPath,
    headers
  }, proxyRes => {
    res.statusCode = proxyRes.statusCode || 502;
    for (const [name, value] of Object.entries(proxyRes.headers)) {
      if (value !== undefined) res.setHeader(name, value);
    }
    proxyRes.pipe(res);
  });

  proxyReq.on('error', error => {
    console.error('OpsCore API proxy error', error.message);
    if (!res.headersSent) res.status(502).json({ error: 'OpsCore API unavailable' });
    else res.end();
  });

  req.pipe(proxyReq);
}

app.get('/health', (_req, res) => res.json({ ok: true, app: 'OpsCore Web', version: 'v4-login2', apiProxy: apiUrl.origin }));
app.use('/api', proxyToApi);
app.use('/auth', proxyToApi);
app.use(express.static(dist));
app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(port, '0.0.0.0', () => console.log(`OpsCore Web v4-login2 listening on ${port}; API proxy ${apiUrl.origin}`));
