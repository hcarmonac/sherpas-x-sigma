# Senda en WhatsApp

El agente de WhatsApp está dedicado a resolver preguntas sobre el caso sintético de **Timothy y Melanie Weah**. Ambos pueden preguntar por su plan familiar y por sus propias cuentas, seguros e ingresos. El servidor incorpora sus informes completos de salud financiera e inversiones y su perfil de cliente.

**Este es el canal principal del MVP y la prioridad del equipo.** La web acompaña la experiencia con visualización y calendario. Para entender las decisiones, las pruebas realizadas y los pendientes operativos, lee primero [ESTADO_ACTUAL.md](../ESTADO_ACTUAL.md).

## Probarlo desde tu WhatsApp

La cuenta del equipo ya está actualizada a pago y se han verificado entregas reales de texto y audio por el Sandbox. También se contrató y configuró un número propio para llamadas telefónicas normales. La configuración efectiva está en el `.env` local de la raíz. Conserva sus números y credenciales y revisa el estado del túnel antes de probar. La última comprobación del 18 de noviembre detectó que el servidor local respondía, pero la URL pública temporal había dejado de funcionar. La recuperación se explica en [el traspaso](../ESTADO_ACTUAL.md#recuperar-el-acceso-público).

Durante la puesta en marcha aparecieron restricciones del trial y una aprobación de identidad pendiente. Esos bloqueos se superaron antes de las entregas verificadas. No deben tratarse como pendientes actuales. Para una cuenta nueva, sigue la [guía del Sandbox](https://www.twilio.com/docs/whatsapp/quickstart) y comprueba que permite enviar respuestas libres durante la ventana de atención.

1. Abre el [Sandbox de WhatsApp en la consola clásica](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn), selecciona la cuenta y completa su activación. Copia el número que muestra ese Sandbox en `WHATSAPP_FROM`. Comprueba el estado de activación si el alta del móvil devuelve «Failed to join sandbox». [Guía del Sandbox](https://www.twilio.com/docs/whatsapp/sandbox)
2. Desde tu móvil, escanea el QR o envía el mensaje `join <código>` que te indica Twilio. Añade tu número en formato internacional y el caso que quieras probar a `WHATSAPP_CLIENTS`.
3. Pon el **Account SID** y el **Auth Token** de esa misma cuenta y región US1 en `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN` del `.env` de la raíz. Configura también `TEAM_KEY` y `LLM_PROXY_URL` de Sherpas. [Plantilla de variables](.env.example)
4. Para probar en local, abre un túnel HTTPS al puerto 5180. Con `cloudflared` instalado, ejecuta `cloudflared tunnel --url http://127.0.0.1:5180` y copia la URL HTTPS que imprime en `WHATSAPP_PUBLIC_URL`. Mantén el túnel abierto y arranca Senda desde la raíz en otra terminal con Node 22.13 o posterior y FFmpeg. [Túneles temporales de Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

```bash
npm --prefix whatsapp ci
npm --prefix whatsapp start
```

En **Sandbox settings → When a message comes in**, guarda `https://TU-ORIGEN/twilio/messages` con el método **POST**. Envía «I'm Timothy. How much life insurance do I have?» desde el móvil vinculado y comprueba que la respuesta llega. Si reinicias el túnel con otra URL, actualiza el `.env` y el webhook y reinicia Senda. [Configurar el webhook del Sandbox](https://www.twilio.com/docs/whatsapp/sandbox)

Asigna los móviles autorizados a `timothy-melanie-weah` en `WHATSAPP_CLIENTS`. Los dos números de la plantilla son ficticios. Cada móvil conserva su propia conversación durante la sesión. Para probar las preguntas personales, identifica a quien habla con mensajes como «I'm Timothy. How much life insurance do I have?» o «I'm Melanie. What does our plan say about my portfolio risk?».

Los datos se cargan desde `cases/timothy-melanie-weah/financial-health.json`, `investment-analysis.json` y `persona.md`. El agente recibe también una comprobación de los intereses de la tarjeta a partir del saldo y el tipo estructurados. Esa comprobación permite aclarar la contradicción del texto narrativo sobre su periodicidad mensual o anual.

## Consultas sobre el caso

Todas las respuestas al cliente se generan en inglés estadounidense, incluidos los audios, saludos y mensajes de error, aunque la consulta llegue en otro idioma.

- **Texto.** Envía «I'm Timothy. How much life insurance do I have?» o «I'm Melanie. What does our plan say about my portfolio?». Senda usa `gemini-3.5-flash-lite` y los datos de los Weah. Si una pregunta personal requiere identificar al titular, el agente pregunta quién habla.
- **Notas de voz.** Mantén pulsado el micrófono de WhatsApp. Senda transcribe con `scribe-v2` y responde con `eleven-flash-v2.5` en Ogg Opus. También puedes escribir `VOICE: What does this position percentage mean?` o usar `TEXT:` al principio de una pregunta para elegir texto.
- **Disponibilidad del modelo.** Ante un timeout de red, un error de conexión temporal, una limitación de tráfico o un error de servidor, la consulta se reintenta una vez. Si también falla, el usuario recibe un mensaje breve para volver a preguntar.
- **Ventana de envío.** Las respuestas libres por texto y audio se envían dentro de las 24 horas posteriores al último mensaje del cliente. [Ventana de atención de WhatsApp](https://www.twilio.com/docs/whatsapp/sandbox)

## Llamadas telefónicas normales

El cliente puede llamar desde la aplicación de teléfono a un número propio de Twilio con Voice habilitado. El Sandbox compartido de WhatsApp no es un número propio para estas llamadas. Este canal utiliza `gemini-3.8-live` de Sherpas en una conversación de voz en directo, con los mismos documentos de los Weah y respuestas en inglés estadounidense.

1. En Twilio, incorpora un número propio con capacidad **Voice** y ponlo en `TWILIO_VOICE_NUMBER` en el `.env` de la raíz, con formato internacional. Esta variable es independiente de `WHATSAPP_FROM`.
2. Conserva los móviles de prueba en `WHATSAPP_CLIENTS`, asociados a `timothy-melanie-weah`. El servidor solo atiende las llamadas de esos números al número telefónico configurado.
3. Mantén abierto el túnel HTTPS al puerto 5180 y ejecuta desde la raíz `npm --prefix whatsapp run phone:setup`. El comando configura y comprueba el webhook **Voice → A call comes in → POST https://TU-ORIGEN/twilio/call** del número existente. No compra números ni cambia los ajustes de mensajes.
4. Reinicia el servicio con `npm --prefix whatsapp start` para cargar el número del `.env`. No necesitas activar `WHATSAPP_CALLS` para las llamadas normales.
5. Llama desde un móvil autorizado, espera al tono y di, por ejemplo, «I'm Melanie. How much life insurance do I have according to our plan?». Puedes seguir preguntando e interrumpir la respuesta.

El puente convierte el audio telefónico de Twilio al formato de Sherpas y devuelve la voz al teléfono mediante una conexión bidireccional. La conexión a Sherpas utiliza IPv4 y reintenta una vez un fallo temporal antes de empezar la conversación. La demo admite una llamada simultánea y termina la sesión a los tres minutos. No graba las llamadas. Si cambia la URL del túnel, actualiza `WHATSAPP_PUBLIC_URL`, vuelve a ejecutar `phone:setup`, reinicia el servicio y actualiza también el webhook de mensajes del Sandbox. [Configurar llamadas entrantes](https://help.twilio.com/articles/223135027-Configuring-Phone-Numbers-to-Receive-Voice-Calls) · [Media Streams](https://www.twilio.com/docs/voice/media-streams)

## Activar llamadas nativas de WhatsApp

Para las llamadas hace falta un remitente propio de **WhatsApp Business Calling** habilitado en Twilio. El Sandbox sirve para la demo de mensajes y notas. Twilio documenta que la cuenta debe tener habilitado el límite de al menos 2.000 conversaciones iniciadas por la empresa en 24 horas para activar Calling. [Requisitos de WhatsApp Business Calling](https://www.twilio.com/docs/voice/whatsapp-business-calling)

En la consola, enlaza el remitente con una aplicación TwiML cuya URL de voz es `POST https://TU-ORIGEN/twilio/call`. En el `.env`, cambia `WHATSAPP_FROM` al número propio y `WHATSAPP_CALLS` a `1`. El servidor recibe el audio por `wss://TU-ORIGEN/twilio/stream`, lo convierte a PCM y lo envía a `gemini-3.8-live` mediante el proxy de Sherpas. La llamada queda asociada al caso del número que llama y termina a los tres minutos como máximo. [Media Streams](https://www.twilio.com/docs/voice/media-streams/websocket-messages)

## Demo local y datos

```bash
npm --prefix whatsapp run demo -- timothy-melanie-weah
npm --prefix whatsapp test
```

La demo de terminal permite probar preguntas sobre el caso usando la clave de Sherpas. La prueba automatizada simula Twilio y Realtime. Cubre firma del webhook, dos móviles asociados a los Weah, conversaciones independientes, notas de voz, deduplicación, mensajes de error, recuperación ante un fallo temporal y audio bidireccional.

Usad los casos sintéticos. El servicio valida la firma de Twilio y admite únicamente los números asignados. Los audios de respuesta quedan en memoria y sus enlaces caducan a los 15 minutos. Las últimas seis intervenciones de cada conversación se conservan en memoria durante 24 horas y se borran al reiniciar el servidor. La base local ignorada por Git guarda la cola de mensajes hasta procesarlos. Ejecutad una sola instancia con su base SQLite. Si un proceso se interrumpe durante un envío, revisad el estado en Twilio antes de repetir ese envío.
