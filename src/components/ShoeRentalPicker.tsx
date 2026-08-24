/**
 * 신발 대여자 다중 체크 + 요약.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 E1, E2, E4 / §4 M3
 *
 * 아무도 신발을 안 빌리면 통째로 쓰지 않는 섹션이라 기타 비용과 같은 방식으로 접는다
 * (2026-08-21 사용자 요청). 대여자가 한 명이라도 있으면 펼친 채로 시작한다 —
 * 새로고침 후 입력해둔 대여자가 접혀서 안 보이면 빠뜨린 줄 안다.
 */

import { useSettlementStore } from '../store/useSettlementStore';
import { formatKRW } from '../lib/format';
import { CollapsibleSection } from './ui/CollapsibleSection';

export function ShoeRentalPicker() {
  const members = useSettlementStore((s) => s.settlement.members);
  const shoeRenters = useSettlementStore((s) => s.settlement.shoeRenters);
  const shoeFee = useSettlementStore((s) => s.settlement.shoeFee);
  const toggleShoeRenter = useSettlementStore((s) => s.toggleShoeRenter);

  const total = shoeRenters.length * shoeFee;

  return (
    <CollapsibleSection
      title="신발 대여"
      summary={
        shoeRenters.length > 0
          ? `· ${shoeRenters.length}명 · ${formatKRW(total)}`
          : '· 선택 사항'
      }
      defaultOpen={shoeRenters.length > 0}
    >
      {shoeFee === 0 ? (
        <p className="text-sm text-slate-700">신발비를 먼저 입력하세요</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-slate-700">멤버를 먼저 추가하세요</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {members.map((m) => {
              const checked = shoeRenters.includes(m.id);
              const inputId = `shoe-renter-${m.id}`;
              return (
                <li key={m.id}>
                  <label
                    htmlFor={inputId}
                    className={`flex min-h-11 min-w-11 items-center gap-2 rounded-lg border px-3 ${
                      checked ? 'border-blue-600 bg-blue-50' : 'border-slate-300'
                    }`}
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleShoeRenter(m.id)}
                      className="h-5 w-5"
                    />
                    <span className="break-words text-slate-700">{m.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm font-medium text-slate-900">
            {shoeRenters.length}명 · {formatKRW(total)}
          </p>
        </>
      )}
    </CollapsibleSection>
  );
}
