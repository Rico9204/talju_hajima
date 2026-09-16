# coffe 브랜치 작업 정리 (병합 대비 메모)

> 작성일: 2026-09-17 (충돌 시뮬레이션 결과로 갱신)
> 브랜치: `coffe` (아직 커밋 안 됨 — 전부 working tree 변경사항)
> 목적: 다른 브랜치에서 다른 사람이 작업 중인 내용과 나중에 합칠 때, 이 브랜치에서
> 뭘 왜 바꿨는지 빨리 파악할 수 있도록 정리.

## 한 줄 요약

`gwanhan.md`(권한 총정리 문서)에 정리된 관리자/승인 거버넌스 기능을, 이미 그 기능이
구현되어 있던 `Hwang_G` 브랜치(`talju_hajima2` 저장소)에서 이 `coffe` 브랜치로
이식했다. 이식 과정에서 라이브 DB에 있던 기존 버그 두 개도 같이 고쳤고, gwanhan.md
매트릭스에 있었지만 UI로는 닿을 방법이 없었던 "관리자가 모든 프로젝트의 팀원을
관리" 기능을 새로 만들었다.

## 코드 변경 — 파일별 요약

| 파일 | 무엇이 바뀌었나 |
|---|---|
| `src/api/types.ts` | `ProjectApprovalStatus`, `Project.approvalStatus/completedAt/requestedAdminId`, `AdminProfileSummary`, `Member.org` 추가 |
| `src/api/dataRepository.ts` | `approveProject`/`rejectProject`/`markProjectDone`/`kickMember`/`searchAdmins`/`updateScheduleEvent` 인터페이스 추가, `updateMyProfile`에 `org` 필드 추가 |
| `src/api/supabase/supabaseDataRepository.ts` | 위 메서드들의 실제 구현 추가 |
| `src/context/AuthContext.tsx` | `isAdmin`, 가입 시 관리자/일반 선택(`signUp` opts) |
| `src/context/ProjectContext.tsx` | `markProjectDone`/`kickMember`/`updateScheduleEvent`를 컨텍스트로 노출, `updateMyProfile` patch 타입에 `org` 추가 |
| `src/App.tsx` | `/admin` 라우트, 승인 안 된 프로젝트는 대시보드 외 접근 차단 |
| `src/components/Login.tsx` | 회원가입 시 계정 유형(관리자/일반) 선택 UI |
| `src/components/CreateProjectModal.tsx` | 날짜 필수 입력, "승인 요청 관리자" 검색 UI (`searchAdmins`) |
| `src/components/Dashboard.tsx` | 승인 대기/반려 상태 안내 배너 |
| `src/components/TeamView.tsx` | 강퇴(`kickMember`) UI, "프로젝트 종료"(`markProjectDone`) 버튼 |
| `src/components/Sidebar.tsx` | 관리자 전용 "소속(org)" 필드를 coffe의 기존 프로필 편집 UI(school/major/student와 같은 방식)에 추가 — **주의**: Hwang_G 쪽엔 완전히 다른 프로필 카드 UI(클릭식 개별 필드 편집)가 있었는데, 그건 가져오지 않고 coffe 자체 UI 구조를 그대로 유지했음 |
| `src/components/Schedule.tsx` | 일정 수정 기능 추가 (기존엔 추가만 가능하고 수정 UI가 없었음). 일정 항목 클릭 → 수정 모드, 삭제 버튼도 새로 연결 (`removeScheduleEvent`는 원래 있었는데 UI에 안 붙어 있었음) |
| `supabase/schema.sql` | 위 기능들에 대응하는 테이블 컬럼·트리거·RLS 정책 전부 반영 (아래 마이그레이션 파일들과 내용 동일) |

### 새 파일
- `src/components/AdminPanel.tsx` — 관리자 화면: 승인 대기 목록(승인/반려), 전체 프로젝트 목록(삭제), **프로젝트 클릭 시 팀원 관리 모달 오픈**
- `src/components/AdminProjectMembers.tsx` — **새 기능**. 관리자가 자기가 속하지 않은 프로젝트라도 클릭 한 번으로 그 팀원 목록을 보고 강퇴할 수 있게 하는 모달. gwanhan.md 매트릭스의 "팀원 초대/제외: 관리자는 모든 프로젝트" 행을 실제로 구현한 것 — 이게 없으면 관리자는 자기가 멤버인 프로젝트에서만 강퇴 가능했음 (TeamView는 로그인 계정 본인 프로젝트만 보여주는 구조라서).

## DB 마이그레이션 (라이브 DB에 이미 적용 완료)

`supabase/` 아래 마이그레이션 파일들, 이 순서로 적용됨:

1. `migration_admin.sql`
2. `migration_admin_signup.sql`
3. `migration_project_approval.sql`
4. `migration_require_dates.sql`
5. `migration_evaluation_history.sql`
6. **`migration_admin_member_management.sql`** ← 이번 세션에 새로 추가한 것. 아래 5가지를 담고 있음:
   - `members` 테이블에 `authenticated` 역할 기본 GRANT가 통째로 빠져 있던 버그 수정 (재발 원인 불명 — 세션 중 두 번 빠짐)
   - `members_select`/`profiles_select_own`에 `is_admin()` 예외 추가 (AdminProjectMembers가 동작하려면 필수)
   - `members_update` 정책 추가 (이전엔 없었음)
   - `projects_update`를 `requested_admin_id` 인지형으로 좁힘 (지정 안 된 관리자가 남의 승인 요청을 마음대로 처리 못 하게)
   - `peer_evaluations → members` 외래키를 `ON DELETE CASCADE`로 변경 (강퇴 시 FK 위반 버그 수정)

**다른 브랜치를 합칠 때**: 그쪽 브랜치가 이 라이브 Supabase 프로젝트(`mulcqnbxbhadqdbkqfnh`)를 같이 쓴다면 이 마이그레이션들은 이미 적용되어 있으니 다시 실행할 필요 없음. 다른 DB를 쓴다면 위 6개 파일을 순서대로 실행해야 함.

## main 브랜치와의 충돌 시뮬레이션 (2026-09-17, `git merge-tree`로 실측)

`origin/main`이 `048498c`까지 갱신되어 있고, 거기엔 **황성환 님이 진행 중인 진짜 동료평가 기능**(제출·집계 RPC, `peer_evaluation_submissions`/`peer_evaluations` 테이블, 대시보드 실데이터 연동 등 33개 파일)이 이미 올라가 있음. 작업 트리를 건드리지 않는 `git merge-tree`로 "지금 이 상태 그대로 main과 합치면 어떻게 되는지"를 시뮬레이션한 결과:

**실제 텍스트 충돌 — 2개 파일뿐**

- **`src/components/Dashboard.tsx`** — 진짜 충돌. `const isDone = ...` 바로 다음 줄에 이 브랜치는 승인대기/반려 배너 분기를 넣었고, main은 그 자리에 실제 과제/일정/평가 데이터를 계산하는 큰 블록(`useState`/`useEffect` 여러 개, `taskSummary`, `evaluation` 상태 등)을 넣어서 완전히 같은 위치가 겹침. **수동 병합 필요**: main의 실데이터 계산 로직은 그대로 두고, 그 결과로 나온 `data.banner`를 승인대기/반려일 때만 덮어쓰도록 끼워 넣으면 됨 (로직 자체가 충돌하는 게 아니라 같은 줄 근처에 각자 추가해서 생긴 위치 충돌).
- **`supabase/schema.sql`** — 겉보기엔 충돌이지만 **내용은 전혀 안 겹침**. 이 브랜치는 `evaluation_history`/`archive_and_cleanup_project`/`search_admin_profiles`를 추가했고 main은 `peer_evaluation_submissions`/`peer_evaluations`/`submit_peer_evaluations` 등을 같은 위치(스토리지 정책 블록 바로 뒤)에 추가해서 생긴 "같은 자리에 각자 새 걸 붙인" 충돌. 함수/테이블/정책 이름이 하나도 안 겹치니 **두 블록을 순서 상관없이 이어 붙이면 끝**.

**나머지는 전부 자동 병합 성공** (양쪽이 같은 파일을 건드렸는데도 충돌 없음, 내용 유실도 없음을 직접 확인):
`src/api/dataRepository.ts`, `src/api/supabase/supabaseDataRepository.ts`, `src/api/types.ts`, `src/components/Sidebar.tsx`, `src/components/TeamView.tsx`, `src/context/ProjectContext.tsx` — 예를 들어 Sidebar.tsx는 main이 "내 협업 평판" 정적 블록을 `<MyEvaluationSummary chart />`(실데이터 컴포넌트)로 통째로 갈아끼웠는데, 이 브랜치가 추가한 관리자용 "소속" 필드는 그 근처를 안 건드려서 둘 다 무사히 살아남음.

**중요 — DB 마이그레이션 순서**: main의 `migration_peer_evaluations.sql`이 정의하는 `peer_evaluations.recipient_id`/`evaluator_id` FK엔 원래 `ON DELETE CASCADE`가 없음 — 바로 이게 강퇴 시 FK 위반(409)을 냈던 원인. 이 브랜치의 `migration_admin_member_management.sql`이 그걸 cascade로 고쳤는데, **반드시 main의 `migration_peer_evaluations.sql`을 먼저 적용한 뒤에** 실행해야 함 (테이블이 있어야 ALTER할 게 있으므로). 지금 라이브 DB는 이미 두 마이그레이션 다 적용된 순서라 문제없음 — 나중에 새 DB에 처음부터 세팅할 때만 순서 주의.

## 알아두면 좋은 것 (이번에 발견한 이슈)

- ~~`peer_evaluations` 테이블은 죽은 코드~~ **정정**: 세션 초반엔 이 테이블이 코드 어디서도 안 쓰이는 걸 보고 죽은 코드로 판단했는데, 틀렸음. `origin/main`에 황성환 님이 이 테이블을 실제로 쓰는 동료평가 기능을 활발히 개발 중이었고(2026-09-16 커밋들), 그게 `coffe`엔 아직 안 들어와 있었을 뿐. `src/components/PeerEvaluation.tsx`가 지금 `coffe`에서 `heritage`/`dialect` 같은 가짜 project id에 하드코딩된 목업으로 보이는 것도, coffe가 main의 최신 커밋을 아직 안 받아서임 — main엔 이 파일이 이미 실데이터 연동 버전으로 442줄 다시 짜여 있음.
- `.npmrc`(`node-linker=hoisted`)는 이 머신의 E: 드라이브가 exFAT라 symlink를 못 써서 pnpm이 실패하는 걸 우회하기 위한 로컬 설정. 다른 개발 환경에서는 필요 없을 수 있음.
- `.env.local`에 `ODCLOUD_API_KEY` 추가함 (학교/학과 자동완성용 공공데이터 API 키) — 로컬 전용, git에 안 올라감.

## 테스트하면서 만든 데이터 (정리 필요 여부 확인 요망)

- 계정: `test-admin-clauded@example.com`, `test-leader-clauded@example.com` (둘 다 비밀번호 `testpass123`)
- 프로젝트: "승인테스트프로젝트"(승인됨), "sadasdasd"(반려됨), "zzz"는 삭제함
- "테스트" 프로젝트의 "윤성빈(test)" 멤버를 강퇴 테스트로 제외함

## 상태

이 브랜치의 모든 변경사항은 아직 **커밋되지 않음** (working tree에만 있음). 커밋 전에
위 테스트 데이터 정리 여부, 커밋 범위(전체 한 번에 vs 기능별 분리) 확인 필요.
