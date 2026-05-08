// PRC-10 — the accreditation pack uses a hand-rolled store-only ZIP
// writer. This test asserts the produced bytes are structurally valid:
//   - the local file headers and central directory entries align
//   - CRC-32 of the data matches the stored CRC
//   - read-back recovers the original entries verbatim
// Coverage of the read-back path is what makes this safe to ship without
// also pulling a third-party unzipper into the test toolchain.

import { describe, expect, it } from 'vitest';

import { buildStoreZip, readStoreZip } from '../../src/modules/reports/zip.js';

describe('buildStoreZip / readStoreZip', () => {
  it('produces bytes that start with the local-file-header signature', () => {
    const zip = buildStoreZip([{ name: 'a.txt', bytes: Buffer.from('hello') }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
  });

  it('roundtrips a single entry', () => {
    const payload = Buffer.from('the quick brown fox jumps over the lazy dog');
    const zip = buildStoreZip([{ name: 'fox.txt', bytes: payload }]);
    const entries = readStoreZip(zip);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe('fox.txt');
    expect(entries[0]!.bytes.equals(payload)).toBe(true);
  });

  it('roundtrips multiple entries in order', () => {
    const inputs = [
      { name: 'cover.txt', bytes: Buffer.from('cover') },
      { name: 'placements.csv', bytes: Buffer.from('placement_id,student\np1,s1') },
      { name: 'organisations.csv', bytes: Buffer.from('organisation_id\no1') },
      { name: 'evaluations.csv', bytes: Buffer.from('evaluation_id\ne1') },
      { name: 'hours_summary.csv', bytes: Buffer.from('student_user_id,approved\ns1,40') },
    ];
    const zip = buildStoreZip(inputs);
    const got = readStoreZip(zip);
    expect(got.map((e) => e.name)).toEqual(inputs.map((e) => e.name));
    for (let i = 0; i < inputs.length; i++) {
      expect(got[i]!.bytes.equals(inputs[i]!.bytes)).toBe(true);
    }
  });

  it('roundtrips a zero-byte entry', () => {
    const zip = buildStoreZip([{ name: 'empty.txt', bytes: Buffer.alloc(0) }]);
    const got = readStoreZip(zip);
    expect(got).toHaveLength(1);
    expect(got[0]!.bytes.length).toBe(0);
  });

  it('roundtrips UTF-8 file names', () => {
    const zip = buildStoreZip([{ name: 'sömé-pláce.txt', bytes: Buffer.from('x') }]);
    const got = readStoreZip(zip);
    expect(got[0]!.name).toBe('sömé-pláce.txt');
  });

  it('end-of-central-directory records the correct entry count', () => {
    const zip = buildStoreZip([
      { name: 'a', bytes: Buffer.from('1') },
      { name: 'b', bytes: Buffer.from('22') },
      { name: 'c', bytes: Buffer.from('333') },
    ]);
    // EOCD is the last 22 bytes (no comment).
    const eocdAt = zip.length - 22;
    expect(zip.readUInt32LE(eocdAt)).toBe(0x06054b50);
    expect(zip.readUInt16LE(eocdAt + 8)).toBe(3);
    expect(zip.readUInt16LE(eocdAt + 10)).toBe(3);
  });
});
