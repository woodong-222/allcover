/**
 * allcover 도메인 타입 — 모든 모듈의 공유 계약.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §2
 *
 * 이 파일은 여러 모듈이 함께 의존하므로 변경 시 팀 리드와 합의할 것.
 */

export type Member = { id: string; name: string };

/** 기타 비용. splitAmong 이 'all' 이면 전체 멤버 균등 분담. */
export type Extra = {
  id: string;
  label: string;
  amount: number;
  splitAmong: string[] | 'all';
};

/**
 * 내기 방식.
 * - `none`     : 이 판은 내기 없음
 * - `pot`      : 판돈 분배(천바리). 인당 ante 를 걷어 순위별 인당 배당액으로 분배
 * - `transfer` : 판비 내주기. 진 쪽이 이긴 쪽 1인분 금액을 대신 부담
 */
export type BetMethod = 'none' | 'pot' | 'transfer';

export type Round = {
  id: string;
  /** 이 판에 실제로 참여한 멤버 id */
  participants: string[];
  /** 팀 편성. null 이면 개인전. 판마다 재편성 가능하며 기본은 직전 판 상속 */
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
   * 여기에 등장하지 않은 참여자는 전원 동일한 최하위 무배당 그룹으로 취급한다.
   */
  ranking: string[][];

  // --- method === 'transfer' 전용 ---
  /** 진 쪽. 팀전이면 진 팀의 멤버 전체가 들어간다. 승자 = participants - losers */
  losers: string[];
  /** 'gameFee' 면 Settlement.gameFeePerGame 을 따라간다 (한판비 내기) */
  transferSource: 'gameFee' | 'custom';
  transferAmount: number;
};

export type Settlement = {
  version: number;
  id: string;
  /** ISO 8601 date string */
  date: string;
  title?: string;

  members: Member[];
  gameFeePerGame: number;
  shoeFee: number;
  /** 신발을 대여한 멤버 id */
  shoeRenters: string[];

  /** 새 판을 만들 때 기본으로 채워지는 인당 판돈 */
  defaultAnte: number;

  rounds: Round[];
  extras: Extra[];

  /** 총무. 지정되면 모든 송금이 총무에게 모이고 반올림 잔액도 총무가 흡수한다 */
  treasurerId?: string;
  roundingUnit: 0 | 10 | 100;
};

/** 한 판의 내기 결과. delta 는 "부담" 기준이라 +가 더 내는 쪽이다. */
export type RoundBreakdown = {
  roundId: string;
  /** memberId -> betDelta. + = 더 부담, - = 이득 */
  delta: Record<string, number>;
  /**
   * pot 방식에서 (배당 합계 - 판돈 합계).
   * 0 이어야 정상이며, 0 이 아니면 UI가 경고를 띄운다. 절대 조용히 감추지 않는다.
   */
  imbalance: number;
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
  /** rounded - subtotal. 잔돈 흡수분 포함 */
  adjustment: number;
};

export type CalcResult = {
  results: MemberResult[];
  breakdowns: RoundBreakdown[];
  /** 모든 라운드 imbalance 의 합. 0 이 아니면 총액이 어긋난다는 뜻 */
  totalImbalance: number;
};
