import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSettlementStore } from './store/useSettlementStore';
import { calculate } from './lib/calc';
import { createCapturer } from './lib/capture';
import { shareImage, downloadBlob, copyText, type ShareOutcome } from './lib/share';
import { buildSummaryText } from './lib/summaryText';
import { todayFilename } from './lib/format';
import { subscribePersistence, getPersistenceSnapshot } from './lib/storage';
import { MemberEditor } from './components/MemberEditor';
import { FeeSettings } from './components/FeeSettings';
import { ShoeRentalPicker } from './components/ShoeRentalPicker';
import { RoundList } from './components/RoundList';
import { ExtraCosts } from './components/ExtraCosts';
import { ResultCard } from './components/ResultCard';
import { ShareBar } from './components/ShareBar';

/** 입력이 멈춘 뒤 이만큼 지나면 공유용 PNG를 다시 만든다 */
const CAPTURE_DEBOUNCE_MS = 400;

export default function App() {
  const settlement = useSettlementStore((s) => s.settlement);
  const resetSession = useSettlementStore((s) => s.resetSession);
  const setMode = useSettlementStore((s) => s.setMode);

  const cardRef = useRef<HTMLDivElement>(null);

  /**
   * 캡처 결과를 state 가 아니라 ref 로도 들고 있는다.
   * 공유 버튼 클릭 핸들러는 await 없이 즉시 shareImage 를 호출해야 하는데(R2),
   * 그러려면 렌더 시점의 state 클로저가 아니라 항상 최신 blob 을 봐야 한다.
   */
  const blobRef = useRef<Blob | null>(null);
  const [captureReady, setCaptureReady] = useState(false);
  const [outcome, setOutcome] = useState<ShareOutcome | undefined>(undefined);

  /**
   * 마운트 시 한 번만 판정하면 안 된다. 사파리 프라이빗 모드는 처음부터 막혀 있어 잡히지만
   * **quota 초과는 세션 중간에 발생**하므로, 그때 배너가 뜨지 않으면 사용자는 조용히
   * 데이터를 잃는다 (인수조건 C4).
   */
  const persistenceOk = useSyncExternalStore(
    subscribePersistence,
    getPersistenceSnapshot,
    getPersistenceSnapshot
  );

  const { results, breakdowns, totalImbalance } = useMemo(
    () => calculate(settlement),
    [settlement]
  );

  /** 그날 실제 결제 총액 */
  const total = useMemo(() => results.reduce((sum, r) => sum + r.rounded, 0), [results]);

  const hasMembers = settlement.members.length > 0;

  /**
   * 결과가 바뀔 때마다 PNG 를 미리 만들어 둔다 (D1).
   * 클릭 시점에 캡처를 시작하면 iOS Safari 가 user activation 을 잃어 공유 시트가 안 뜬다.
   */
  useEffect(() => {
    if (!hasMembers) {
      blobRef.current = null;
      setCaptureReady(false);
      return;
    }
    setCaptureReady(false);
    setOutcome(undefined);

    let cancelled = false;
    const timer = setTimeout(() => {
      const node = cardRef.current;
      if (!node) return;
      void createCapturer(node)
        .capture()
        .then((blob) => {
          if (cancelled) return;
          blobRef.current = blob;
          setCaptureReady(true);
        })
        .catch(() => {
          if (cancelled) return;
          blobRef.current = null;
          setCaptureReady(false);
        });
    }, CAPTURE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hasMembers, results, breakdowns, totalImbalance, settlement]);

  const filename = useMemo(() => todayFilename('allcover'), []);

  // await 없이 즉시 shareImage 를 호출한다. 여기에 await 를 넣으면 iOS 에서 공유가 죽는다 (R2).
  const handleShare = useCallback(() => {
    const blob = blobRef.current;
    if (!blob) return;
    void shareImage(blob, filename, 'allcover 정산').then(setOutcome);
  }, [filename]);

  const handleDownload = useCallback(() => {
    const blob = blobRef.current;
    if (!blob) return;
    downloadBlob(blob, filename);
    setOutcome('downloaded');
  }, [filename]);

  const handleCopyText = useCallback(() => {
    const memberNames = Object.fromEntries(settlement.members.map((m) => [m.id, m.name]));
    const text = buildSummaryText({
      date: settlement.date,
      memberNames,
      results,
      total,
    });
    void copyText(text);
  }, [settlement.members, settlement.date, results, total]);

  const handleReset = useCallback(() => {
    if (window.confirm('지금 정산 내역을 지우고 새로 시작할까요? 요금 설정은 그대로 남습니다.')) {
      resetSession();
    }
  }, [resetSession]);

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">🎳 allcover</h1>

          <div className="flex items-center gap-2">
            {/*
              모드는 판마다가 아니라 정산 전체에 걸리는 설정이라 헤더에 둔다.
              전환은 비파괴적이다 — 정산 모드로 바꿔도 입력해둔 순위·배당은 지워지지 않고
              계산에서만 빠진다. 잘못 눌렀을 때 되돌릴 수 없으면 안 되기 때문이다.
            */}
            <div
              role="radiogroup"
              aria-label="정산 방식"
              className="flex rounded-lg border border-slate-300 p-0.5"
            >
              {(
                [
                  ['normal', '정산'],
                  ['bet', '내기'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={settlement.mode === value}
                  onClick={() => setMode(value)}
                  className={`min-h-11 rounded-md px-4 text-sm font-medium ${
                    settlement.mode === value
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700"
            >
              새 정산
            </button>
          </div>
        </div>
      </header>

      {!persistenceOk && (
        <p className="bg-amber-100 px-4 py-2 text-sm text-amber-900">
          이 브라우저에서는 저장이 막혀 있어 새로고침하면 입력한 내용이 사라집니다.
        </p>
      )}

      <main className="mx-auto max-w-5xl px-4 py-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <MemberEditor />
          <FeeSettings />
          <ShoeRentalPicker />
          <RoundList />
          <ExtraCosts />
        </div>

        <div className="mt-4 flex flex-col gap-4 lg:sticky lg:top-4 lg:mt-0">
          {hasMembers ? (
            <>
              <ShareBar
                onShare={handleShare}
                onDownload={handleDownload}
                onCopyText={handleCopyText}
                ready={captureReady}
                outcome={outcome}
              />
              {/* 카드는 캡처 일관성을 위해 540px 고정이라 좁은 화면에서는 카드 자체가 가로 스크롤된다 (E1) */}
              <div className="overflow-x-auto">
                <ResultCard
                  ref={cardRef}
                  settlement={settlement}
                  results={results}
                  breakdowns={breakdowns}
                  totalImbalance={totalImbalance}
                />
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              먼저 참여자 이름을 추가해주세요.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
