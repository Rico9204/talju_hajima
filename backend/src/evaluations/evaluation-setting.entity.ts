import { Column, Entity, PrimaryColumn } from 'typeorm';

// 평가 관련 전역 설정 — 단일 행(id='global')만 존재한다. 운영자만 수정 가능, 조회는 로그인한
// 누구나 가능(클라이언트가 평가 화면에 뱃지/옵션을 표시할지 판단하는 데 쓴다).
@Entity('evaluation_settings')
export class EvaluationSetting {
  @PrimaryColumn({ default: 'global' })
  id: string;

  // 프로토타입 모드(항상 제출 가능, 기간/상태 게이팅 없음) 토글. 현재 백엔드는 프로젝트 "종료"
  // 상태만 있을 뿐 평가 기간 자체를 모델링하지 않아서, 이 값은 그대로 저장/조회만 되고 아직
  // submit()의 실제 게이팅에는 쓰이지 않는다 — talju_hajima_이식기록.txt에 기록된 기존 설계
  // 결정("항상 프로토타입 모드로 고정")과 맞춘 상태.
  @Column({ name: 'evaluation_mode', default: true })
  evaluationMode: boolean;

  // true면 GET .../evaluations/:phase?method= 쿼리 파라미터를 운영자가 점수 방식 비교
  // 용도로 쓸 수 있게 허용한다. false면 method 파라미터를 무시하고 항상 공식 방식만 반환.
  @Column({ name: 'method_preview_enabled', default: false })
  methodPreviewEnabled: boolean;

  // true면 공식 점수 산정 방식이 'cca'(최저/최고 제외 평균), false면 'raw'(단순 평균).
  @Column({ name: 'score_cca_enabled', default: false })
  scoreCcaEnabled: boolean;
}
