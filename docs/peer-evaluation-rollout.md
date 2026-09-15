# 동료 평가 적용 및 검증

## 작업 범위
- 실제 계정으로 참여한 팀원 중 본인을 제외한 사람을 평가합니다.
- 진행 중에는 중간 평가, 팀장이 프로젝트를 종료하면 종료 평가를 작성합니다.
- 시작일과 종료일 차이가 14일 미만이면 중간 평가를 생략합니다. 날짜가 없으면 중간 평가를 허용하는 기존 규칙을 유지합니다.
- 각 항목은 1~10의 정수이며 항목별 합계는 평가 대상 수 × 5입니다.
- 프로젝트·작성자·평가 유형별로 한 번 제출합니다. 제출 후 수정할 수 없습니다.
- 중간 피드백은 작성자와 수신자만 조회합니다. 종료 평가는 프로젝트 참여자에게 공개합니다.
- 종료 평가만 기존 members 평점 및 항목별 평균에 반영합니다. 이 값은 프로젝트별 평판이며 여러 프로젝트를 합산하는 계정 전체 평판은 이번 범위에 포함하지 않습니다.
- 제출 전 초안은 화면 내부에만 유지되고, 제출 후에는 DB에서 다시 조회합니다.
- 본인 제출 여부와 평점은 대시보드에도 실제 데이터로 표시합니다.

## 기존 Supabase 프로젝트
1. 대상 프로젝트: mulcqnbxbhadqdbkqfnh
2. SQL Editor에서 supabase/migration_peer_evaluations.sql 전체를 실행합니다.
3. 아래 읽기 전용 SQL로 테이블, RLS, 함수 적용을 확인합니다.
4. 작업 브랜치에서 앱을 실행해 서로 다른 실제 계정으로 중간 평가, 종료 평가와 공개 범위를 확인합니다.
5. main 병합과 push는 사용자 허락을 받은 뒤에 진행합니다.

새 DB를 설치하는 경우 supabase/schema.sql에 동일한 마이그레이션이 포함되어 있습니다.
이 마이그레이션은 기존 프로젝트를 종료하거나 기존 평가 점수를 일괄 초기화하지 않습니다.

```sql
select relname, relrowsecurity
from pg_class where oid in (
  'public.peer_evaluation_submissions'::regclass,
  'public.peer_evaluations'::regclass
);
select proname from pg_proc where oid in (
  'public.submit_peer_evaluations(text,text,jsonb)'::regprocedure,
  'public.complete_evaluation_project(text)'::regprocedure
);
```

## 로컬 검증
```powershell
npx tsc --noEmit
npm run build
npm install --prefix "$env:TEMP/talju-eval-validation" --no-package-lock @electric-sql/pglite
node tests/peer-evaluations.test.mjs "$env:TEMP/talju-eval-validation"
```

DB 테스트는 임시 PostgreSQL 엔진(PGlite)에서 실행합니다. 운영 데이터는 만들거나 수정하지 않습니다.
테스트용 기본 테이블과 인증 함수를 사용하므로 원격 DB의 전체 기존 스키마와 실제 로그인 세션을 검증하는 테스트는 별도로 필요합니다.


## 이번 작업의 적용 상태
- 2026-09-15: 지정한 Supabase 프로젝트에 마이그레이션 적용 성공.
- 원격 DB에서 두 테이블의 RLS 활성화, 익명 읽기 차단, 직접 INSERT 차단, 인증 사용자 RPC 실행 권한을 확인했습니다.
- 실제 프로젝트 상태나 평가 데이터는 테스트를 위해 변경하지 않았습니다.
- 로컬 DB 통합 검증 32개 통과.
- 브라우저 테스트에서 제출 버튼 조건, 제출 내역 복원, 단기 프로젝트 제한, 종료 확인 및 종료 평가 화면 전환을 확인했습니다.
- 실제 계정 두 개로 앱과 원격 DB를 연결하는 통합 사용 검증 및 서비스 프런트엔드 배포는 별도 단계입니다.

UI 테스트 화면 실행:
```powershell
node tests/preview-evaluation.mjs
```
http://127.0.0.1:5182/tests/fixtures/evaluation.html
이 화면은 테스트 저장소만 사용하며 실제 Supabase에 평가를 제출하지 않습니다.
