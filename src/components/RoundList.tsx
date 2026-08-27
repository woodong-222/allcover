/**
 * 판 목록 + 판 추가 버튼.
 *
 * 판 번호는 1부터 매기고, 새 판은 스토어의 addRound가 직전 판 구성(참여자·팀·방식·판돈)을 상속한다.
 */

import { useSettlementStore } from '../store/useSettlementStore';
import { RoundCard } from './RoundCard';

const HIT_AREA = 'min-h-[44px] min-w-[44px]';

export function RoundList() {
  const rounds = useSettlementStore((s) => s.settlement.rounds);
  const addRound = useSettlementStore((s) => s.addRound);

  return (
    <section aria-label="판 목록" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">판</h2>
        <button
          type="button"
          onClick={addRound}
          className={`${HIT_AREA} rounded-lg bg-blue-600 px-4 py-2 font-medium text-white`}
        >
          판 추가
        </button>
      </div>

      {rounds.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-400 px-4 py-6 text-center text-sm text-slate-600">
          아직 판이 없습니다. 위의 “판 추가”를 눌러 첫 판을 만들어 주세요.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rounds.map((round, i) => (
            <RoundCard key={round.id} round={round} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
