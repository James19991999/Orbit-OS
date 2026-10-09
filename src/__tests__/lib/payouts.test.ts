/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { validateLines, parsePayoutCsv } from '@/lib/payouts/service';
import { txOutcome, batchDone } from '@/lib/intasend/client';

describe('payout lines', () => {
  it('normalises numbers and rejects bad rows with row numbers', () => {
    const { ok, errors } = validateLines([
      { name: 'Amina', phone: '0712 345 678', amount_minor: 4_500_000 },
      { name: '', phone: '12345', amount_minor: 500 },
      { name: 'Twice', phone: '+254712345678', amount_minor: 100_000 },
      { name: 'Too much', phone: '0722000111', amount_minor: 30_000_000 },
    ]);
    expect(ok[0]).toMatchObject({ name: 'Amina', phone: '254712345678', amount_minor: 4_500_000 });
    expect(errors.map((e) => e.row)).toEqual([2, 2, 2, 3, 4]);
    expect(errors.find((e) => e.row === 3)!.message).toMatch(/appears twice/);
    expect(errors.find((e) => e.row === 4)!.message).toMatch(/250,000/);
  });
  it('refuses empty batches', () => {
    expect(validateLines([]).errors[0]!.message).toMatch(/at least one/);
  });
  it('parses CSV with header, quotes and thousands separators', () => {
    const { lines, errors } = parsePayoutCsv('name,phone,amount\n"Otieno, Brian",0712000111,"45,000.50"\nAmina,0722000222,38500\nbad row');
    expect(lines).toEqual([
      { name: 'Otieno, Brian', phone: '0712000111', amount_minor: 4_500_050 },
      { name: 'Amina', phone: '0722000222', amount_minor: 3_850_000 },
    ]);
    expect(errors).toHaveLength(1);
  });
});

describe('IntaSend payout statuses', () => {
  it('maps transaction outcomes', () => {
    expect(txOutcome({ status: 'Successful', status_code: 'TS100' }, true)).toBe('sent');
    expect(txOutcome({ status: 'Failed', status_code: 'TF104' }, true)).toBe('failed');
    expect(txOutcome({ status: 'Pending' }, false)).toBe('pending');
    expect(txOutcome({ status: 'Pending' }, true)).toBe('failed'); // batch finished without paying it
  });
  it('knows when a batch is finished', () => {
    expect(batchDone({ tracking_id: 'x', status: 'Completed', status_code: 'BC100' })).toEqual({ done: true, failedEarly: false });
    expect(batchDone({ tracking_id: 'x', status: 'Failed Processing' })).toEqual({ done: true, failedEarly: true });
    expect(batchDone({ tracking_id: 'x', status: 'Sending payment' })).toEqual({ done: false, failedEarly: false });
  });
});
