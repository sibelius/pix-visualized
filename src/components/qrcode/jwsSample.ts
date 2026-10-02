// The sample JWS published in the API Pix OpenAPI spec (v2.10.0), GET /{pixUrlAccessToken} response.
// Its header uses RS256 with jku/kid/x5t; the signature is illustrative and cannot be verified.
export const BCB_SAMPLE_JWS =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXUyIsImtpZCI6IjIwMTEtMDQtMjkiLCJqa3UiOiJodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNzUxNyIsIng1dCI6IkFwcGVuZGl4QUV4YW1wbGVBMUpXS1NSc2FLZXkifQ.eyJjYWxlbmRhcmlvIjp7ImNyaWFjYW8iOiIyMDIwLTA5LTE1VDE5OjM5OjU0LjAxM1oiLCJhcHJlc2VudGFjYW8iOiIyMDIwLTA0LTAxVDE4OjAwOjAwWiIsImV4cGlyYWNhbyI6IjM2MDAifSwidHhpZCI6ImZjOWE0MzY2ZmYzZDQ5NjRiNWRiYzZjOTFhODcyMmQzIiwicmV2aXNhbyI6IjMiLCJzdGF0dXMiOiJBVElWQSIsInZhbG9yIjp7Im9yaWdpbmFsIjoiNTAwLjAwIn0sImNoYXZlIjoiNzQwN2M5YzgtZjc4Yi0xMWVhLWFkYzEtMDI0MmFjMTIwMDAyIiwic29saWNpdGFjYW9QYWdhZG9yIjoiSW5mb3JtYXIgY2FydGFvIGZpZGVsaWRhZGUiLCJpbmZvQWRpY2lvbmFpcyI6W3sibm9tZSI6InF1YW50aWRhZGUiLCJ2YWxvciI6IjIifV19.qI7NUrYkwcgXmyoyOjt2YLQyhxH-lPdr3xQ7RId9TDXZ-MlWmPJkUScjuo1Nz_EvlSotbWDGOxErBXHeTLHOQM-9T7lBmG5iw6uEX7L5U72XiganIm80EZCFD1vBPq9j89i4cP2U2Yv21TTt8JLhjA57KHLOSlj-KB5UAKCH-MX3AORFcrXFrYL2rrSQDe-lFNtdyPRwLQHIrhkQ6RR2FPhynzUG0401LScS9mWLLYbYzhzwtP5lk07Ryf4MZq86ihmOLFZXkIiW7pbSd8QfD5Dvj28XebLQi_bam9wInqKB--57_N741BskCN_TXf0EHbQ1qjNTgiT8Y1GIrA4pFA";

export function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - (b.length % 4));
  const bin = atob(b + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const b64urlDecodeText = (s: string) => new TextDecoder().decode(b64urlToBytes(s));
export const b64urlEncodeText = (s: string) => bytesToB64url(new TextEncoder().encode(s));
