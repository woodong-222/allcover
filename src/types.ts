/** allcover 도메인 타입. 계산 엔진과 화면이 공유하는 계약이다. */

export type Member = { id: string; name: string };

/**
 * 게임비·신발비 외에 나눠 내는 비용. 음료수, 주차비 같은 것들.
 *
 * 금액을 사람별로 담는다. "철수는 2,000원짜리, 영희는 2,500원짜리" 같은 경우가 실제로
 * 있어서, 총액 하나를 균등 분배하는 형태로는 표현할 수 없다. 균등 분배는 같은 값을
 * 채워 넣은 특수한 경우로 이 안에 흡수된다.
 *
 * 금액이 0이거나 키가 없는 사람은 그 항목에서 빠진 것이라 청구되지 않는다.
 */
export type Extra = {
  id: string;
  label: string;
  /** memberId -> 그 사람이 낼 금액(원). 정수만 담는다 */
  amounts: Record<string, number>;
};

/**
 * 판별 내기 방식. 정산/내기 구분도 이 하나로 표현한다 — `none` 이 곧 "내기 없이 정산만" 이다.
 *
 * - `none`     : 게임비만 나눈다
 * - `pot`      : 판돈 분배(천바리). 인당 ante 를 걷어 순위별 인당 배당액으로 나눈다
 * - `transfer` : 판비 내주기. 진 쪽이 이긴 쪽 1인분 금액을 대신 낸다
 */
export type BetMethod = 'none' | 'pot' | 'transfer';

export type Round = {
  id: string;
  /** 이 판에 실제로 참여한 멤버 id */
  participants: string[];
  /** 팀 편성. null 이면 개인전. 판마다 재편성할 수 있고 기본은 직전 판 상속 */
  teams: string[][] | null;
  method: BetMethod;

  // --- method === 'pot' 전용 ---
  /** 인당 판돈 */
  ante: number;
  /** 등수별 "인당" 배당액. index 0 = 1등. 배열 길이보다 낮은 등수는 무배당 */
  payout: number[];
  /**
   * 탭한 순서대로의 순위 그룹.
   * 개인전이면 각 그룹이 멤버 1명, 팀전이면 그룹이 팀원 전체.
   * 여기 없는 참여자는 전원 동일한 최하위 무배당 그룹으로 친다.
   */
  ranking: string[][];

  // --- method === 'transfer' 전용 ---
  /** 진 쪽. 팀전이면 진 팀 전원이 들어간다. 이긴 쪽 = participants - losers */
  losers: string[];
  /** 'gameFee' 면 그날 게임 단가를 따라간다 (한판비 내기) */
  transferSource: 'gameFee' | 'custom';
  transferAmount: number;
};

export type Settlement = {
  id: string;
  /** ISO 8601 date string */
  date: string;
  title?: string;

  members: Member[];
  gameFeePerGame: number;
  shoeFee: number;
  /** 신발을 대여한 멤버 id */
  shoeRenters: string[];

  rounds: Round[];
  extras: Extra[];
};

/** 한 판의 내기 결과. delta 는 "부담" 기준이라 +가 더 내는 쪽이다. */
export type RoundBreakdown = {
  roundId: string;
  /** memberId -> betDelta. + = 더 부담, - = 이득 */
  delta: Record<string, number>;
  /**
   * pot 방식에서 (배당 합계 - 판돈 합계).
   * 0 이어야 정상이고, 0 이 아니면 화면에 경고를 띄운다. 조용히 감추지 않는다.
   */
  imbalance: number;
  /**
   * transfer 방식에서 진 쪽 인원으로 나누어떨어지지 않아 올림으로 더 걷힌 금액.
   * 최대 (진 쪽 인원 - 1)원. pot 방식은 나눗셈을 쓰지 않으므로 항상 0 이다.
   */
  surplus: number;
};

export type MemberResult = {
  memberId: string;
  /** 참여한 판 수 */
  gameCount: number;
  gameFee: number;
  shoe: number;
  extra: number;
  betDelta: number;
  /** gameFee + shoe + extra + betDelta (반올림 전) */
  subtotal: number;
  /** 반올림 적용 후 실제 청구액 */
  rounded: number;
  /** rounded - subtotal */
  adjustment: number;
};

export type CalcResult = {
  results: MemberResult[];
  breakdowns: RoundBreakdown[];
  /** 모든 라운드 imbalance 의 합. 0 이 아니면 총액이 어긋난다는 뜻 */
  totalImbalance: number;
  /**
   * 전원이 같은 금액을 내도록 올린 결과 실제 결제액보다 더 걷힌 금액.
   *
   * 나눗셈 한 번당 최대 (인원-1)원이라 보통 0~2원이다. 8,000원을 3명이 나누면
   * 2,667원씩 걷어 1원이 남는 식이다. 한 명만 1원 덜 내게 하는 것보다 낫다고 봤고,
   * 그 1원이 조용히 사라지지 않도록 여기로 드러낸다.
   */
  roundingSurplus: number;
  /**
   * 낼 사람이 한 명도 안 남은 기타비용 항목.
   *
   * 지정한 멤버가 전부 삭제되면 그 금액은 아무에게도 청구되지 않아 정산에서 사라진다.
   * 그만큼 덜 걷게 되므로 화면에 반드시 드러내야 한다.
   */
  unassignedExtras: { label: string; amount: number }[];
};
