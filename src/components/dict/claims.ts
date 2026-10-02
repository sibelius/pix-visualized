/**
 * Claim (reivindicação) state machine, per DICT API v2.12 (createClaim / acknowledgeClaim /
 * confirmClaim / cancelClaim / completeClaim) and Manual Operacional do DICT v8.5 §5–6.
 * Times are in hours since the claim was created.
 */

export type ClaimType = "PORTABILITY" | "OWNERSHIP";
export type ClaimStatus = "OPEN" | "WAITING_RESOLUTION" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
export type Actor = "DONOR" | "CLAIMER";
export type Op = "acknowledge" | "confirm" | "cancel" | "complete";
export type Reason = "USER_REQUESTED" | "ACCOUNT_CLOSURE" | "DEFAULT_OPERATION" | "FRAUD";

export const DAY = 24;
export const RESOLUTION = 7 * DAY;
export const COMPLETION = 14 * DAY; // ownership: resolution (7d) + completion period (7d)
export const VALIDATION_DEADLINE = 30 * DAY; // ownership: claimer must complete or cancel by day 30

export type Claim = {
  type: ClaimType;
  status: ClaimStatus;
  resolutionEnd: number;
  completionEnd: number;
  confirmReason?: Reason;
  cancelReason?: Reason;
  cancelledBy?: Actor;
};

export const newClaim = (type: ClaimType): Claim => ({
  type,
  status: "OPEN",
  resolutionEnd: RESOLUTION,
  completionEnd: type === "OWNERSHIP" ? COMPLETION : RESOLUTION,
});

export type Result = { ok: true; claim: Claim; note?: string } | { ok: false; error: string; why: string };

const err = (error: string, why: string): Result => ({ ok: false, error, why });

export function apply(c: Claim, now: number, actor: Actor, op: Op, reason?: Reason): Result {
  const terminal = c.status === "CANCELLED" || c.status === "COMPLETED";
  if (terminal) return err("ClaimOperationInvalid", `claim is ${c.status}`);

  if (op === "acknowledge") {
    if (actor !== "DONOR") return err("Forbidden", "only the donor PSP acknowledges");
    if (c.status !== "OPEN") return err("ClaimOperationInvalid", "acknowledge needs status OPEN");
    return { ok: true, claim: { ...c, status: "WAITING_RESOLUTION" } };
  }

  if (op === "confirm") {
    if (actor !== "DONOR") return err("Forbidden", "only the donor PSP confirms");
    if (c.status !== "WAITING_RESOLUTION") return err("ClaimOperationInvalid", "confirm needs WAITING_RESOLUTION");
    if (c.type === "PORTABILITY") {
      if (reason !== "USER_REQUESTED" && reason !== "ACCOUNT_CLOSURE") return err("InvalidReason", "portability confirms with USER_REQUESTED or ACCOUNT_CLOSURE");
      return { ok: true, claim: { ...c, status: "CONFIRMED", confirmReason: reason }, note: "key removed from the donor; lookups now return 404 until the claimer completes" };
    }
    if (reason === "DEFAULT_OPERATION") {
      if (now < c.resolutionEnd) return err("ClaimResolutionPeriodNotEnded", "ownership: donor may confirm by default only after ResolutionPeriodEnd (7 days)");
      return { ok: true, claim: { ...c, status: "CONFIRMED", confirmReason: reason }, note: "donor user stayed silent for 7 days; key leaves the donor" };
    }
    if (reason === "USER_REQUESTED")
      return {
        ok: true,
        claim: { ...c, status: "CONFIRMED", confirmReason: reason, completionEnd: now },
        note: "donor user agreed: CompletionPeriodEnd moved to now, the claimer may complete immediately",
      };
    return err("InvalidReason", "ownership confirms with USER_REQUESTED or DEFAULT_OPERATION");
  }

  if (op === "cancel") {
    if (c.type === "PORTABILITY") {
      const allowed = actor === "DONOR" ? ["USER_REQUESTED", "DEFAULT_OPERATION", "FRAUD"] : ["USER_REQUESTED", "ACCOUNT_CLOSURE", "FRAUD"];
      if (!reason || !allowed.includes(reason)) return err("InvalidReason", `${actor.toLowerCase()} cancels a portability with ${allowed.join(" / ")}`);
      if (c.status === "CONFIRMED" && !(actor === "CLAIMER" && reason === "FRAUD"))
        return err("ClaimOperationInvalid", "a CONFIRMED portability can only be cancelled by the claimer (FRAUD, RECONCILIATION, RFB_VALIDATION)");
      if (reason === "DEFAULT_OPERATION" && now < c.resolutionEnd) return err("ClaimResolutionPeriodNotEnded", "donor may cancel by default only after 7 days");
      return { ok: true, claim: { ...c, status: "CANCELLED", cancelReason: reason, cancelledBy: actor } };
    }
    // OWNERSHIP
    if (actor === "DONOR") {
      if (reason !== "FRAUD") return err("InvalidReason", "in an ownership claim the donor can only cancel with FRAUD (its user proved possession)");
      return { ok: true, claim: { ...c, status: "CANCELLED", cancelReason: reason, cancelledBy: actor }, note: "donor user validated possession of the key" };
    }
    if (reason === "DEFAULT_OPERATION" && now < VALIDATION_DEADLINE) return err("ClaimOperationInvalid", "claimer cancels by default only after day 30 without possession validation");
    if (!reason || !["USER_REQUESTED", "FRAUD", "DEFAULT_OPERATION"].includes(reason)) return err("InvalidReason", "claimer cancels with USER_REQUESTED / FRAUD / DEFAULT_OPERATION");
    return { ok: true, claim: { ...c, status: "CANCELLED", cancelReason: reason, cancelledBy: actor } };
  }

  // complete
  if (actor !== "CLAIMER") return err("Forbidden", "only the claimer completes");
  if (c.status !== "CONFIRMED") return err("ClaimOperationInvalid", "complete needs CONFIRMED");
  if (c.type === "OWNERSHIP" && now < c.completionEnd) return err("ClaimCompletionPeriodNotEnded", "ownership: wait for CompletionPeriodEnd (day 14) unless the donor user agreed");
  return { ok: true, claim: { ...c, status: "COMPLETED" }, note: "new entry created at the claimer (CID ADDED); KeyOwnershipDate resets for ownership" };
}

/** What GET /entries/{key} returns while the claim is in each state */
export function lookupView(c: Claim): { code: number; where: "donor" | "claimer" | "none"; openClaim: boolean } {
  switch (c.status) {
    case "OPEN":
    case "WAITING_RESOLUTION":
      return { code: 200, where: "donor", openClaim: true };
    case "CONFIRMED":
      return { code: 404, where: "none", openClaim: false };
    case "COMPLETED":
      return { code: 200, where: "claimer", openClaim: false };
    case "CANCELLED":
      return { code: 200, where: "donor", openClaim: false };
  }
}

/** The "default path" the SLAs force on well-behaved PSPs (Manual de Tempos do Pix v7 §4.2.1). */
export function autoAction(c: Claim, since: number): { actor: Actor; op: Op; reason?: Reason; at: number } | null {
  if (c.status === "OPEN") return { actor: "DONOR", op: "acknowledge", at: since + 0.05 }; // ack ≤ 180 s (p95)
  if (c.status === "WAITING_RESOLUTION")
    return c.type === "PORTABILITY"
      ? { actor: "DONOR", op: "cancel", reason: "DEFAULT_OPERATION", at: Math.max(since, c.resolutionEnd + 0.5) } // ≤ 60 min after day 7
      : { actor: "DONOR", op: "confirm", reason: "DEFAULT_OPERATION", at: Math.max(since, c.resolutionEnd + 0.5) };
  if (c.status === "CONFIRMED" && c.type === "PORTABILITY") return { actor: "CLAIMER", op: "complete", at: since + 0.05 }; // ≤ 180 s
  if (c.status === "CONFIRMED" && c.type === "OWNERSHIP")
    return { actor: "CLAIMER", op: "cancel", reason: "DEFAULT_OPERATION", at: Math.max(since, VALIDATION_DEADLINE + 0.5) }; // ≤ 60 min after day 30
  return null;
}
