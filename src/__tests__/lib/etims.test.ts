import { buildSalePayload, vatOf, normalizeKraPin, classifyResult, serviceItemCode, verifyUrl, round2, buildItemPayload, nextRetryDelayMs, etimsDateTime } from '@/lib/etims/compose';

jest.mock('server-only', () => ({}));

const base = {
  kind: 'sale' as const, tin: 'P051234567X', bhfId: '00', invcNo: 7, tradeInvoiceNo: 'INV-2026-0042', customerName: 'Savannah Logistics Ltd',
  customerPin: 'p 052 345 678 y', amountMinor: 11_600_00, taxType: 'B' as const, paymentType: '02', itemCode: 'KE3NTXU0000001',
  itemClassCode: '8111150000', itemName: 'Software development services', tradeName: 'MOCK TRADERS LIMITED KENYA', at: new Date('2026-10-11T07:30:00Z'), user: { id: 'orbitos', name: 'OrbitOS' },
};

describe('KRA eTIMS payloads', () => {
  it('splits VAT out of a VAT-inclusive amount the way KRA’s spec sample does', () => {
    expect(vatOf(11600, 'B')).toBe(1600);
    expect(vatOf(7000, 'B')).toBe(965.52);   // 7000 × 16 / 116
    expect(vatOf(1080, 'E')).toBe(80);
    expect(vatOf(5000, 'A')).toBe(0);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it('builds a sale whose lines and totals tie to the cent', () => {
    const p = buildSalePayload(base);
    const line = p.itemList[0] as Record<string, number | string>;
    expect(line).toMatchObject({ itemSeq: 1, prc: 11600, splyAmt: 11600, taxblAmt: 11600, totTaxAmt: 1600, totAmt: 11600, taxTyCd: 'B', qty: 1, pkgUnitCd: 'NT', qtyUnitCd: 'U' });
    expect(p).toMatchObject({ invcNo: 7, orgInvcNo: 0, rcptTyCd: 'S', salesTyCd: 'N', salesSttsCd: '02', pmtTyCd: '02', custTin: 'P052345678Y',
      taxblAmtB: 11600, taxAmtB: 1600, taxRtB: 16, taxblAmtA: 0, taxRtE: 8, totTaxblAmt: 11600, totTaxAmt: 1600, totAmt: 11600, totItemCnt: 1 });
    // Nairobi time, KRA formats
    expect(p.cfmDt).toBe('20261011103000');
    expect(p.salesDt).toBe('20261011');
    expect((p.receipt as Record<string, unknown>).trdeNm).toBe('MOCK TRADERS LIMITED');   // KRA allows 20 characters
  });

  it('builds a credit note pointing at the original invoice number', () => {
    const p = buildSalePayload({ ...base, kind: 'credit_note', invcNo: 9, orgInvcNo: 7 });
    expect(p).toMatchObject({ rcptTyCd: 'R', orgInvcNo: 7, invcNo: 9, rfdRsnCd: '06' });
    expect(p.rfdDt).toBe(p.cfmDt);
  });

  it('drops an invalid customer PIN rather than sending it', () => {
    expect(buildSalePayload({ ...base, customerPin: '12345' }).custTin).toBeNull();
    expect(normalizeKraPin(' a123456789z ')).toBe('A123456789Z');
    expect(normalizeKraPin('A12345678Z')).toBeNull();
  });

  it('registers a service item with a KRA-shaped code', () => {
    expect(serviceItemCode(1)).toBe('KE3NTXU0000001');
    expect(serviceItemCode(42)).toBe('KE3NTXU0000042');
    expect(buildItemPayload({ tin: 'P051234567X', bhfId: '00', itemCode: serviceItemCode(1), itemClassCode: '8111150000', itemName: 'X', taxType: 'B', user: { id: 'o', name: 'O' } }))
      .toMatchObject({ itemTyCd: '3', orgnNatCd: 'KE', useYn: 'Y', isrcAplcbYn: 'N' });
  });

  it('classifies KRA answers: accept, duplicate, reject, retry', () => {
    expect(classifyResult('000')).toBe('accepted');
    expect(classifyResult('994')).toBe('duplicate');
    expect(classifyResult('910')).toBe('rejected');
    expect(classifyResult('901')).toBe('rejected');
    expect(classifyResult('999')).toBe('retry');
    expect(classifyResult('894')).toBe('retry');
    expect(classifyResult(undefined)).toBe('retry');
    expect(nextRetryDelayMs(1)).toBe(60_000);
    expect(nextRetryDelayMs(9)).toBe(3 * 3_600_000);
  });

  it('links the QR code to KRA’s receipt check page', () => {
    expect(verifyUrl('production', 'P051234567X', '00', 'ABCD1234EFGH5678')).toBe('https://etims.kra.go.ke/common/link/etims/receipt/indexEtimsReceiptData?Data=P051234567X00ABCD1234EFGH5678');
    expect(verifyUrl('sandbox', 'P051234567X', '00', 'X')).toMatch(/^https:\/\/etims-sbx\.kra\.go\.ke\//);
    expect(etimsDateTime(new Date('2026-12-31T21:30:00Z'))).toBe('20270101003000');
  });
});

describe('secrets at rest', () => {
  const OLD = process.env.ENCRYPTION_KEY;
  afterAll(() => { process.env.ENCRYPTION_KEY = OLD; });
  it('round-trips with AES-GCM and refuses a tampered box', async () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    const { encryptSecret, decryptSecret, isEncryptionConfigured } = await import('@/lib/crypto/secrets');
    expect(isEncryptionConfigured()).toBe(true);
    const box = encryptSecret('cmc-key-123');
    expect(box).toMatch(/^v1\./);
    expect(box).not.toContain('cmc-key-123');
    expect(decryptSecret(box)).toBe('cmc-key-123');
    const parts = box.split('.'); parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
    process.env.ENCRYPTION_KEY = 'short';
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret('x')).toThrow(/ENCRYPTION_KEY/);
  });
});
