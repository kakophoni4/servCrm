/** Цифры телефона РФ → 7XXXXXXXXXX (как на API). */
export function digitsPhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  if (!digits.startsWith('7')) digits = `7${digits}`;
  return digits.slice(0, 11);
}

/** Красивый ввод: +7 (999) 123-45-67 */
export function formatRuPhoneInput(raw: string): string {
  const digits = digitsPhone(raw);
  const rest = digits.slice(1); // без ведущей 7
  let out = '+7';
  if (!rest.length) return `${out} `;
  out += ` (${rest.slice(0, 3)}`;
  if (rest.length < 3) return out;
  out += ')';
  if (rest.length === 3) return `${out} `;
  out += ` ${rest.slice(3, 6)}`;
  if (rest.length <= 6) return out;
  out += `-${rest.slice(6, 8)}`;
  if (rest.length <= 8) return out;
  out += `-${rest.slice(8, 10)}`;
  return out;
}

export function formatRuPhoneDisplay(normalized: string): string {
  const d = digitsPhone(normalized);
  if (d.length < 11) return normalized;
  return formatRuPhoneInput(d);
}
