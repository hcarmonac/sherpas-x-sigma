import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import twilio from 'twilio';
import { cases, instructions, respond } from './agent.mjs';
import { createAi } from './ai.mjs';
import { addCalls } from './calls.mjs';
import { createStore } from './store.mjs';

const day = 24 * 60 * 60 * 1_000;
const audioLimit = 4_000_000;
const numberOf = (value) => String(value ?? '').replace(/^whatsapp:/i, '');
const whatsapp = (number) => `whatsapp:${number}`;

function config(env) {
  const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'WHATSAPP_FROM', 'WHATSAPP_CLIENTS', 'WHATSAPP_PUBLIC_URL', 'TEAM_KEY'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Faltan variables: ${missing.join(', ')}`);
  const publicUrl = new URL(env.WHATSAPP_PUBLIC_URL);
  if (publicUrl.protocol !== 'https:' || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) {
    throw new Error('WHATSAPP_PUBLIC_URL debe ser el origen HTTPS público, sin ruta');
  }
  const entries = Object.entries(JSON.parse(env.WHATSAPP_CLIENTS));
  const sender = numberOf(env.WHATSAPP_FROM);
  if (!/^\+[1-9]\d{6,14}$/.test(sender)) throw new Error('WHATSAPP_FROM debe ser un número en formato internacional');
  const voiceNumber = env.TWILIO_VOICE_NUMBER || '';
  if (voiceNumber && !/^\+[1-9]\d{6,14}$/.test(voiceNumber)) throw new Error('TWILIO_VOICE_NUMBER debe ser un número en formato internacional');
  if (!entries.length) throw new Error('Configura al menos un cliente de prueba en WHATSAPP_CLIENTS');
  const clients = new Map(entries.map(([number, id]) => {
    if (!/^\+[1-9]\d{6,14}$/.test(number) || !cases.has(id)) throw new Error('Revisa el número o caso en WHATSAPP_CLIENTS');
    const key = createHash('sha256').update(`${number}:${id}`).digest('hex');
    return [number, { number, key, plan: cases.get(id) }];
  }));
  return { origin: publicUrl.origin, sender, voiceNumber, clients };
}

async function getForm(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_768) throw new Error('Webhook demasiado grande');
    chunks.push(chunk);
  }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
}

async function downloadMedia(uri, auth, account) {
  const url = new URL(uri);
  if (url.origin !== 'https://api.twilio.com' || !url.pathname.startsWith(`/2010-04-01/Accounts/${account}/Messages/`)) {
    throw new Error('URL de audio no válida');
  }
  const response = await fetch(url, {
    headers: { Authorization: 'Basic ' + Buffer.from(auth).toString('base64') },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error('Audio no disponible');
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > audioLimit) throw new Error('Audio demasiado grande');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function makeService(env, deps = {}) {
  const { origin, sender, voiceNumber, clients } = config(env);
  const byKey = new Map([...clients.values()].map((client) => [client.key, client]));
  const provider = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, { timeout: 12_000 });
  const send = deps.send ?? ((number, message) => provider.messages.create({
    from: whatsapp(sender), to: whatsapp(number), ...message,
  }));
  const download = deps.download ?? ((url) => downloadMedia(
    url, `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`, env.TWILIO_ACCOUNT_SID,
  ));
  const ai = deps.ai ?? createAi(env);
  const store = createStore(env.WHATSAPP_DB || fileURLToPath(new URL('./data.sqlite', import.meta.url)));
  const audio = new Map();
  const tickets = new Map();
  const history = new Map();
  let busy = false;

  function valid(req, params, stream = false) {
    const signature = req.headers['x-twilio-signature'];
    if (typeof signature !== 'string') return false;
    const url = origin + req.url;
    const check = (uri) => twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, uri, params);
    return check(url) || (stream && (check(url + '/') || check(url.replace(/^https:/, 'wss:'))));
  }

  function takeTicket(start) {
    const id = start?.customParameters?.ticket;
    const ticket = tickets.get(id);
    if (!ticket || ticket.expires <= Date.now() || start.callSid !== ticket.callSid ||
        start.accountSid !== env.TWILIO_ACCOUNT_SID) return undefined;
    tickets.delete(id);
    return instructions(ticket.client.plan) + '\nYou are speaking with the client in a live phone call. Keep answers to two or three short sentences unless more detail is requested. Speak naturally without Markdown. Ask whether the caller is Timothy or Melanie before answering a personal question if they have not identified themselves.';
  }

  const server = createServer(async (req, res) => {
    const path = new URL(req.url, origin).pathname;
    if (req.method === 'GET' && path === '/health') return res.end('ok');
    if (['GET', 'HEAD'].includes(req.method) && path.startsWith('/audio/')) {
      const clip = audio.get(path.slice('/audio/'.length));
      if (!clip || clip.expires <= Date.now()) return res.writeHead(404).end();
      return res.writeHead(200, { 'Content-Type': 'audio/ogg', 'Content-Length': clip.data.length,
        'Cache-Control': 'no-store' }).end(req.method === 'GET' ? clip.data : undefined);
    }
    if (req.method !== 'POST' || !['/twilio/messages', '/twilio/call'].includes(path)) return res.writeHead(404).end();

    try {
      const params = await getForm(req);
      if (!valid(req, params) || params.AccountSid !== env.TWILIO_ACCOUNT_SID) return res.writeHead(403).end();
      const client = clients.get(numberOf(params.From));
      const allowed = client && numberOf(params.To) === sender;
      if (path === '/twilio/messages') {
        if (allowed && params.MessageSid) {
          store.enqueue(params.MessageSid, client.key, {
            text: (params.Body ?? '').slice(0, 2000),
            media: params.MediaContentType0?.startsWith('audio/') && params.MediaUrl0
              ? { url: params.MediaUrl0, type: params.MediaContentType0 } : undefined,
            unsupported: Number(params.NumMedia) > 0 && !params.MediaContentType0?.startsWith('audio/'),
          });
        }
        res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' }).end('<Response/>');
        void work();
        return;
      }

      const response = new twilio.twiml.VoiceResponse();
      const whatsappCall = allowed && params.From.startsWith('whatsapp:') && params.To.startsWith('whatsapp:') && env.WHATSAPP_CALLS === '1';
      const phoneCall = client && voiceNumber && params.To === voiceNumber && params.From === client.number;
      for (const [id, ticket] of tickets) if (ticket.expires <= Date.now()) tickets.delete(id);
      if ((phoneCall || whatsappCall) && params.CallSid && !tickets.size && !calls.active) {
        const ticket = randomUUID();
        tickets.set(ticket, { client, callSid: params.CallSid, expires: Date.now() + 45_000 });
        response.say({ language: 'en-US' }, "I'm Senda, the AI assistant for your financial plan. Please wait for the tone, then tell me whether you're Timothy or Melanie and ask your question.");
        const stream = response.connect().stream({ url: origin.replace(/^https:/, 'wss:') + '/twilio/stream' });
        stream.parameter({ name: 'ticket', value: ticket });
        response.say({ language: 'en-US' }, 'The voice session has ended. You can continue chatting with Senda.');
      } else {
        response.say({ language: 'en-US' }, 'Calling is unavailable. You can ask questions by chat if you have a demo case.');
      }
      response.hangup();
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' }).end(response.toString());
    } catch {
      if (!res.headersSent) res.writeHead(500).end();
    }
  });
  const calls = addCalls(server, { valid, takeTicket, ai });

  async function handle(job) {
    const client = byKey.get(job.key);
    if (!client || Date.now() - job.at >= day) return;
    const { media, unsupported, text } = JSON.parse(job.payload);
    let question = text;
    if (unsupported) return send(client.number, { body: 'Please send your question as text or a voice note.' });
    if (media) {
      try { question = await ai.transcribe(await download(media.url), media.type); } catch (error) {
        console.warn('Nota de voz falló', error.cause?.code ?? error.status ?? error.name);
        question = '';
      }
      if (!question) return send(client.number, { body: "I couldn't understand that voice note. Please send it again or type your question." });
    }
    const recent = history.get(client.key);
    const prior = recent?.until > Date.now() ? recent.turns : [];
    const reply = await respond({ plan: client.plan, text: question, voice: Boolean(media), ai, prior });
    if (reply.question) history.set(client.key, { until: Date.now() + day,
      turns: [...prior, { role: 'user', content: reply.question }, { role: 'assistant', content: reply.text }].slice(-6) });
    if (reply.audio) {
      let data;
      try { data = await ai.speak(reply.text); } catch { /* la respuesta escrita sirve de respaldo */ }
      if (data) {
        const id = randomUUID() + '.ogg';
        audio.set(id, { data, expires: Date.now() + 15 * 60_000 });
        return send(client.number, { mediaUrl: [`${origin}/audio/${id}`] });
      }
    }
    await send(client.number, { body: reply.text });
  }

  async function work() {
    if (busy) return;
    busy = true;
    try {
      const job = store.queued();
      if (job && store.claim(job.id)) {
        try { await handle(job); store.finish(job.id, true); }
        catch (error) { store.finish(job.id, false); console.warn('Respuesta WhatsApp falló', error.code ?? error.status ?? ''); }
      }
      const now = Date.now();
      for (const [id, clip] of audio) if (clip.expires <= now) audio.delete(id);
      for (const [id, ticket] of tickets) if (ticket.expires <= now) tickets.delete(id);
      for (const [id, recent] of history) if (recent.until <= now) history.delete(id);
    } catch {
      console.warn('Cola de WhatsApp no disponible');
    } finally { busy = false; }
  }

  const poll = setInterval(work, 2_000);
  poll.unref();
  server.once('close', () => clearInterval(poll));
  return { server, store, work };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { server } = makeService(process.env);
    const port = Number(process.env.WHATSAPP_PORT || 5180);
    server.listen(port, '127.0.0.1', () => console.log(`Senda WhatsApp en http://127.0.0.1:${port}`));
  } catch (error) {
    console.error(error instanceof SyntaxError ? 'WHATSAPP_CLIENTS debe ser JSON válido' : error.message);
    process.exitCode = 1;
  }
}
