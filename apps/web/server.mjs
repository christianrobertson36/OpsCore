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
  const proxyReq = proxyClient.request({protocol:apiUrl.protocol,hostname:apiUrl.hostname,port:apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80),method:req.method,path:targetPath,headers}, proxyRes => {
    res.statusCode = proxyRes.statusCode || 502;
    for (const [name, value] of Object.entries(proxyRes.headers)) if (value !== undefined) res.setHeader(name, value);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', error => {
    console.error('Core Ops Workflow API proxy error', error.message);
    if (!res.headersSent) res.status(502).json({ error: 'Core Ops Workflow API unavailable' }); else res.end();
  });
  req.pipe(proxyReq);
}

app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else if (req.path.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  next();
});

app.get('/health', (_req, res) => res.json({ok:true,app:'Core Ops Workflow Web',version:'v29',apiProxy:apiUrl.origin,equipment:'half-u-depth-aware',licensing:'activation-and-sync',brand:'core-ops-workflow',loginRender:'static-css-atomic',topNavigation:'full-width-no-scroll',enterpriseModules:'complete',reporting:'live-summary',dcamBridge:'live-overview-identity-mapping-record-drill-in',monitoring:'http-tcp-foundation',sla:'policy-tracking-foundation',notifications:'in-app-alert-centre',versionDisplay:'current-build',i18n:['en-GB','ro-RO']}));
app.use('/api', proxyToApi);
app.use('/auth', proxyToApi);
app.use(express.static(dist, { etag:true, maxAge:0 }));
app.use((_req, res) => {res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.sendFile(path.join(dist,'index.html'))});

app.listen(port,'0.0.0.0',()=>console.log(`Core Ops Workflow Web v29 listening on ${port}; API proxy ${apiUrl.origin}; full-width no-scroll top navigation; notification centre; SLA management; Monitoring foundation; languages en-GB, ro-RO`));
