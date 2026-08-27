import { describe, it, expect, beforeEach, vi } from 'vitest';
import { safeGet, safeSet, safeRemove, isPersistenceAvailable, safeStateStorage } from './storage';

describe('storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('safeGet/safeSet: 정상 환경에서 값을 저장하고 읽는다', () => {
    expect(safeSet('k', 'v')).toBe(true);
    expect(safeGet('k')).toBe('v');
  });

  it('safeGet: 존재하지 않는 키는 null', () => {
    expect(safeGet('nope')).toBeNull();
  });

  it('safeRemove: 저장된 값을 제거한다', () => {
    safeSet('k', 'v');
    safeRemove('k');
    expect(safeGet('k')).toBeNull();
  });

  it('localStorage.setItem이 throw해도 safeSet은 예외를 던지지 않고 false를 반환한다', () => {
    const spy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => safeSet('k', 'v')).not.toThrow();
    expect(safeSet('k', 'v')).toBe(false);
    spy.mockRestore();
  });

  it('localStorage.getItem이 throw해도 safeGet은 예외를 던지지 않고 in-memory 폴백을 사용한다', () => {
    const setSpy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    const getSpy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });

    expect(() => safeSet('memkey', 'memval')).not.toThrow();
    expect(() => safeGet('memkey')).not.toThrow();
    // localStorage 접근이 throw하는 환경이므로 in-memory 폴백에서 읽어온다
    expect(safeGet('memkey')).toBe('memval');

    getSpy.mockRestore();
    setSpy.mockRestore();
  });

  it('localStorage 접근이 throw하는 환경에서 isPersistenceAvailable()은 false를 반환한다', () => {
    const setSpy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(isPersistenceAvailable()).toBe(false);
    setSpy.mockRestore();
  });

  it('isPersistenceAvailable: 정상 환경에서는 true', () => {
    expect(isPersistenceAvailable()).toBe(true);
  });

  it('safeStateStorage: zustand persist의 StateStorage 인터페이스를 만족한다', () => {
    safeStateStorage.setItem('sk', 'sv');
    expect(safeStateStorage.getItem('sk')).toBe('sv');
    safeStateStorage.removeItem('sk');
    expect(safeStateStorage.getItem('sk')).toBeNull();
  });
});
