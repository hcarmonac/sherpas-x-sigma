const title = 'Retomar un hito en Senda';

function utc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function localDateTime(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function calendarId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function googleCalendarUrl({ at, url }) {
  const end = new Date(at.getTime() + 10 * 60_000);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const event = new URL('https://calendar.google.com/calendar/r/eventedit');
  event.search = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${utc(at)}/${utc(end)}`,
    stz: zone,
    etz: zone,
    details: `Abre Senda para retomar tu hito.\n${url}`,
  });
  return event.href;
}

export function calendarFile({ id, at, url, now = new Date() }) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Senda//Recordatorios//ES',
    'BEGIN:VEVENT',
    `UID:${id}@senda`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${utc(at)}`,
    'DURATION:PT10M',
    `SUMMARY:${title}`,
    `URL:${url}`,
    `DESCRIPTION:Abre Senda para retomar tu hito.\\n${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:PT0S',
    `DESCRIPTION:${title}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].map((line) => {
    const first = line.slice(0, 75);
    const rest = line.slice(75).match(/.{1,74}/g) ?? [];
    return [first, ...rest.map((part) => ` ${part}`)].join('\r\n');
  }).join('\r\n');
}

export function downloadCalendar(event) {
  const blob = new Blob([calendarFile(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'recordatorio-senda.ics';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
