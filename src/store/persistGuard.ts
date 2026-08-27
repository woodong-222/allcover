/**
 * zustand persist용 손상 데이터 방어 계층.
 *
 * - JSON 파싱 실패, 또는 `{ state, version }` 봉투 형태가 아닌 값은
 *   원본 그대로 `allcover:corrupt:{ts}` 키에 백업한 뒤 null을 돌려줘 초기 상태로 복구시킨다.
 * - 버전이 현재 버전과 다른 값은 각 스토어의 `migrate`가 처리한다 (동일한 백업 규칙 적용).
 * - 이 파일의 함수들은 절대 throw하지 않는다.
 */

import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { safeGet, safeSet, safeRemove } from '../lib/storage';

const CORRUPT_PREFIX = 'allcover:corrupt:';

/**
 * 지금까지 쌓인 손상 백업을 모두 지운다.
 *
 * 백업에는 세션 JSON 전체 — 즉 멤버 실명과 금액 — 이 들어간다. 정리하지 않으면 사용자가
 * "새 정산"으로 데이터를 지웠다고 믿어도 이름이 무기한 남고 quota 도 잠식한다.
 */
export function clearCorruptBackups(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key !== null && key.startsWith(CORRUPT_PREFIX)) keys.push(key);
    }
    for (const key of keys) safeRemove(key);
  } catch {
    // 열거 자체가 막힌 환경(프라이빗 모드 등)이면 정리를 포기한다. 흐름은 계속된다.
  }
}

/**
 * 손상된 원본 문자열을 그대로 백업한다.
 *
 * 새 백업을 쓰기 전에 기존 백업을 지워 항상 최신 1건만 남긴다. 진단에는 가장 최근 손상본이면
 * 충분하고, 과거 백업을 계속 들고 있으면 개인정보만 오래 남는다.
 */
export function backupCorruptRaw(raw: string): void {
  try {
    clearCorruptBackups();
    safeSet(`${CORRUPT_PREFIX}${Date.now()}`, raw);
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
 *
 * `isValidState`는 각 스토어가 자신의 `state` 모양을 아는 유일한 쪽이므로 선택적으로 받는다.
 * 버전이 현재 버전과 같으면 zustand persist는 `migrate`를 아예 호출하지 않고 이 state를
 * 그대로 쓰기 때문에, 형태 검증을 여기서 하지 않으면 `{settlement:null}` 같은 값이 그대로
 * 스토어에 들어가 렌더 중 TypeError로 이어질 수 있다.
 *
 * 저장된 버전을 함께 넘기는 이유: 이 검사는 옛 버전 값에도 걸리는데, 옛 스키마는 당연히
 * 현재 모양이 아니다. 버전을 안 주면 스토어가 현재 스키마 기준으로 검사하다가 정상적인
 * 마이그레이션 대상을 손상으로 오인해 백업 후 초기화한다 — 진행 중인 정산이 날아간다.
 */
export function createGuardedStorage<T>(
  isValidState?: (state: unknown, version: number) => boolean
): PersistStorage<T> {
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

      if (isValidState && !isValidState(parsed.state, parsed.version)) {
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
