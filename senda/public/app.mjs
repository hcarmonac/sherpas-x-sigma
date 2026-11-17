import { loadProgress, saveProgress, suggestedAction, milestonesThisWeek } from './progress.mjs';
import { calendarId, downloadCalendar, googleCalendarUrl, localDateTime } from './calendar.mjs';
import { installTrailMap } from './trail-map.mjs';
import { installVoice } from './voice.mjs';

const element = (id) => document.getElementById(id);
const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
const escaped = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const html = (value) => String(value).replace(/[&<>"']/g, (character) => escaped[character]);
const drawTrailMap = installTrailMap(element('trail-map'));

let cases = [];
let plan;
let progress;
let readerId;
let scenarioId;
let actionId;
let voice;

function option(id, label, selected) {
  return `<option value="${html(id)}" ${id === selected ? 'selected' : ''}>${html(label)}</option>`;
}

function radio(name, id, label, selected) {
  return `<label class="option"><input type="radio" name="${html(name)}" value="${html(id)}" ${id === selected ? 'checked' : ''}>${html(label)}</label>`;
}

function showNotice(text = '') {
  const notice = element('return-message');
  notice.textContent = text;
  notice.hidden = !text;
}

function persist(changedReminder) {
  if (!saveProgress(plan.id, progress, changedReminder)) {
    showNotice('El navegador limita el guardado. Puedes continuar en esta pestaña.');
  }
}

function activeAction() {
  return plan.actions.find(({ id }) => id === actionId);
}

function renderComparison() {
  const scenario = plan.scenarios.find(({ id }) => id === scenarioId);
  const mode = progress.modes[readerId] ?? 'simple';
  element('mode').value = mode;

  const result = (score, label, chosen = false) => `
    <div class="result ${chosen ? 'chosen' : ''}">
      <span>${label}</span><strong>${score}/100</strong>
      ${mode === 'visual' ? `<div class="bar" style="--score:${score}%" aria-hidden="true"></div>` : ''}
    </div>`;
  const detail = mode === 'detail' ? `
    <ul class="condition-list">${scenario.conditions.map((condition) => `<li>${html(condition)}</li>`).join('')}</ul>
    <p class="caption">Fuente del escenario · <code>${html(scenario.source)}</code></p>` : '';

  element('comparison').innerHTML = `
    <div class="results">${result(plan.score, 'Situación actual')}${result(scenario.score, 'Con estas medidas', true)}</div>
    <p>${html(scenario.summary)}</p>${detail}`;
}

function renderQuestions() {
  const action = activeAction();
  const { value, label, note } = action.impact;
  const questions = [
    { question: '¿Qué tengo que hacer en este hito?', answer: action.description, source: action.source },
    {
      question: '¿Qué significa la cifra de este hito?',
      answer: `${value} ${label.toLocaleLowerCase('es-ES')}. ${note}`,
      source: action.impact.source ?? action.source,
    },
    ...plan.questions,
  ];
  element('questions').innerHTML = questions.map(({ question, answer, source }) => `
    <details><summary>${html(question)}</summary><p>${html(answer)}</p>
      <p class="caption">En el plan · <code>${html(source)}</code></p></details>`).join('');
}

function impactFigure({ value, label }) {
  return `<span class="impact-value">${html(value)}</span><span class="impact-label">${html(label)}</span>`;
}

function reminderUrl(id) {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('recordatorio', id);
  url.hash = 'siguiente';
  return url.href;
}

function reminderStatus(reminder) {
  if (!reminder) return '';
  if (Date.parse(reminder.at) <= Date.now()) return 'Por retomar';
  return reminder.confirmed ? 'En agenda' : 'Por añadir';
}

function renderTrail(earnedId) {
  const completed = plan.actions.filter(({ id }) => progress.completed[id]).length;
  element('weekly-progress').textContent = `${completed} de ${plan.actions.length} hitos · ${milestonesThisWeek(progress.completed)} esta semana`;
  element('trail-stops').innerHTML = plan.actions.map(({ id, label }) => {
    const done = Boolean(progress.completed[id]);
    const selected = id === actionId;
    const scheduled = reminderStatus(progress.reminders[id]);
    const state = done ? 'Completado' : scheduled || (selected ? 'Estás aquí' : 'Por recorrer');
    return `<li class="trail-stop ${done ? 'done' : ''} ${id === earnedId ? 'earned' : ''}">
      <button type="button" class="trail-button" data-stop="${html(id)}" aria-current="${selected ? 'step' : 'false'}">
        <span class="trail-marker" aria-hidden="true">${done ? '✓' : ''}</span>
        <span class="trail-name"><strong>${html(label)}</strong><small>${state}</small></span>
      </button>
    </li>`;
  }).join('');
  const action = activeAction();
  element('trail-preview').innerHTML = `
    <h3>${html(action.title)}</h3>
    <div class="trail-impact">${impactFigure(action.impact)}</div>
    <p class="caption">${html(action.impact.note)}</p>`;
  const upcoming = plan.actions
    .filter(({ id }) => progress.reminders[id] && !progress.completed[id])
    .sort((a, b) => Date.parse(progress.reminders[a.id].at) - Date.parse(progress.reminders[b.id].at))[0];
  const agenda = element('trail-agenda');
  agenda.hidden = !upcoming;
  if (upcoming) {
    const reminder = progress.reminders[upcoming.id];
    agenda.innerHTML = `<strong>${reminderStatus(reminder)}</strong> · ${html(dateFormat.format(new Date(reminder.at)))}
      <a href="${html(reminderUrl(reminder.id))}">${html(upcoming.label)}</a>`;
  }
  drawTrailMap(Boolean(earnedId));
}

function renderDecisionTopics() {
  element('people').innerHTML = '<legend class="visually-hidden">Elegir qué aclarar primero</legend>' +
    plan.concerns.map(({ id, label, fact, why }) => `
      <label class="decision-topic">
        <input type="radio" name="concern" value="${html(id)}"
          aria-labelledby="topic-${html(id)}" aria-describedby="why-${html(id)}"
          ${progress.concerns[readerId] === id ? 'checked' : ''}>
        <span class="decision-topic-title" id="topic-${html(id)}">${html(label)}</span>
        <span class="decision-fact">${html(fact)}</span>
        <span class="decision-why" id="why-${html(id)}">${html(why)}</span>
      </label>`).join('');
}

function renderDecisionSelection() {
  const choices = plan.members.map(({ name, id }) => {
    const concern = plan.concerns.find(({ id: key }) => key === progress.concerns[id]);
    return `${name} · ${concern?.label ?? 'Pendiente de elegir'}`;
  });
  const suggested = plan.actions.find(({ id }) => id === suggestedAction(plan, progress.concerns));
  element('decision-selection').innerHTML = `
    <span>${choices.map(html).join(' <span aria-hidden="true">/</span> ')}</span>
    <strong>${html(suggested.title)}</strong>`;
}

function reminderDate(days) {
  const now = new Date();
  if (days === 0) return localDateTime(new Date(now.getTime() + 2 * 60_000));
  now.setDate(now.getDate() + days);
  now.setHours(18, 0, 0, 0);
  return localDateTime(now);
}

function reminderInputValue(reminder) {
  const saved = reminder && new Date(reminder.at);
  return saved > new Date() ? localDateTime(saved) : reminderDate(1);
}

function renderAction(earnedId) {
  const action = activeAction();
  const agreed = progress.saved[action.id];
  const completed = Boolean(progress.completed[action.id]);
  const reminder = progress.reminders[action.id];
  const chosen = plan.members.filter(({ id }) => progress.concerns[id]);

  let reason = 'Senda propone una revisión para preparar la decisión.';
  if (chosen.length === plan.members.length) {
    const priorities = plan.members.map((member) => {
      const concern = plan.concerns.find(({ id }) => progress.concerns[member.id] === id);
      return `${member.name}: ${concern.label.toLocaleLowerCase('es-ES')}`;
    });
    reason = priorities.join(' · ');
  } else if (agreed) {
    reason = 'Paso guardado para retomarlo cuando os venga bien.';
  }
  element('action-reason').textContent = reason;
  const next = plan.actions.find(({ id }) => !progress.completed[id] && id !== action.id);
  const impact = action.impact;
  const taskContext = `<div class="task-context">${impactFigure(impact)}<p class="caption">${html(impact.note)}</p></div>`;
  let controls = `${taskContext}<button class="button primary" type="button" id="agree">Guardar este paso</button>`;
  if (completed) {
    const comparison = impact.comparison ? `<dl class="impact-comparison" aria-label="Intereses orientativos del primer mes">
      <div><dt>Interés con el saldo actual</dt><dd>${html(impact.comparison[0])}</dd></div>
      <div><dt>Interés tras el abono</dt><dd>${html(impact.comparison[1])}</dd></div>
    </dl>` : '';
    controls = `<div class="milestone-win ${earnedId ? 'earned' : ''}" id="milestone-win" role="group" aria-labelledby="win-title" aria-describedby="win-detail" tabindex="-1">
      <div class="win-summary">
        <span class="win-mark" aria-hidden="true">✓</span>
        <div><strong id="win-title">${next ? 'Hito conseguido' : 'Senda completada'}</strong><p id="win-detail">${html(action.win)}</p></div>
      </div>
      <div class="win-impact">
        ${impactFigure(impact)}
        ${comparison}
        <p class="caption">${html(impact.note)}</p>
      </div>
    </div>
    <p class="caption">Completado el ${html(dateFormat.format(new Date(progress.completed[action.id])))}.</p>`;
    if (next) controls += '<button class="button primary" type="button" id="next-action">Continuar por la senda →</button>';
    else controls += '<a class="button secondary" href="#ruta">Ver todos mis hitos ↑</a>';
  } else if (agreed) {
    const status = reminderStatus(reminder);
    const reminderNote = reminder ? `
      <div class="reminder-summary ${status === 'Por retomar' ? 'overdue' : ''}">
        <strong>${status} · ${html(dateFormat.format(new Date(reminder.at)))}</strong>
        <p>${status === 'Por retomar' ? '¿Pudiste hacerlo? Completa el hito o elige otra fecha.'
          : reminder.confirmed ? 'Confirmaste este aviso en el calendario del móvil.'
          : 'Guarda el evento en tu calendario y activa el aviso.'}</p>
        ${status === 'Por añadir' ? '<button class="button secondary" type="button" id="confirm-calendar">Ya lo guardé con aviso</button>' : ''}
        <a class="text-link" href="${html(reminderUrl(reminder.id))}">Probar enlace de vuelta</a>
      </div>` : '';
    controls = `${taskContext}
      <div class="actions">
        <button class="button primary" type="button" id="complete">${html(action.completeLabel ?? 'Completar este hito')}</button>
        <button class="button secondary" type="button" id="open-calendar" aria-expanded="false" aria-controls="calendar-form">
          ${reminder ? 'Elegir otra fecha' : 'Recordármelo en el móvil'}
        </button>
      </div>
      ${reminderNote}
      <form id="calendar-form" class="calendar-editor" hidden>
        <p class="caption">El calendario del móvil enviará el aviso cuando guardes el evento y actives la notificación.</p>
        <div class="reminder-presets">
          <button class="button secondary" type="button" data-remind-days="0">Probar en 2 min</button>
          <button class="button secondary" type="button" data-remind-days="1">Mañana</button>
          <button class="button secondary" type="button" data-remind-days="3">En 3 días</button>
        </div>
        <label for="calendar-time">¿Cuándo quieres retomarlo?</label>
        <input id="calendar-time" name="at" type="datetime-local" required value="${reminderInputValue(reminder)}">
        <div class="actions">
          <button class="button primary" type="submit" name="calendar" value="google">Abrir Google Calendar ↗</button>
          <button class="button secondary" type="submit" name="calendar" value="ics">Descargar evento .ics</button>
          <button class="button secondary" type="button" id="copy-reminder">Copiar fecha y enlace</button>
        </div>
        ${reminder ? '<p class="caption">Si ya tienes el evento anterior, cambia su fecha o elimínalo en tu calendario al guardar el nuevo.</p>' : ''}
        <p id="calendar-status" class="caption" role="status"></p>
      </form>`;
  }

  element('action-content').innerHTML = `
    <div class="task">
      <h3 id="current-action-title" tabindex="-1">${html(action.title)}</h3>
      <p>${html(action.description)}</p>
      ${controls}
    </div>`;
  renderQuestions();
  renderTrail(earnedId);
}

function selectAction(id) {
  if (id !== actionId) voice?.close();
  actionId = id;
  progress.draft = id;
  showNotice();
  persist();
  renderAction();
}

function displayCase(nextPlan, resumedAction) {
  voice?.close();
  plan = nextPlan;
  progress = loadProgress(plan.id);
  readerId = plan.members.find(({ id }) => id === progress.readerId)?.id ?? plan.members[0].id;
  scenarioId = plan.scenarios.find(({ id }) => id === progress.scenarioId)?.id ?? plan.scenarios[0].id;
  const savedAction = resumedAction ?? progress.draft;
  actionId = plan.actions.some(({ id }) => id === savedAction) ? savedAction : suggestedAction(plan, progress.concerns);

  element('case-picker').value = plan.id;
  element('case-name').textContent = plan.title;
  element('hero-title').textContent = plan.question;
  element('case-description').textContent = plan.introduction;
  element('original-plan').href = plan.planUrl;
  element('fact-value').textContent = plan.fact.value;
  element('fact-label').textContent = plan.fact.label;
  const readers = plan.members.map(({ id, name }) => option(id, name, readerId)).join('');
  element('read-as-container').hidden = plan.members.length === 1;
  element('decision-reader-container').hidden = plan.members.length === 1;
  element('read-as').innerHTML = readers;
  element('decision-reader').innerHTML = readers;
  renderDecisionTopics();
  renderDecisionSelection();
  element('scenarios').innerHTML = '<legend>Elegid qué medidas comparar</legend>' +
    plan.scenarios.map(({ id, title }) => radio('scenario', id, title, scenarioId)).join('');
  element('comparison-note').textContent = plan.explanation;
  element('later-steps').innerHTML = plan.later.map(({ when, text }) => `<dt>${html(when)}</dt><dd>${html(text)}</dd>`).join('');
  if (resumedAction) {
    showNotice(progress.completed[actionId]
      ? 'Ya completaste el hito de este recordatorio.'
      : 'Has vuelto al hito de tu recordatorio. Puedes completarlo o elegir otra fecha.');
  } else {
    showNotice();
  }
  renderComparison();
  renderAction();
}

function prepareReminder() {
  const input = element('calendar-time');
  const date = new Date(input.value);
  if (!input.value || !Number.isFinite(date.getTime()) || date <= new Date()) {
    element('calendar-status').textContent = 'Elige una fecha y hora futuras.';
    input.focus();
    return null;
  }

  const previous = progress.reminders[actionId];
  const id = previous?.id ?? calendarId();
  const at = date.toISOString();
  progress.reminders[actionId] = { id, at, confirmed: previous?.at === at && previous.confirmed === true };
  persist(actionId);
  return { id, at: date, url: reminderUrl(id) };
}

element('case-picker').addEventListener('change', (event) => {
  const nextPlan = cases.find(({ id }) => id === event.target.value);
  if (!nextPlan) return;
  const url = new URL(location.href);
  url.searchParams.delete('recordatorio');
  url.searchParams.set('caso', nextPlan.id);
  history.replaceState(null, '', url);
  displayCase(nextPlan);
});

element('people').addEventListener('change', ({ target }) => {
  progress.concerns[readerId] = target.value;
  renderDecisionSelection();
  if (!progress.saved[actionId] && !progress.completed[actionId]) {
    const suggested = suggestedAction(plan, progress.concerns);
    if (!progress.completed[suggested] && suggested !== actionId) {
      selectAction(suggested);
      return;
    }
  }
  persist();
  renderAction();
});

element('decision-go').addEventListener('click', () => {
  selectAction(suggestedAction(plan, progress.concerns));
  element('current-action-title').focus({ preventScroll: true });
});

element('trail-stops').addEventListener('click', ({ target }) => {
  const stop = target.closest('[data-stop]');
  if (!stop) return;
  const id = stop.dataset.stop;
  selectAction(id);
  element('trail-stops').querySelector(`[data-stop="${id}"]`).focus({ preventScroll: true });
});

element('scenarios').addEventListener('change', ({ target }) => {
  scenarioId = target.value;
  progress.scenarioId = scenarioId;
  persist();
  voice?.close();
  renderComparison();
});

function changeReader({ target }) {
  readerId = target.value;
  progress.readerId = readerId;
  element('read-as').value = readerId;
  element('decision-reader').value = readerId;
  persist();
  renderDecisionTopics();
  renderComparison();
}

element('read-as').addEventListener('change', changeReader);
element('decision-reader').addEventListener('change', changeReader);

element('mode').addEventListener('change', ({ target }) => {
  progress.modes[readerId] = target.value;
  persist();
  renderComparison();
});

element('action-content').addEventListener('click', async ({ target }) => {
  if (target.hasAttribute('data-remind-days')) {
    element('calendar-time').value = reminderDate(Number(target.dataset.remindDays));
    element('calendar-time').focus();
    return;
  }

  switch (target.id) {
    case 'agree':
      progress.saved[actionId] = true;
      progress.draft = actionId;
      persist();
      renderAction();
      element('complete').focus();
      break;
    case 'complete': {
      Object.assign(progress.completed, loadProgress(plan.id).completed);
      const earned = !progress.completed[actionId];
      if (earned) progress.completed[actionId] = new Date().toISOString();
      persist();
      showNotice();
      renderAction(earned ? actionId : undefined);
      element('milestone-win').focus();
      break;
    }
    case 'next-action':
      selectAction(plan.actions.find(({ id }) => !progress.completed[id]).id);
      element('current-action-title').focus();
      break;
    case 'open-calendar': {
      const form = element('calendar-form');
      form.hidden = !form.hidden;
      target.setAttribute('aria-expanded', String(!form.hidden));
      if (!form.hidden) element('calendar-time').focus();
      break;
    }
    case 'confirm-calendar':
      progress.reminders[actionId].confirmed = true;
      persist(actionId);
      renderAction();
      element('open-calendar').focus();
      break;
    case 'copy-reminder': {
      const reminder = prepareReminder();
      if (!reminder) break;
      const status = element('calendar-status');
      try {
        await navigator.clipboard.writeText(`${dateFormat.format(reminder.at)}\n${reminder.url}`);
        if (!status.isConnected) break;
        renderAction();
        showNotice('Fecha y enlace copiados. Puedes pegarlos en tu calendario.');
      } catch {
        status.textContent = `${dateFormat.format(reminder.at)} · ${reminder.url}`;
      }
      break;
    }
  }
});

element('action-content').addEventListener('submit', (event) => {
  event.preventDefault();
  const reminder = prepareReminder();
  if (!reminder) return;
  const google = event.submitter?.value === 'google';
  if (google) window.open(googleCalendarUrl(reminder), '_blank', 'noopener,noreferrer');
  else downloadCalendar(reminder);
  renderAction();
  showNotice(google
    ? 'Guarda el evento en Google Calendar y comprueba el aviso.'
    : 'Abre el archivo en tu calendario y comprueba el aviso.');
  (element('confirm-calendar') ?? element('open-calendar')).focus();
});

async function start() {
  const response = await fetch('/api/cases');
  if (!response.ok) throw new Error('No se pudieron cargar los casos');
  const data = await response.json();
  cases = data.cases;
  const params = new URLSearchParams(location.search);
  const reminderId = params.get('recordatorio');
  const resumedPlan = reminderId && cases.find((sample) => Object.values(loadProgress(sample.id).reminders)
    .some(({ id }) => id === reminderId));
  const initial = resumedPlan || cases.find(({ id }) => id === params.get('caso')) || cases[0];
  const resumedAction = resumedPlan && Object.entries(loadProgress(initial.id).reminders)
    .find(([, reminder]) => reminder.id === reminderId)?.[0];

  element('case-picker').innerHTML = cases.map(({ id, title }) => option(id, title, initial.id)).join('');
  displayCase(initial, resumedAction || undefined);
  if (reminderId && !resumedPlan) showNotice('Para recuperar el paso, abre el enlace en el navegador donde guardaste el recordatorio.');
  element('main').hidden = false;
  element('loading').hidden = true;
  if (location.hash === '#siguiente') element('siguiente').scrollIntoView();

  voice = installVoice(() => ({
    case: plan.id, scenario: scenarioId, action: actionId, title: activeAction().title,
  }), data.voiceEnabled);
}

start().catch(() => {
  element('loading').textContent = 'No se pudo abrir Senda. Comprueba que el servidor local esté en marcha y recarga.';
});
