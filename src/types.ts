/**
 * allcover 도메인 타입 — 모든 모듈의 공유 계약.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §2
 *
 * 이 파일은 여러 모듈이 함께 의존하므로 변경 시 팀 리드와 합의할 것.
 */

export type Member = { id: string; name: string };

/**
 * 기타 비용. **금액을 사람별로 따로 담는다** (2026-08-24).
 *
 * 이전에는 `amount` 하나를 `splitAmong` 대상에게 균등 분배했는데, 그러면
 * "가는 2,000원짜리 음료수, 나는 2,500원짜리" 를 표현할 수 없었다. 사람별 금액 맵이
 * 균등 분배와 개별 금액을 **하나의 표현으로** 모두 담는다 — 균등 분배는 같은 값을
 * 채워 넣은 특수한 경우일 뿐이다.
 *
 * 금액이 0이거나 키가 없는 멤버는 그 항목을 안 먹은 것이므로 청구되지 않는다.
 * 따라서 "분담 대상 전원 삭제" 도 amounts 가 비는 것으로 자연스럽게 표현된다.
 */
export type Extra = {
  id: string;
  label: string;
  /** memberId -> 그 사람이 낼 금액(원). 정수만 담는다 */
  amounts: Record<string, number>;
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

// 전역 SettlementMode 는 제거됐다 (2026-08-24). 정산/내기 구분은 판마다 다를 수 있으므로
// Round.method 하나로 표현한다 — 'none' 이 정산, 'pot'/'transfer' 가 내기다.
// 전역 토글과 판별 method 가 이중으로 존재하던 구조를 하나로 합친 것이다.

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
  // `defaultAnte` 는 제거됐다 (2026-08-21). `addRound` 가 직전 판의 ante 를 상속하므로
  // 이 값이 실제로 쓰이는 건 맨 첫 판 하나뿐이었다. 그 하나 때문에 설정 화면에
  // 상시 필드를 두면 판별 "인당 판돈" 과 이름이 겹쳐 어느 쪽이 적용되는지 헷갈린다.
  // 첫 판의 ante 는 0 으로 시작하고 사용자가 그 판에서 직접 입력한다.

  rounds: Round[];
  extras: Extra[];

  // `treasurerId` 는 제거됐다 (2026-08-21). 볼링장에서는 누가 카드로 긁었는지 다들 아는데
  // 앱이 굳이 지정을 받아야 할 이유가 없었다. 송금 목록(settle.ts / TransferList)도 함께 제거했고,
  // 결과 카드는 "누가 얼마" 와 총액만 보여준다.
  // 올림으로 생기는 초과분은 최대 부담자가 흡수한다 — 입력이 전부 정수라 실무에서는 발생하지 않는다.
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
  /** rounded - subtotal. 잔돈 흡수분 포함 */
  adjustment: number;
};

export type CalcResult = {
  results: MemberResult[];
  breakdowns: RoundBreakdown[];
  /** 모든 라운드 imbalance 의 합. 0 이 아니면 총액이 어긋난다는 뜻 */
  totalImbalance: number;
  /**
   * 전원이 같은 금액을 내도록 1원 단위로 올린 결과, 실제 결제액보다 더 걷힌 금액.
   *
   * 나눗셈 한 번당 최대 (인원-1)원이라 보통 0~2원이다. 예: 8,000원 판돈을 3명이 나누면
   * `2,667 × 3 = 8,001` 로 1원이 남는다. 한 명만 1원 덜 내게 하는 것보다 낫다고 판단한
   * 결과이며(2026-08-21 사용자 결정), 조용히 사라지지 않도록 여기로 드러낸다.
   */
  roundingSurplus: number;
  /**
   * 분담 대상이 한 명도 남지 않은 기타비용 항목.
   *
   * 지정 멤버가 전원 삭제되면 그 항목은 아무에게도 청구되지 않아 금액이 정산에서
   * 조용히 사라진다. 사용자는 그만큼 덜 걷게 되므로 반드시 화면에 드러내야 한다.
   */
  unassignedExtras: { label: string; amount: number }[];
};
