import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfileImage } from '../src/lib/profileImages.ts';

const image = (type, bytes, size = bytes.length) => new File([new Uint8Array(bytes), new Uint8Array(Math.max(0, size - bytes.length))], 'image', { type });

test('accepts known static profile image signatures', async () => {
  await assert.doesNotReject(validateProfileImage(image('image/jpeg', [0xff, 0xd8, 0xff, 0xdb])));
  await assert.doesNotReject(validateProfileImage(image('image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
  await assert.doesNotReject(validateProfileImage(image('image/webp', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])));
  await assert.doesNotReject(validateProfileImage(image('image/avif', [0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])));
});

test('accepts GIF; rejects SVG, spoofed content and oversized profile images', async () => {
  await assert.doesNotReject(validateProfileImage(image('image/gif', [0x47, 0x49, 0x46, 0x38])));
  await assert.rejects(validateProfileImage(image('image/gif', [60, 115, 118, 103])), /확인/);
  await assert.rejects(validateProfileImage(image('image/svg+xml', [60, 115, 118, 103])), /GIF/);
  await assert.rejects(validateProfileImage(image('image/png', [60, 115, 118, 103])), /확인/);
  await assert.rejects(validateProfileImage(image('image/jpeg', [0xff, 0xd8, 0xff], 5 * 1024 * 1024 + 1)), /5MB/);
});
