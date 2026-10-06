/**
 * A dependency-free SHA-256 implementation.
 *
 * Sigilgen needs a stable hash to turn inputs into a deterministic numeric stream. Node's
 * `node:crypto` would do the job but would tie the library to Node, and a hand-rolled version keeps
 * the guarantee in one auditable place: identical output in Node, in a browser, and in a worker.
 *
 * Standard, unmodified SHA-256 (FIPS 180-4). Verified against the published test vectors in
 * `tests/sha256.test.ts`.
 */

/** Number of bytes in a SHA-256 digest. */
export const DIGEST_LENGTH = 32

/** SHA-256 round constants: the first 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/**
 * Encodes a string as UTF-8 bytes.
 *
 * @param text - The string to encode.
 * @returns The UTF-8 bytes.
 */
function utf8Bytes(text: string): Uint8Array {
  const out: number[] = []
  for (let index = 0; index < text.length; index++) {
    let code = text.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
        index++
      }
    }
    if (code < 0x80) {
      out.push(code)
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      )
    }
  }
  return Uint8Array.from(out)
}

/**
 * Computes the SHA-256 digest of a string.
 *
 * @param text - The message to hash.
 * @returns A 32-byte digest.
 */
export function sha256(text: string): Uint8Array {
  const message = utf8Bytes(text)
  const bitLength = message.length * 8
  const paddedLength = (((message.length + 9) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLength)
  padded.set(message)
  padded[message.length] = 0x80

  // 64-bit length field, big endian. Inputs are far below 2^32 bits, so the high word is derived
  // from the float division rather than BigInt arithmetic.
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const w = new Uint32Array(64)

  for (let block = 0; block < paddedLength; block += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = view.getUint32(block + t * 4, false)
    }
    for (let t = 16; t < 64; t++) {
      const w15 = w[t - 15] as number
      const w2 = w[t - 2] as number
      const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3)
      const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10)
      w[t] = ((w[t - 16] as number) + s0 + (w[t - 7] as number) + s1) >>> 0
    }

    let a = state[0] as number
    let b = state[1] as number
    let c = state[2] as number
    let d = state[3] as number
    let e = state[4] as number
    let f = state[5] as number
    let g = state[6] as number
    let h = state[7] as number

    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + (K[t] as number) + (w[t] as number)) >>> 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    state[0] = ((state[0] as number) + a) >>> 0
    state[1] = ((state[1] as number) + b) >>> 0
    state[2] = ((state[2] as number) + c) >>> 0
    state[3] = ((state[3] as number) + d) >>> 0
    state[4] = ((state[4] as number) + e) >>> 0
    state[5] = ((state[5] as number) + f) >>> 0
    state[6] = ((state[6] as number) + g) >>> 0
    state[7] = ((state[7] as number) + h) >>> 0
  }

  const digest = new Uint8Array(DIGEST_LENGTH)
  const digestView = new DataView(digest.buffer)
  for (let index = 0; index < 8; index++) {
    digestView.setUint32(index * 4, state[index] as number, false)
  }
  return digest
}

/**
 * Renders a digest as lowercase hex.
 *
 * @param digest - The bytes to render.
 * @returns A 64-character hex string.
 */
export function toHex(digest: Uint8Array): string {
  let hex = ''
  for (const byte of digest) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}
