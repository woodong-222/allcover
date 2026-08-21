/**
 * 멤버 추가/수정/삭제 + 최근 멤버 이름 칩.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 E2, E3, E4 / §4 M3
 */

import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useSettlementStore } from '../store/useSettlementStore';
import { usePrefsStore } from '../store/usePrefsStore';

type MemberRowProps = {
  id: string;
  name: string;
  duplicate: boolean;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
};

function MemberRow({ id, name, duplicate, onRename, onRemove }: MemberRowProps) {
  // renameMember는 트림 결과가 빈 문자열이면 스토어를 갱신하지 않는다.
  // 로컬 상태를 따로 두어 사용자가 이름을 완전히 지우고 새로 입력하는 도중에도
  // 입력창이 스토어 값으로 되돌아가지 않게 한다.
  const [text, setText] = useState(name);

  useEffect(() => {
    setText(name);
  }, [name]);

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    setText(e.target.value);
    onRename(id, e.target.value);
  }

  const inputId = `member-name-${id}`;

  return (
    <li className="flex items-center gap-2">
      <label htmlFor={inputId} className="sr-only">
        {name || '멤버'} 이름 수정
      </label>
      <input
        id={inputId}
        type="text"
        value={text}
        onChange={handleChange}
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
      />
      {duplicate && (
        <span className="shrink-0 text-sm text-amber-700" title="이름이 중복돼요">
          중복
        </span>
      )}
      <button
        type="button"
        onClick={() => onRemove(id)}
        aria-label={`${name || '멤버'} 삭제`}
        className="min-h-11 min-w-11 shrink-0 rounded-lg border border-slate-300 px-3 text-slate-700"
      >
        삭제
      </button>
    </li>
  );
}

export function MemberEditor() {
  const members = useSettlementStore((s) => s.settlement.members);
  const addMember = useSettlementStore((s) => s.addMember);
  const removeMember = useSettlementStore((s) => s.removeMember);
  const renameMember = useSettlementStore((s) => s.renameMember);
  const recentMemberNames = usePrefsStore((s) => s.recentMemberNames);

  const [name, setName] = useState('');

  const memberNameSet = new Set(members.map((m) => m.name));
  const nameCounts = new Map<string, number>();
  for (const m of members) nameCounts.set(m.name, (nameCounts.get(m.name) ?? 0) + 1);

  function handleAdd(): void {
    if (!name.trim()) return;
    addMember(name);
    setName('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <section className="rounded-xl border bg-white p-4">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">멤버</h2>

      <div className="mb-3 flex gap-2">
        <label htmlFor="member-name-input" className="sr-only">
          멤버 이름
        </label>
        <input
          id="member-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="이름 입력"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!name.trim()}
          className="min-h-11 min-w-11 shrink-0 rounded-lg bg-blue-600 px-4 font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          추가
        </button>
      </div>

      {recentMemberNames.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {recentMemberNames.map((n) => {
            const already = memberNameSet.has(n);
            return (
              <button
                key={n}
                type="button"
                disabled={already}
                onClick={() => addMember(n)}
                className={`min-h-11 min-w-11 rounded-full border px-3 text-sm font-medium ${
                  already
                    ? 'cursor-not-allowed border-slate-200 text-slate-400'
                    : 'border-slate-300 text-slate-700'
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      )}

      {members.length === 0 ? (
        <p className="text-sm text-slate-700">멤버를 추가해주세요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              id={m.id}
              name={m.name}
              duplicate={(nameCounts.get(m.name) ?? 0) > 1}
              onRename={renameMember}
              onRemove={removeMember}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
