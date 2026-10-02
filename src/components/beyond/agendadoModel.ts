/** Pix Agendado model: Regulamento arts. 9–10 (retention, DICT re-lookup, retries), IN BCB 512 art. 7 (daily limit checked at
 * confirmation and again at settlement; the 20h–24h next-day rule), Manual de Tempos §1.2 (secondary channel, 45 min). */

export type Freq = "once" | "weekly" | "monthly";
export type Schedule = {
  id: number;
  label: string;
  amount: number;
  receiverPF: boolean;
  freq: Freq;
  /** first settlement day index (0 = Thu 1 Oct 2026) */
  first: number;
  count: number;
  /** hour of day (on day 0) at which the payer created the schedule */
  createdHour: number;
};

export type Scenario = {
  dailyLimit: number;
  /** from this day on the payer has lowered the Pix Agendado limit to `loweredTo` (−1 = never) */
  lowerFrom: number;
  loweredTo: number;
  /** day on which the account has no balance (−1 = never) */
  brokeDay: number;
  /** receiver of this schedule id deletes the Pix key before settlement (−1 = none) */
  keyGoneFor: number;
};

export type Occ = {
  sid: number;
  day: number;
  amount: number;
  confirm: { ok: boolean; why: string };
  settle?: { ok: boolean; why: string };
};

export const DAYS = 56;

export function dayLabel(d: number) {
  if (d < 31) return `${d + 1} Oct`;
  return `${d - 30} Nov`;
}
export const weekday = (d: number) => ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"][d % 7];

export function occurrences(s: Schedule): number[] {
  const out: number[] = [];
  for (let k = 0; k < (s.freq === "once" ? 1 : s.count); k++) {
    const d = s.freq === "weekly" ? s.first + 7 * k : s.freq === "monthly" ? (k === 0 ? s.first : s.first + 31) : s.first;
    if (d < DAYS) out.push(d);
  }
  return out;
}

export function simulate(schedules: Schedule[], sc: Scenario): Occ[] {
  const occ: Occ[] = [];
  // confirmation happens at creation (day 0), in creation order: deduct what is already scheduled for the same date
  const booked = new Map<number, number>();
  const bookedNight = new Map<number, number>();
  for (const s of schedules) {
    const nightRule = s.createdHour >= 20 && s.receiverPF;
    for (const d of occurrences(s)) {
      const already = booked.get(d) ?? 0;
      let confirm: Occ["confirm"];
      if (nightRule && d === 1) {
        const n = bookedNight.get(d) ?? 0;
        confirm =
          n + s.amount <= 1000
            ? { ok: true, why: `Created ${s.createdHour}h for tomorrow to a PF: special R$1,000 cap for 20h–24h schedules (used ${n + s.amount}).` }
            : { ok: false, why: `Created between 20h and 24h for next-day settlement to another PF: those schedules share a R$1,000 cap (IN 512 art. 7 §7).` };
        if (confirm.ok) bookedNight.set(d, n + s.amount);
      } else {
        confirm =
          already + s.amount <= sc.dailyLimit
            ? { ok: true, why: `Fits the daily Pix Agendado limit for ${dayLabel(d)}: ${already} already booked + ${s.amount} ≤ ${sc.dailyLimit}.` }
            : { ok: false, why: `Rejected at confirmation: ${already} already booked for ${dayLabel(d)} + ${s.amount} > ${sc.dailyLimit}.` };
      }
      if (confirm.ok) booked.set(d, already + s.amount);
      occ.push({ sid: s.id, day: d, amount: s.amount, confirm });
    }
  }
  // settlement: per day, in order; limit checked again with the limit in force on that day
  const spent = new Map<number, number>();
  for (const o of occ.filter((x) => x.confirm.ok).sort((a, b) => a.day - b.day || a.sid - b.sid)) {
    const lim = sc.lowerFrom >= 0 && o.day >= sc.lowerFrom ? sc.loweredTo : sc.dailyLimit;
    const used = spent.get(o.day) ?? 0;
    if (sc.keyGoneFor === o.sid) {
      o.settle = { ok: false, why: "DICT re-lookup before sending returned no entry (or a different owner): the payer PSP must reject and tell the payer (art. 9 §§5–6)." };
    } else if (used + o.amount > lim) {
      o.settle = { ok: false, why: `Limit is checked again on the settlement date: limit now ${lim}, already used ${used}. Not authorized.` };
    } else if (sc.brokeDay === o.day) {
      o.settle = { ok: false, why: "No balance at initiation: not authorized (art. 9 §1). The PSP must retry per the BCB procedure for Pix Agendado retries (check current document)." };
    } else {
      spent.set(o.day, used + o.amount);
      o.settle = { ok: true, why: "Sent on the secondary channel: pacs.008 InstrPrty NORM, SvcLvl PAGAGD; must settle within 45 minutes of reaching the SPI." };
    }
  }
  return occ;
}
