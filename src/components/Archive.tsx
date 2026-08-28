/**
 * 보관함 — 임시 저장한 정산을 꺼내거나 지운다.
 *
 * 저장은 사용자가 버튼을 눌러야만 일어나므로, 목록이 비어 있는 게 정상이다.
 * 그래서 평소에는 접혀 있고 저장한 게 있을 때만 펼친 채로 시작한다.
 */

import { useState } from 'react';
import { useArchiveStore, autoLabel, type ArchiveEntry } from '../store/useArchiveStore';
import { useSettlementStore } from '../store/useSettlementStore';
import { calculate } from '../lib/calc';
import { CollapsibleSection } from './ui/CollapsibleSection';

const HIT_AREA = 'min-h-11 min-w-11';

function savedAtText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}.${d.getDate()} ${hh}:${mm}`;
}

type RowProps = {
  entry: ArchiveEntry;
  onLoad: (entry: ArchiveEntry) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
};

function ArchiveRow({ entry, onLoad, onRemove, onRename }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.label);

  function commit(): void {
    setEditing(false);
    if (text.trim() && text !== entry.label) onRename(entry.id, text);
  }

  const inputId = `archive-label-${entry.id}`;
  const memberCount = entry.settlement.members.length;
  const roundCount = entry.settlement.rounds.length;

  return (
    <li
      data-testid="archive-entry"
      className="flex flex-col gap-2 rounded-lg border border-slate-300 p-3"
    >
      {editing ? (
        <>
          <label htmlFor={inputId} className="sr-only">
            보관함 이름 수정
          </label>
          <input
            id={inputId}
            autoFocus
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setText(entry.label);
                setEditing(false);
              }
            }}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-slate-900"
          />
        </>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`${entry.label} 이름 수정`}
          className={`${HIT_AREA} text-left text-sm font-medium text-slate-900`}
        >
          {entry.label}
        </button>
      )}

      <p className="text-xs text-slate-600">
        {savedAtText(entry.savedAt)} 저장 · {memberCount}명 · {roundCount}판
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onLoad(entry)}
          className={`${HIT_AREA} rounded-lg bg-blue-600 px-3 text-sm font-medium text-white`}
        >
          불러오기
        </button>
        <button
          type="button"
          onClick={() => onRemove(entry.id)}
          aria-label={`${entry.label} 삭제`}
          className={`${HIT_AREA} rounded-lg border border-red-300 px-3 text-sm font-medium text-red-700`}
        >
          삭제
        </button>
      </div>
    </li>
  );
}

export function Archive() {
  const entries = useArchiveStore((s) => s.entries);
  const save = useArchiveStore((s) => s.save);
  const rename = useArchiveStore((s) => s.rename);
  const remove = useArchiveStore((s) => s.remove);

  const settlement = useSettlementStore((s) => s.settlement);
  const loadSettlement = useSettlementStore((s) => s.loadSettlement);

  const hasContent = settlement.members.length > 0;

  function handleSave(): void {
    if (!hasContent) return;
    const { results } = calculate(settlement);
    const total = results.reduce((sum, r) => sum + r.rounded, 0);
    save({ label: autoLabel(settlement, total), settlement });
  }

  function handleLoad(entry: ArchiveEntry): void {
    // 지금 화면에 입력한 게 있으면 덮어쓰기 전에 물어본다. 불러오기는 되돌릴 수 없다.
    if (hasContent && !window.confirm('지금 입력한 정산을 덮어씁니다. 계속할까요?')) return;
    loadSettlement(entry.settlement);
  }

  return (
    <CollapsibleSection
      title="보관함"
      summary={entries.length > 0 ? `· ${entries.length}건` : '· 비어 있음'}
      defaultOpen={entries.length > 0}
    >
      <div className="flex flex-col gap-3">
        <div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasContent}
            className={`${HIT_AREA} rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400`}
          >
            지금 정산 임시 저장
          </button>
          {!hasContent && (
            <p className="mt-1 text-xs text-slate-600">참여자를 추가하면 저장할 수 있습니다.</p>
          )}
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-slate-700">
            저장한 정산이 없습니다. 진행 중인 정산은 자동으로 저장되지 않으니, 나중에 이어서 하려면
            임시 저장을 눌러주세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <ArchiveRow
                key={entry.id}
                entry={entry}
                onLoad={handleLoad}
                onRemove={remove}
                onRename={rename}
              />
            ))}
          </ul>
        )}
      </div>
    </CollapsibleSection>
  );
}
