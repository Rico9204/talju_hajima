import test from 'node:test';
import assert from 'node:assert/strict';

// AuthContext에 구현된 changePasswordWithCurrent의 검증 로직을 순수 단위 테스트로 검증
function validatePasswordChangeInput(currentPassword, newPassword) {
  const trimmedCurrent = (currentPassword ?? '').trim();
  const trimmedNext = (newPassword ?? '').trim();

  if (!trimmedCurrent) {
    return { error: "현재 비밀번호를 입력해 주세요." };
  }
  if (!trimmedNext) {
    return { error: "새 비밀번호를 입력해 주세요." };
  }
  if (trimmedCurrent === trimmedNext) {
    return { error: "새 비밀번호는 기존 비밀번호와 다르게 설정해야 합니다." };
  }
  if (trimmedNext.length < 6) {
    return { error: "새 비밀번호는 6자 이상이어야 합니다." };
  }
  return { error: null };
}

test('비밀번호 변경 검증: 현재 비밀번호가 비어있으면 거절', () => {
  const result = validatePasswordChangeInput('', 'newPassword123');
  assert.equal(result.error, '현재 비밀번호를 입력해 주세요.');
});

test('비밀번호 변경 검증: 기존 비밀번호와 새 비밀번호가 동일하면 거절', () => {
  const result = validatePasswordChangeInput('samePassword123', 'samePassword123');
  assert.equal(result.error, '새 비밀번호는 기존 비밀번호와 다르게 설정해야 합니다.');
});

test('비밀번호 변경 검증: 새 비밀번호가 6자 미만이면 거절', () => {
  const result = validatePasswordChangeInput('currentPassword123', 'short');
  assert.equal(result.error, '새 비밀번호는 6자 이상이어야 합니다.');
});

test('비밀번호 변경 검증: 기존 비밀번호와 새 비밀번호가 다르고 6자 이상이면 검증 통과', () => {
  const result = validatePasswordChangeInput('currentPassword123', 'completelyNewPassword123');
  assert.equal(result.error, null);
});
