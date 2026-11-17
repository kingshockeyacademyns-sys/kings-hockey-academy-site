const ageGroupBands = [
  { maxAge: 6, label: 'U7' },
  { maxAge: 8, label: 'U9' },
  { maxAge: 10, label: 'U11' },
  { maxAge: 12, label: 'U13' },
  { maxAge: 14, label: 'U15' },
  { maxAge: 17, label: 'U18' },
  { maxAge: 20, label: 'U21' }
];

function datePartsInHalifax(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Halifax',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function ageGroupForBirthDate(value, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return '';

  const [, yearText, monthText, dayText] = match;
  const birthYear = Number(yearText);
  const birthMonth = Number(monthText);
  const birthDay = Number(dayText);
  const validBirthDate = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));
  if (
    validBirthDate.getUTCFullYear() !== birthYear ||
    validBirthDate.getUTCMonth() !== birthMonth - 1 ||
    validBirthDate.getUTCDate() !== birthDay
  ) return '';

  const localToday = datePartsInHalifax(now);
  const currentYear = Number(localToday.year);
  const month = Number(localToday.month);
  const day = Number(localToday.day);
  const cutoffYear = month > 7 || (month === 7 && day >= 31) ? currentYear : currentYear - 1;
  const ageAtCutoff = cutoffYear - birthYear - (birthMonth > 7 ? 1 : 0);
  if (ageAtCutoff < 0) return '';
  return ageGroupBands.find(group => ageAtCutoff <= group.maxAge)?.label || 'Over U21';
}

export function ageGroupMessage(value) {
  const group = ageGroupForBirthDate(value);
  return group
    ? `Current age group: <strong>${group}</strong>. Groups update each July 31.`
    : 'Enter a valid date of birth to calculate the age group.';
}
