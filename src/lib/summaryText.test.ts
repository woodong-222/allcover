import { describe, expect, it } from 'vitest';
import type { MemberResult } from '../types';
import { buildSummaryText } from './summaryText';

function makeResult(memberId: string, rounded: number): MemberResult {
  return {
    memberId,
    gameCount: 3,
    gameFee: 12000,
    shoe: 0,
    extra: 0,
    betDelta: 0,
    subtotal: rounded,
    rounded,
    adjustment: 0,
  };
}

describe('buildSummaryText', () => {
  it('이모지 1개(🎳)와 함께 날짜/총액/인원수/멤버별 금액을 포함한다', () => {
    const text = buildSummaryText({
      date: '2026-08-21',
      memberNames: { m1: '김철수', m2: '이영희', m3: '박민수' },
      results: [makeResult('m1', 16000), makeResult('m2', 14000), makeResult('m3', 12000)],
      total: 42000,
    });

    expect(text).toBe(
      [
        '🎳 allcover 정산 · 2026.08.21 (금)',
        '총 42,000원 / 3명',
        '',
        '김철수  16,000원',
        '이영희  14,000원',
        '박민수  12,000원',
      ].join('\n'),
    );
  });

  it('이모지는 정확히 1개만 포함한다', () => {
    const text = buildSummaryText({
      date: '2026-08-21',
      memberNames: { m1: '김철수' },
      results: [makeResult('m1', 1000)],
      total: 1000,
    });

    const emojiCount = [...text].filter((ch) => ch === '🎳').length;
    expect(emojiCount).toBe(1);
  });

  it('총무/송금 안내 줄이 없다 (2026-08-21 제거됨)', () => {
    const text = buildSummaryText({
      date: '2026-08-21',
      memberNames: { m1: '김철수' },
      results: [makeResult('m1', 1000)],
      total: 1000,
    });

    expect(text).not.toContain('→');
    expect(text).not.toContain('보내주세요');
  });
});
