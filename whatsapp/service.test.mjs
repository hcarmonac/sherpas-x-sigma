import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import twilio from 'twilio';
import { WebSocket, WebSocketServer } from 'ws';
import { makeService } from './server.mjs';
import { createAi } from './ai.mjs';
import { cases, respond } from './agent.mjs';
import { addCalls } from './calls.mjs';

test('consultas de los Weah, conversaciones aisladas, notas y llamada', { timeout: 16_000 }, async (t) => {
  const env = {
    TWILIO_ACCOUNT_SID: 'AC' + '0'.repeat(32), TWILIO_AUTH_TOKEN: 'local-test-token',
    TEAM_KEY: 'local-test-ai', WHATSAPP_PORT: '0', WHATSAPP_PUBLIC_URL: 'https://senda.example',
    WHATSAPP_FROM: '+15550000003', WHATSAPP_CALLS: '1', WHATSAPP_DB: ':memory:',
    TWILIO_VOICE_NUMBER: '+15550000005',
    WHATSAPP_CLIENTS: JSON.stringify({ '+15550000001': 'timothy-melanie-weah', '+15550000002': 'timothy-melanie-weah' }),
  };
  const sent = [];
  const prompts = [];
  const histories = [];
  let connections = 0;
  const realtime = new WebSocketServer({ port: 0, host: '127.0.0.1', verifyClient(info, done) {
    connections++;
    done(connections > 1, 503, 'Service Unavailable');
  } });
  await once(realtime, 'listening');
  realtime.on('connection', (peer) => {
    peer.send(JSON.stringify({ type: 'session.created' }));
    peer.on('message', (raw) => {
    const event = JSON.parse(raw);
    if (event.type === 'session.update') {
      prompts.push(event.session.instructions);
      peer.send(JSON.stringify({ type: 'session.updated' }));
    }
    if (event.type === 'input_audio_buffer.append') {
      assert.equal(Buffer.from(event.audio, 'base64').length, 960);
      peer.send(JSON.stringify({ type: 'response.created' }));
      peer.send(JSON.stringify({ type: 'response.output_audio.delta', delta: Buffer.alloc(960).toString('base64') }));
    }
    });
  });
  const { server, work } = makeService(env, {
    ai: {
      realtimeUrl: `ws://127.0.0.1:${realtime.address().port}`, token: 'fake',
      async answer(prompt, question, prior) {
        if (question === 'provider-unavailable') throw new Error('Proveedor de prueba no disponible');
        prompts.push(prompt);
        histories.push(prior);
        return question + ' respondida';
      },
      async transcribe() { return 'Pregunta de audio'; },
      async speak() { return Buffer.from('OggS test'); },
    },
    send: async (number, message) => sent.push({ number, message }),
    download: async () => Buffer.from('audio de prueba'),
  });
  t.after(() => { for (const ws of realtime.clients) ws.terminate(); realtime.close(); server.close(); });
  await once(server.listen(0, '127.0.0.1'), 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const sign = (path, fields) => twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, env.WHATSAPP_PUBLIC_URL + path, fields);
  const msg = (from, id, text, extra = {}, path = '/twilio/messages', valid = true) => {
    const fields = { From: `whatsapp:${from}`, To: `whatsapp:${env.WHATSAPP_FROM}`, MessageSid: id, Body: text,
      AccountSid: env.TWILIO_ACCOUNT_SID, ...extra };
    return fetch(base + path, { method: 'POST', body: new URLSearchParams(fields),
      headers: { 'X-Twilio-Signature': valid ? sign(path, fields) : 'firma-inválida' } });
  };
  async function until(check) {
    for (let i = 0; i < 80; i++) {
      if (check()) return;
      await work();
      await new Promise((done) => setTimeout(done, 15));
    }
    assert.fail('No llegó el estado esperado');
  }

  const [timothy, melanie, stranger] = ['+15550000001', '+15550000002', '+15550000004'];
  assert.equal((await msg(timothy, 'bad', 'Cartera', {}, undefined, false)).status, 403);
  await msg(stranger, 'unassigned', 'Cartera');
  assert.equal(sent.length, 0);
  await msg(timothy, 'one', 'Soy Timothy. Qué hay en mi cartera');
  await msg(timothy, 'one', 'Soy Timothy. Qué hay en mi cartera');
  await msg(melanie, 'two', '', { NumMedia: '1', MediaUrl0: 'https://example.test/audio', MediaContentType0: 'audio/ogg' });
  await until(() => sent.length === 2);
  assert.match(prompts[0], /Timothy y Melanie Weah/);
  assert.doesNotMatch(prompts[0], /Samantha Lewis/);
  assert.match(prompts[1], /Timothy y Melanie Weah/);
  assert.match(prompts[1], /Puedes atender consultas por audio/);
  assert.match(prompts[1], /Always respond in American English/);
  assert.doesNotMatch(prompts[1], /Samantha Lewis/);
  assert.equal(sent[0].number, timothy);
  assert.equal(sent[1].number, melanie);
  const media = await fetch(base + new URL(sent[1].message.mediaUrl[0]).pathname);
  assert.equal(media.headers.get('content-type'), 'audio/ogg');
  assert.match(await media.text(), /^OggS/);

  await msg(timothy, 'three', 'Hola');
  await until(() => sent.length === 3);
  assert.match(sent[2].message.body, /Timothy and Melanie Weah/);
  assert.doesNotMatch(sent[2].message.body, /hito|recu[eé]rdame|racha/i);
  await msg(timothy, 'four', '¿Y mis seguros?');
  await until(() => sent.length === 4);
  assert.match(histories[2][0].content, /Soy Timothy/);
  assert.doesNotMatch(JSON.stringify(histories[2]), /Pregunta de audio/);
  await msg(timothy, 'five', 'provider-unavailable');
  await until(() => sent.length === 5);
  assert.match(sent[4].message.body, /access your case/);
  assert.doesNotMatch(sent[4].message.body, /hito|recu[eé]rdame|racha/i);

  for (const fields of [
    { From: stranger, To: env.TWILIO_VOICE_NUMBER },
    { From: timothy, To: env.WHATSAPP_FROM },
    { From: `whatsapp:${timothy}`, To: `whatsapp:${env.TWILIO_VOICE_NUMBER}` },
  ]) {
    const denied = await msg(timothy, 'ignored', '', { ...fields, CallSid: 'CA-denied' }, '/twilio/call');
    assert.doesNotMatch(await denied.text(), /<Stream/);
  }
  const call = await msg(timothy, 'ignored', '', {
    From: timothy, To: env.TWILIO_VOICE_NUMBER, CallSid: 'CA-test',
  }, '/twilio/call');
  const twiml = await call.text();
  assert.match(twiml, /language="en-US"/);
  assert.match(twiml, /wait for the tone/);
  const ticket = /name="ticket" value="([^"]+)"/.exec(twiml)?.[1];
  assert.ok(ticket);
  const socket = new WebSocket(base.replace(/^http/, 'ws') + '/twilio/stream', {
    headers: { 'X-Twilio-Signature': sign('/twilio/stream', {}) },
  });
  t.after(() => socket.terminate());
  await once(socket, 'open');
  socket.send(JSON.stringify({ event: 'start', start: { callSid: 'CA-test', streamSid: 'MZ-test',
    accountSid: env.TWILIO_ACCOUNT_SID, mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 },
    customParameters: { ticket } } }));
  await until(() => prompts.length === 4);
  assert.match(prompts[3], /Timothy y Melanie Weah/);
  assert.match(prompts[3], /live phone call/);
  assert.equal(connections, 2, 'la llamada se recupera tras el primer fallo de conexión a Sherpas');
  assert.doesNotMatch(prompts[3], /Próximo hito|RECUÉRDAME|HECHO/);
  // Espera a que el puente anuncie que está listo para escuchar.
  await new Promise((done) => setTimeout(done, 40));
  const busyCall = await msg(melanie, 'ignored', '', {
    From: melanie, To: env.TWILIO_VOICE_NUMBER, CallSid: 'CA-busy',
  }, '/twilio/call');
  assert.doesNotMatch(await busyCall.text(), /<Stream/);
  const heard = once(socket, 'message');
  socket.send(JSON.stringify({ event: 'media', streamSid: 'MZ-test', media: { payload: Buffer.alloc(160, 255).toString('base64') } }));
  const output = JSON.parse((await heard)[0]);
  assert.equal(output.streamSid, 'MZ-test');
  assert.equal(Buffer.from(output.media.payload, 'base64').length, 160);
  socket.send(JSON.stringify({ event: 'stop' }));
  await once(socket, 'close');
  await new Promise((done) => setTimeout(done, 20));
  const whatsappCall = await msg(timothy, 'ignored', '', { CallSid: 'CA-whatsapp' }, '/twilio/call');
  assert.match(await whatsappCall.text(), /<Stream/);
});

test('la conexión de voz limita los reintentos y no reintenta errores de autorización', { timeout: 5000 }, async (t) => {
  for (const status of [503, 401]) {
    let attempts = 0;
    const provider = new WebSocketServer({ port: 0, host: '127.0.0.1', verifyClient(info, done) {
      attempts++;
      done(false, status, 'Provider unavailable');
    } });
    await once(provider, 'listening');
    const server = createServer();
    addCalls(server, { valid: () => true, takeTicket: () => 'Test plan', ai: {
      realtimeUrl: `ws://127.0.0.1:${provider.address().port}`, token: 'fake',
    } });
    t.after(() => { provider.close(); server.close(); });
    await once(server.listen(0, '127.0.0.1'), 'listening');
    const peer = new WebSocket(`ws://127.0.0.1:${server.address().port}/twilio/stream`);
    await once(peer, 'open');
    const closed = once(peer, 'close');
    peer.send(JSON.stringify({ event: 'start', start: { callSid: 'CA-retry', streamSid: 'MZ-retry',
      mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 },
    } }));
    await closed;
    assert.equal(attempts, status === 503 ? 2 : 1);
  }
});

test('el número telefónico es opcional y las llamadas normales no requieren activar WhatsApp Calling', async (t) => {
  const env = {
    TWILIO_ACCOUNT_SID: 'AC' + '0'.repeat(32), TWILIO_AUTH_TOKEN: 'local-test-token', TEAM_KEY: 'test-key',
    WHATSAPP_PUBLIC_URL: 'https://senda.example', WHATSAPP_FROM: '+15550000003',
    WHATSAPP_CLIENTS: JSON.stringify({ '+15550000001': 'timothy-melanie-weah' }), WHATSAPP_DB: ':memory:',
  };
  for (const number of ['', '+15550000005']) {
    const { server } = makeService({ ...env, TWILIO_VOICE_NUMBER: number });
    t.after(() => server.close());
    await once(server.listen(0, '127.0.0.1'), 'listening');
    const fields = { AccountSid: env.TWILIO_ACCOUNT_SID, From: '+15550000001', To: '+15550000005', CallSid: 'CA-phone' };
    const response = await fetch(`http://127.0.0.1:${server.address().port}/twilio/call`, {
      method: 'POST', body: new URLSearchParams(fields), headers: {
        'X-Twilio-Signature': twilio.getExpectedTwilioSignature(env.TWILIO_AUTH_TOKEN, env.WHATSAPP_PUBLIC_URL + '/twilio/call', fields),
      },
    });
    const xml = await response.text();
    if (number) assert.match(xml, /<Stream/);
    else assert.doesNotMatch(xml, /<Stream/);
  }
});

test('un saludo por nota de voz recibe una respuesta de voz', async () => {
  const reply = await respond({ plan: cases.get('timothy-melanie-weah'), text: 'Hola.', voice: true });
  assert.equal(reply.audio, true);
  assert.match(reply.text, /voice note/);
});

test('reintenta una consulta tras un fallo temporal de conexión', async () => {
  let attempts = 0;
  const ai = createAi({ TEAM_KEY: 'test-key' }, async () => {
    attempts++;
    if (attempts === 1) {
      throw new TypeError('fetch failed', { cause: { code: 'ETIMEDOUT' } });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Respuesta del caso' } }] }));
  });
  assert.equal(await ai.answer('Caso de prueba', 'Mi pregunta'), 'Respuesta del caso');
  assert.equal(attempts, 2);
});

test('reintenta transcribir una nota ante un fallo temporal de Sherpas', async () => {
  let attempts = 0;
  const ai = createAi({ TEAM_KEY: 'test-key' }, async (url, options) => {
    assert.match(url.pathname, /audio\/transcriptions$/);
    assert.equal(options.body.get('model'), 'scribe-v2');
    attempts++;
    if (attempts === 1) return new Response('', { status: 503 });
    return new Response(JSON.stringify({ text: 'Soy Melanie' }));
  });
  assert.equal(await ai.transcribe(Buffer.from('OggS')), 'Soy Melanie');
  assert.equal(attempts, 2);
});
