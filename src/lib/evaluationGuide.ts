import { EVIDENCE_LEVELS, TRUST_LEVELS } from "./collaborationTrust";

// 평가 점수 안내. 프로필·팀 관리·동료 평가 화면은 점수와 짧은 상태만 보여 주고,
// 자세한 설명은 ⓘ(EvaluationInfoButton)를 누르면 이 내용이 창으로 열린다. 문구는 여기 한곳에서 고친다.
export type EvaluationGuideSection = "score" | "disclosure" | "trust" | "cca" | "percentile" | "phases" | "participation";

// 평가 항목. 동료 평가 화면의 입력 항목과 안내가 함께 쓴다.
export const EVALUATION_CRITERIA = [
  { id: "role", label: "역할 이행", desc: "맡은 역할과 작업을 수행했는지", icon: "✓" },
  { id: "deadline", label: "약속 및 마감 준수", desc: "합의한 기한과 약속을 지켰는지", icon: "◷" },
  { id: "communication", label: "의사소통", desc: "요청·질문·진행 상황 공유에 적절히 응답했는지", icon: "◎" },
  { id: "collaboration", label: "협업 태도", desc: "팀 의사결정과 문제 해결 과정에 협조적으로 참여했는지", icon: "⊙" },
  { id: "quality", label: "결과물 품질", desc: "결과물의 완성도가 기대 수준을 충족했는지", icon: "★" },
] as const;

export const EVALUATION_GUIDE: { id: EvaluationGuideSection; title: string; items: string[] }[] = [
  {
    id: "score",
    title: "점수는 어떻게 매겨지나요",
    items: [
      "동료가 다섯 항목을 0~10점으로 평가하고, 다섯 항목의 평균이 그 동료가 준 점수가 됩니다.",
      ...EVALUATION_CRITERIA.map((c) => `${c.label}: ${c.desc}`),
      "프로필·대시보드·업적의 평점은 최종 평가만으로 계산합니다. 중간 점검 점수는 포함하지 않습니다.",
    ],
  },
  {
    id: "disclosure",
    title: "점수는 언제 공개되나요",
    items: [
      "누가 몇 점을 줬는지 알 수 없도록, 함께 평가하는 동료가 2명 이상이고 모두 제출한 뒤에만 평균을 공개합니다. 그 전에는 '공개 대기'로 표시됩니다.",
      "공개되는 것은 평균뿐이며, 개별 평가자의 점수는 누구에게도 보이지 않습니다.",
      "중간 점검의 평균과 종합 코멘트는 본인만 볼 수 있습니다.",
    ],
  },
  {
    id: "trust",
    title: "협업 신뢰도와 평가 근거",
    items: [
      "최종 평가 평균에 따라 단계를 붙입니다: " + TRUST_LEVELS.map((level, i) => i === TRUST_LEVELS.length - 1 ? `${TRUST_LEVELS[i - 1].min}점 미만 '${level.label}'` : `${level.min}점 이상 '${level.label}'`).join(", ") + ".",
      "받은 평가가 적으면 점수가 한두 명의 평가에 크게 흔들립니다. 그래서 평가 건수를 함께 표시합니다: " + EVIDENCE_LEVELS.map((level, i) => i === 0 ? `${level.min}건 이상 '${level.label}'` : i === EVIDENCE_LEVELS.length - 1 ? `${EVIDENCE_LEVELS[i - 1].min}건 미만 '${level.label}'` : `${level.min}건 이상 '${level.label}'`).join(", ") + ".",
      "협업 신뢰도는 협업 방식을 참고하기 위한 지표이며, 사람을 평가하는 성적이 아닙니다.",
    ],
  },
  {
    id: "cca",
    title: "CCA 보정",
    items: [
      "평가자마다 점수를 후하게 주거나 짜게 주는 습관이 다릅니다. CCA(성향 보정 합의 평균)는 이 습관을 빼고 계산한 평균입니다.",
      "평가자별로 그 사람이 평소 주는 평균 점수와의 차이를 기준으로 다시 맞춘 뒤, 다른 평가자들과 크게 동떨어진 점수(합의에서 3점 넘게 벗어난 점수)는 줄여서 반영합니다.",
      "관리자가 공식 점수 방식을 CCA로 정하면 프로필·대시보드·업적·상위 %가 모두 CCA로 계산되고, 점수 옆에 'CCA' 표시가 붙습니다. 받은 원래 점수는 그대로 보관됩니다.",
      "동료 평가 화면의 점수 방식 비교는 두 방식을 미리 보는 기능이라, 고른다고 실제 평점이 바뀌지 않습니다. '반영 중'이 붙은 방식이 실제 평점에 쓰입니다.",
    ],
  },
  {
    id: "percentile",
    title: "상위 %",
    items: [
      "최종 평가가 공개된 서비스 전체 사용자와 비교해 몇 % 안에 드는지 보여 줍니다. 항목별 상위 %는 오각형 차트의 각 항목 옆에 표시됩니다.",
      "비교할 사용자가 10명 이상 모여야 표시됩니다. 그 전에는 '상위 % 집계 전'으로 나옵니다.",
    ],
  },
  {
    id: "phases",
    title: "중간 점검과 최종 평가",
    items: [
      "중간 점검은 형성적 평가입니다. 프로젝트 진행 중에 서로 피드백을 주고받기 위한 것으로, 프로필 평판에는 반영되지 않습니다.",
      "최종 평가는 총괄 평가입니다. 프로젝트를 종료하면 열리고, 그 평균이 대시보드와 프로필의 평점이 됩니다.",
      "프로젝트 기간이 2주 미만이면 피드백을 반영할 시간이 부족해 중간 점검 없이 최종 평가만 진행합니다.",
      "제출한 평가는 수정할 수 없습니다.",
    ],
  },
  {
    id: "participation",
    title: "참여 횟수와 함께한 동료",
    items: [
      "프로젝트 참여 횟수는 종료된 프로젝트만 셉니다.",
      "함께한 동료는 종료된 프로젝트에서 함께한 사람 수이며, 여러 프로젝트를 같이 한 사람도 한 번만 셉니다.",
    ],
  },
];
