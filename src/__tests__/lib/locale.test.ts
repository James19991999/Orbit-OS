import { formatMoney, parseMoneyToMinor, isCurrency } from '@/lib/format';
import { englishForRegion, localeFromAcceptLanguage, resolveLocale, currencyForLocale, localeForCurrency, makeFormatter, formatDate } from '@/lib/locale';

describe('formatMoney by locale', () => {
  it('keeps the existing Kenyan format by default', () => {
    expect(formatMoney(123456, 'KES')).toBe('KES 1,234.56');
    expect(formatMoney(123456, 'KES', { decimals: false })).toBe('KES 1,235');
  });
  it('uses symbols for USD, EUR and GBP', () => {
    expect(formatMoney(123450, 'USD', { locale: 'en-US' })).toBe('$1,234.50');
    expect(formatMoney(123450, 'GBP', { locale: 'en-GB' })).toBe('£1,234.50');
    expect(formatMoney(123450, 'EUR', { locale: 'en-IE' })).toBe('€1,234.50');
  });
  it('uses the region separators consistently (number and money agree)', () => {
    expect(formatMoney(123450, 'EUR', { locale: 'en-DE' })).toBe('€1.234,50');
    expect(formatMoney(12345650, 'KES', { locale: 'en-IN' })).toBe('KES 1,23,456.50');
    expect(formatMoney(123450, 'USD', { locale: 'en-CA' })).toBe('US$1,234.50');
    expect(formatMoney(123450, 'USD', { locale: 'en-AU' })).toBe('US$1,234.50');
    expect(formatMoney(-1, 'USD', { locale: 'en-US', decimals: false })).toBe('$0');
  });
  it('handles negatives and compact', () => {
    expect(formatMoney(-123450, 'USD', { locale: 'en-US' })).toBe('-$1,234.50');
    expect(formatMoney(250_000_000, 'USD', { locale: 'en-US', compact: true })).toBe('$2.5M');
  });
});

describe('parseMoneyToMinor by locale', () => {
  it('parses en-KE / en-US input', () => {
    expect(parseMoneyToMinor('1,250.5')).toBe(125050);
    expect(parseMoneyToMinor('1250.50', 'en-US')).toBe(125050);
    expect(parseMoneyToMinor('12.345')).toBeNull();
    expect(parseMoneyToMinor('abc')).toBeNull();
  });
  it('parses comma-decimal regions', () => {
    expect(parseMoneyToMinor('1.250,50', 'en-DE')).toBe(125050);
    expect(parseMoneyToMinor('1250,5', 'en-DE')).toBe(125050);
    expect(parseMoneyToMinor('1250.50', 'en-DE')).toBe(125050);
    expect(parseMoneyToMinor('1 250,50', 'en-FR')).toBe(125050);
    expect(parseMoneyToMinor('1.250', 'en-DE')).toBe(125000);
    expect(parseMoneyToMinor('1.250.000', 'en-DE')).toBe(125000000);
  });
});

describe('locale resolution', () => {
  it('maps any language to English with that region', () => {
    expect(englishForRegion('de-DE')).toBe('en-DE');
    expect(englishForRegion('en-us')).toBe('en-US');
    expect(englishForRegion('en')).toBeNull();
  });
  it('reads Accept-Language by quality and ignores region-less tags', () => {
    expect(localeFromAcceptLanguage('en;q=0.9,de-DE;q=0.8')).toBe('en-DE');
    expect(localeFromAcceptLanguage('fr-FR,fr;q=0.9,en-US;q=0.8')).toBe('en-FR');
    expect(localeFromAcceptLanguage('en')).toBeNull();
    expect(localeFromAcceptLanguage('')).toBeNull();
  });
  it('prefers a valid cookie, rejects unknown cookie values, falls back to en-KE', () => {
    expect(resolveLocale('en-US', 'de-DE')).toBe('en-US');
    expect(resolveLocale('xx-evil', 'en-GB')).toBe('en-GB');
    expect(resolveLocale(undefined, undefined)).toBe('en-KE');
  });
  it('picks currencies and fallback locales', () => {
    expect(currencyForLocale('en-US')).toBe('USD');
    expect(currencyForLocale('en-GB')).toBe('GBP');
    expect(currencyForLocale('en-DE')).toBe('EUR');
    expect(currencyForLocale('en-KE')).toBe('KES');
    expect(localeForCurrency('GBP')).toBe('en-GB');
    expect(isCurrency('EUR')).toBe(true);
    expect(isCurrency('JPY')).toBe(false);
  });
  it('formats dates per region', () => {
    expect(formatDate('2026-10-08T12:00:00Z', 'short', 'en-US')).toBe('Oct 8, 2026');
    expect(formatDate('2026-10-08T12:00:00Z', 'short', 'en-KE')).toBe('8 Oct 2026');
    expect(makeFormatter('en-US').money(500, 'USD')).toBe('$5.00');
    expect(formatDate('2026-10-08', 'long', 'en-GB')).toBe('8 October 2026');
    expect(formatDate('2026-10', 'month', 'en-GB')).toBe('Oct');
    // timestamps follow the user's time zone and the region's clock
    expect(formatDate('2026-10-08T21:30:00Z', 'datetime', 'en-US', 'America/New_York')).toBe('Oct 8, 2026, 5:30 PM');
    expect(formatDate('2026-10-08T21:30:00Z', 'datetime', 'en-KE', 'Africa/Nairobi')).toBe('9 Oct 2026, 00:30');
    // bare calendar dates never shift, whatever the zone
    expect(formatDate('2026-10-08', 'short', 'en-US', 'Pacific/Kiritimati')).toBe('Oct 8, 2026');
  });
  it('spells out every offered region explicitly (identical in Node and browsers)', () => {
    expect(formatMoney(123456789, 'EUR', { locale: 'en-FR' })).toBe('€1 234 567,89');
    expect(formatMoney(123456789, 'USD', { locale: 'en-ZA' })).toBe('$1 234 567,89');
    expect(formatMoney(123456789, 'GBP', { locale: 'en-NL' })).toBe('£1.234.567,89');
    expect(formatMoney(99950, 'USD', { locale: 'en-US', decimals: false })).toBe('$1,000');
    expect(formatMoney(123_456_789_00, 'KES', { locale: 'en-DE', compact: true })).toBe('KES 123,5M');
    expect(formatMoney(99_996_000, 'USD', { locale: 'en-US', compact: true })).toBe('$1M');
    expect(formatMoney(99_960_000, 'USD', { locale: 'en-US', compact: true })).toBe('$999.6K');
    expect(englishForRegion('es-ES')).toBeNull();
    expect(resolveLocale(undefined, 'es-ES,es;q=0.9')).toBe('en-KE');
  });
});
