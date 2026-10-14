/** Inside its schedule window? Either bound may be absent (`startsAt` inclusive, `endsAt` exclusive). */
export const inWindow = (row, now = new Date()) =>
  (!row.startsAt || new Date(row.startsAt) <= now) && (!row.endsAt || new Date(row.endsAt) > now);
