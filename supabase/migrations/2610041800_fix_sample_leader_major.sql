-- ===== 팀장 전공·학번 예시 값 정리 (migrations/2610041800_fix_sample_leader_major.sql 과 동일) =====
-- 프로젝트를 만들 때 서버가 팀장 행에 예시 값('역사문화학과 3학년', '2021123456')을 그대로 넣던 문제(서버 코드는 고침).
-- 그 값이 남은 팀원 행을 계정 프로필의 전공·학번으로, 프로필에도 없으면 참여할 때와 같은 기본값('전공 미지정', '-')으로 바꾼다.
-- 두 값이 함께 예시 값과 똑같은 행만 고치므로 여러 번 실행해도 안전하다.
update public.members m
set major = coalesce(nullif(btrim(left(p.major, 100)), ''), '전공 미지정'),
    student = coalesce(nullif(btrim(left(p.student, 50)), ''), '-')
from (select m2.id, pr.major, pr.student from public.members m2 left join public.profiles pr on pr.id = m2.user_id) p
where p.id = m.id and m.major = '역사문화학과 3학년' and m.student = '2021123456';
