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
import { getPersistenceSnapshot } from '../lib/storage';
import { CollapsibleSection } from './ui/CollapsibleSection';

const HIT_AREA = 'min-h-11 min-w-11';
const SAVE_HINT_ID = 'archive-save-hint';

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
  onRemove: (entry: ArchiveEntry) => void;
  onRename: (id: string, label: string) => void;
};

function ArchiveRow({ entry, onLoad, onRemove, onRename }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.label);

  function commit(): void {
    setEditing(false);
    // 스토어도 trim 하지만 여기서 먼저 맞춰둔다. 안 그러면 편집기를 다시 열었을 때 목록에
    // 보이는 이름과 다른 값(공백 붙은 원본)이 뜨고, 고친 게 없는데도 rename 이 또 나간다.
    const next = text.trim();
    setText(next);
    if (next && next !== entry.label) onRename(entry.id, next);
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
          onClick={() => {
            // 목록의 이름이 밖에서 바뀌었을 수 있으니 편집을 열 때 현재 값으로 맞춘다
            setText(entry.label);
            setEditing(true);
          }}
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
          aria-label={`${entry.label} 불러오기`}
          className={`${HIT_AREA} rounded-lg bg-blue-600 px-3 text-sm font-medium text-white`}
        >
          불러오기
        </button>
        <button
          type="button"
          onClick={() => onRemove(entry)}
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

  /**
   * 펼침 여부는 마운트 시점에 한 번만 정한다.
   *
   * `entries.length > 0` 을 그대로 넘기면 파생 상태가 되어, 마지막 보관본을 지우는 순간 값이
   * true -> false 로 바뀌고 React 가 DOM 의 `open` 을 도로 지운다. 사용자가 보고 있던 섹션이
   * 눈앞에서 접힌다.
   */
  const [initiallyOpen] = useState(() => entries.length > 0);

  /** 저장·삭제 결과. 남기지 않으면 스크린리더는 아무 일도 안 일어난 것으로 읽는다 */
  const [status, setStatus] = useState<string | null>(null);

  function handleSave(): void {
    if (!hasContent) return;
    const { results } = calculate(settlement);
    const total = results.reduce((sum, r) => sum + r.rounded, 0);
    save({ label: autoLabel(settlement, total), settlement });

    // 저장 공간이 가득 차면 목록에는 새 줄이 보이지만 실제로는 안 남는다. 메모리에만 있다가
    // 다음에 열면 사라지므로, 성공처럼 보이게 두지 말고 그 자리에서 알린다.
    setStatus(
      getPersistenceSnapshot()
        ? '저장했습니다.'
        : '저장하지 못했습니다. 이 브라우저의 저장 공간이 가득 찼습니다.'
    );
  }

  function handleLoad(entry: ArchiveEntry): void {
    // 지금 화면에 입력한 게 있으면 덮어쓰기 전에 물어본다. 불러오기는 되돌릴 수 없다.
    if (hasContent && !window.confirm('지금 입력한 정산을 덮어씁니다. 계속할까요?')) return;
    loadSettlement(entry.settlement);
    setStatus(`"${entry.label}" 을(를) 불러왔습니다.`);
  }

  function handleRemove(entry: ArchiveEntry): void {
    // 불러오기와 달리 이쪽은 유일한 사본을 없앤다. 되돌리기가 없으니 더 물어봐야 한다.
    if (!window.confirm(`"${entry.label}" 을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    remove(entry.id);
    setStatus(`"${entry.label}" 을(를) 삭제했습니다.`);
  }

  return (
    <CollapsibleSection
      title="보관함"
      summary={entries.length > 0 ? `· ${entries.length}건` : '· 비어 있음'}
      defaultOpen={initiallyOpen}
    >
      <div className="flex flex-col gap-3">
        <div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasContent}
            aria-describedby={hasContent ? undefined : SAVE_HINT_ID}
            className={`${HIT_AREA} rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400`}
          >
            지금 정산 임시 저장
          </button>
          {!hasContent && (
            <p id={SAVE_HINT_ID} className="mt-1 text-xs text-slate-600">
              참여자를 추가하면 저장할 수 있습니다.
            </p>
          )}
          <p role="status" aria-live="polite" className="mt-1 text-xs text-slate-600">
            {status}
          </p>
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
                onRemove={handleRemove}
                onRename={rename}
              />
            ))}
          </ul>
        )}
      </div>
    </CollapsibleSection>
  );
}
