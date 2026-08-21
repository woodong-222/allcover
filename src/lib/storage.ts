/**
 * localStorage 안전 래퍼.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 C4
 *
 * 사파리 프라이빗 모드(getItem/setItem이 throw)나 quota 초과 상황에서도
 * 앱이 죽지 않도록, 접근 자체가 실패하면 in-memory Map으로 조용히 전환한다.
 */

import type { StateStorage } from 'zustand/middleware';

/** localStorage 접근이 불가능할 때 쓰는 인메모리 폴백 저장소 */
const memoryFallback = new Map<string, string>();

export function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memoryFallback.has(key) ? memoryFallback.get(key)! : null;
  }
}

/** 성공하면 true, quota 초과 등으로 실패하면 false를 반환하고 절대 throw하지 않는다 */
export function safeSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    memoryFallback.set(key, value);
    return false;
  }
}

export function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 접근 자체가 실패하는 환경이면 memoryFallback만 정리하면 된다
  }
  memoryFallback.delete(key);
}

/** UI가 "저장 불가" 안내를 띄울 때 사용. 매번 실제로 써보고 판정해 순간적인 실패에도 최신 상태를 반영한다 */
export function isPersistenceAvailable(): boolean {
  const probeKey = '__allcover_probe__';
  try {
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

/** zustand persist의 createJSONStorage에 넘길 수 있는 StateStorage 어댑터 */
export const safeStateStorage: StateStorage = {
  getItem: (name: string) => safeGet(name),
  setItem: (name: string, value: string) => {
    safeSet(name, value);
  },
  removeItem: (name: string) => safeRemove(name),
};
