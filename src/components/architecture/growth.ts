/** Pix growth figures with sources. "approx" marks numbers not seen in a BCB release (press or derived). */

export type Point = { label: string; x: number; v: number; src: string; approx?: boolean; note?: string };

/** daily records, millions of transactions; x = fractional year */
export const RECORDS: Point[] = [
  { label: "5 Jul 2024", x: 2024.51, v: 224.2, src: "Exame, citing BCB" },
  { label: "6 Sep 2024", x: 2024.68, v: 227.4, src: "Exame, citing BCB" },
  { label: "29 Nov 2024", x: 2024.91, v: 239.9, src: "CNN Brasil, citing BCB", note: "Black Friday" },
  { label: "6 Dec 2024", x: 2024.93, v: 250.5, src: "CNN Brasil, citing BCB" },
  { label: "20 Dec 2024", x: 2024.97, v: 252.1, src: "press, citing BCB", approx: true },
  { label: "Jun 2025", x: 2025.43, v: 276.7, src: "IstoÉ Dinheiro", approx: true },
  { label: "5 Sep 2025", x: 2025.68, v: 290, src: "press", approx: true },
  { label: "28 Nov 2025", x: 2025.91, v: 297.4, src: "JB, citing BCB", note: "Black Friday + 13th salary" },
  { label: "5 Dec 2025", x: 2025.93, v: 313.34, src: "bcb.gov.br (Pix page): 313,339,828", note: "first day over 300 M" },
  { label: "4 Sep 2026", x: 2026.68, v: 318.07, src: "press citing BCB (Metrópoles, Giro News)", approx: true, note: "pay-day: 5th business day" },
];

/** monthly transactions, billions (BCB open data EstatisticasTransacoesPix; excludes most intra-PSP Pix) */
const M24 = [3.85, 3.85, 4.32, 4.35, 4.62, 4.66, 4.79, 5.01, 4.9, 5.1, 5.17, 5.71];
const M25 = [5.06, 4.99, 5.56, 5.6, 5.93, 5.8, 6.0, 6.24, 6.13, 6.45, 6.46, 7.1];
const M26 = [6.36, 5.99, 6.74, 6.68, 7.12, 6.98, 7.24, 7.37, 7.17];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHLY: Point[] = [
  ...M24.map((v, i) => ({ label: `${MON[i]} 2024`, x: 2024 + i / 12, v, src: "BCB open data" })),
  ...M25.map((v, i) => ({ label: `${MON[i]} 2025`, x: 2025 + i / 12, v, src: "BCB open data" })),
  ...M26.map((v, i) => ({ label: `${MON[i]} 2026`, x: 2026 + i / 12, v, src: "BCB open data", approx: i === 8, note: i === 8 ? "possibly preliminary" : undefined })),
];

/** annual transactions, billions */
export const ANNUAL: Point[] = [
  { label: "2021", x: 2021, v: 9.4, src: "approximate (BCB statistics)", approx: true },
  { label: "2022", x: 2022, v: 24, src: "approximate (derived from Febraban's +74% for 2023)", approx: true },
  { label: "2023", x: 2023, v: 41.8, src: "Febraban" },
  { label: "2024", x: 2024, v: 63.5, src: "BCB (Relatório de Gestão: 63.4 bn)" },
  { label: "2025", x: 2025, v: 79.8, src: "BCB, R$ 35.36 tn" },
];
