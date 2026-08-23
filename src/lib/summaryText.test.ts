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

describe('buildSummaryText — 경고 줄 (N3)', () => {
  const base = {
    date: '2026-08-21',
    memberNames: { m1: '가', m2: '나' },
    results: [makeResult('m1', 4000), makeResult('m2', 4000)],
    total: 8000,
  };

  it('미수금 항목이 있으면 항목명과 금액이 텍스트에 들어간다', () => {
    const out = buildSummaryText({
      ...base,
      unassignedExtras: [{ label: '맥주', amount: 5000 }],
    });
    expect(out).toContain('맥주');
    expect(out).toContain('5,000원');
    expect(out).toContain('아무도 내지 않은 항목');
  });

  it('올림 초과분이 있으면 안내 줄이 들어간다', () => {
    const out = buildSummaryText({ ...base, roundingSurplus: 2 });
    expect(out).toContain('2원 더 걷힙니다');
  });

  it('둘 다 없으면 경고 줄이 전혀 없다', () => {
    const out = buildSummaryText(base);
    expect(out).not.toContain('⚠');
    expect(out).not.toContain('※');
  });

  it('초과분이 0이면 안내를 넣지 않는다', () => {
    const out = buildSummaryText({ ...base, roundingSurplus: 0 });
    expect(out).not.toContain('더 걷힙니다');
  });
});
