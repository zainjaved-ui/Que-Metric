/**
 * UTC-consistent registration window.
 *
 * Open rule:
 * - registration is OPEN when now UTC datetime <= end of the deadline day (23:59:59.999 UTC)
 * - If registrationDeadline == current date, registration remains OPEN for the entire day.
 */

function toDate(input) {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function endOfDayUTC(date) {
  const d = toDate(date);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function getRegistrationDeadlineDate(tournament) {
  if (!tournament) return null;
  // Fallback for legacy data where registrationDeadline is missing.
  return toDate(tournament.registrationDeadline || tournament.startDate);
}

function getLateEntryDeadlineDate(tournament) {
  if (!tournament) return null;
  return toDate(
    tournament.lateRegistrationDeadline ||
      tournament.startDate ||
      tournament.registrationDeadline
  );
}

export function isRegistrationOpenUTC(tournament, now = new Date()) {
  const deadlineDate = getRegistrationDeadlineDate(tournament);
  const deadlineEnd = endOfDayUTC(deadlineDate);
  if (!deadlineEnd) return false;
  return now.getTime() <= deadlineEnd.getTime();
}

export function isRegistrationClosedUTC(tournament, now = new Date()) {
  return !isRegistrationOpenUTC(tournament, now);
}

export function getEffectiveLateRegistrationMode(tournament) {
  const allowLateRegistration =
    tournament?.allowLateRegistration === true ||
    tournament?.allowLateRegistration === 'true' ||
    tournament?.allowLateRegistration === 1 ||
    tournament?.allowLateRegistration === '1';

  if (!allowLateRegistration) return 'disabled';

  const mode = String(tournament?.lateRegistrationMode || '').trim();
  const validModes = new Set([
    'disabled',
    'allow_before_fixture',
    'allow_with_regeneration',
    'allow_with_qualifier',
    'allow_with_waitlist',
  ]);

  // Backward compatibility for older tournaments where mode was never set.
  if (!validModes.has(mode) || mode === 'disabled') return 'allow_with_regeneration';
  return mode;
}

export function getAllowedLateEntryStrategies(mode) {
  const map = {
    disabled: [],
    allow_before_fixture: ['regenerate'],
    allow_with_regeneration: ['regenerate', 'qualifier', 'waitlist', 'fill_bye'],
    allow_with_qualifier: ['qualifier', 'waitlist'],
    allow_with_waitlist: ['waitlist'],
  };
  return map[mode] || [];
}

export function isLateEntryWindowOpenUTC(tournament, now = new Date()) {
  const deadlineDate = getLateEntryDeadlineDate(tournament);
  const deadlineEnd = endOfDayUTC(deadlineDate);
  if (!deadlineEnd) return false;
  return now.getTime() <= deadlineEnd.getTime();
}

export function getLateEntryGate(tournament, now = new Date()) {
  const mode = getEffectiveLateRegistrationMode(tournament);
  const allowedStrategies = getAllowedLateEntryStrategies(mode);
  const hasRegenerationBudget =
    (tournament?.fixtureRegenerationCount ?? 0) < (tournament?.maxFixtureRegenerations ?? 3);
  const windowOpen = isLateEntryWindowOpenUTC(tournament, now);
  const tournamentStatus = String(tournament?.status || '');
  const beforeFixtureOnlyBlocked =
    mode === 'allow_before_fixture' &&
    ['fixtures_generated', 'in_progress', 'completed'].includes(tournamentStatus);

  if (mode === 'disabled') {
    return {
      enabled: false,
      reason: 'Late entry is disabled for this tournament.',
      mode,
      allowedStrategies,
      windowOpen,
      hasRegenerationBudget,
    };
  }

  if (!windowOpen) {
    return {
      enabled: false,
      reason: 'Late entry deadline has passed.',
      mode,
      allowedStrategies,
      windowOpen,
      hasRegenerationBudget,
    };
  }

  if (!hasRegenerationBudget) {
    return {
      enabled: false,
      reason: 'Maximum fixture regenerations reached.',
      mode,
      allowedStrategies,
      windowOpen,
      hasRegenerationBudget,
    };
  }

  if (beforeFixtureOnlyBlocked) {
    return {
      enabled: false,
      reason: 'This late-entry mode only allows additions before fixtures are generated.',
      mode,
      allowedStrategies,
      windowOpen,
      hasRegenerationBudget,
    };
  }

  return {
    enabled: true,
    reason: '',
    mode,
    allowedStrategies,
    windowOpen,
    hasRegenerationBudget,
  };
}
