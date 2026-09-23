import type { BoardPoll, BoardPollOption, NewBoardPollInput } from "../api/types";

/**
 * 투표 항목의 득표율을 정수로 계산합니다 (0 ~ 100).
 */
export function calculatePollPercentage(votesCount: number, totalVotes: number): number {
  if (totalVotes <= 0 || votesCount <= 0) return 0;
  return Math.round((votesCount / totalVotes) * 100);
}

/**
 * 가장 많은 표를 얻은 1위 항목(동점 포함)의 ID 목록을 반환합니다.
 */
export function getLeadingOptionIds(options: Pick<BoardPollOption, "id" | "votesCount">[]): number[] {
  if (!options || options.length === 0) return [];
  const max = Math.max(...options.map((o) => o.votesCount), 0);
  if (max === 0) return [];
  return options.filter((o) => o.votesCount === max).map((o) => o.id);
}

/**
 * 마감 여부 및 마감일시를 기준으로 투표가 종료되었는지 판정합니다.
 */
export function isPollClosed(poll: Pick<BoardPoll, "closed" | "closesAt">, now: Date = new Date()): boolean {
  if (poll.closed) return true;
  if (!poll.closesAt) return false;
  return new Date(poll.closesAt).getTime() <= now.getTime();
}

/**
 * 새 투표 입력값 검증 (오류 메시지 반환, 유효하면 null).
 */
export function validateNewPollInput(
  input: { question?: string; options?: string[]; closesAt?: string | null },
  now: Date = new Date()
): string | null {
  const q = (input.question ?? "").trim();
  if (!q) return "투표 질문을 입력해주세요.";
  if (q.length > 200) return "투표 질문은 200자 이하로 입력해주세요.";

  const opts = (input.options ?? []).map((o) => o.trim()).filter(Boolean);
  if (opts.length < 2) return "투표 항목을 최소 2개 이상 입력해주세요.";
  if (opts.length > 10) return "투표 항목은 최대 10개까지 등록 가능합니다.";

  for (const opt of opts) {
    if (opt.length > 100) return "각 항목은 100자 이하로 입력해주세요.";
  }

  if (input.closesAt) {
    const deadline = new Date(input.closesAt);
    if (isNaN(deadline.getTime())) return "올바른 마감일을 지정해주세요.";
    if (deadline.getTime() <= now.getTime()) return "마감일은 현재 시간 이후여야 합니다.";
  }

  return null;
}

const LOCAL_POLLS_KEY = "talju_board_local_polls";

export function getLocalStoredPolls(): Record<number, BoardPoll & { votersStore?: Record<string, number[]> }> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(LOCAL_POLLS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLocalStoredPoll(poll: BoardPoll, votersStore?: Record<string, number[]>): void {
  try {
    if (typeof localStorage === "undefined") return;
    const all = getLocalStoredPolls();
    all[poll.postId] = { ...poll, votersStore: votersStore || all[poll.postId]?.votersStore || {} };
    localStorage.setItem(LOCAL_POLLS_KEY, JSON.stringify(all));
  } catch {}
}

export function getLocalStoredPoll(postId: number, currentUserId: string | null): BoardPoll | null {
  const all = getLocalStoredPolls();
  const poll = all[postId];
  if (!poll) return null;
  const votersStore = poll.votersStore || {};
  const myOptionIds = currentUserId ? votersStore[currentUserId] || [] : [];
  return {
    ...poll,
    hasVoted: myOptionIds.length > 0,
    myOptionIds,
  };
}

export function voteLocalStoredPoll(
  pollIdOrPostId: number,
  userId: string,
  userName: string,
  userAvatar: string | null,
  optionIds: number[]
): BoardPoll {
  const all = getLocalStoredPolls();
  const targetKey = Object.keys(all).find(
    (k) => Number(k) === pollIdOrPostId || all[Number(k)]?.id === pollIdOrPostId
  );
  if (!targetKey) throw new Error("투표를 찾을 수 없습니다.");
  const poll = all[Number(targetKey)];
  const votersStore = poll.votersStore || {};

  if (optionIds.length === 0) {
    delete votersStore[userId];
  } else {
    votersStore[userId] = optionIds;
  }

  const newOptions = poll.options.map((opt) => {
    const optVoters = Object.entries(votersStore)
      .filter(([_, votedOpts]) => votedOpts.includes(opt.id))
      .map(([uId]) => ({
        userId: uId,
        name: uId === userId ? userName : "참여자",
        avatarUrl: uId === userId ? userAvatar : null,
      }));
    return {
      ...opt,
      votesCount: optVoters.length,
      voters: poll.isAnonymous ? [] : optVoters,
    };
  });

  const totalVoters = Object.keys(votersStore).length;
  const myOptionIds = votersStore[userId] || [];

  const updatedPoll: BoardPoll = {
    ...poll,
    options: newOptions,
    totalVotes: totalVoters,
    hasVoted: myOptionIds.length > 0,
    myOptionIds,
  };

  saveLocalStoredPoll(updatedPoll, votersStore);
  return updatedPoll;
}

export function closeLocalStoredPoll(pollIdOrPostId: number): void {
  const all = getLocalStoredPolls();
  const targetKey = Object.keys(all).find(
    (k) => Number(k) === pollIdOrPostId || all[Number(k)]?.id === pollIdOrPostId
  );
  if (!targetKey) return;
  const poll = all[Number(targetKey)];
  all[Number(targetKey)] = { ...poll, closed: true };
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LOCAL_POLLS_KEY, JSON.stringify(all));
    }
  } catch {}
}
