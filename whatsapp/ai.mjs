import { spawn } from 'node:child_process';

export function oggOpus(bytes) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-nostdin', '-loglevel', 'error', '-i', 'pipe:0', '-vn',
      '-t', '90', '-c:a', 'libopus', '-ac', '1', '-f', 'ogg', 'pipe:1']);
    const chunks = [];
    const timer = setTimeout(() => ffmpeg.kill('SIGKILL'), 15_000);
    ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
    ffmpeg.stderr.resume();
    ffmpeg.stdin.on('error', () => {});
    ffmpeg.once('error', reject);
    ffmpeg.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error('FFmpeg no pudo convertir el audio'));
    });
    ffmpeg.stdin.end(bytes);
  });
}

export function createAi(env, request = fetch) {
  const base = (env.LLM_PROXY_URL || 'https://llm-hackathon.sherpaswealth.com').replace(/\/+$/, '');
  async function post(path, payload) {
    const multipart = payload instanceof FormData;
    const headers = { Authorization: `Bearer ${env.TEAM_KEY}` };
    if (!multipart) headers['Content-Type'] = 'application/json';
    const response = await request(new URL(`/v1/${path}`, base), {
      method: 'POST', headers, body: multipart ? payload : JSON.stringify(payload),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const error = new Error(`Sherpas HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response;
  }

  async function postWithRetry(path, payload) {
    try {
      return await post(path, payload);
    } catch (error) {
      const temporary = error.name === 'TimeoutError' ||
        ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(error.cause?.code) ||
        error.status === 429 || error.status >= 500;
      if (!temporary) throw error;
      return post(path, payload);
    }
  }

  return {
    realtimeUrl: `${base.replace(/^http/, 'ws')}/v1/realtime?model=gemini-3.8-live`,
    token: env.TEAM_KEY,
    async answer(system, question, prior = []) {
      const payload = {
        model: 'gemini-3.5-flash-lite',
        messages: [{ role: 'system', content: system }, ...prior, { role: 'user', content: question }],
        max_tokens: 320,
      };
      const response = await postWithRetry('chat/completions', payload);
      const result = (await response.json()).choices?.[0]?.message?.content?.trim();
      if (!result) throw new Error('El modelo no devolvió texto');
      return result.slice(0, 1500);
    },
    async transcribe(bytes, type = 'audio/ogg') {
      const audio = type.startsWith('audio/ogg') ? bytes : await oggOpus(bytes);
      const form = new FormData();
      form.set('model', 'scribe-v2');
      form.set('file', new Blob([audio], { type: 'audio/ogg' }), 'nota.ogg');
      return (await (await postWithRetry('audio/transcriptions', form)).json()).text?.trim() || '';
    },
    async speak(text) {
      const response = await post('audio/speech', { model: 'eleven-flash-v2.5', voice: 'alloy', language_code: 'en', input: text });
      return oggOpus(Buffer.from(await response.arrayBuffer()));
    },
  };
}
