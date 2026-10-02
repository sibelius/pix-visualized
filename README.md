# Pix, visualized

Interactive, low-level explorations of **Pix**, the Banco Central do Brasil's instant payment system. Every chapter is a page of live models you can push on: BR Code strings with real CRC16, DICT token buckets, signed ISO 20022 messages, ICOM streams, Conta PI balances, Pix Automático calendars.

| # | Page | What you can play with |
|---|------|------------------------|
| 00 | `/` | The life of one Pix: every hop from QR scan to credit, step by step |
| 01 | `/architecture` | Participants, SPI/DICT/Conta PI, RTGS vs netting liquidity |
| 02 | `/qrcode` | BR Code builder & TLV parser, CRC16-CCITT, a hand-written QR encoder, static vs dynamic, JWS payloads |
| 03 | `/dict` | Key validators, lookups, rate-limit token buckets, portability & ownership claims, CID/VSync |
| 04 | `/iso20022` | AppHdr + Document explorer, MsgId / EndToEndId builder, the SPI message catalog |
| 05 | `/pacs008` | pacs.008 builder, the payment sequence with timeouts, pacs.002 status & reason codes |
| 06 | `/pacs004` | Returns: partial devoluções, reason codes, deadlines |
| 07 | `/conta-pi` | Conta PI liquidity over a day, STR transfers, camt.052/053/054 and reconciliation |
| 08 | `/icom` | ICOM HTTP interface: long-poll streams, multipart batches, gzip, status codes |
| 09 | `/xmldsig` | Exclusive C14N, SHA-256 digests, RSA signing and verification in the browser |
| 10 | `/certificates` | RSFN topology, ICP-Brasil chains, mTLS handshake, certificate rotation |
| 11 | `/api-pix` | API Pix console: cob, cobv, loc, pix, devolução, webhooks, OAuth2 + mTLS |
| 12 | `/automatico` | Pix Automático journeys, authorization lifecycle, billing calendar with retries |
| 13 | `/med` | MED timeline, fund tracing across mule accounts, infraction reports |
| 14 | `/beyond` | Saque/Troco, Pix por aproximação, limits explorer, time SLAs |
| 15 | `/glossary` | Every concept, searchable, linked to its visualization |

## Run

```sh
pnpm install
pnpm dev
```

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS 4 · TypeScript. Hand-written SVG, no chart libraries. Seeded PRNG for deterministic simulations. Fully static.

## Disclaimer

An independent study aid, not affiliated with or endorsed by the Banco Central do Brasil. Pix is a trademark of the BCB. Content is paraphrased from the BCB's public regulation, manuals and specs ([bacen/pix-api](https://github.com/bacen/pix-api), [bacen/pix-dict-api](https://github.com/bacen/pix-dict-api), [bcb.gov.br/estabilidadefinanceira/pix](https://www.bcb.gov.br/estabilidadefinanceira/pix)), which change often. Check the current versions before building on any detail. All ISPBs, names, keys and documents in examples are fictional.
