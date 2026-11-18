# Senda — estado actual y traspaso de desarrollo

Actualizado el **18 de noviembre de 2026**. Este documento recoge las decisiones del equipo, el código existente y las comprobaciones de esta sesión. Los procesos locales, las URLs temporales y las cuentas externas deben volver a comprobarse al retomar el trabajo.

## Qué estamos construyendo y dónde está el valor

**Senda permite que el cliente pregunte por WhatsApp las dudas que le surgen sobre su propio plan financiero, por texto o con una nota de voz.** El agente recibe el caso del cliente y explica sus cifras, su cartera y las recomendaciones que ya aparecen en sus documentos.

La prioridad del equipo es demostrar que esa conversación es útil, personal y fácil de retomar desde una herramienta cotidiana. El objetivo de producto es poder preguntar cuando aparece una duda, sin tener que abrir y recorrer el informe. La demo actual depende de un servidor local y de un túnel temporal, por lo que todavía no ofrece disponibilidad permanente.

La web existente tiene trabajo aprovechable. Permite visualizar el plan, recorrer una senda, entender el efecto de medidas concretas y crear recordatorios de calendario. Se conserva como complemento. El equipo considera que basar toda la propuesta en esa web se parece demasiado a lo que otros grupos pueden construir y al Living Map que Sherpas ya ofrece. Además, el README del reto indica que Sherpas ya tiene recorridos guiados y un chat dentro del plan.

Por tanto, **el esfuerzo y la presentación deben centrarse en la experiencia de WhatsApp**. La llamada telefónica amplía los canales de consulta. La web ayuda a visualizar y retomar acciones. Esta es la hipótesis de diferenciación del equipo y debe demostrarse con una conversación útil sobre el caso.

## Decisiones vigentes que debe conocer el siguiente Codex

| Tema | Decisión actual |
| --- | --- |
| Canal principal | WhatsApp mediante Twilio, con preguntas y respuestas sobre el plan particular. |
| Caso del agente | Solo `timothy-melanie-weah`. Los dos móviles autorizados del entorno local están asociados a este hogar. |
| Idioma del cliente | Inglés estadounidense en texto, audios, saludos y errores, incluso si la pregunta llega en otro idioma. Esta decisión sustituyó la configuración anterior en español. |
| Timothy y Melanie | Pueden preguntar por el hogar. Para preguntas personales se usa la identidad que expresan en la conversación o se les pregunta quién habla. |
| Hitos en WhatsApp | Se retiraron las menciones automáticas a hitos, rachas y comandos de seguimiento. El agente debe atender la pregunta del cliente. |
| Recordatorios por WhatsApp | El envío automático está desactivado y su lógica fue retirada. No es una función actual del agente. |
| Recordatorios de la web | Se conservan los eventos de Google Calendar y `.ics`. El usuario debe guardarlos con aviso en su calendario. |
| Fuente de las respuestas | Los documentos originales del caso. El agente de WhatsApp no consulta la web de Senda ni lee su progreso. |
| Papel de la IA | Explicar el plan existente y sus implicaciones. No ejecuta operaciones ni crea nuevas recomendaciones de inversión. |
| Datos financieros | Usar los datos y escenarios que existen en el caso. Las estimaciones aritméticas deben llevar sus supuestos. |
| Llamadas | Se contrató y configuró un número propio de Twilio para llamadas telefónicas normales. Las llamadas nativas de WhatsApp siguen sin habilitarse. |

## Estado implementado y evidencia disponible

| Capacidad | Implementación y comprobación | Límite o pendiente |
| --- | --- | --- |
| Preguntas escritas por WhatsApp | Implementadas. Se verificaron mensajes entrantes y respuestas entregadas por Twilio. | La entrada pública depende del túnel descrito más abajo. |
| Notas de voz por WhatsApp | Implementadas. Se comprobó transcripción, respuesta basada en el caso, generación de voz y entrega de audio Ogg Opus. | Si falla la síntesis, se envía texto. Si falla la transcripción, se pide repetir o escribir la pregunta. |
| Contexto conversacional | Se guardan las últimas seis intervenciones por móvil, con caducidad de 24 horas. | Está en memoria y se pierde al reiniciar. No se comparte entre móviles ni con las llamadas. |
| Llamadas telefónicas normales | Número propio contratado, webhook configurado y puente bidireccional con Gemini Live implementado. Hay pruebas de audio con el modelo real. | Hubo una llamada real que terminó a los 15 segundos por un fallo de conexión inicial. Se aplicó IPv4 y un reintento. Después consta otra llamada real completada de 62 segundos y una sesión lista en el registro. Falta recoger la confirmación del usuario sobre calidad y contenido. |
| Llamadas desde WhatsApp | Existe una ruta de código condicionada por `WHATSAPP_CALLS=1`. | La cuenta/remitente actual no tiene habilitado WhatsApp Business Calling. No presentarlo como función disponible del Sandbox. |
| Web visual y calendario | Implementados en `senda/`, con los Weah y Samantha Lewis. | El progreso vive en el navegador. Los avisos dependen del calendario del usuario y de que guarde el evento. |
| Sincronización web–WhatsApp | Ambos usan datos del mismo repositorio. | No comparten conversaciones, hitos completados ni recordatorios. No hay una integración de estado entre ambos. |
| Varios hogares en WhatsApp | El mapa de móviles permite asociar un número a un caso. | El cargador y el prompt del agente actual solo admiten los Weah. No hay soporte general para los cuatro casos. |

### Incidencia operativa detectada al redactar este documento

**El servidor local responde `ok` en el puerto 5180, pero el acceso público del túnel temporal dejó de funcionar.** La comprobación devolvió un error de resolución DNS y el registro de Cloudflare contiene `Unauthorized: Tunnel not found`. Que el proceso `cloudflared` siga abierto no significa que el túnel esté operativo.

Este es el primer pendiente antes de otra prueba externa de mensajes, notas de voz o llamadas. Las entregas y pruebas anteriores son evidencia de que los flujos se implementaron, pero no garantizan que la URL pública siga disponible. Sigue [Recuperar el acceso público](#recuperar-el-acceso-público).

## Cómo obtiene el agente la información del cliente

`whatsapp/agent.mjs` carga al arrancar estos archivos locales completos:

- `cases/timothy-melanie-weah/financial-health.json`.
- `cases/timothy-melanie-weah/investment-analysis.json`.
- `cases/timothy-melanie-weah/persona.md`.

Los convierte en contexto para el modelo y añade instrucciones sobre identidad, idioma, explicación y límites de las respuestas. **No utiliza RAG, una base vectorial, entrenamiento propio ni una consulta al Living Map para cada pregunta.** En este MVP, el agente personal se consigue asociando el móvil al caso y aportando ese caso como contexto. No hay un modelo distinto entrenado para cada cliente.

Para los mensajes, el servidor añade las últimas intervenciones de ese móvil. En cada llamada, Gemini Live recibe el contexto del hogar y mantiene su propia conversación durante esa sesión. El historial de WhatsApp no se incorpora a la llamada.

El perfil incluye inferencias sobre preferencias y motivaciones. El prompt pide tratarlas como inferencias. Las posiciones de inversión son una fotografía del caso, sin precios en directo ni conexión a cuentas bancarias.

### Cifras útiles para comprobar la personalización

| Pregunta | Dato esperado del caso |
| --- | --- |
| Cobertura actual de vida de Timothy | 140.000 USD. |
| Cobertura mínima de Timothy indicada en el plan | 750.000 USD, con una diferencia de 610.000 USD respecto a su cobertura actual. |
| Cobertura actual de vida de Melanie | 110.000 USD. |
| Cobertura mínima de Melanie indicada en el plan | 600.000 USD, con una diferencia de 490.000 USD respecto a su cobertura actual. |
| Saldo y tipo anual de la tarjeta | 18.000 USD al 18 % anual. |

Hay una contradicción en el texto narrativo sobre los intereses de la tarjeta. Con saldo y tipo constantes, la estimación es 3.240 USD al año o 270 USD al mes, antes de amortizaciones, compras y comisiones. `agent.mjs` añade esa comprobación a partir de `profile.liabilities`. Una versión anterior intentó leer `profile.debts`, que no existe en este caso. No recuperar ese acceso incorrecto.

### Cómo explicar lo que gana el cliente al seguir el plan

Se pueden explicar ahorro de intereses, cobertura, reducción de riesgos y los escenarios de puntuación que Sherpas ya calculó. La web utiliza `score.top_moves` y `score.combined_moves`. Una mejora de puntuación no es una rentabilidad ni dinero ya ganado.

El mentor advirtió que los casos traen la proyección del rumbo actual, no una nueva proyección patrimonial de seguir todas las recomendaciones. No fabricar curvas de riqueza futura ni prometer ganancias por completar un hito. Por ejemplo, un abono de 6.800 USD a una tarjeta al 18 % permite estimar 102 USD menos de intereses el primer mes bajo supuestos constantes. Eso debe presentarse como estimación, no como un resultado verificado en una cuenta bancaria.

## Arquitectura y archivos que conviene leer

El servicio principal está en `whatsapp/`. La web tiene su propio servidor en `senda/`. Se pueden ejecutar de forma independiente.

| Archivo | Responsabilidad |
| --- | --- |
| `whatsapp/server.mjs` | Servidor del puerto 5180, validación de firma de Twilio, móviles autorizados, cola, historial, notas de voz, enlaces de audio y entrada de llamadas. |
| `whatsapp/agent.mjs` | Documentos de los Weah, instrucciones del agente, idioma, identidad, saludo y respuesta cuando el modelo falla. Es el primer archivo que revisar para cambiar la conducta del asistente. |
| `whatsapp/ai.mjs` | Acceso al proxy de Sherpas, selección de modelos, transcripción, síntesis y conversión con FFmpeg. |
| `whatsapp/calls.mjs` | Puente Twilio–Gemini Live, conversión de formatos de audio, tono de inicio, interrupciones, límites y recuperación de conexión. |
| `whatsapp/store.mjs` | SQLite de la cola de mensajes y deduplicación por identificador de Twilio. |
| `whatsapp/setup-phone.mjs` | Configura y verifica el webhook de voz del número existente. No compra números ni modifica el webhook del Sandbox de WhatsApp. |
| `whatsapp/service.test.mjs` | Pruebas automatizadas con Twilio y Sherpas simulados. |
| `whatsapp/demo.mjs` | Consulta del caso desde terminal usando el modelo real. No reproduce el canal de Twilio ni conserva el historial conversacional del servidor. |
| `whatsapp/.env.example` | Nombres de las variables necesarias y números ficticios de ejemplo. |
| `senda/server.mjs` | Web en el puerto 5173 y endpoint `/api/cases`. |
| `senda/cases.mjs` | Adaptación de los datos de los Weah y Samantha para la interfaz visual. |
| `senda/public/app.mjs`, `progress.mjs`, `trail-map.mjs` | Interfaz, progreso en `localStorage` y mapa interactivo. |
| `senda/public/calendar.mjs` | Eventos de Google Calendar y archivos `.ics` con alarma y enlace de vuelta. |
| `senda/voice-server.mjs`, `public/voice.mjs` | Ayuda de voz de la web, con Gemini Live y contexto del caso, escenario y acción mostrados. Su interfaz e instrucciones siguen en español y tienen un límite de 90 segundos. |

### Flujos del canal principal

```text
Texto de WhatsApp
  → Twilio → POST /twilio/messages → cola SQLite
  → contexto del caso + conversación del móvil → modelo de texto de Sherpas
  → respuesta por la API de Twilio → WhatsApp del cliente

Nota de voz de WhatsApp
  → mismo webhook → descarga autenticada del audio → transcripción de Sherpas
  → consulta del caso → síntesis de voz → audio Ogg Opus → Twilio → cliente

Llamada telefónica normal
  → número propio de Twilio → POST /twilio/call → TwiML Connect/Stream
  → WSS /twilio/stream ↔ Gemini Live de Sherpas con el caso
  → voz en directo en el teléfono
```

| Uso | Modelo actual |
| --- | --- |
| Respuestas a preguntas escritas o transcritas | `gemini-3.5-flash-lite` |
| Transcripción de notas | `scribe-v2` |
| Voz de respuesta a notas | `eleven-flash-v2.5`, con `language_code: en` |
| Conversación de llamada en directo | `gemini-3.8-live` |

Las claves se usan desde el servidor. Todas esas peticiones van al proxy de Sherpas. En las llamadas en directo se usa el modelo conversacional, sin encadenar Scribe y la síntesis de ElevenLabs para cada turno.

## Configuración local y ejecución

Requisitos del servicio de WhatsApp y teléfono: Node **22.13 o posterior**, npm, FFmpeg y acceso al `.env` local de la raíz. Para acceso externo hace falta un origen público HTTPS que también admita WebSocket seguro.

| Variable | Uso |
| --- | --- |
| `TEAM_KEY`, `LLM_PROXY_URL` | Acceso al proxy y a los créditos de Sherpas. Hay un origen por defecto en el código si no se define la URL. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Cuenta de Twilio y validación de sus firmas. |
| `WHATSAPP_FROM` | Número emisor del Sandbox o remitente de WhatsApp. |
| `WHATSAPP_CLIENTS` | Objeto JSON con móviles internacionales como claves y el identificador del caso como valor. Se reutiliza para autorizar llamadas. |
| `WHATSAPP_PUBLIC_URL` | Origen HTTPS público, sin ruta. También se usa para construir y validar los webhooks de llamadas y los enlaces de audio. |
| `WHATSAPP_PORT` | Puerto local, 5180 por defecto. |
| `TWILIO_VOICE_NUMBER` | Número propio de Twilio para llamadas telefónicas normales. Ya está configurado en el entorno de trabajo. |
| `WHATSAPP_CALLS` | Solo habilita las llamadas nativas desde WhatsApp. Actualmente está deshabilitado. Las llamadas telefónicas normales no necesitan activarlo. |
| `WHATSAPP_DB` | Ruta opcional de la base de cola. Por defecto, `whatsapp/data.sqlite`. |

El número propio para llamadas ya se compró con autorización del usuario. Reutilizar el existente y consultar su valor en el `.env`. El precio autorizado fue 1,15 USD al mes, más consumo. La telefonía, el envío de audio y el uso de modelos se contabilizan por separado. Una llamada desde España al número estadounidense puede tener coste adicional en el operador del móvil. No asumir que el saldo o el precio se mantienen sin comprobarlos.

Desde la raíz, para una instalación nueva:

```bash
npm --prefix whatsapp ci
npm --prefix whatsapp test
npm --prefix whatsapp start
```

Los tests usan simulaciones y no envían mensajes ni consumen créditos de Sherpas. El comando `start` carga el `.env` de la raíz. Si ya hay un servicio en el puerto 5180, comprobarlo antes de abrir una segunda instancia. Los cambios de código o del `.env` requieren reiniciar el servicio.

Para ejecutar la web en otra terminal:

```bash
npm --prefix senda ci
npm --prefix senda start
```

La web se abre en `http://127.0.0.1:5173`. Su ayuda de voz usa la misma clave de Sherpas, pero no pasa por Twilio. El detalle del calendario, el acceso desde móvil y la voz del navegador están en [senda/README.md](senda/README.md).

### Recuperar el acceso público

1. Comprobar el servicio local con `curl http://127.0.0.1:5180/health`. Debe devolver `ok`.
2. Revisar la URL efectiva de `WHATSAPP_PUBLIC_URL` en el `.env` y probar `GET /health` desde esa URL pública. Un servicio local sano no demuestra que Twilio pueda alcanzarlo.
3. Si el túnel expiró, abrir uno nuevo hacia el puerto 5180, por ejemplo con `cloudflared tunnel --url http://127.0.0.1:5180`, y conservar el proceso abierto.
4. Guardar el nuevo origen HTTPS en `WHATSAPP_PUBLIC_URL` y reiniciar el servicio en un momento sin mensajes o llamadas en curso.
5. En el Sandbox de Twilio, guardar **When a message comes in → POST NUEVO-ORIGEN/twilio/messages**. Este paso corresponde al canal de mensajes.
6. Ejecutar `npm --prefix whatsapp run phone:setup` desde la raíz. Configura **Voice → POST NUEVO-ORIGEN/twilio/call** del número ya comprado. Este paso corresponde a las llamadas.
7. Comprobar `GET /health` público y probar una pregunta real de WhatsApp desde un móvil autorizado. Verificar en Twilio la entrega de la respuesta.
8. Probar una nota de voz y, después, una llamada normal. Esperar al tono antes de hablar. Registrar el resultado de cada canal y actualizar este documento.

Para comprobar el origen público sin copiar credenciales ni cargar el `.env` en el shell:

```bash
node --env-file=.env --input-type=module <<'JS'
const response = await fetch(process.env.WHATSAPP_PUBLIC_URL + '/health', {
  signal: AbortSignal.timeout(10000),
});
console.log(response.status, await response.text());
JS
```

Para la entrega conviene resolver la dependencia de un túnel temporal con un servicio y un origen estables. El nombre de la URL de una sesión anterior no debe copiarse como si fuera permanente.

### Referencias de la sesión en este ordenador

El servicio y el túnel se han ejecutado como procesos locales. Los archivos de esta sesión están en `/tmp/senda-tunnel-k8dphyu1/`:

- `server.pid` y `app.log` indican el proceso y los registros de WhatsApp/teléfono.
- `tunnel.pid` y `tunnel-current.logpath` identifican el proceso del túnel y su último registro.
- `phone-number.json` contiene el recibo local de configuración del número.

Estas rutas son temporales y pueden desaparecer. Antes de detener un PID, comprobar que su comando y directorio corresponden al proceso esperado. No son un sistema de despliegue ni un requisito para arrancar desde una copia nueva.

## Límites y fallos conocidos

Las llamadas admiten una sesión simultánea y cierran el puente de audio a los 180 segundos desde su apertura. El saludo y el cierre telefónico pueden añadir tiempo a la duración total que cobra Twilio. El puente convierte mu-law de 8 kHz a PCM de 24 kHz y hace la conversión inversa para las respuestas.

Se observaron fallos de conexión al proxy, entre ellos `ETIMEDOUT`, y una ruta IPv6 no disponible desde este equipo. `calls.mjs` fuerza IPv4 y permite un segundo intento ante errores temporales antes de que la sesión esté lista. No reintenta credenciales rechazadas ni reconstruye una conversación cortada a mitad de llamada. El registro `Realtime: llamada lista` confirma que el modelo quedó preparado, no que el cliente escuchara toda la respuesta.

En las peticiones HTTP, `ai.mjs` reintenta una vez las consultas de texto y las transcripciones ante ciertos errores temporales. La descarga del audio y la síntesis no tienen ese mismo reintento. Si falla la síntesis, se utiliza la respuesta escrita. Revisar estos límites si se siguen observando fallos de notas de voz.

Las respuestas por WhatsApp son iniciadas por una consulta del cliente. No se han implementado plantillas ni una campaña de avisos proactivos. La capacidad futura de recordar próximos pasos por WhatsApp debe decidirse como trabajo nuevo, respetando que el usuario pidió retirar los hitos de las conversaciones actuales.

## Datos, estado y privacidad de la demo

Se trabaja con casos sintéticos. Se valida la firma de Twilio y solo se atienden los móviles configurados. Esa lista es un control de acceso para la demo y no sustituye una verificación de identidad de clientes reales. La identificación como Timothy o Melanie se obtiene de lo que expresa la persona y del contexto del chat.

Las conversaciones se mantienen en memoria durante hasta 24 horas desde su última actualización y contienen como máximo seis intervenciones. Los audios generados se mantienen en memoria con enlaces aleatorios que caducan a los 15 minutos. El servidor no configura una grabación de las llamadas. Twilio y los proveedores reciben los mensajes o el audio necesarios para prestar el servicio, por lo que no debe prometerse que los datos nunca salen del equipo.

La base SQLite conserva la cola y la deduplicación. El contenido pendiente se elimina de la fila al terminar el trabajo. El estado `done` significa que el servidor procesó el trabajo, no que el móvil haya recibido la respuesta. Comprobar la entrega en Twilio. Al reiniciar, los trabajos que estaban `sending` se marcan como fallidos para evitar repetir automáticamente envíos de resultado incierto. No ejecutar dos instancias sobre la misma base.

La web guarda su progreso en `localStorage` por caso y sus recordatorios dependen del calendario. No hay backend de progreso compartido. Nunca subir el `.env`, credenciales, teléfonos personales de los probadores, bases SQLite ni registros a Git. Los números de `.env.example` son ficticios.

## Pruebas existentes y validación de la demo

`npm --prefix whatsapp test` dispone de seis pruebas. Cubren firma del webhook, números autorizados, deduplicación, separación de conversaciones, notas de voz, saludo hablado, errores del modelo, entrada telefónica independiente de WhatsApp Calling, audio bidireccional y recuperación limitada de fallos de conexión. Los proveedores se simulan. No prueban la disponibilidad de Cloudflare, los permisos de la cuenta o la entrega real en un móvil.

En la verificación de este traspaso, las seis pruebas pasaron. También se comprobaron los enlaces locales de la documentación y que el material original del hackathon del README principal se conserva.

Se hicieron pruebas adicionales con los modelos reales de Sherpas y con el puente público simulando los eventos de una llamada. Se obtuvieron respuestas de voz correctas de 140.000 USD para Timothy y 110.000 USD para Melanie. No confundir esa simulación con una llamada cursada por la red telefónica. Las dos llamadas reales registradas al revisar este traspaso duraron 15 y 62 segundos, respectivamente.

Para una demo centrada en la propuesta de valor:

1. Abrir una conversación real de WhatsApp desde un móvil autorizado y preguntar «I'm Timothy. How much life insurance do I have?». Comprobar 140.000 USD y respuesta en inglés.
2. Hacer una pregunta de seguimiento, por ejemplo «Why does our plan recommend more coverage?», para mostrar comprensión del contexto y explicación sencilla.
3. Desde el otro móvil, identificarse como Melanie y preguntar por su cobertura. Comprobar 110.000 USD y separación de ambas conversaciones.
4. Enviar una nota de voz preguntando por el plan. Reproducir la respuesta hablada en inglés. No debe añadir hitos, rachas o recordatorios no solicitados.
5. Si la llamada está validada y el acceso público funciona, mostrar brevemente ese canal como extensión de la consulta.
6. Abrir la web para apoyar una explicación con las medidas ya calculadas y mostrar el evento de calendario. Explicar que el aviso lo emite el calendario y que no sincroniza el progreso con WhatsApp.

La demostración debe enseñar primero la resolución de una duda particular y su continuación. Según [los criterios originales del reto](README.md#how-we-judge), interesa mostrar claridad para quien no sabe finanzas, personalización por miembro del hogar y un siguiente paso comprensible cuando el cliente lo pide. La diferencia de canal y de acceso debe aportar utilidad demostrable frente al chat ya existente en el plan. No hay una calificación garantizada por utilizar WhatsApp.

## Orden recomendado para continuar

1. **Restaurar el acceso público.** Resolver el túnel, actualizar los dos webhooks y verificar entregas reales antes de preparar otra demo.
2. **Consolidar la experiencia principal de WhatsApp.** Revisar respuestas sobre cartera, deuda, seguros y jubilación, identificación personal, preguntas de seguimiento, claridad y manejo de datos ausentes. Mantener el inglés estadounidense y la consulta directa sin hitos automáticos.
3. **Comprobar fiabilidad de las notas de voz.** Verificar recepción, transcripción y reproducción en el móvil. Registrar latencia y errores reales para decidir si hacen falta ajustes puntuales.
4. **Confirmar la experiencia telefónica con el usuario.** Comprobar escucha, respuesta, interrupciones y duración. La existencia de una llamada completada no basta para afirmar que toda la experiencia es satisfactoria.
5. **Preparar una entrega reproducible.** Mantener un servidor y origen accesibles para el jurado, probar desde una instalación nueva y grabar una conversación real como recorrido principal.
6. **Pulir la web como apoyo cuando lo anterior esté sólido.** Conservar calendario y visualización. Un rediseño completo del mapa no es la prioridad actual.

Posibles ampliaciones, todavía sin implementar: sincronizar estado entre web y chat, dar soporte a otros hogares, persistir conversaciones con una política definida o activar WhatsApp Business Calling. Deben tratarse como decisiones de alcance posteriores. Un sistema de RAG o más infraestructura solo tiene sentido si resuelve una necesidad concreta que el caso único actual no cubra.

## Entrega del código y continuidad del trabajo

En el momento de este traspaso hay cambios locales anteriores en `README.md`, `senda/README.md` y `senda/voice-server.mjs`. La carpeta `whatsapp/` aparece como nueva sin seguimiento en Git. Comprobar `git status` antes de editar y antes de entregar. No descartar esos cambios. Verificar que el código y la documentación nuevos se incluyen en la entrega sin incorporar secretos, datos locales ni dependencias.

Para cambios de implementación, el equipo ha pedido seguir [Karpathy Guidelines](.agents/skills/karpathy-guidelines/SKILL.md): aclarar supuestos relevantes, hacer cambios acotados, evitar infraestructura especulativa y verificar el comportamiento que se pretende corregir. Este documento es un punto de partida fechado. Actualizarlo al resolver incidencias o cambiar el alcance para que el siguiente agente reciba el estado real.
