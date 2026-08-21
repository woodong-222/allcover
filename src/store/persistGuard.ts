/**
 * zustand persist용 손상 데이터 방어 계층.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 C3
 *
 * - JSON 파싱 실패, 또는 `{ state, version }` 봉투 형태가 아닌 값은
 *   원본 그대로 `allcover:corrupt:{ts}` 키에 백업한 뒤 null을 돌려줘 초기 상태로 복구시킨다.
 * - 버전이 현재 버전과 다른 값은 각 스토어의 `migrate`가 처리한다 (동일한 백업 규칙 적용).
 * - 이 파일의 함수들은 절대 throw하지 않는다.
 */

import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { safeGet, safeSet, safeRemove } from '../lib/storage';

/** 손상된 원본 문자열을 그대로 백업한다 */
export function backupCorruptRaw(raw: string): void {
  try {
    safeSet(`allcover:corrupt:${Date.now()}`, raw);
  } catch {
    // 백업조차 실패해도 초기화 흐름은 계속 진행한다
  }
}

/** migrate 단계에서 만난, 버전이 다르거나 형태를 알 수 없는 persisted state를 백업한다 */
export function backupCorruptState(persistedState: unknown, version: number): void {
  try {
    backupCorruptRaw(JSON.stringify({ state: persistedState, version }));
  } catch {
    // 직렬화 자체가 실패하면(순환 참조 등) 백업을 포기하고 초기화만 진행한다
  }
}

function isValidEnvelope(value: unknown): value is { version: number; state: unknown } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.version === 'number' && typeof v.state === 'object' && v.state !== null;
}

/**
 * safeStateStorage 위에 JSON 파싱/봉투 검증을 얹은 PersistStorage.
 * 파싱 실패나 잘못된 형태를 만나면 백업 후 null을 반환해 persist가 초기 상태를 쓰게 한다.
 */
export function createGuardedStorage<T>(): PersistStorage<T> {
  return {
    getItem: (name) => {
      const raw = safeGet(name);
      if (raw === null) return null;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        backupCorruptRaw(raw);
        safeRemove(name);
        return null;
      }

      if (!isValidEnvelope(parsed)) {
        backupCorruptRaw(raw);
        safeRemove(name);
        return null;
      }

      return parsed as StorageValue<T>;
    },
    setItem: (name, value) => {
      try {
        safeSet(name, JSON.stringify(value));
      } catch {
        // safeSet은 throw하지 않지만 방어적으로 한 번 더 감싼다
      }
    },
    removeItem: (name) => {
      safeRemove(name);
    },
  };
}
