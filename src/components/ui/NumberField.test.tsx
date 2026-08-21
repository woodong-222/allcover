import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberField } from './NumberField';

describe('NumberField', () => {
  it('E3: inputMode="numeric"을 갖는다', () => {
    render(<NumberField label="게임 단가" value={0} onChange={() => {}} />);
    expect(screen.getByLabelText('게임 단가')).toHaveAttribute('inputMode', 'numeric');
  });

  it('E4: label과 htmlFor로 연결되어 접근 가능하다', () => {
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
});
