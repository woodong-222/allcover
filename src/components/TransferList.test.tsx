import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransferList } from './TransferList';

const memberNames = { m1: '김철수', m2: '이영희', m3: '박민수' };

describe('TransferList', () => {
  it('transfers를 "from -> to  금액" 형태로 렌더한다', () => {
    render(
      <TransferList
        transfers={[{ from: 'm2', to: 'm1', amount: 5000 }]}
        memberNames={memberNames}
      />,
    );
    const row = screen.getByTestId('transfer-row');
    expect(row).toHaveTextContent('이영희 → 김철수');
    expect(row).toHaveTextContent('5,000원');
  });

  it('총무 모드면 "모두 -> 총무" 안내 문구를 헤더에 표시한다', () => {
    render(
      <TransferList
        transfers={[{ from: 'm2', to: 'm1', amount: 5000 }]}
        memberNames={memberNames}
        treasurerId="m1"
      />,
    );
    expect(screen.getByText('모두 김철수에게 보내주세요')).toBeInTheDocument();
  });

  it('transfers가 비어 있으면 "정산할 금액이 없습니다"를 보여준다', () => {
    render(<TransferList transfers={[]} memberNames={memberNames} />);
    expect(screen.getByText('정산할 금액이 없습니다')).toBeInTheDocument();
  });

  it('treasurerId가 없으면 그리디 모드 잔액 안내 문구를 노출한다', () => {
    render(
      <TransferList
        transfers={[{ from: 'm1', to: 'm2', amount: 3000 }]}
        memberNames={memberNames}
      />,
    );
    expect(screen.getByTestId('greedy-remainder-note')).toHaveTextContent(
      '목록에 없는 잔액은 각자 카운터에서 결제하세요.',
    );
  });

  it('treasurerId가 있으면 그리디 모드 잔액 안내 문구를 노출하지 않는다', () => {
    render(
      <TransferList
        transfers={[{ from: 'm2', to: 'm1', amount: 5000 }]}
        memberNames={memberNames}
        treasurerId="m1"
      />,
    );
    expect(screen.queryByTestId('greedy-remainder-note')).not.toBeInTheDocument();
  });
});
