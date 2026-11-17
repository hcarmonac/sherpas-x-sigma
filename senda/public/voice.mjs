export function installVoice(getContext, enabled) {
  const element = (id) => document.getElementById(id);
  const dialog = element('voice-dialog');
  const open = element('voice-action');
  const connect = element('voice-connect');
  const end = element('voice-end');
  const status = element('voice-status');
  const answer = element('voice-answer');
  connect.hidden = !enabled;
  if (!enabled) {
    element('voice-consent').textContent = 'La llamada requiere una clave de Sherpas. Puedes consultar las respuestas del plan aquí.';
  }

  let attempt = 0;
  let socket;
  let audio;
  let mic;
  let ready = false;
  let nextStart = 0;
  const playing = new Set();

  function stopPlayback() {
    for (const source of playing) source.stop();
    playing.clear();
    nextStart = audio?.currentTime ?? 0;
  }

  function close(message = 'Llamada terminada.') {
    if (!audio && !socket) return;
    attempt += 1;
    ready = false;
    stopPlayback();
    mic?.getTracks().forEach((track) => track.stop());
    mic = undefined;
    audio?.close().catch(() => {});
    audio = undefined;
    socket?.close();
    socket = undefined;
    connect.disabled = false;
    end.hidden = true;
    status.textContent = message;
  }

  function play(base64) {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const pcm = new DataView(bytes.buffer);
    const buffer = audio.createBuffer(1, bytes.length / 2, 24_000);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = pcm.getInt16(i * 2, true) / 32_768;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    const start = Math.max(nextStart, audio.currentTime);
    source.start(start);
    nextStart = start + buffer.duration;
    playing.add(source);
    source.onended = () => playing.delete(source);
  }

  function receive({ data }) {
    const event = JSON.parse(data);
    switch (event.type) {
      case 'ready':
        ready = true;
        status.textContent = 'Llamada conectada. Puedes hacer una pregunta.';
        break;
      case 'answer':
        answer.textContent = '';
        break;
      case 'audio':
        play(event.data);
        break;
      case 'transcript':
        answer.textContent += event.text;
        break;
      case 'interrupt':
        stopPlayback();
        break;
      case 'unavailable':
        close(event.message);
        break;
    }
  }

  connect.addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      status.textContent = 'Para activar el micrófono, abre Senda en el propio ordenador o con HTTPS.';
      return;
    }

    const current = ++attempt;
    connect.disabled = true;
    end.hidden = false;
    answer.textContent = '';
    status.textContent = 'Autorizando el micrófono…';
    try {
      audio = new AudioContext({ sampleRate: 24_000 });
      await audio.resume();
      if (current !== attempt) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      if (current !== attempt) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mic = stream;
      await audio.audioWorklet.addModule('/mic-worklet.js');
      if (current !== attempt) return;

      const capture = new AudioWorkletNode(audio, 'mic-frames');
      const silence = audio.createGain();
      silence.gain.value = 0;
      audio.createMediaStreamSource(mic).connect(capture).connect(silence).connect(audio.destination);

      const url = new URL('/voice', location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const { case: caseId, scenario, action } = getContext();
      url.search = new URLSearchParams({ case: caseId, scenario, action });
      socket = new WebSocket(url);
      status.textContent = 'Conectando con el proxy…';
      socket.addEventListener('message', (event) => {
        if (current === attempt) receive(event);
      });
      socket.addEventListener('error', () => {
        if (current === attempt) close('La llamada no está disponible. Puedes consultar las respuestas escritas.');
      });
      socket.addEventListener('close', () => {
        if (current === attempt) close();
      });
      capture.port.onmessage = ({ data }) => {
        if (ready && socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 128_000) {
          socket.send(btoa(String.fromCharCode(...new Uint8Array(data))));
        }
      };
    } catch {
      if (current === attempt) close('No se pudo abrir el micrófono. Puedes consultar las respuestas escritas.');
    }
  });

  open.addEventListener('click', () => {
    element('voice-context').textContent = getContext().title;
    dialog.showModal();
  });
  end.addEventListener('click', () => close());
  dialog.addEventListener('close', () => {
    close('');
    answer.textContent = '';
    status.textContent = '';
  });
  window.addEventListener('pagehide', () => close());
  open.hidden = false;
  return {
    close() {
      close('');
      status.textContent = '';
      answer.textContent = '';
      if (dialog.open) dialog.close();
    },
  };
}
