/** Time-zone aware day boundaries for the daily speaking allowance. */

function offsetMs(instant: Date, timeZone: string): number {
  // Offset = (wall-clock time in the zone, read as if it were UTC) − (the real UTC instant).
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant of the most recent local midnight in `timeZone`. */
export function startOfLocalDay(now: Date, timeZone: string): Date {
  const local = new Date(now.getTime() + offsetMs(now, timeZone));
  const localMidnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // Re-evaluate the offset at midnight itself (DST-safe for zones that have it).
  const guess = new Date(localMidnightAsUtc - offsetMs(new Date(localMidnightAsUtc), timeZone));
  return new Date(localMidnightAsUtc - offsetMs(guess, timeZone));
}

/** The UTC instant of the next local midnight. */
export function nextLocalMidnight(now: Date, timeZone: string): Date {
  const start = startOfLocalDay(now, timeZone);
  // 26h later is always inside the next local day, whatever the DST shift; take its start.
  return startOfLocalDay(new Date(start.getTime() + 26 * 3600 * 1000), timeZone);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
