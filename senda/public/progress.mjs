const prefix = 'senda:v1:';

export function loadProgress(caseId) {
  const empty = { concerns: {}, modes: {}, saved: {}, completed: {}, reminders: {} };
  try {
    const { agreed, ...stored } = JSON.parse(localStorage.getItem(prefix + caseId)) ?? {};
    if (agreed) {
      stored.saved = { [agreed]: true, ...stored.saved };
      stored.draft ??= agreed;
    }
    return { ...empty, ...stored };
  } catch {
    return empty;
  }
}

export function saveProgress(caseId, progress, changedReminder) {
  try {
    const stored = loadProgress(caseId);
    Object.assign(progress.completed, stored.completed);
    Object.assign(progress.saved, stored.saved);
    const reminders = stored.reminders;
    if (changedReminder) reminders[changedReminder] = progress.reminders[changedReminder];
    localStorage.setItem(prefix + caseId, JSON.stringify({ ...progress, reminders }));
    progress.reminders = reminders;
    return true;
  } catch {
    return false;
  }
}

export function suggestedAction(plan, concerns) {
  const choices = plan.members.map(({ id }) => concerns[id]);
  if (choices.every((choice) => choice && choice === choices[0])) {
    return plan.choices[choices[0]];
  }
  return plan.defaultAction;
}

export function milestonesThisWeek(completed, now = new Date()) {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return Object.values(completed).filter((at) => {
    const completion = new Date(at);
    return completion >= monday && completion <= now;
  }).length;
}
