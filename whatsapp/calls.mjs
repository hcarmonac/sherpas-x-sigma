import { WebSocket, WebSocketServer } from 'ws';

function decodeMuLaw(byte) {
  const code = 255 - byte;
  const magnitude = (((code & 15) * 8 + 132) << ((code >> 4) & 7)) - 132;
  return code & 128 ? -magnitude : magnitude;
}

function encodeMuLaw(sample) {
  const sign = sample < 0 ? 128 : 0;
  const magnitude = Math.min(32635, Math.abs(sample)) + 132;
  const exponent = Math.max(0, Math.floor(Math.log2(magnitude)) - 7);
  return 255 - (sign | (exponent << 4) | ((magnitude >> (exponent + 3)) & 15));
}

const readyTone = Buffer.from(Array.from({ length: 1600 }, (_, i) =>
  encodeMuLaw(2000 * Math.sin(2 * Math.PI * 660 * i / 8000)))).toString('base64');

function inputPcm(base64) {
  const input = Buffer.from(base64, 'base64');
  const pcm = Buffer.alloc(input.length * 6);
  for (const [i, byte] of input.entries()) {
    const sample = decodeMuLaw(byte);
    for (let n = 0; n < 3; n++) pcm.writeInt16LE(sample, i * 6 + n * 2);
  }
  return pcm.toString('base64');
}

export function addCalls(server, { valid, takeTicket, ai }) {
  const streams = new WebSocketServer({ noServer: true, maxPayload: 64_000 });

  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/twilio/stream' || streams.clients.size || !valid(req, {}, true)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    streams.handleUpgrade(req, socket, head, (peer) => streams.emit('connection', peer));
  });

  streams.on('connection', (peer) => {
    let upstream, streamSid, ready = false, accepting = true;
    let remainder = Buffer.alloc(0);
    const startTimeout = setTimeout(() => peer.close(), 20_000);
    const endTimeout = setTimeout(() => peer.close(), 180_000);
    const send = (socket, data) => {
      if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 128_000) socket.send(JSON.stringify(data));
    };
    peer.on('close', () => {
      clearTimeout(startTimeout);
      clearTimeout(endTimeout);
      if (upstream?.readyState === WebSocket.CONNECTING) upstream.terminate();
      if (upstream?.readyState === WebSocket.OPEN) upstream.close();
    });
    peer.on('error', () => peer.close());

    peer.on('message', (bytes) => {
      let event;
      try { event = JSON.parse(bytes); } catch { return peer.close(); }
      if (event.event === 'stop') return peer.close();
      if (event.event === 'media' && ready && event.streamSid === streamSid) {
        if (typeof event.media?.payload !== 'string') return peer.close();
        send(upstream, { type: 'input_audio_buffer.append', audio: inputPcm(event.media.payload) });
      }
      if (event.event !== 'start' || upstream) return;
      const start = event.start;
      const prompt = takeTicket(start);
      if (!prompt || start.mediaFormat?.encoding !== 'audio/x-mulaw' ||
          start.mediaFormat.sampleRate !== 8000 || start.mediaFormat.channels !== 1) return peer.close();
      streamSid = start.streamSid;
      let attempts = 0;
      const connect = () => {
        attempts++;
        let retry = false;
        const socket = new WebSocket(ai.realtimeUrl, {
          headers: { Authorization: `Bearer ${ai.token}` }, family: 4, handshakeTimeout: 8_000,
        });
        upstream = socket;
        socket.on('error', (error) => {
          const temporary = ['ETIMEDOUT', 'ENETUNREACH', 'ECONNRESET', 'EAI_AGAIN', 'ECONNREFUSED'].includes(error.code) ||
            error.message === 'Opening handshake has timed out' || /Unexpected server response: (429|5\d\d)/.test(error.message);
          retry = !ready && attempts < 2 && temporary;
          console.warn('Realtime: conexión fallida', start.callSid, error.code ?? error.message, retry ? 'reintentando' : 'fin');
        });
        socket.on('close', () => {
          if (retry && peer.readyState === WebSocket.OPEN) connect();
          else peer.close();
        });
        const configure = () => send(socket, {
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: prompt,
            audio: {
              input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: { type: 'server_vad', silence_duration_ms: 500 } },
              output: { format: { type: 'audio/pcm', rate: 24000 } },
            },
          },
        });
        socket.on('message', (raw) => {
          let answer;
          try { answer = JSON.parse(raw); } catch { return peer.close(); }
          switch (answer.type) {
            case 'session.created':
              configure();
              break;
            case 'session.updated':
              if (ready) break;
              clearTimeout(startTimeout);
              ready = true;
              console.info('Realtime: llamada lista', start.callSid, 'intento', attempts);
              send(peer, { event: 'media', streamSid, media: { payload: readyTone } });
              send(peer, { event: 'mark', streamSid, mark: { name: 'ready' } });
              break;
            case 'input_audio_buffer.speech_started':
              accepting = false;
              remainder = Buffer.alloc(0);
              send(peer, { event: 'clear', streamSid });
              break;
            case 'response.created':
              accepting = true;
              remainder = Buffer.alloc(0);
              break;
            case 'response.audio.delta':
            case 'response.output_audio.delta': {
              if (!accepting) break;
              const pcm = Buffer.concat([remainder, Buffer.from(answer.delta, 'base64')]);
              const audio = Buffer.alloc(Math.floor(pcm.length / 6));
              for (let i = 0; i < audio.length; i++) {
                const offset = i * 6;
                const sample = (pcm.readInt16LE(offset) + pcm.readInt16LE(offset + 2) + pcm.readInt16LE(offset + 4)) / 3;
                audio[i] = encodeMuLaw(sample);
              }
              remainder = pcm.subarray(audio.length * 6);
              if (audio.length) send(peer, { event: 'media', streamSid, media: { payload: audio.toString('base64') } });
              break;
            }
            case 'error':
              console.warn('Realtime: error del proveedor', answer.error?.code || '');
              peer.close();
              break;
          }
        });
      };
      connect();
    });
  });
  return { get active() { return streams.clients.size > 0; } };
}
