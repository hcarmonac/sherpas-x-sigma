import { createInterface } from 'node:readline/promises';
import { cases, respond } from './agent.mjs';
import { createAi } from './ai.mjs';

const plan = cases.get(process.argv[2] || 'timothy-melanie-weah');
if (!plan) throw new Error('Caso no reconocido');
const terminal = createInterface({ input: process.stdin, output: process.stdout });
const ai = createAi(process.env);
console.log(plan.title, '· Escribe una pregunta sobre el caso. Ctrl+D para salir.');
try {
  for await (const text of terminal) {
    const reply = await respond({ plan, text, ai, voice: false });
    console.log(reply.text);
  }
} finally { terminal.close(); }
