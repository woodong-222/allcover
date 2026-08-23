/**
 * 멤버 추가/수정/삭제 + 최근 멤버 이름 칩.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §3 인수조건 E1, E2, E3, E4 / §4 M3
 *
 * 참여자 목록은 줄바꿈되는 칩(flex-wrap)이다. 이름이 보통 2~3글자인데 한 줄 전체 폭을 쓰는
 * 입력행 구조였던 이전 버전은 멤버가 8~10명(볼링 모임 기본 규모)만 돼도 세로 스크롤을
 * 통째로 잡아먹었다 (사용자 리포트). 칩 이름을 탭하면 그 자리에서 바로 수정할 수 있다.
 *
 * "참여자" 칩(현재 멤버)과 "최근 멤버" 칩(빠른 추가용)은 역할이 반대다 — 하나는 이미 들어있는
 * 걸 보여주고 지우는 용도, 하나는 없는 걸 눌러서 넣는 용도. 실선/점선 테두리와 섹션 라벨로
 * 구분한다.
 */

import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useSettlementStore } from '../store/useSettlementStore';
import { usePrefsStore } from '../store/usePrefsStore';

type MemberChipProps = {
  id: string;
  name: string;
  duplicate: boolean;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
};

function MemberChip({ id, name, duplicate, onRename, onRemove }: MemberChipProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(name);

  // 스토어의 실제 이름이 바뀌면(다른 곳에서 변경되거나 rename이 반영된 경우) 로컬 편집
  // 상태를 다시 맞춘다. 편집 중이 아닐 때만 의미가 있지만, 편집 중에도 name이 바뀌는
  // 경로는 없으므로 항상 동기화해도 안전하다.
  useEffect(() => {
    setText(name);
  }, [name]);

  function commit(): void {
    setEditing(false);
    if (text.trim() === '' || text === name) return;
    onRename(id, text);
  }

  function cancel(): void {
    setText(name);
    setEditing(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  const inputId = `member-name-${id}`;

  return (
    <li
      className={`inline-flex min-h-11 min-w-11 items-center gap-1 rounded-full border py-1 pl-1 pr-1 ${
        duplicate ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'
      }`}
    >
      {editing ? (
        <>
          <label htmlFor={inputId} className="sr-only">
            {name || '멤버'} 이름 수정
          </label>
          <input
            id={inputId}
            autoFocus
            type="text"
            value={text}
            size={Math.max(2, text.length + 1)}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commit}
            className="min-h-9 min-w-0 max-w-[10rem] rounded-full border border-slate-300 px-2 text-slate-900"
          />
        </>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="min-h-9 max-w-[8rem] truncate rounded-full px-2 text-sm font-medium text-slate-800"
        >
          {name}
        </button>
      )}
      {duplicate && (
        <span className="shrink-0 px-1 text-xs font-medium text-amber-700" title="이름이 중복돼요">
          중복
        </span>
      )}
      <button
        type="button"
        onClick={() => onRemove(id)}
        aria-label={`${name || '멤버'} 삭제`}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-slate-500"
      >
        <span aria-hidden="true">×</span>
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

      <div className="mb-4 flex gap-2">
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
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-slate-500">최근 멤버 · 탭해서 빠르게 추가</p>
          <ul className="flex flex-wrap gap-2">
            {recentMemberNames.map((n) => {
              const already = memberNameSet.has(n);
              return (
                <li key={n}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => addMember(n)}
                    className={`min-h-11 min-w-11 rounded-full border border-dashed px-3 text-sm font-medium ${
                      already
                        ? 'cursor-not-allowed border-slate-200 text-slate-400'
                        : 'border-slate-400 text-slate-700'
                    }`}
                  >
                    {n}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        {members.length === 0 ? (
          <p className="text-sm text-slate-700">멤버를 추가해주세요.</p>
        ) : (
          <>
            <p className="mb-2 text-xs font-medium text-slate-500">참여자 ({members.length}명)</p>
            <ul className="flex flex-wrap gap-2">
              {members.map((m) => (
                <MemberChip
                  key={m.id}
                  id={m.id}
                  name={m.name}
                  duplicate={(nameCounts.get(m.name) ?? 0) > 1}
                  onRename={renameMember}
                  onRemove={removeMember}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
