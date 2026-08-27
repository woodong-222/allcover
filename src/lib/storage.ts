/**
 * localStorage 안전 래퍼.
 *
 * 사파리 프라이빗 모드(getItem/setItem이 throw)나 quota 초과 상황에서도 앱이 죽지 않도록,
 * 접근 자체가 실패하면 in-memory Map 으로 조용히 전환한다.
 */

import type { StateStorage } from 'zustand/middleware';

/** localStorage 접근이 불가능할 때 쓰는 인메모리 폴백 저장소 */
const memoryFallback = new Map<string, string>();

/**
 * 마지막으로 확인된 저장 가능 여부. `null` 은 아직 한 번도 확인하지 않았다는 뜻이다.
 *
 * 마운트 시점에 한 번만 판정하면 사파리 프라이빗 모드(처음부터 throw)는 잡히지만
 * quota 초과는 세션 중간에 발생하므로 영영 감지되지 않는다. 그래서 실제 쓰기가 실패하는
 * 순간 이 값을 뒤집고 구독자에게 알린다.
 */
let persistenceOk: boolean | null = null;

const listeners = new Set<() => void>();

function setPersistence(next: boolean): void {
  if (persistenceOk === next) return;
  persistenceOk = next;
  for (const listener of listeners) listener();
}

/** React 의 useSyncExternalStore 에 그대로 넘길 수 있는 구독 함수 */
export function subscribePersistence(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 현재 저장 가능 여부. 같은 상태에서는 동일한 값을 돌려주므로
 * useSyncExternalStore 의 getSnapshot 으로 안전하게 쓸 수 있다.
 */
export function getPersistenceSnapshot(): boolean {
  if (persistenceOk === null) persistenceOk = probeStorage();
  return persistenceOk;
}

function probeStorage(): boolean {
  const probeKey = '__allcover_probe__';
  try {
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

/** 테스트 전용. 모듈 상태가 테스트 사이로 새지 않게 초기화한다. */
export function resetPersistenceStateForTest(): void {
  persistenceOk = null;
  memoryFallback.clear();
}

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
    setPersistence(true);
    return true;
  } catch {
    memoryFallback.set(key, value);
    // quota 초과는 여기서만 드러난다. 이 신호를 흘리면 사용자는 조용히 데이터를 잃는다.
    setPersistence(false);
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

/**
 * 지금 실제로 써보고 판정한다. 판정 결과는 구독자에게도 전파된다.
 *
 * UI 는 이 함수를 직접 폴링하지 말고 `subscribePersistence` + `getPersistenceSnapshot`
 * 을 쓰는 편이 낫다. 이 함수는 명시적으로 다시 확인하고 싶을 때만 쓴다.
 */
export function isPersistenceAvailable(): boolean {
  const ok = probeStorage();
  setPersistence(ok);
  return ok;
}

/** zustand persist의 createJSONStorage에 넘길 수 있는 StateStorage 어댑터 */
export const safeStateStorage: StateStorage = {
  getItem: (name: string) => safeGet(name),
  setItem: (name: string, value: string) => {
    safeSet(name, value);
  },
  removeItem: (name: string) => safeRemove(name),
};
