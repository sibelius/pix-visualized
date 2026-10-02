/** Value limits for a PF payer, as of Oct 2026:
 * - IN BCB 512/2024 as amended by IN 629/2025, IN 669/2025 and IN 746/2026 (per-period limits, night = 20h–6h or 22h–6h,
 *   PF-receiver night default R$1,000, PJ receiver per day, separate Saque/Troco, Agendado and Automático buckets);
 * - IN BCB 491/2024 (as amended by IN 594/2025): a never-used, unregistered access device is capped at R$200 per Pix and R$1,000 per day;
 * - Regulamento art. 37 §3 (Res. BCB 496/2025): R$15,000 per transaction if the payer's PSP is a non-authorized payment institution
 *   or reaches the RSFN through a PSTI (with exceptions). */

export type Product = "pix" | "saque" | "agendado" | "automatico";
export type LimitsInput = {
  hour: number;
  nightStart: 20 | 22;
  receiver: "PF" | "PJ";
  product: Product;
  device: "registered" | "new";
  newDeviceUsedToday: number;
  dayLimitPF: number;
  nightLimitPF: number;
  dailyLimitPJ: number;
  saqueDay: number;
  agendadoDaily: number;
  automaticoDaily: number;
  usedInBucket: number;
  amount: number;
  psti: boolean;
};

export type Step = { rule: string; ok: boolean; detail: string };

export const isNight = (hour: number, nightStart: number) => hour >= nightStart || hour < 6;

export function decide(i: LimitsInput): { allowed: boolean; steps: Step[]; bucket: string; bucketLimit: number } {
  const night = isNight(i.hour, i.nightStart);
  const steps: Step[] = [];
  let bucket = "";
  let bucketLimit = 0;
  switch (i.product) {
    case "pix":
      if (i.receiver === "PF") {
        bucket = night ? `PF receiver · night (${i.nightStart}h–6h)` : `PF receiver · day (6h–${i.nightStart}h)`;
        bucketLimit = night ? i.nightLimitPF : i.dayLimitPF;
      } else {
        bucket = "PJ receiver · per day (no day/night split)";
        bucketLimit = i.dailyLimitPJ;
      }
      break;
    case "saque":
      bucket = night ? "Saque/Troco · night" : "Saque/Troco · day";
      bucketLimit = night ? 1000 : i.saqueDay;
      break;
    case "agendado":
      bucket = "Pix Agendado · per day";
      bucketLimit = i.agendadoDaily;
      break;
    case "automatico":
      bucket = "Pix Automático · per day (checked on settlement day)";
      bucketLimit = i.automaticoDaily;
      break;
  }
  steps.push({ rule: "Amount > 0", ok: i.amount > 0, detail: "" });
  if (i.product !== "automatico") {
    if (i.device === "new") {
      steps.push({
        rule: "Unregistered device: ≤ R$200 per Pix",
        ok: i.amount <= 200,
        detail: "IN BCB 491/2024: a device that has never initiated a Pix and was not registered (name, CPF, phone, e-mail, account confirmed + 2FA).",
      });
      steps.push({
        rule: "Unregistered device: ≤ R$1,000 per day",
        ok: i.newDeviceUsedToday + i.amount <= 1000,
        detail: `Already sent from this device today: R$${i.newDeviceUsedToday}.`,
      });
    } else steps.push({ rule: "Device registered", ok: true, detail: "Registered device: no device-specific cap." });
  } else steps.push({ rule: "No device check", ok: true, detail: "Pix Automático is initiated by the payer PSP on the settlement day, not from the payer's phone." });
  if (i.product === "saque") {
    steps.push({
      rule: `Per-tx cash cap ${night ? "R$1,000 (20h–6h)" : "R$3,000 (6h–20h)"}`,
      ok: i.amount <= (night ? 1000 : 3000),
      detail: "IN 512 art. 5. For Troco, only the cash part counts.",
    });
    if (!night)
      steps.push({ rule: "Day Saque limit within R$1,000–3,000", ok: i.saqueDay >= 1000 && i.saqueDay <= 3000, detail: "IN 512 art. 6 default band (the user may ask to go outside it)." });
  }
  if (i.product === "pix" && i.receiver === "PF" && night && i.nightLimitPF !== 1000)
    steps.push({ rule: "Night PF limit ≠ R$1,000", ok: true, detail: "Only valid if the user explicitly asked (IN 512 art. 3 §7, as amended by IN 669/2025)." });
  steps.push({
    rule: `Bucket: ${bucket}`,
    ok: i.usedInBucket + i.amount <= bucketLimit,
    detail: `used ${i.usedInBucket} + ${i.amount} ≤ ${bucketLimit}? Each bucket is independent of the others; devoluções don't consume limits.`,
  });
  if (i.psti)
    steps.push({ rule: "PSP is a non-authorized IP or uses a PSTI: ≤ R$15,000/tx", ok: i.amount <= 15000, detail: "Regulamento art. 37 §3 (Res. BCB 496/2025), with exceptions in §4." });
  return { allowed: steps.every((s) => s.ok), steps, bucket, bucketLimit };
}

/** Change requests (IN 512 arts. 11–14): decrease immediately; increase 24–48h after the request (8h max for Pix Automático);
 * night-start change and registering a trusted beneficiary also 24–48h. */
export type Change = { label: string; from: number; to: number; color: string };
export function changeTimeline(pspHours: number, autoHours: number): Change[] {
  return [
    { label: "decrease any limit", from: 0, to: 0, color: "#34d399" },
    { label: "increase (Pix, Saque, Agendado)", from: 24, to: Math.max(24, Math.min(48, pspHours)), color: "#fbbf24" },
    { label: "increase Pix Automático", from: 0, to: Math.min(8, autoHours), color: "#818cf8" },
    { label: "night start 20h ↔ 22h", from: 24, to: Math.max(24, Math.min(48, pspHours)), color: "#f472b6" },
    { label: "trusted beneficiary limit", from: 24, to: Math.max(24, Math.min(48, pspHours)), color: "#22d3ee" },
  ];
}
