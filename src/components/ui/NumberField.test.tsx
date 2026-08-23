import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberField } from './NumberField';

describe('NumberField', () => {
  it('E3: inputMode="numeric"을 갖는다', () => {
    render(<NumberField label="게임 단가" value={0} onChange={() => {}} />);
    expect(screen.getByLabelText('게임 단가')).toHaveAttribute('inputMode', 'numeric');
  });

  it('label과 htmlFor로 연결되어 접근 가능하다 (E4 전제조건, 실제 Tab 순회 검증은 a11y.test.tsx)', () => {
    render(<NumberField label="신발비" value={0} onChange={() => {}} />);
    expect(screen.getByLabelText('신발비')).toBeInTheDocument();
  });

  it('천 단위 콤마를 표시한다', () => {
    render(<NumberField label="금액" value={12000} onChange={() => {}} />);
    expect(screen.getByLabelText('금액')).toHaveValue('12,000');
  });

  it('숫자를 입력하면 콤마 없는 숫자 값으로 onChange가 호출된다', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberField label="금액" value={0} onChange={onChange} />);

    await user.type(screen.getByLabelText('금액'), '5000');

    expect(onChange).toHaveBeenLastCalledWith(5000);
  });

  it('음수 입력(마이너스)은 무시된다', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberField label="금액" value={0} onChange={onChange} />);

    await user.type(screen.getByLabelText('금액'), '-500');

    expect(onChange).toHaveBeenLastCalledWith(500);
    expect(screen.getByLabelText('금액')).toHaveValue('500');
  });

  it('빈 문자열로 지우면 0으로 처리된다', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberField label="금액" value={100} onChange={onChange} />);

    await user.clear(screen.getByLabelText('금액'));

    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('suffix가 있으면 표시된다', () => {
    render(<NumberField label="금액" value={0} onChange={() => {}} suffix="원" />);
    expect(screen.getByText('원')).toBeInTheDocument();
  });

  it('reviewer finding #3: 소수 value(payout 프리셋 등)를 받으면 정수로 표시하고, 한 글자만 입력해도 금액이 1,000배로 튀지 않는다', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    // PayoutEditor 승자독식 프리셋이 실제로 만들어내는 소수값 (7명 3팀, ante 1,000 사례).
    render(<NumberField label="배당" value={2333.3333333333335} onChange={onChange} />);

    const input = screen.getByLabelText('배당');
    // 표시값은 항상 정수여야 한다 — 소수점이 화면에 남아있으면 안 된다.
    expect(input).toHaveValue('2,334');

    await user.type(input, '5');

    const lastValue = onChange.mock.calls.at(-1)?.[0] as number;
    // 버그가 있었다면 "2333.333" 문자열에서 소수점이 지워져 2,333,335 근처(약 1,000배)로 튀었다.
    // 정상 동작은 정수 "2334" 뒤에 입력한 자리 하나가 더 붙는 수준(23345)이어야 한다.
    expect(lastValue).toBeLessThan(100_000); // 1,000배로 튀면 백만 단위가 된다
    expect(lastValue).toBe(23345);
  });
});

describe('NumberField — 상한 클램프 (2026-08-23 보안 검토 MEDIUM)', () => {
  it('기본 상한 1억을 넘는 값은 잘려서 저장되고 화면 표시도 함께 잘린다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField label="배당" value={0} onChange={onChange} />);

    const input = screen.getByLabelText('배당');
    await user.type(input, '999999999999');

    // 상한이 없으면 이 값이 그대로 상태에 들어가 PayoutEditor 의 탐색 루프를 폭발시킨다.
    expect(onChange).toHaveBeenLastCalledWith(100_000_000);
    // 저장값과 화면이 어긋나면 사용자가 무엇이 반영됐는지 알 수 없다
    expect((input as HTMLInputElement).value).toBe('100,000,000');
  });

  it('상한 이하 값은 그대로 통과한다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField label="배당" value={0} onChange={onChange} />);

    await user.type(screen.getByLabelText('배당'), '4000');
    expect(onChange).toHaveBeenLastCalledWith(4000);
  });

  it('max 를 직접 넘기면 그 값이 적용된다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField label="배당" value={0} onChange={onChange} max={500} />);

    await user.type(screen.getByLabelText('배당'), '9999');
    expect(onChange).toHaveBeenLastCalledWith(500);
  });
});
