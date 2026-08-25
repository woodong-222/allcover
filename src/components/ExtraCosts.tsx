/**
 * 기타 비용 항목 추가/삭제 + 사람별 금액 지정.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 E1, E2, E3, E4 / §4 M3
 *
 * `Extra` 가 사람별 금액 맵(`amounts`)으로 바뀌면서(2026-08-24) 이 화면의 역할도 바뀌었다.
 * "총액 + 분담 대상" 은 이제 **균등 금액을 계산하는 도구**일 뿐이고, 저장되는 것은 언제나
 * memberId -> 금액 맵이다. 균등 분배는 같은 값을 채워 넣은 특수한 경우다.
 *
 * 그래서 "개별 금액 입력" 토글은 별도 저장 모드가 아니라 **입력 편의**에 불과하다.
 * 꺼져 있으면 전원 같은 금액, 켜면 사람별로 고친 금액이 그대로 들어간다.
 *
 * 개별 금액은 `overrides`(사용자가 실제로 고친 사람만)로 들고, 안 고친 사람은 균등 금액을
 * 그대로 따라간다. 스냅샷을 떠서 들고 있으면 총액이나 분담 대상을 나중에 바꿨을 때
 * 화면의 숫자가 총액과 어긋난 채 굳어버린다.
 *
 * 기타 비용은 있을 수도 없을 수도 있는 선택 항목이라 `CollapsibleSection`(네이티브
 * `<details>`/`<summary>`)으로 접고 편다. `defaultOpen` 은 렌더 시점의 펼침만 결정하고
 * 그 뒤 사용자가 누른 open/close 는 React 가 되돌리지 않는다.
 */

import { useState } from 'react';
import { useSettlementStore } from '../store/useSettlementStore';
import { NumberField } from './ui/NumberField';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { formatKRW } from '../lib/format';
import { splitEvenly } from '../lib/money';
import type { Member } from '../types';

type Payer = { name: string; amount: number };

/**
 * 실제로 청구되는 사람만 뽑는다. 판정 기준을 `calc.ts` 와 맞춘다 — 모르는 id 와 0원은
 * 청구되지 않으므로 목록에도 나오면 안 된다. 순서는 멤버 등록 순서를 따른다.
 */
function payersOf(amounts: Record<string, number>, members: Member[]): Payer[] {
  return members
    .filter((m) => (amounts[m.id] ?? 0) > 0)
    .map((m) => ({ name: m.name, amount: amounts[m.id] }));
}

/** 전원 같은 금액이면 "가·나·다 각 3,334원", 다르면 "가 2,000원 / 나 2,500원" */
function describePayers(payers: Payer[]): string {
  if (payers.length === 0) return '';
  // 혼자 내는 항목에 "각" 을 붙이면 어색하다.
  if (payers.length === 1) return `${payers[0].name} ${formatKRW(payers[0].amount)}`;
  const first = payers[0].amount;
  if (payers.every((p) => p.amount === first)) {
    return `${payers.map((p) => p.name).join('·')} 각 ${formatKRW(first)}`;
  }
  return payers.map((p) => `${p.name} ${formatKRW(p.amount)}`).join(' / ');
}

function sumOf(amounts: Record<string, number>): number {
  return Object.values(amounts).reduce((acc, v) => acc + v, 0);
}

export function ExtraCosts() {
  const members = useSettlementStore((s) => s.settlement.members);
  const extras = useSettlementStore((s) => s.settlement.extras);
  const addExtra = useSettlementStore((s) => s.addExtra);
  const setExtraAmounts = useSettlementStore((s) => s.setExtraAmounts);
  const removeExtra = useSettlementStore((s) => s.removeExtra);

  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState(0);
  const [splitAll, setSplitAll] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [perPerson, setPerPerson] = useState(false);
  /** 사용자가 직접 고친 사람만 담는다. 나머지는 균등 금액을 따라간다 */
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  /** 사람별 금액을 고치는 중인 항목. 한 번에 하나만 연다 */
  const [editingId, setEditingId] = useState<string | null>(null);

  // `selected` 가 아니라 `members` 를 걸러 순서를 등록 순으로 고정한다. 체크한 순서대로
  // 입력칸이 튀어다니면 몇 명만 고치는 흐름에서 엉뚱한 칸을 건드리게 된다.
  const targets = splitAll ? members : members.filter((m) => selected.includes(m.id));
  // 균등 분배는 반드시 splitEvenly 를 거친다. 전원이 같은 금액을 내도록 올리는 이 앱의
  // 분배 규칙이고, Math.floor 로 직접 나누면 한 명만 1원 덜 내는 옛 동작으로 되돌아간다.
  const evenShare = splitEvenly(amount, targets.length)[0] ?? 0;
  const draftAmounts: Record<string, number> = Object.fromEntries(
    targets.map((m) => [m.id, perPerson ? overrides[m.id] ?? evenShare : evenShare])
  );
  const draftSum = sumOf(draftAmounts);

  // 낼 사람이 아무도 없으면(=합이 0) 추가해봐야 정산에 잡히지 않는다.
  const canAdd = label.trim() !== '' && draftSum > 0;
  const total = extras.reduce((sum, e) => sum + sumOf(e.amounts), 0);

  function handleAdd(): void {
    if (!canAdd) return;
    addExtra({ label: label.trim(), amounts: draftAmounts });
    setLabel('');
    setAmount(0);
    setSplitAll(true);
    setSelected([]);
    setPerPerson(false);
    setOverrides({});
  }

  function toggleSelected(memberId: string): void {
    setSelected((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  }

  return (
    <CollapsibleSection
      title="기타 비용"
      summary={extras.length > 0 ? `· ${extras.length}건 · ${formatKRW(total)}` : '· 선택 사항'}
      defaultOpen={extras.length > 0}
    >
      <div>
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="extra-label" className="mb-1 block text-sm font-medium text-slate-700">
              항목명
            </label>
            <input
              id="extra-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="예: 간식비"
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
            />
          </div>

          <NumberField id="extra-amount" label="총액" value={amount} onChange={setAmount} suffix="원" />

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">분담 대상</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="분담 대상">
              <button
                type="button"
                aria-pressed={splitAll}
                onClick={() => setSplitAll(true)}
                className={`min-h-11 min-w-11 rounded-lg border px-3 text-sm font-medium ${
                  splitAll ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-slate-700'
                }`}
              >
                전체
              </button>
              <button
                type="button"
                aria-pressed={!splitAll}
                onClick={() => setSplitAll(false)}
                className={`min-h-11 min-w-11 rounded-lg border px-3 text-sm font-medium ${
                  !splitAll ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-slate-700'
                }`}
              >
                지정 멤버
              </button>
            </div>

            {!splitAll && (
              <div className="mt-2 flex flex-wrap gap-2">
                {members.map((m) => {
                  const checked = selected.includes(m.id);
                  const inputId = `extra-target-${m.id}`;
                  return (
                    <label
                      key={m.id}
                      htmlFor={inputId}
                      className={`flex min-h-11 min-w-11 items-center gap-2 rounded-lg border px-3 ${
                        checked ? 'border-blue-600 bg-blue-50' : 'border-slate-300'
                      }`}
                    >
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelected(m.id)}
                        className="h-5 w-5"
                      />
                      <span className="break-words text-slate-700">{m.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="extra-per-person"
              className="flex min-h-11 min-w-11 items-center gap-2 rounded-lg border border-slate-300 px-3"
            >
              <input
                id="extra-per-person"
                type="checkbox"
                checked={perPerson}
                onChange={(e) => setPerPerson(e.target.checked)}
                className="h-5 w-5"
              />
              <span className="text-sm font-medium text-slate-700">개별 금액 입력</span>
            </label>

            {perPerson && (
              <div className="mt-2 flex flex-col gap-2">
                {targets.length === 0 ? (
                  <p className="text-sm text-slate-500">분담 대상을 먼저 고르세요.</p>
                ) : (
                  <>
                    {targets.map((m) => (
                      <NumberField
                        key={m.id}
                        id={`extra-share-${m.id}`}
                        label={`${m.name} 금액`}
                        value={draftAmounts[m.id]}
                        onChange={(v) => setOverrides((prev) => ({ ...prev, [m.id]: v }))}
                        suffix="원"
                      />
                    ))}
                    {/* 총액과 어긋날 수 있으므로 실시간 합계를 보여준다 — 저장되는 건 이 합계다 */}
                    <p className="text-sm font-medium text-slate-900">
                      입력 합계: {formatKRW(draftSum)}
                    </p>
                    {amount > 0 && draftSum !== amount && (
                      <p className="text-sm text-amber-700">총액 {formatKRW(amount)}과 다릅니다</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={!canAdd}
            className="min-h-11 min-w-11 rounded-lg bg-blue-600 px-4 font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            추가
          </button>
        </div>

        {extras.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {extras.map((e) => {
              const payers = payersOf(e.amounts, members);
              const editing = editingId === e.id;
              return (
                <li
                  key={e.id}
                  className={`rounded-lg border px-3 py-2 ${
                    payers.length === 0 ? 'border-amber-400 bg-amber-50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium text-slate-900">{e.label}</p>
                      {payers.length === 0 ? (
                        // 아무에게도 청구되지 않는 항목. 결과 카드에도 미수금 경고가 뜨지만
                        // 고칠 수 있는 곳은 여기이므로 입력 화면에서 먼저 드러낸다 (F3).
                        <p className="break-words text-sm font-medium text-amber-800">
                          낼 사람이 없어 정산에 반영되지 않아요
                        </p>
                      ) : (
                        <p className="break-words text-sm text-slate-700">
                          {formatKRW(sumOf(e.amounts))} · {describePayers(payers)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(editing ? null : e.id)}
                        aria-label={`${e.label} 금액 수정`}
                        aria-expanded={editing}
                        className="min-h-11 min-w-11 rounded-lg border border-slate-300 px-3 text-slate-700"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (editing) setEditingId(null);
                          removeExtra(e.id);
                        }}
                        aria-label={`${e.label} 삭제`}
                        className="min-h-11 min-w-11 rounded-lg border border-slate-300 px-3 text-slate-700"
                      >
                        삭제
                      </button>
                    </div>
                  </div>

                  {editing && (
                    <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3">
                      {members.length === 0 ? (
                        <p className="text-sm text-slate-500">멤버를 먼저 추가하세요.</p>
                      ) : (
                        <>
                          {members.map((m) => (
                            <NumberField
                              key={m.id}
                              id={`extra-${e.id}-share-${m.id}`}
                              // 추가 폼의 "가 금액" 과 겹치지 않도록 항목명을 붙인다.
                              label={`${e.label} · ${m.name} 금액`}
                              value={e.amounts[m.id] ?? 0}
                              onChange={(v) => setExtraAmounts(e.id, { ...e.amounts, [m.id]: v })}
                              suffix="원"
                            />
                          ))}
                          <p className="text-sm font-medium text-slate-900">
                            합계: {formatKRW(sumOf(e.amounts))}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-3 text-sm font-medium text-slate-900">총 기타비용: {formatKRW(total)}</p>
      </div>
    </CollapsibleSection>
  );
}
