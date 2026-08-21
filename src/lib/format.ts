/**
 * 표시용 포맷 유틸.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 D
 */

const KRW_FORMATTER = new Intl.NumberFormat('ko-KR');

/** 12000 -> "12,000원", -12000 -> "-12,000원" */
export function formatKRW(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}${KRW_FORMATTER.format(Math.abs(amount))}원`;
}

/** 내기 증감 표기. 3000 -> "+3,000", -2000 -> "-2,000", 0 -> "0" */
export function formatSigned(amount: number): string {
  if (amount === 0) return '0';
  const sign = amount > 0 ? '+' : '-';
  return `${sign}${KRW_FORMATTER.format(Math.abs(amount))}`;
}

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** ISO 날짜 문자열 -> "2026.08.21 (금)" */
export function formatDate(iso: string): string {
  // "YYYY-MM-DD" 형태는 로컬 시간대로 직접 구성한다.
  // new Date('YYYY-MM-DD')는 UTC 자정으로 해석되어, UTC보다 시간대가 늦은 지역(-오프셋)에서는
  // 로컬 getters(getDate/getDay)가 하루 전으로 밀리는 문제가 있다.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const weekday = WEEKDAYS_KO[date.getDay()];
  return `${year}.${month}.${day} (${weekday})`;
}

/** prefix + 오늘 날짜(YYYYMMDD) 기반 파일명. todayFilename('allcover') -> "allcover-20260821.png" */
export function todayFilename(prefix: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${prefix}-${year}${month}${day}.png`;
}
