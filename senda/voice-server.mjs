import { WebSocket, WebSocketServer } from 'ws';

const sessionTimeout = 90_000;
const pcmFrame = /^[A-Za-z0-9+/]{1280}$/;

function sessionInstructions(plan, scenario, action) {
  return [
    'Responde en español, en dos o tres frases. Eres la ayuda de Senda para un caso sintético.',
    'Explica únicamente estos datos. Cuando el plan no responda, sugiere consultar al asesor.',
    'Usa las puntuaciones solo para las medidas descritas. Distingue los importes estimados de los resultados reales. No calcules proyecciones ni recomiendes compras o movimientos.',
    `Caso: ${plan.title}. ${plan.introduction} Situación actual: ${plan.score}/100.`,
    `Escenario consultado: ${scenario.title}, ${scenario.score}/100 si se aplican estas condiciones: ${scenario.conditions.join(' ')} Fuente: ${scenario.source}.`,
    `Próximo paso: ${action.title}. ${action.description} Fuente: ${action.source}.`,
    `Dato del hito: ${action.impact.value}. ${action.impact.label}. ${action.impact.note} Fuente: ${action.impact.source ?? action.source}.`,
    ...plan.questions.map(({ question, answer }) => `${question} ${answer}`),
  ].join('\n');
}

function rejectUpgrade(socket, status) {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function startRelay(browser, proxy, instructions) {
  const upstream = new WebSocket(proxy, {
    headers: { Authorization: `Bearer ${process.env.TEAM_KEY}` },
    handshakeTimeout: 8_000,
  });
  let ready = false;
  let sentFrames = 0;

  const send = (event) => {
    if (browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify(event));
  };
  const fail = (message) => {
    send({ type: 'unavailable', message });
    browser.close();
  };
  const timeout = setTimeout(() => fail('Se ha agotado el tiempo de la llamada de demostración.'), sessionTimeout);
  const readyTimeout = setTimeout(() => fail('El proxy tardó en conectar. Puedes volver a intentarlo.'), 10_000);

  browser.on('close', () => {
    clearTimeout(timeout);
    clearTimeout(readyTimeout);
    if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  });
  browser.on('error', () => browser.close());

  upstream.on('message', (data) => {
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }

    switch (event.type) {
      case 'session.created':
        upstream.send(JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions,
            audio: {
              input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: { type: 'server_vad' } },
              output: { format: { type: 'audio/pcm', rate: 24000 } },
            },
          },
        }));
        break;
      case 'session.updated':
        clearTimeout(readyTimeout);
        ready = true;
        send({ type: 'ready' });
        break;
      case 'input_audio_buffer.speech_started':
        send({ type: 'interrupt' });
        break;
      case 'response.created':
        send({ type: 'answer' });
        break;
      case 'response.output_audio.delta':
        send({ type: 'audio', data: event.delta });
        break;
      case 'response.output_audio_transcript.delta':
        send({ type: 'transcript', text: event.delta });
        break;
      case 'error':
        fail(event.error?.code === 'expired_secret_key'
          ? 'El proveedor de voz ha rechazado la conexión por una credencial caducada. Puedes consultar las respuestas escritas.'
          : 'El proxy no pudo responder. Puedes consultar las respuestas escritas.');
        break;
    }
  });

  upstream.on('error', () => fail('La llamada no está disponible. Puedes consultar las respuestas escritas.'));
  upstream.on('close', () => browser.close());

  browser.on('message', (audio, isBinary) => {
    if (!ready || upstream.readyState !== WebSocket.OPEN) return;
    const frame = audio.toString();
    if (isBinary || !pcmFrame.test(frame) || ++sentFrames > 4_600) {
      browser.close(1008, 'Trama de audio no válida');
      return;
    }
    if (upstream.bufferedAmount < 128_000) {
      upstream.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: frame }));
    }
  });
}

export function addVoice(server, cases) {
  const proxy = new URL(process.env.LLM_PROXY_URL || 'https://llm-hackathon.sherpaswealth.com');
  proxy.protocol = proxy.protocol === 'http:' ? 'ws:' : 'wss:';
  proxy.pathname = '/v1/realtime';
  proxy.search = '?model=gemini-3.8-live';

  const voice = new WebSocketServer({ noServer: true, maxPayload: 1_280 });
  server.on('upgrade', (req, socket, head) => {
    const location = new URL(req.url, 'http://localhost');
    if (location.pathname !== '/voice') return rejectUpgrade(socket, '404 Not Found');

    const origin = req.headers.origin;
    if (origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
      return rejectUpgrade(socket, '403 Forbidden');
    }
    if (voice.clients.size) return rejectUpgrade(socket, '429 Too Many Requests');

    const plan = cases.find(({ id }) => id === location.searchParams.get('case'));
    const scenario = plan?.scenarios.find(({ id }) => id === location.searchParams.get('scenario'));
    const action = plan?.actions.find(({ id }) => id === location.searchParams.get('action'));
    if (!action || !scenario) return rejectUpgrade(socket, '400 Bad Request');

    voice.handleUpgrade(req, socket, head, (browser) => {
      startRelay(browser, proxy, sessionInstructions(plan, scenario, action));
    });
  });
}
