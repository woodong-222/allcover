/**
 * 게임 단가 / 신발비 / 기본 판돈 / 반올림 단위 / 총무 지정.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 E2, E3, E4 / §4 M3
 */

import { useSettlementStore } from '../store/useSettlementStore';
import { NumberField } from './ui/NumberField';

const ROUNDING_UNITS = [0, 10, 100] as const;

export function FeeSettings() {
  const gameFeePerGame = useSettlementStore((s) => s.settlement.gameFeePerGame);
  const shoeFee = useSettlementStore((s) => s.settlement.shoeFee);
  const defaultAnte = useSettlementStore((s) => s.settlement.defaultAnte);
  const roundingUnit = useSettlementStore((s) => s.settlement.roundingUnit);
  const members = useSettlementStore((s) => s.settlement.members);
  const treasurerId = useSettlementStore((s) => s.settlement.treasurerId);
  const setFees = useSettlementStore((s) => s.setFees);
  const setTreasurer = useSettlementStore((s) => s.setTreasurer);

  return (
    <section className="rounded-xl border bg-white p-4">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">요금 설정</h2>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <NumberField
          label="게임 단가"
          value={gameFeePerGame}
          onChange={(v) => setFees({ gameFeePerGame: v })}
          suffix="원"
        />
        <NumberField
          label="신발비"
          value={shoeFee}
          onChange={(v) => setFees({ shoeFee: v })}
          suffix="원"
        />
        <NumberField
          label="기본 판돈"
          value={defaultAnte}
          onChange={(v) => setFees({ defaultAnte: v })}
          suffix="원"
        />
      </div>

      <div className="mt-4">
        <span className="mb-2 block text-sm font-medium text-slate-700">반올림 단위</span>
        <div className="flex gap-2" role="group" aria-label="반올림 단위">
          {ROUNDING_UNITS.map((unit) => (
            <button
              key={unit}
              type="button"
              aria-pressed={roundingUnit === unit}
              onClick={() => setFees({ roundingUnit: unit })}
              className={`min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium ${
                roundingUnit === unit
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 text-slate-700'
              }`}
            >
              {unit === 0 ? '0원' : `${unit}원`}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="treasurer-select" className="mb-2 block text-sm font-medium text-slate-700">
          총무
        </label>
        <select
          id="treasurer-select"
          value={treasurerId ?? ''}
          onChange={(e) => setTreasurer(e.target.value === '' ? undefined : e.target.value)}
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
        >
          <option value="">총무 없음</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {treasurerId === undefined && (
          <p className="mt-2 text-sm text-slate-700">잔액은 각자 카운터 결제</p>
        )}
      </div>
    </section>
  );
}
