/**
 * 카카오톡 등에 붙여넣을 플레인 텍스트 정산 요약.
 * "누가 얼마"와 총액만 보여준다.
 */

import type { MemberResult } from '../types';
import { formatDate, formatKRW } from './format';

export type BuildSummaryTextArgs = {
  /** ISO 8601 날짜 문자열 */
  date: string;
  /** memberId -> 이름 */
  memberNames: Record<string, string>;
  results: MemberResult[];
  /** 총액 (원) */
  total: number;
  /** 전원이 같은 금액을 내도록 올려서 더 걷힌 금액. 0 이하면 표시하지 않는다 */
  roundingSurplus?: number;
  /** 분담 대상이 한 명도 없어 아무에게도 청구되지 않은 기타비용 항목 */
  unassignedExtras?: { label: string; amount: number }[];
};

/**
 * 예)
 * 🎳 allcover 정산 · 2026.08.21 (금)
 * 총 42,000원 / 3명
 *
 * 김철수  16,000원
 * 이영희  14,000원
 * 박민수  12,000원
 */
export function buildSummaryText(args: BuildSummaryTextArgs): string {
  const { date, memberNames, results, total, roundingSurplus = 0, unassignedExtras = [] } = args;

  const lines: string[] = [];
  lines.push(`🎳 allcover 정산 · ${formatDate(date)}`);
  lines.push(`총 ${formatKRW(total)} / ${results.length}명`);
  lines.push('');

  for (const result of results) {
    const name = memberNames[result.memberId] ?? result.memberId;
    lines.push(`${name}  ${formatKRW(result.rounded)}`);
  }

  // 결과 카드 이미지에는 두 경고가 뜨는데 이 텍스트에만 없으면, 같은 정산을 텍스트로
  // 공유한 사람만 총액이 어긋난 이유를 알 수 없다. 두 채널의 정보량을 맞춘다.
  if (unassignedExtras.length > 0) {
    lines.push('');
    lines.push('⚠ 분담할 사람이 없어 아무도 내지 않은 항목 (위 총액에 미포함)');
    for (const item of unassignedExtras) {
      lines.push(`  ${item.label}  ${formatKRW(item.amount)}`);
    }
  }
  if (roundingSurplus > 0) {
    lines.push('');
    lines.push(`※ 인원수로 나누어떨어지지 않아 ${formatKRW(roundingSurplus)} 더 걷힙니다`);
  }

  return lines.join('\n');
}
