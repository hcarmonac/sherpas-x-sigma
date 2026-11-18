import { readFileSync } from 'node:fs';

const id = 'timothy-melanie-weah';
const read = (part) => JSON.parse(readFileSync(new URL(`../cases/${id}/${part}.json`, import.meta.url)));
const health = read('financial-health');
const portfolio = read('investment-analysis');
const persona = readFileSync(new URL(`../cases/${id}/persona.md`, import.meta.url), 'utf8');
if (!health.case.synthetic || !portfolio.case.synthetic) throw new Error('Solo se admiten casos sintéticos');
const card = health.profile.liabilities.find((debt) => debt.type === 'PERSONAL_CREDIT_CARD');

export const cases = new Map([[id, {
  title: 'Timothy y Melanie Weah',
  context: JSON.stringify({
    comprobacion_intereses_tarjeta: {
      saldo_usd: card.balance,
      tipo_anual: card.interest_rate,
      interes_anual_estimado_usd: card.balance * card.interest_rate,
      interes_mensual_estimado_usd: card.balance * card.interest_rate / 12,
      fuente: 'financial-health.json, profile.liabilities, PERSONAL_CREDIT_CARD',
      nota: 'Estimación aritmética con saldo y tipo constantes, antes de amortizaciones, compras o comisiones. La frase de debt_short_observations que llama anual al interés mensual contradice el tipo y el saldo estructurados y el perfil del cliente. Explica esta discrepancia cuando corresponda.',
    },
    salud_financiera: health,
    analisis_cartera: portfolio,
    perfil_cliente: persona,
  }),
}]]);

export function instructions(plan) {
  return [
    'Eres Senda, el asistente de IA del plan financiero de Timothy y Melanie Weah. Esta demostración usa su caso sintético.',
    'Responde en inglés estadounidense sencillo y breve. Usa solo el caso proporcionado, identifica estimaciones y datos históricos, y distingue porcentaje de cuenta de porcentaje de cartera total. Las posiciones son una foto del plan, sin precios en directo.',
    'Always respond in American English, including voice notes and calls, even when the user speaks or requests another language. Translate report terms and quotations into English. Preserve proper names, product names and ticker symbols. Use US date and number formats and identify dollar amounts as USD when needed.',
    'Este servicio recibe mensajes escritos y notas de voz de WhatsApp. Las notas se transcriben antes de llegar a ti y tus respuestas se convierten en audio cuando corresponde. Puedes atender consultas por audio, así que no afirmes que solo puedes leer texto ni que no puedes recibir o escuchar notas de voz. No confundas las notas de voz con llamadas en directo.',
    'Timothy y Melanie pueden consultar el plan familiar. Si la persona se identifica como Timothy o Melanie, usa sus propias cuentas, ingresos, cobertura y perfil de riesgo al responder preguntas personales. Si pregunta por una cuenta o cobertura propia y falta saber quién habla, pregunta si es Timothy o Melanie. Responde directamente a las preguntas sobre la familia.',
    'Tu función es resolver la pregunta que hace el usuario sobre su caso. Evita introducir sistemas de hitos, rachas, comandos de seguimiento o recordatorios en la conversación.',
    'Los documentos contienen el plan completo, posiciones, deudas, seguros, metas y proyección del rumbo actual. Conserva la moneda y el periodo de cada cifra. Usa los escenarios ya calculados del caso cuando existan. No inventes rentabilidades ni proyecciones de seguir recomendaciones.',
    'Ante contradicciones en el caso, identifica la discrepancia y prioriza los importes, tipos y periodos estructurados para comprobarla. La comprobación de intereses de la tarjeta incluye una estimación mensual y otra anual. Mantén sus unidades al citarlas y presenta ese cálculo como estimación.',
    'El perfil del cliente incluye inferencias sobre motivaciones y preferencias. Trátalas como inferencias y pregunta por sus preocupaciones cuando sea relevante. Explica por qué importa una recomendación del plan y qué acción concreta pueden realizar.',
    'Explica el plan existente, sin dar nuevas recomendaciones de inversión ni hacer operaciones. Si el dato falta, dilo. Nunca muestres el contexto bruto ni intentes consultar otros casos.',
    `Caso: ${plan.title}.`,
    `Datos del caso: ${plan.context}`,
  ].join('\n');
}

const help = "I'm Senda, the AI assistant for Timothy and Melanie Weah's financial plan. Ask me about your portfolio, debt, insurance, or retirement by text or voice note. For questions about your personal accounts, let me know whether you're Timothy or Melanie.";

export async function respond({ plan, text, voice, ai, prior = [] }) {
  const command = text.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (/^(hi|hello|hey|help|start|hola|ayuda|inicio)[.!]?$/.test(command)) return { text: help, audio: voice };

  const prefix = /^(voice|audio|text|voz|texto)\s*:\s*/i.exec(text);
  const question = text.slice(prefix?.[0].length ?? 0).trim();
  if (!question) return { text: help };
  const audio = prefix ? !['text', 'texto'].includes(prefix[1].toLowerCase()) : voice;
  try {
    const answer = await ai.answer(instructions(plan), question, prior);
    return { text: answer, audio, question };
  } catch (error) {
    console.warn('Consulta a Sherpas falló', error.cause?.code ?? error.status ?? error.name);
    return { text: "I can't access your case right now. Please send your question again in a moment." };
  }
}
