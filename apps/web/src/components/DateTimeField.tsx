'use client';
import {orderDay} from '@/lib/order-date';

type Props = {
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  id?: string;
  /** Подсказка времени при выборе только даты */
  defaultTime?: string;
  /** «Сегодня» / «Завтра» - только при создании заявки */
  showQuickPicks?: boolean;
};

function splitValue(value: string): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const [date = '', timePart = ''] = value.split('T');
  const time = timePart.slice(0, 5);
  return { date, time };
}

function joinValue(date: string, time: string): string {
  if (!date && !time) return '';
  if (!date) return '';
  if (!time) return `${date}T00:00`;
  return `${date}T${time}`;
}

export function DateTimeField({
  value,
  onChange,
  required,
  id,
  defaultTime = '10:00',
  showQuickPicks = false,
}: Props) {
  const { date, time } = splitValue(value);

  function setDate(nextDate: string) {
    const nextTime = time || (nextDate ? defaultTime : '');
    onChange(joinValue(nextDate, nextTime));
  }

  function setTime(nextTime: string) {
    onChange(joinValue(date, nextTime));
  }

  function pickDay(offset: number) {
    setDate(orderDay(offset));
  }

  return (
    <div className="datetime-field">
      <div className="datetime-field-row">
        <input
          id={id}
          type="date"
          required={required}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Дата"
        />
        <input
          type="time"
          required={required}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Время"
        />
      </div>
      {showQuickPicks ? (
        <div className="datetime-field-quick">
          <button type="button" className="btn-link" onClick={() => pickDay(0)}>
            Сегодня
          </button>
          <button type="button" className="btn-link" onClick={() => pickDay(1)}>
            Завтра
          </button>
        </div>
      ) : null}
    </div>
  );
}
