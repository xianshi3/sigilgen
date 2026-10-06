import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256, toHex } from '../src/sha256'

describe('sha256', () => {
  // Published FIPS 180-4 / RFC 6234 vectors.
  const vectors: [string, string][] = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    [
      'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    ],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ]

  it.each(vectors)('hashes %j to the published digest', (input, expected) => {
    expect(toHex(sha256(input))).toBe(expected)
  })

  it('hashes a one-million-character message correctly', () => {
    // Long enough to force many blocks and to exercise the length field.
    const million = 'a'.repeat(1_000_000)
    expect(toHex(sha256(million))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'
    )
  })

  it('returns 32 bytes', () => {
    expect(sha256('sigilgen')).toHaveLength(32)
  })

  it('handles multi-byte UTF-8 identically to node:crypto', () => {
    const text = 'Sigilgen — 标志 · émoji 🚀'
    // The library ships its own hash so it is not tied to node:crypto; this cross-checks it.
    expect(toHex(sha256(text))).toBe(createHash('sha256').update(text, 'utf8').digest('hex'))
  })

  it('distinguishes inputs that differ only in case', () => {
    expect(toHex(sha256('Acme'))).not.toBe(toHex(sha256('acme')))
  })

  it('is stable across calls', () => {
    expect(toHex(sha256('repeatable'))).toBe(toHex(sha256('repeatable')))
  })

  it('pads messages that sit exactly on a block boundary', () => {
    // 55 and 56 bytes exercise the extra-block padding branch.
    expect(toHex(sha256('a'.repeat(55)))).toHaveLength(64)
    expect(toHex(sha256('a'.repeat(56)))).toHaveLength(64)
    expect(toHex(sha256('a'.repeat(55)))).not.toBe(toHex(sha256('a'.repeat(56))))
  })
})
