import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { cases } from './cases.mjs';

const files = {
  '/': ['./public/index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['./public/styles.css', 'text/css; charset=utf-8'],
  '/app.mjs': ['./public/app.mjs', 'text/javascript; charset=utf-8'],
  '/progress.mjs': ['./public/progress.mjs', 'text/javascript; charset=utf-8'],
  '/calendar.mjs': ['./public/calendar.mjs', 'text/javascript; charset=utf-8'],
  '/voice.mjs': ['./public/voice.mjs', 'text/javascript; charset=utf-8'],
  '/brand-banner.png': ['../assets/banner.png', 'image/png'],
  '/trail-map.mjs': ['./public/trail-map.mjs', 'text/javascript; charset=utf-8'],
  '/mic-worklet.js': ['../examples/voice/public/mic-worklet.js', 'text/javascript; charset=utf-8'],
};

const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) loadEnvFile(envFile);

const host = process.env.SENDA_HOST || '127.0.0.1';
const port = Number(process.env.SENDA_PORT || 5173);
const voiceRequested = process.env.SENDA_VOICE === '1' ||
  (process.env.SENDA_VOICE !== '0' && ['127.0.0.1', 'localhost', '::1'].includes(host));
const voiceEnabled = voiceRequested && Boolean(process.env.TEAM_KEY);
const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405, { Allow: 'GET, HEAD' }).end();

  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/api/cases') {
    return res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      .end(JSON.stringify({ cases, voiceEnabled }));
  }

  const file = Object.hasOwn(files, path) ? files[path] : null;
  if (!file) return res.writeHead(404).end('Página no encontrada');

  try {
    const [filename, type] = file;
    const body = await readFile(new URL(filename, import.meta.url));
    res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' }).end(body);
  } catch {
    res.writeHead(500).end('No se pudo cargar la página');
  }
});

if (voiceEnabled) {
  const { addVoice } = await import('./voice-server.mjs');
  addVoice(server, cases);
}

server.listen(port, host, () => {
  console.log(`Senda en http://${host}:${server.address().port}`);
});
