// node tests/admin-application-lib.test.mjs
import assert from 'node:assert/strict';
import {
  ADMIN_DOC_TYPES, MAX_ADMIN_DOC_SIZE, SHOW_EMAIL_VERIFICATION_BADGE, adminDocTypeLabel, clearAdminApplicationDraft, formatFileSize, hasAdminApplicationDraft,
  hasPdfSignature, reapplyAvailableAt, setAdminApplicationDraft, takeAdminApplicationDraft, validateAdminDocument,
} from '../src/lib/adminApplication.ts';

let count = 0;
function check(name, fn) { fn(); console.log('PASS ' + name); count++; }
async function checkAsync(name, fn) { await fn(); console.log('PASS ' + name); count++; }
const pdf = (name = '교원증.pdf', body = '%PDF-1.4 test', type = 'application/pdf') => new File([body], name, { type });

check('validateAdminDocument accepts a normal PDF and rejects everything else', () => {
  assert.equal(validateAdminDocument(pdf()), null);
  assert.equal(validateAdminDocument(pdf('scan.PDF')), null);
  assert.match(validateAdminDocument(null), /선택/);
  assert.match(validateAdminDocument(pdf('memo.txt', 'x', 'text/plain')), /PDF 파일만/);
  assert.match(validateAdminDocument(pdf('fake.pdf', 'x', 'image/png')), /PDF 파일만/);
  assert.match(validateAdminDocument(pdf('empty.pdf', '')), /빈 파일/);
  assert.match(validateAdminDocument(new File([new Uint8Array(MAX_ADMIN_DOC_SIZE + 1)], 'big.pdf', { type: 'application/pdf' })), /10MB/);
  assert.equal(validateAdminDocument(new File([new Uint8Array(MAX_ADMIN_DOC_SIZE)], 'edge.pdf', { type: 'application/pdf' })), null);
});
await checkAsync('hasPdfSignature catches files that only have a .pdf name', async () => {
  assert.equal(await hasPdfSignature(pdf()), true);
  assert.equal(await hasPdfSignature(pdf('renamed.pdf', 'MZ not a pdf')), false);
  assert.equal(await hasPdfSignature(pdf('short.pdf', '%PD')), false);
});
check('a rejected applicant can apply again 24 hours after the decision', () => {
  const reviewed = '2026-09-22T00:00:00.000Z';
  assert.equal(reapplyAvailableAt('rejected', reviewed).toISOString(), '2026-09-23T00:00:00.000Z');
  assert.equal(reapplyAvailableAt('approved', reviewed), null);
  assert.equal(reapplyAvailableAt('pending', null), null);
  assert.equal(reapplyAvailableAt('rejected', null), null);
});
check('labels and sizes are readable', () => {
  assert.equal(ADMIN_DOC_TYPES.length, 4);
  assert.equal(adminDocTypeLabel('faculty_id'), '교원증 사본');
  assert.equal(adminDocTypeLabel('unknown'), '기타');
  assert.equal(formatFileSize(500), '500 B');
  assert.equal(formatFileSize(2048), '2 KB');
  assert.equal(formatFileSize(1.5 * 1024 * 1024), '1.5 MB');
});
check('the signup draft is handed over exactly once and can be discarded', () => {
  const draft = { org: 'OO대학교', jobTitle: '교수', contact: '010-1234-5678', docType: 'employment', file: pdf(), consent: true };
  assert.equal(hasAdminApplicationDraft(), false);
  assert.equal(takeAdminApplicationDraft(), null);
  setAdminApplicationDraft(draft);
  assert.equal(hasAdminApplicationDraft(), true);
  assert.equal(takeAdminApplicationDraft(), draft);
  assert.equal(hasAdminApplicationDraft(), false);
  assert.equal(takeAdminApplicationDraft(), null);
  setAdminApplicationDraft(draft);
  clearAdminApplicationDraft();
  assert.equal(hasAdminApplicationDraft(), false);
});
check('the email verification badge stays hidden while email confirmation is off', () => {
  assert.equal(SHOW_EMAIL_VERIFICATION_BADGE, false);
});
console.log(`${count} admin-application lib checks passed`);
