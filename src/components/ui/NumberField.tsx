/**
 * 공용 금액 입력 필드. 앱 전체 금액 입력에서 재사용한다.
 *
 * - inputMode="numeric" 으로 모바일 숫자 키패드를 띄운다.
 * - type="text" + 숫자만 허용하는 방식이 모바일 스핀 버튼보다 다루기 쉽다.
 * - 편집 중에도 천 단위 콤마를 보여주되, 로컬 상태를 따로 두어 부모 값 동기화가
 *   타이핑을 방해하지 않게 한다.
 * - 빈 문자열은 0으로 처리하고, 숫자가 아닌 문자(마이너스 포함)는 입력 단계에서 제거해
 *   음수 입력을 원천 차단한다.
 * - `value`가 소수(예: PayoutEditor 프리셋이 만드는 2333.3333…)로 들어오면 항상 정수로
 *   정규화한다. 정규화하지 않으면 `String(value)`가 그대로 로컬 편집 상태에 들어가 소수점이
 *   화면에 보이는데, 사용자가 칸을 한 글자만 건드리는 순간 `toDigits`가 숫자 아닌 문자(소수점)를
 *   전부 지워버려 2,333원이 2,333,333원으로 뛴다.
 *   `Math.ceil`을 쓰는 이유: 이 앱의 금액은 항상 원 단위 정수여야 하고 반올림 정책이
 *   "1원 단위 올림"이다. 내림이나 반올림으로 깎으면 그 방향과 어긋나고 총액 보존
 *   (Σ rounded === Σ subtotal)을 흔들 수 있으므로 올림으로 통일한다.
 */

import { useEffect, useId, useState, type ChangeEvent } from 'react';

export type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  /**
   * 상한. 기본 1억원.
   *
   * 볼링 정산에 1억을 넘는 금액이 들어올 일은 없다. 상한이 없으면 붙여넣기나 키 반복으로
   * 들어온 천문학적 값이 그대로 저장되고, 그 값이 계산 루프의 탐색 범위에 선형으로 반영돼
   * 화면이 멈춘다. 루프 쪽에도 별도 상한이 있지만 애초에 말이 안 되는 값을 상태에
   * 넣지 않는 것이 낫다.
   */
  max?: number;
  step?: number;
  id?: string;
};

/** 정산 금액의 현실적 상한. 이 값을 넘기면 오타이지 의도가 아니다. */
const DEFAULT_MAX = 100_000_000;

function toDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

/** 소수/비정수 value를 정수 원 단위로 정규화한다. 방향은 "1원 단위 올림"과 맞춘다. */
function toIntegerWon(value: number): number {
  return Math.ceil(value);
}

function formatDigits(digits: string): string {
  if (digits === '') return '';
  return Number(digits).toLocaleString('ko-KR');
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  max = DEFAULT_MAX,
  step,
  id,
}: NumberFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [digits, setDigits] = useState(() => {
    const normalized = toIntegerWon(value);
    return normalized === 0 ? '' : String(normalized);
  });

  useEffect(() => {
    const normalized = toIntegerWon(value);
    const current = digits === '' ? 0 : Number(digits);
    if (current !== normalized) {
      setDigits(normalized === 0 ? '' : String(normalized));
    }
    // digits는 의도적으로 의존성에서 제외한다: 사용자가 타이핑 중일 때 외부 value와
    // 우리가 계산해 보낸 값이 같으면 로컬 편집 상태를 건드리지 않기 위해서다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    const nextDigits = toDigits(e.target.value);
    const num = nextDigits === '' ? 0 : Number(nextDigits);
    const clamped = Math.min(max, Math.max(min, num));
    // 상한에 걸리면 화면의 숫자도 함께 잘라야 한다. 그렇지 않으면 입력칸에는
    // 잘리기 전 숫자가 남아 저장된 값과 어긋나 보인다.
    setDigits(clamped === 0 ? '' : String(clamped));
    onChange(clamped);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={fieldId}
          type="text"
          inputMode="numeric"
          value={formatDigits(digits)}
          onChange={handleChange}
          step={step}
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-slate-900"
        />
        {suffix && <span className="shrink-0 text-sm text-slate-700">{suffix}</span>}
      </div>
    </div>
  );
}
