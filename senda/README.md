# Senda

## Papel de la web en el MVP actual

La web es el complemento visual del proyecto. Conservamos el mapa de la senda, la explicación de las medidas del plan, el progreso local y los recordatorios de calendario. **La prioridad actual y la propuesta de valor principal son las consultas personalizadas por WhatsApp**, implementadas en `../whatsapp/`. Antes de continuar el desarrollo, lee [el estado actual y el traspaso para otro Codex](../ESTADO_ACTUAL.md).

El equipo considera que una web centrada únicamente en visualizar el plan se parece demasiado al Living Map existente de Sherpas. Por eso, la demo debe empezar por una duda real resuelta desde WhatsApp y utilizar esta web como apoyo. La web y WhatsApp todavía no sincronizan progreso, recordatorios ni conversaciones.

## Qué implementa esta web

Senda permite que una familia elija qué necesita comprobar para tomar una decisión de su plan, acuerde un paso y lo retome después. El enlace al plan de Sherpas lleva al Living Map y al resto del plan original. Dentro de Senda, la comparación usa la puntuación actual y las medidas que Sherpas ya calculó en el caso.

El prototipo usa los casos sintéticos de **Timothy y Melanie Weah** y **Samantha Lewis**. El estado se guarda por caso en el navegador. El selector de los Weah permite ensayar dos perspectivas en el mismo dispositivo.

## Ejecutarlo

Ejecutad este comando desde la raíz del repositorio con Node 22 o posterior.

```bash
node senda/server.mjs
```

Abrid <http://127.0.0.1:5173>. El recorrido usa los datos locales. Si estáis usando el `.env` del equipo, instalad las dependencias de voz como indica el paso 6.

## Archivos y recorrido implementados

Los archivos descritos a continuación ya existen. Este apartado conserva la explicación de su construcción y de cómo comprobarlos.

### 1. Servir la web y preparar los casos

Cread [server.mjs](server.mjs) con un servidor HTTP de Node. `GET /` sirve el HTML y `GET /api/cases` devuelve `{ cases, voiceEnabled }`. El servidor sirve solo los archivos de la lista `files`. Los JSON originales se siguen leyendo desde `../cases/`.

En [cases.mjs](cases.mjs), registrad una función por cada caso que queráis presentar. Cada función describe el problema, las dudas, las acciones y el texto de las medidas. El cargador común incorpora el identificador, los miembros adultos y `score.published_score`. `synthetic: true` identifica los planes admitidos por este prototipo.

Para obtener un escenario, buscad la medida exacta en `score.top_moves` o la combinación exacta en `score.combined_moves`. El comparador toma el resultado de `record.score_after` y conserva la ruta del campo. La opción principal de los Weah usa estos campos.

```js
const cardAndLife = findScenario(plan.score, 'Pay down revolving card', 'Add life cover');
const scoreAfter = cardAndLife.record.score_after; // 73 en este caso
const source = cardAndLife.source;               // score.combined_moves[1]
```

Podéis probarlo consultando el endpoint.

```bash
curl http://127.0.0.1:5173/api/cases
```

### 2. Mostrar una decisión y las medidas documentadas

Cread [public/index.html](public/index.html) con las secciones de dudas, comparación y próximo paso. [public/styles.css](public/styles.css) adapta el diseño a móvil. [public/app.mjs](public/app.mjs) carga los datos de `/api/cases` y renderiza cada sección.

1. En `displayCase()`, rellenad la pregunta inicial, el dato de contexto y el enlace al plan de Sherpas.
2. En el selector de escenarios, cread una opción por cada elemento de `plan.scenarios`.
3. En `renderComparison()`, mostrad siempre la puntuación actual y la del escenario seleccionado, ambas sobre 100. En **Sencillo**, añadid un resumen. En **Visual**, representad los mismos valores con barras. En **Detalle**, añadid las condiciones y el origen en el caso.
4. Manteneos en el escenario seleccionado al cambiar de modo. Guardad el modo por persona y caso.

Para los Weah, comprobad **60 → 62** al reducir el saldo, **60 → 73** al sumar la medida de seguro de vida y **60 → 78** al incluir también la cobertura de responsabilidad civil adicional. El valor de 73 exige la cobertura total de vida indicada en el caso. En Samantha, la edad de 73 años corresponde a la proyección actual. [Medidas de los Weah](../cases/timothy-melanie-weah/financial-health.json#L83) · [Plan de Samantha](../cases/samantha-lewis/financial-health.json) · [Plan compartido de los Weah](https://app.sherpaswealth.com/plan/shared/RcCtgoNkGmD6dvGtYVKWLGefdCTFdc4JP_jH9Jbz2jo)

### 3. Proponer un paso a partir de las dudas

Cread [public/progress.mjs](public/progress.mjs) para el estado. Usad un registro en `localStorage` por caso con las preferencias de lectura, las dudas elegidas, el paso guardado, las fechas de los hitos y los recordatorios.

En **¿Qué necesitamos aclarar?**, cada opción muestra un dato del caso, explica por qué importa y lleva a un paso sugerido. En los Weah, usad **Eligiendo como** para guardar la duda de cada miembro. `suggestedAction()` propone la acción asociada si eligen el mismo tema. Con dudas diferentes, sugiere acordar la pregunta que llevarán al asesor.

El mapa de **Tu senda** permite seleccionar cualquier hito y ver su impacto antes de abrirlo. `public/trail-map.mjs` dibuja el relieve y el recorrido. El yak se mueve por el sendero hacia la parada elegida y el tramo cambia al completar el hito. **Guardar este paso** habilita completar la acción y crear un recordatorio. La fecha se guarda por acción y el total semanal se calcula desde el lunes local.

Para comprobar el ahorro, abrid **Reducir la deuda** en los Weah y registrad el abono de ejemplo. Senda calcula la diferencia de intereses entre los dos saldos al tipo anual del caso dividido por 12. Un abono de 6.800 USD al 18 % anual supondría unos 102 USD menos de intereses el primer mes, si el tipo se mantiene y no hay compras ni comisiones.

### 4. Crear un recordatorio que vuelva al paso guardado

El [código del calendario](public/calendar.mjs) prepara un evento de diez minutos. El móvil emite el aviso cuando guardáis el evento con notificaciones activadas, incluso con Senda cerrada.

1. Guardad el paso y elegid **Recordármelo en el móvil**. Podéis probar en **2 min**, elegir **Mañana**, **En 3 días** o editar la fecha.
2. **Abrir Google Calendar** lleva a un evento rellenado. **Descargar evento .ics** prepara un archivo con alarma al inicio. Si el móvil no importa el archivo, usad **Copiar fecha y enlace** para crear el evento manualmente.
3. Guardad el evento en el calendario, verificad que tiene un aviso al empezar y marcad **Ya lo guardé con aviso** en Senda. La parada queda **En agenda**.
4. Cerrad la pestaña para probar el aviso. Al tocar el enlace del evento en el mismo navegador, Senda abre el hito correspondiente. Cuando pasa la hora, aparece **Por retomar** hasta que lo completéis. Si cambiáis la fecha o ya completasteis el hito, ajustad o retirad el evento anterior desde el calendario.

El evento se titula «Retomar un hito en Senda» y su enlace usa un identificador aleatorio. **Probar enlace de vuelta** abre la misma URL que lleva el evento. [Enlaces de Google Calendar](https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events#provide_a_link_for_users_to_add_the_event) · [Avisos en el calendario del iPhone](https://support.apple.com/en-asia/guide/iphone/iph3d110f84/ios) · [Alarmas de iCalendar](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.6.6)

Para ensayar en un móvil conectado a la misma red privada, arrancad la demo con `SENDA_HOST=0.0.0.0 node senda/server.mjs` y abrid `http://IP-DEL-ORDENADOR:5173` desde el móvil. Cread el recordatorio en ese navegador para que el enlace conserve la dirección correcta y encuentre su estado al volver.

### 5. Comprobar que el flujo se adapta al segundo caso

Elegid **Samantha Lewis** en la cabecera. Debe aparecer una sola perspectiva y su propio progreso. Al elegir jubilación, el paso sugerido es confirmar qué ofrece su empresa. Al elegir estudios, es comprobar la fecha y el importe del próximo pago.

Para añadir otro caso, escribid una función como `buildSamantha()` y registradla en `caseBuilders`. Definid sus dudas y acciones y vinculad cada escenario con el resultado que ya trae su `financial-health.json`. La misma interfaz usa esa ficha.

### 6. Activar la ayuda conversacional

Las respuestas escritas salen del paso mostrado y de `plan.questions`. Para la voz opcional, [voice-server.mjs](voice-server.mjs) valida el caso, escenario y acción y monta el contexto antes de abrir el WebSocket al proxy. La llamada usa `gemini-3.8-live` con audio PCM16 a 24 kHz y configura la sesión al recibir `session.created`. [public/voice.mjs](public/voice.mjs) captura y reproduce el audio con el [worklet del ejemplo de Sherpas](../examples/voice/public/mic-worklet.js).

Con una clave vigente en el `.env` de la raíz, detened el servidor anterior y ejecutad estos comandos.

```bash
npm --prefix senda ci
node senda/server.mjs
```

Pulsad el botón flotante **Pregunta al yak** e **Iniciar llamada**. Probad «¿Qué puedo revisar esta semana?» en los Weah y en Samantha. La sesión se cierra al colgar o cambiar de caso. La app mantiene el audio y la respuesta en memoria. El audio llega al proxy. La llamada de demostración admite una sesión de hasta 90 segundos. En local, la voz se activa al detectar `TEAM_KEY`. El panel también ofrece respuestas escritas del hito seleccionado. [Acceso y protocolo de Sherpas](../README.md#6-add-voice-if-your-idea-uses-it)

## Demostración y comprobación de entrega

1. Abrir los Weah y elegir una duda distinta por persona.
2. Seleccionar **Tarjeta y seguro de vida** y cambiar de **Visual** a **Detalle**. Explicar que 73 es el resultado de aplicar esas medidas concretas.
3. Guardar el paso compartido y mostrar el recordatorio. Abrir **Probar enlace de vuelta** y completar el hito.
4. Cambiar a Samantha para enseñar la adaptación. En una pestaña aparte, dejar preparados los planes originales y las instrucciones de arranque.

Probad el recorrido completo en móvil y confirmad el aviso en el calendario del dispositivo que vayáis a usar. Abrid el MVP desde una copia limpia con `node senda/server.mjs`. La versión sin voz es el recorrido que puede revisar el jurado con los archivos del repo.

## Recurso visual

La portada y el botón de consulta muestran el yak del [banner de Sherpas](../assets/banner.png) mediante un recorte CSS.
