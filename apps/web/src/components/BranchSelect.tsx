'use client';

import { useEffect } from 'react';
import { branchLabel } from '@/lib/branchLabel';

export type BranchCity = {
  id: string;
  name: string;
  cityName?: string | null;
};

type Props = {
  cities: BranchCity[];
  value: string;
  onChange: (cityId: string) => void;
  required?: boolean;
  /** Показать пустой вариант «—» (только если филиалов больше одного). */
  allowEmpty?: boolean;
};

/**
 * Выбор филиала: если доступен один — поле скрыто, значение подставляется само.
 * Выбор показывается только при двух и более филиалах.
 */
export function BranchSelect({
  cities,
  value,
  onChange,
  required = false,
  allowEmpty = false,
}: Props) {
  const soleId = cities.length === 1 ? cities[0].id : '';
  useEffect(() => {
    if (soleId && value !== soleId) {
      onChange(soleId);
    }
    // onChange из родителя часто inline — не включаем в deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soleId, value]);

  if (cities.length <= 1) {
    return null;
  }

  return (
    <div className="field">
      <label>Филиал</label>
      <select
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowEmpty ? <option value="">—</option> : null}
        {cities.map((c) => (
          <option key={c.id} value={c.id}>
            {branchLabel(c)}
          </option>
        ))}
      </select>
    </div>
  );
}
