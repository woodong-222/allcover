/**
 * 송금 안내 리스트.
 * 계획서: .omc/plans/2026-08-21-allcover-bowling-settlement.md §4 M4
 *
 * ResultCard(캡처 대상)의 하위 컴포넌트이므로 이 파일도 R1 규칙(색은 src/index.css의
 * hex CSS 변수 --card-* 만 사용, Tailwind 색상 유틸 금지)을 그대로 따른다.
 *
 * 총무 미지정(그리디 최소 송금) 모드에 대한 안내:
 * settleTransfers()가 treasurerId 없이 계산되면, 채무자는 자신의 rounded 금액 중
 * 채권자 총액을 넘는 부분은 송금 목록에 포함하지 못한다(Σ송금액 === min(총채무, 총채권)).
 * 그 남은 잔액은 "각자 카운터에서 결제"하는 것으로 간주하므로, 그 사실을 사용자에게
 * 명시적으로 알려야 한다 (숨기지 않는다 원칙, R4와 동일한 맥락).
 * 총무가 지정된 모드는 전액이 총무에게 모이므로 이 안내가 필요 없다.
 */

import { formatKRW } from '../lib/format';

export type Transfer = { from: string; to: string; amount: number };

export type TransferListProps = {
  transfers: Transfer[];
  memberNames: Record<string, string>;
  treasurerId?: string;
};

export function TransferList({ transfers, memberNames, treasurerId }: TransferListProps) {
  const nameOf = (id: string) => memberNames[id] ?? id;

  return (
    <div data-testid="transfer-list">
      <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--card-muted)' }}>
        {treasurerId ? `모두 ${nameOf(treasurerId)}에게 보내주세요` : '송금 안내'}
      </p>

      {transfers.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {transfers.map((t, i) => (
            <li key={`${t.from}-${t.to}-${i}`} data-testid="transfer-row">
              {nameOf(t.from)} → {nameOf(t.to)}{' '}
              <strong style={{ color: 'var(--card-accent)' }}>{formatKRW(t.amount)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: 'var(--card-muted)' }}>
          정산할 금액이 없습니다
        </p>
      )}

      {!treasurerId && (
        <p
          data-testid="greedy-remainder-note"
          className="mt-2 text-xs"
          style={{ color: 'var(--card-muted)' }}
        >
          목록에 없는 잔액은 각자 카운터에서 결제하세요.
        </p>
      )}
    </div>
  );
}
