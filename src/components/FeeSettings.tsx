/**
 * 게임 단가 / 신발비.
 *
 * 반올림은 항상 1원 단위 올림으로 고정이라 사용자가 고를 것이 없다. `NumberField`의
 * `toIntegerWon`(Math.ceil)이 같은 방향이므로 이 화면에는 반올림 단위 설정을 두지 않는다.
 */

import { useSettlementStore } from '../store/useSettlementStore';
import { NumberField } from './ui/NumberField';

export function FeeSettings() {
  const gameFeePerGame = useSettlementStore((s) => s.settlement.gameFeePerGame);
  const shoeFee = useSettlementStore((s) => s.settlement.shoeFee);
  const setFees = useSettlementStore((s) => s.setFees);

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
      </div>
    </section>
  );
}
