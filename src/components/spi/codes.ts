/**
 * pacs.002 TxSts and StsRsnInf/Rsn/Cd domains of the SPI (pacs.002.spi.1.17, Catálogo v5.13).
 * Meanings are paraphrased from the "Comentários" column; "raisedBy" is the catalog's
 * "Participante que gera o Erro".
 */

export type Raiser = "SPI" | "receiver PSP" | "SPI or receiver PSP";
export type Topic = "timeout" | "account" | "amount" | "identity" | "format" | "routing" | "returns" | "business" | "automatico" | "saque";

export type ReasonCode = { code: string; iso: string; meaning: string; raisedBy: Raiser; topic: Topic; newIn?: string };

export const TX_STATUS = [
  { code: "ACSP", iso: "AcceptedSettlementInProcess", who: "receiver PSP → SPI", meaning: "The receiver PSP checked the account and accepts the credit. Not final: the SPI still has to settle." },
  { code: "ACSC", iso: "AcceptedSettlementCompletedDebitorAccount", who: "SPI → payer PSP", meaning: "Settled. Sent to the payer's side (the debited Conta PI). Now the payer PSP debits the customer for good." },
  { code: "ACCC", iso: "AcceptedSettlementCompleted", who: "SPI → receiver PSP", meaning: "Settled on the creditor's account. The receiver PSP turns its provisional credit into a real one." },
  { code: "RJCT", iso: "Rejected", who: "SPI or receiver PSP", meaning: "Payment (or return) rejected, with a reason in StsRsnInf/Rsn/Cd. Terminal for that EndToEndId / RtrId." },
] as const;

export const REASONS: ReasonCode[] = [
  { code: "AB03", iso: "AbortedSettlementTimeout", meaning: "Settlement aborted because the SPI's time limit ran out (typically the receiver PSP did not answer in time).", raisedBy: "SPI", topic: "timeout" },
  { code: "AB09", iso: "ErrorCreditorAgent", meaning: "Transaction stopped by an error at the receiver PSP.", raisedBy: "receiver PSP", topic: "timeout" },
  { code: "AB11", iso: "TimeoutDebtorAgent", meaning: "Timeout at the payer PSP: the reported validation time (order received from the user → sent to SPI) exceeded the limit.", raisedBy: "SPI", topic: "timeout" },
  { code: "AC03", iso: "InvalidCreditorAccountNumber", meaning: "Receiver's branch and/or account does not exist or is invalid.", raisedBy: "receiver PSP", topic: "account" },
  { code: "AC06", iso: "BlockedAccount", meaning: "Receiver's account is blocked.", raisedBy: "receiver PSP", topic: "account" },
  { code: "AC07", iso: "ClosedCreditorAccountNumber", meaning: "Receiver's account is closed.", raisedBy: "receiver PSP", topic: "account" },
  { code: "AC14", iso: "InvalidCreditorAccountType", meaning: "Wrong account type for the receiver's account.", raisedBy: "receiver PSP", topic: "account" },
  { code: "AG03", iso: "TransactionNotSupported", meaning: "Transaction type not allowed on the receiver's account (e.g. a transfer into a salary account).", raisedBy: "receiver PSP", topic: "account" },
  { code: "AG12", iso: "NotAllowedBookTransfer", meaning: "Both accounts are in the same institution (or share the same settling participant): that is a book transfer and must be settled off the SPI.", raisedBy: "SPI", topic: "routing" },
  { code: "AG13", iso: "ForbiddenReturnPayment", meaning: "Returning a return is not allowed.", raisedBy: "SPI", topic: "returns" },
  { code: "AGNT", iso: "IncorrectAgent", meaning: "The direct participant sending the order is not the settler of the payer's PSP.", raisedBy: "SPI", topic: "routing" },
  { code: "AM01", iso: "ZeroAmount", meaning: "Order with amount zero.", raisedBy: "SPI", topic: "amount" },
  { code: "AM02", iso: "NotAllowedAmount", meaning: "The credit would exceed the limit allowed for the receiver's account type.", raisedBy: "receiver PSP", topic: "amount" },
  { code: "AM04", iso: "InsufficientFunds", meaning: "Not enough balance in the payer PSP's Conta PI to reserve the amount.", raisedBy: "SPI", topic: "amount" },
  { code: "AM09", iso: "WrongAmount", meaning: "A return whose amount would push total returns above the original payment.", raisedBy: "receiver PSP", topic: "returns" },
  { code: "AM12", iso: "InvalidAmount", meaning: "Purchase + cash blocks (Saque/Troco) do not add up to the amount.", raisedBy: "SPI", topic: "saque" },
  { code: "AM18", iso: "InvalidNumberOfTransactions", meaning: "NbOfTxs inconsistent with the transactions in the message.", raisedBy: "SPI", topic: "format" },
  { code: "AM23", iso: "AmountExceedsSettlementLimit", meaning: "Split-payment tax amounts add up to more than the transaction amount.", raisedBy: "SPI", topic: "amount" },
  { code: "BE01", iso: "InconsistentWithEndCustomer", meaning: "Receiver CPF/CNPJ does not match the holder of the account.", raisedBy: "receiver PSP", topic: "identity" },
  { code: "BE05", iso: "UnrecognisedInitiatingParty", meaning: "The payment initiator's CNPJ is not registered in the Pix arrangement.", raisedBy: "SPI", topic: "identity" },
  { code: "BE15", iso: "InvalidIdentificationCode", meaning: "idConciliacaoRecebedor (TxId) missing when it should be there, or wrong.", raisedBy: "receiver PSP", topic: "identity" },
  { code: "BE17", iso: "InvalidCreditorIdentificationCode", meaning: "QR code rejected by the receiver PSP.", raisedBy: "receiver PSP", topic: "identity" },
  { code: "CH11", iso: "CreditorIdentifierIncorrect", meaning: "Receiver CPF/CNPJ incorrect.", raisedBy: "receiver PSP", topic: "identity" },
  { code: "CH16", iso: "ElementContentFormallyIncorrect", meaning: "Content incorrect or incompatible with business rules (schema-valid, rule-invalid).", raisedBy: "SPI", topic: "format" },
  { code: "CN01", iso: "AuthorisationCancelled", meaning: "Pix Automático: the recurring schedule was cancelled (cancellation status ACCR).", raisedBy: "receiver PSP", topic: "automatico" },
  { code: "DS02", iso: "OrderCancelled", meaning: "Rejected by settings the institution itself configured in SPI-Web: manual or automatic send block, or Conta PI minimum operating balance reached.", raisedBy: "SPI", topic: "business", newIn: "1.17" },
  { code: "DS04", iso: "OrderRejected", meaning: "Order rejected by the receiver PSP (generic). Also the code BCB mandated, with AddtlInf \"MP 1.394/2026\", for credits to betting operators' accounts.", raisedBy: "receiver PSP", topic: "business" },
  { code: "DS0G", iso: "NotAllowedPayment", meaning: "The signer is neither the holder of the debited Conta PI nor the payer PSP's settler.", raisedBy: "SPI", topic: "routing" },
  { code: "DS27", iso: "UserNotYetActivated", meaning: "Participant not registered or not yet operating in the SPI.", raisedBy: "SPI", topic: "routing" },
  { code: "DT02", iso: "InvalidCreationDate", meaning: "Invalid message creation date/time.", raisedBy: "SPI", topic: "format" },
  { code: "DT05", iso: "InvalidCutOffDate", meaning: "A return outside the maximum return period of the Pix rules.", raisedBy: "SPI", topic: "returns" },
  { code: "DU03", iso: "DuplicateTransaction", meaning: "The charge was already paid through another instrument (e.g. a boleto).", raisedBy: "receiver PSP", topic: "business", newIn: "1.17" },
  { code: "DUPL", iso: "DuplicatePayment", meaning: "Duplicate payment: same idConciliacaoRecebedor for the same receiver.", raisedBy: "receiver PSP", topic: "business" },
  { code: "ED05", iso: "SettlementFailed", meaning: "Generic processing error.", raisedBy: "SPI or receiver PSP", topic: "business" },
  { code: "FF07", iso: "InvalidPurpose", meaning: "Purpose (Purp) inconsistent with the Structured block.", raisedBy: "SPI", topic: "saque" },
  { code: "FF08", iso: "InvalidEndToEndId", meaning: "Badly formatted operation identifier.", raisedBy: "SPI", topic: "format" },
  { code: "FRAD", iso: "FraudulentOrigin", meaning: "Rejected for well-founded suspicion of fraud.", raisedBy: "receiver PSP", topic: "business" },
  { code: "INDT", iso: "InvalidDetails", meaning: "Content incompatible with the QR code charge or pain.013 instruction it came from.", raisedBy: "receiver PSP", topic: "identity" },
  { code: "MD01", iso: "NoMandate", meaning: "ISPB of the Pix Saque/Troco facilitator does not exist.", raisedBy: "SPI", topic: "saque" },
  { code: "RC09", iso: "InvalidDebtorClearingSystemMemberIdentifier", meaning: "Payer PSP's ISPB invalid or nonexistent.", raisedBy: "SPI", topic: "routing" },
  { code: "RC10", iso: "InvalidCreditorClearingSystemMemberIdentifier", meaning: "Receiver PSP's ISPB invalid or nonexistent.", raisedBy: "SPI", topic: "routing" },
  { code: "RR04", iso: "RegulatoryReason", meaning: "Payer is sanctioned by a UN Security Council resolution (a sanctioned receiver is not grounds to reject).", raisedBy: "receiver PSP", topic: "identity" },
  { code: "RR06", iso: "TaxInformationInvalid", meaning: "Split-payment tax block present where not allowed (both parties must be companies; only QRES, APES, MANU, DICT).", raisedBy: "SPI", topic: "format" },
  { code: "SL02", iso: "SpecificServiceOfferedByCreditorAgent", meaning: "A return coded SL02 that refers to a transaction that was not Pix Saque or Pix Troco.", raisedBy: "receiver PSP", topic: "returns" },
  { code: "UPAY", iso: "UnduePayment", meaning: "Pix Automático: no valid, active recurrence behind this payment.", raisedBy: "receiver PSP", topic: "automatico" },
];
