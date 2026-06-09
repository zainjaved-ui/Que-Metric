/**
 * Registration open/closed calculation with UTC-consistent semantics.
 *
 * NEW FLOW RULE:
 * - registration is OPEN when current UTC datetime <= end of the deadline day (23:59:59.999 UTC)
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
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(Date.UTC(y, m, day, 23, 59, 59, 999));
}

function getRegistrationDeadlineDate(tournament) {
  if (!tournament) return null;
  // Late registration deadline has highest priority when present.
  // Fallback for legacy data where registrationDeadline is missing.
  return toDate(
    tournament.lateRegistrationDeadline ||
      tournament.registrationDeadline ||
      tournament.startDate
  );
}

function isRegistrationOpenUTC(tournament, now = new Date()) {
  const deadlineDate = getRegistrationDeadlineDate(tournament);
  const deadlineEnd = endOfDayUTC(deadlineDate);
  if (!deadlineEnd) return false;
  return now.getTime() <= deadlineEnd.getTime();
}

function getRegistrationOpenStateUTC(tournament, now = new Date()) {
  const deadlineDate = getRegistrationDeadlineDate(tournament);
  const deadlineEnd = endOfDayUTC(deadlineDate);
  const open = deadlineEnd ? now.getTime() <= deadlineEnd.getTime() : false;
  return {
    open,
    deadlineDate,
    deadlineEnd,
  };
}

module.exports = {
  isRegistrationOpenUTC,
  getRegistrationOpenStateUTC,
};

