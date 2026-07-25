// IST-safe date helpers.
//
// The whole app targets India (Asia/Kolkata, UTC+5:30). Using
// `new Date().toISOString().slice(0,10)` returns a UTC date, so between
// 00:00 and 05:30 IST it yields *yesterday* — corrupting attendance dates,
// the UNIQUE(staff_user_id, attendance_date) constraint, streaks and payroll.
// These helpers always resolve the calendar date/time in IST.

const IST_TZ = 'Asia/Kolkata';

/** Today's date in IST as YYYY-MM-DD. */
export function istDateStr(d: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD; timeZone pins it to IST.
  return d.toLocaleDateString('en-CA', { timeZone: IST_TZ });
}

/** A date N days before today, in IST, as YYYY-MM-DD. */
export function istDateStrDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return istDateStr(d);
}

/** The IST hour (0–23) of a given instant — for punctuality-style checks. */
export function istHour(d: Date = new Date()): number {
  return Number(d.toLocaleString('en-GB', { timeZone: IST_TZ, hour: '2-digit', hour12: false }).slice(0, 2)) % 24;
}
