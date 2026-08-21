import { describe, expect, it } from 'vitest';
import { formatDate, formatKRW, formatSigned, todayFilename } from './format';

describe('formatKRW', () => {
  it('양수 금액을 "12,000원" 형태로 표기한다', () => {
    expect(formatKRW(12000)).toBe('12,000원');
  });

  it('음수 금액은 부호를 앞에 붙여 "-12,000원" 으로 표기한다', () => {
    expect(formatKRW(-12000)).toBe('-12,000원');
  });

  it('0원도 정상 표기한다', () => {
    expect(formatKRW(0)).toBe('0원');
  });
});

describe('formatSigned', () => {
  it('양수는 "+3,000" 형태로 표기한다', () => {
    expect(formatSigned(3000)).toBe('+3,000');
  });

  it('음수는 "-2,000" 형태로 표기한다', () => {
    expect(formatSigned(-2000)).toBe('-2,000');
  });

  it('0은 부호 없이 "0" 으로 표기한다', () => {
    expect(formatSigned(0)).toBe('0');
  });
});

describe('formatDate', () => {
  it('ISO 날짜를 "YYYY.MM.DD (요일)" 한국어 요일 형태로 표기한다', () => {
    // 2026-08-21 은 금요일
    expect(formatDate('2026-08-21')).toBe('2026.08.21 (금)');
  });

  it('월/일이 한 자리여도 0으로 패딩한다', () => {
    // 2026-01-04 는 일요일
    expect(formatDate('2026-01-04')).toBe('2026.01.04 (일)');
  });
});

describe('todayFilename', () => {
  it('prefix-YYYYMMDD.png 형태의 파일명을 만든다', () => {
    const filename = todayFilename('allcover');
    expect(filename).toMatch(/^allcover-\d{8}\.png$/);
  });
});
