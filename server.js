/**
 * server.js — Plain Node.js HTTP server for GitHub Codespaces / local dev
 * No Vercel CLI needed. Just run: node server.js
 */

import http from 'http';
import { URL } from 'url';

const PORT = process.env.PORT || 3000;

// ── Load all handlers ────────────────────────────────────────────────────────
import healthHandler          from './api/health.js';
import schemaHandler          from './api/schema.js';
import transformHandler       from './api/transform.js';
import passportHandler        from './api/passport.js';
import deliverHandler         from './api/deliver.js';
import ingestHandler          from './api/ingest/index.js';
import ingestWhatsappHandler  from './api/ingest/whatsapp.js';
import ingestCsvHandler       from './api/ingest/csv.js';
import waStatusHandler        from './api/whatsapp-status.js';
import cameraUploadHandler    from './api/camera/upload.js';
import cameraReadingsHandler  from './api/camera/readings.js';
import esgReportHandler       from './api/esg-report.js';

// ── Start camera simulator (every 30 min) ───────────────────────────────────
import { initScheduler } from './lib/scheduler.js';
initScheduler();

// ── Simple request adapter (Vercel req/res → Node req/res) ──────────────────
function buildReq(nodeReq, body, parsedUrl) {
  const query = Object.fromEntries(parsedUrl.searchParams.entries());
  return Object.assign(nodeReq, { method: nodeReq.method, url: nodeReq.url, query, body });
}

function buildRes(nodeRes) {
  let headersSent = false;
  const res = {
    _status: 200,
    headers: {},
    status(code) { res._status = code; return res; },
    setHeader(k, v) { res.headers[k] = v; return res; },
    json(data) {
      if (headersSent) return;
      headersSent = true;
      const body = JSON.stringify(data);
      nodeRes.writeHead(res._status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...res.headers,
      });
      nodeRes.end(body);
    },
    send(data) {
      if (headersSent) return;
      headersSent = true;
      nodeRes.writeHead(res._status, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        ...res.headers,
      });
      nodeRes.end(String(data));
    },
    end(data) { res.send(data || ''); },
  };
  return res;
}

// ── Route table ──────────────────────────────────────────────────────────────
function getHandler(pathname) {
  if (pathname === '/api/health')               return healthHandler;
  if (pathname === '/api/schema')               return schemaHandler;
  if (pathname === '/api/transform')            return transformHandler;
  if (pathname.startsWith('/api/passport'))     return passportHandler;
  if (pathname === '/api/deliver')              return deliverHandler;
  if (pathname === '/api/ingest/whatsapp')      return ingestWhatsappHandler;
  if (pathname === '/api/ingest/csv')           return ingestCsvHandler;
  if (pathname === '/api/ingest')               return ingestHandler;
  if (pathname === '/api/whatsapp-status')      return waStatusHandler;
  if (pathname === '/api/camera/upload')        return cameraUploadHandler;
  if (pathname === '/api/camera/readings')      return cameraReadingsHandler;
  if (pathname.startsWith('/api/esg-report'))   return esgReportHandler;
  return null;
}

// ── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (nodeReq, nodeRes) => {
  const parsedUrl = new URL(nodeReq.url, `http://localhost:${PORT}`);
  const pathname  = parsedUrl.pathname;

  if (nodeReq.method === 'OPTIONS') {
    nodeRes.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key',
    });
    nodeRes.end();
    return;
  }

  let body = {};
  if (['POST','PUT','PATCH'].includes(nodeReq.method)) {
    await new Promise(resolve => {
      let raw = '';
      nodeReq.on('data', chunk => raw += chunk);
      nodeReq.on('end', () => {
        try { body = JSON.parse(raw); } catch { body = {}; }
        resolve();
      });
    });
  }

  const handler = getHandler(pathname);

  if (!handler) {
    nodeRes.writeHead(404, { 'Content-Type': 'application/json' });
    nodeRes.end(JSON.stringify({
      error: 'Route not found',
      path: pathname,
      available: [
        '/api/health', '/api/schema', '/api/ingest',
        '/api/ingest/whatsapp', '/api/ingest/csv',
        '/api/transform', '/api/passport', '/api/deliver',
        '/api/whatsapp-status', '/api/camera/upload',
        '/api/camera/readings', '/api/esg-report',
      ]
    }));
    return;
  }

  const req = buildReq(nodeReq, body, parsedUrl);
  const res = buildRes(nodeRes);

  try {
    await handler(req, res);
  } catch (err) {
    console.error(`[${pathname}] Error:`, err.message);
    if (!nodeRes.headersSent) {
      nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
      nodeRes.end(JSON.stringify({ error: err.message }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`\n${'='.repeat(55)}`);
  console.log(`  SupplyMind AI Backend — Running on port ${PORT}`);
  console.log(`  http://localhost:${PORT}/api/health`);
  console.log(`  http://localhost:${PORT}/api/esg-report`);
  console.log(`${'='.repeat(55)}\n`);
});
