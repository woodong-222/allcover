/**
 * 게임 단가 / 신발비.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 E2, E3, E4 / §4 M3 / §5-A
 *
 * 반올림은 항상 1원 단위 올림으로 고정되어(§5-A-1) 사용자가 고를 게 없으므로
 * 반올림 단위 세그먼트 컨트롤은 제거했다. `NumberField`의 `toIntegerWon`(Math.ceil)이
 * 이미 같은 방향이라 별도 조치는 필요 없다.
 * `defaultAnte`(기본 판돈)와 `treasurerId`(총무)는 types.ts에서 완전히 삭제됐다 (2026-08-21).
 * - defaultAnte: `addRound`가 직전 판의 ante를 상속하므로 실제로 쓰이는 건 첫 판 하나뿐이었다.
 *   첫 판은 ante 0으로 시작해 사용자가 그 판에서 직접 입력한다.
 * - treasurerId: 볼링장에서는 누가 카드로 긁었는지 다들 알아서, 앱이 지정을 받을 이유가
 *   없었다. 송금 목록(옛 TransferList)도 함께 제거됐다 — 결과 카드는 "누가 얼마"와 총액만
 *   보여준다. 그래서 이 화면에는 더 이상 "기본 판돈"·"총무" 필드가 없다.
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
