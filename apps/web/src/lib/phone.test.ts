import { digitsPhone, formatRuPhoneInput } from './phone';

describe('digitsPhone', () => {
  it('нормализует полный номер', () => {
    expect(digitsPhone('+7 (916) 123-45-67')).toBe('79161234567');
    expect(digitsPhone('89161234567')).toBe('79161234567');
    expect(digitsPhone('9161234567')).toBe('79161234567');
  });

  it('не добавляет вторую 7 при Backspace с полного номера', () => {
    // было 79161234567 → стёрли последнюю цифру
    expect(digitsPhone('+7 (916) 123-45-6')).toBe('7916123456');
    expect(digitsPhone('7916123456')).toBe('7916123456');
  });

  it('игнорирует лишний символ после полного номера', () => {
    expect(digitsPhone('+7 (916) 123-45-67a')).toBe('79161234567');
    expect(digitsPhone('+7 (916) 123-45-67!')).toBe('79161234567');
    expect(digitsPhone('+7 (916) 123-45-679')).toBe('79161234567');
  });

  it('позволяет очистить до пустого', () => {
    expect(digitsPhone('')).toBe('');
    expect(digitsPhone('+7 ')).toBe('7');
  });
});

describe('formatRuPhoneInput', () => {
  it('форматирует и не раздувает номер лишней 7', () => {
    expect(formatRuPhoneInput('+7 (916) 123-45-67x')).toBe(
      '+7 (916) 123-45-67',
    );
    expect(formatRuPhoneInput('+7 (916) 123-45-6')).toBe('+7 (916) 123-45-6');
  });
});
