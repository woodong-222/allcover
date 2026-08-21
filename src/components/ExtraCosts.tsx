/**
 * 기타 비용 항목 추가/삭제 + 분담 대상 지정.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 E1, E2, E3, E4 / §4 M3
 */

import { useState } from 'react';
import { useSettlementStore } from '../store/useSettlementStore';
import { NumberField } from './ui/NumberField';
import { formatKRW } from '../lib/format';
import type { Extra } from '../types';

export function ExtraCosts() {
  const members = useSettlementStore((s) => s.settlement.members);
  const extras = useSettlementStore((s) => s.settlement.extras);
  const addExtra = useSettlementStore((s) => s.addExtra);
  const removeExtra = useSettlementStore((s) => s.removeExtra);

  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState(0);
  const [splitAll, setSplitAll] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

  const canAdd = label.trim() !== '' && amount > 0 && (splitAll || selected.length > 0);

  function handleAdd(): void {
    if (!canAdd) return;
    const extra: Omit<Extra, 'id'> = {
      label: label.trim(),
      amount,
      splitAmong: splitAll ? 'all' : selected,
    };
    addExtra(extra);
    setLabel('');
    setAmount(0);
    setSplitAll(true);
    setSelected([]);
  }

  function toggleSelected(memberId: string): void {
    setSelected((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  }

  const total = extras.reduce((sum, e) => sum + e.amount, 0);

  return (
    <section className="rounded-xl border bg-white p-4">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">기타 비용</h2>

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

        <NumberField label="금액" value={amount} onChange={setAmount} suffix="원" />

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">분담 대상</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="분담 대상">
            <button
              type="button"
              aria-pressed={splitAll}
              onClick={() => setSplitAll(true)}
              className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${
                splitAll ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-slate-700'
              }`}
            >
              전체
            </button>
            <button
              type="button"
              aria-pressed={!splitAll}
              onClick={() => setSplitAll(false)}
              className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${
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

        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className="min-h-11 rounded-lg bg-blue-600 px-4 font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          추가
        </button>
      </div>

      {extras.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {extras.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{e.label}</p>
                <p className="text-sm text-slate-700">
                  {formatKRW(e.amount)} · {e.splitAmong === 'all' ? '전체' : `${e.splitAmong.length}명`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeExtra(e.id)}
                aria-label={`${e.label} 삭제`}
                className="min-h-11 min-w-11 shrink-0 rounded-lg border border-slate-300 px-3 text-slate-700"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-sm font-medium text-slate-900">총 기타비용: {formatKRW(total)}</p>
    </section>
  );
}
