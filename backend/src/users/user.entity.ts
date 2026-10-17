import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column()
  name: string;

  @Column({ type: 'float', nullable: true })
  trustScore: number | null;

  // 계정 단위 프로필(학교/학과/학번/연락처/배너/링크) — 프로젝트별이 아니라 사람 단위로 하나만
  // 있고, 참여 중인 모든 프로젝트에서 동일하게 보인다. major/student는 프로젝트 참여 시점에
  // 같이 입력받아 여기 채워넣지만(가입 직후 프로필을 처음 채우는 자연스러운 지점이라), 값 자체는
  // 계정에 귀속된다.
  @Column({ type: 'varchar', nullable: true })
  school: string | null;

  @Column({ type: 'varchar', nullable: true })
  major: string | null;

  @Column({ type: 'varchar', nullable: true })
  student: string | null;

  // 카카오톡 ID, 전화번호 등 팀원에게 보여줄 연락처
  @Column({ type: 'varchar', nullable: true })
  contact: string | null;

  // 프로필 카드 배너 색상(hex). bannerImageUrl이 있으면 그쪽이 우선.
  @Column({ type: 'varchar', nullable: true })
  bannerColor: string | null;

  @Column({ type: 'varchar', nullable: true })
  bannerImageUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;

  // 로그인 횟수 제한 — 연속 실패 횟수가 임계치를 넘으면 lockedUntil까지 비밀번호가 맞아도
  // 로그인을 막는다(brute-force 방어). 성공하면 즉시 0/null로 초기화(users.service.ts 참고).
  @Column({ type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  // 소속 학과/부서 admin(프로젝트 승인 권한) 여부. isOperator는 그 위의 최고 권한(admin 승인/
  // 해제까지 가능) — 이 백엔드엔 아직 "첫 운영자를 어떻게 지정하는지"가 없어서, 당장은 DB에서
  // 직접 true로 바꿔야 함(운영 전환 시 정리 필요).
  @Column({ name: 'is_admin', default: false })
  isAdmin: boolean;

  @Column({ name: 'is_operator', default: false })
  isOperator: boolean;

  // admin 승인을 받을 때(소속 학과/부서) — 운영자 검색/목록 화면에서 씀.
  @Column({ type: 'varchar', nullable: true })
  org: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
