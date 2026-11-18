import twilio from 'twilio';

try {
  const env = process.env;
  for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VOICE_NUMBER', 'WHATSAPP_PUBLIC_URL']) {
    if (!env[key]) throw new Error(`Falta ${key} en el .env de la raíz`);
  }
  const origin = new URL(env.WHATSAPP_PUBLIC_URL);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('WHATSAPP_PUBLIC_URL debe ser el origen HTTPS público, sin ruta');
  }
  const provider = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, { timeout: 12_000 });
  const [number] = await provider.incomingPhoneNumbers.list({ phoneNumber: env.TWILIO_VOICE_NUMBER, limit: 1 });
  if (!number?.capabilities.voice) throw new Error('La cuenta debe tener ese número propio de Twilio con Voice habilitado');
  const voiceUrl = origin.origin + '/twilio/call';
  await provider.incomingPhoneNumbers(number.sid).update({ voiceUrl, voiceMethod: 'POST', voiceApplicationSid: '' });
  const saved = await provider.incomingPhoneNumbers(number.sid).fetch();
  if (saved.voiceUrl !== voiceUrl || saved.voiceMethod !== 'POST' || saved.voiceApplicationSid) {
    throw new Error('Twilio no ha guardado el webhook de voz esperado');
  }
  console.log(`Número de llamadas: ${saved.phoneNumber}`);
  console.log(`Webhook de voz guardado: POST ${saved.voiceUrl}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
