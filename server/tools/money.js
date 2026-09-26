export class CalculationInputError extends Error {
  constructor(field, reason) { super(reason); this.field = field; }
}

export function parseMoney(value, field, { signed = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CalculationInputError(field, 'Expected { amount, currency: OMR | baisa }.');
  const currency = typeof value.currency === 'string' ? value.currency.toLowerCase() : '';
  if (!['omr', 'baisa'].includes(currency)) throw new CalculationInputError(`${field}.currency`, 'Specify OMR or baisa explicitly.');
  if (!['string', 'number'].includes(typeof value.amount)) throw new CalculationInputError(field, 'Amount must be a finite decimal.');
  const raw = String(value.amount);
  const precision = currency === 'omr' ? 3 : 0;
  const match = raw.match(/^(-?)(\d{1,15})(?:\.(\d{1,3}))?$/);
  if (!match || (match[3]?.length || 0) > precision) throw new CalculationInputError(field, 'Use at most 3 decimals for OMR; baisa must be integral.');
  let baisa = BigInt(match[2]) * (currency === 'omr' ? 1000n : 1n);
  if (currency === 'omr') baisa += BigInt((match[3] || '').padEnd(3, '0'));
  if (match[1]) baisa = -baisa;
  if (!signed && baisa < 0n) throw new CalculationInputError(field, 'Amount cannot be negative.');
  return { baisa, input: { amount: raw, currency: currency === 'omr' ? 'OMR' : 'baisa', amountOMR: formatOMR(baisa), amountBaisa: String(baisa) } };
}
export function formatOMR(baisa) {
  const absolute = baisa < 0n ? -baisa : baisa;
  return `${baisa < 0n ? '-' : ''}${absolute / 1000n}.${String(absolute % 1000n).padStart(3, '0')}`;
}
export const moneyResult = baisa => ({ value: formatOMR(baisa), unit: 'OMR', baisa: String(baisa) });
export function ratioResult(numerator, denominator, unit) {
  if (denominator === 0n) throw new CalculationInputError('denominator', 'Division by zero is undefined.');
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const scaled = (n * 1000000n + d / 2n) / d;
  const value = `${negative && scaled ? '-' : ''}${scaled / 1000000n}.${String(scaled % 1000000n).padStart(6, '0')}`.replace(/\.?0+$/, '');
  return { value, unit, exact: { numerator: String(numerator), denominator: String(denominator) }, rounding: 'half-up, at most 6 decimal places' };
}
export function convertMoney(value) {
  return moneyResult(parseMoney(value, 'amount', { signed: true }).baisa);
}
