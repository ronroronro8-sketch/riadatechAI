import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessCalculationTools as tools, calculationDefinitions } from './businessCalculations.js';
import { convertMoney } from './money.js';
import { resolveCalculationTools } from './resolveCalculations.js';
const omr = amount => ({ amount: String(amount), currency: 'OMR' });

test('ROAS: 600 OMR advertising revenue / 150 OMR advertising spend = 4x', () => {
  const r = tools.calculateROAS({ revenue: omr(600), adSpend: omr(150) });
  assert.equal(r.status, 'ok'); assert.equal(r.results.roas.value, '4'); assert.equal(r.results.roas.unit, 'x');
  assert.equal(r.formulas.roas, 'revenue / adSpend');
});
test('monthly profit: 2000 - 1500 = exactly 500.000 OMR', () => {
  const r = tools.calculateMonthlyProfit({ revenue: omr(2000), totalCosts: omr(1500) });
  assert.deepEqual(r.results.profit, { value: '500.000', unit: 'OMR', baisa: '500000' });
});
test('profit margin: (2000 - 1500) / 2000 = 25%, not markup', () => {
  const r = tools.calculateProfitMargin({ revenue: omr(2000), totalCosts: omr(1500) });
  assert.equal(r.results.profitMargin.value, '25'); assert.equal(r.results.profitMargin.unit, '%');
});
test('ROI: 500 net profit / 2500 investment = 20%', () => {
  const r = tools.calculateROI({ netProfit: omr(500), investment: omr(2500) });
  assert.equal(r.results.roi.value, '20'); assert.equal(r.results.roi.unit, '%');
  assert.equal(tools.calculateROI({ netProfit: omr(-500), investment: omr(2500) }).results.roi.value, '-20');
});
test('2500 baisa is exactly 2.500 OMR; mixed units and decimal arithmetic stay exact', () => {
  assert.deepEqual(convertMoney({ amount: '2500', currency: 'baisa' }), { value: '2.500', unit: 'OMR', baisa: '2500' });
  const r = tools.calculateMonthlyProfit({ revenue: { amount: 2500, currency: 'baisa' }, totalCosts: omr('0.125') });
  assert.equal(r.results.profit.value, '2.375');
  assert.equal(tools.calculateMonthlyProfit({ revenue: omr('0.300'), totalCosts: omr('0.200') }).results.profit.value, '0.100');
});
test('break-even rounds up whole units; unit economics reports contribution, not net profit', () => {
  const r = tools.calculateBreakEven({ fixedCosts: omr(1000), unitPrice: omr(7), unitVariableCost: omr(4) });
  assert.equal(r.results.breakEvenUnits.value, '334');
  assert.equal(r.results.breakEvenRevenue.value, '2338.000');
  assert.equal(r.results.theoreticalUnits.value, '333.333333');
  const unit = tools.calculateUnitEconomics({ unitPrice: omr('2.500'), unitVariableCost: omr('1.000') });
  assert.equal(unit.results.contributionPerUnit.value, '1.500');
  assert.equal(unit.results.contributionMargin.value, '60');
});
test('zero denominators and non-positive break-even contribution are rejected', () => {
  for (const [tool, inputs] of [
    ['calculateROI', { netProfit: omr(10), investment: omr(0) }],
    ['calculateROAS', { revenue: omr(10), adSpend: omr(0) }],
    ['calculateProfitMargin', { revenue: omr(0), totalCosts: omr(10) }],
    ['calculateUnitEconomics', { unitPrice: omr(0), unitVariableCost: omr(0) }],
    ['calculateBreakEven', { fixedCosts: omr(10), unitPrice: omr(2), unitVariableCost: omr(2) }],
  ]) { const r = tools[tool](inputs); assert.equal(r.status, 'invalid_inputs'); assert.equal(r.results, undefined); }
  assert.equal(tools.calculateMonthlyProfit({ revenue: omr(0), totalCosts: omr(0) }).results.profit.value, '0.000');
});
test('each tool rejects missing/invalid inputs and does not invent currency or precision', () => {
  for (const [name, definition] of Object.entries(calculationDefinitions)) {
    assert.deepEqual(tools[name]({}).missingInputs, definition.required);
    const input = Object.fromEntries(definition.required.map(key => [key, omr(100)]));
    for (const invalid of [omr(-1), omr('NaN'), omr('Infinity'), omr('1.2345'), { amount: '1' }, { amount: '1', currency: 'USD' }, { amount: '0.5', currency: 'baisa' }]) {
      const key = definition.required.find(key => key !== 'netProfit');
      const r = tools[name]({ ...input, [key]: invalid });
      assert.equal(r.status, 'invalid_inputs', `${name}: ${JSON.stringify(invalid)}`);
    }
  }
});
test('router resolves Arabic requests and keeps ROAS ad spend separate from total costs', () => {
  const r = resolveCalculationTools('احسب ROAS: إيرادات الإعلانات 600 OMR، الإنفاق الإعلاني 150 OMR، إجمالي التكاليف 500 OMR.')[0];
  assert.equal(r.results.roas.value, '4'); assert.equal(r.inputs.adSpend.amountOMR, '150.000');
  assert.equal(r.inputs.totalCosts, undefined);
  const profit = resolveCalculationTools('احسب الربح الشهري: الإيرادات ٢٠٠٠ ريال عماني، إجمالي التكاليف ١٥٠٠ ريال عماني.')[0];
  assert.equal(profit.results.profit.value, '500.000');
});
test('pending calculation can use a missing input supplied in the next user message', () => {
  const first = resolveCalculationTools('احسب الربح الشهري: الإيرادات 2000 OMR.');
  assert.equal(first[0].status, 'missing_inputs');
  assert.deepEqual(first[0].missingInputs, ['totalCosts']);
  const second = resolveCalculationTools('إجمالي التكاليف 1500 OMR', first)[0];
  assert.equal(second.results.profit.value, '500.000');
  assert.equal(second.inputSources.revenue, 'previous_pending_calculation');
});
test('ambiguous numbers, missing units and missing financial concepts request clarification', () => {
  assert.equal(resolveCalculationTools('احسب ROI، ميزانيتي 2500 OMR')[0].status, 'missing_inputs');
  assert.equal(resolveCalculationTools('ROAS revenue 600 OMR total costs 150 OMR')[0].status, 'missing_inputs');
  assert.equal(resolveCalculationTools('احسب الربح الشهري: الإيرادات 2000، إجمالي التكاليف 1500')[0].status, 'invalid_inputs');
  assert.equal(resolveCalculationTools('ROAS revenue 600 OMR revenue 800 OMR ad spend 150 OMR')[0].status, 'invalid_inputs');
  assert.equal(resolveCalculationTools('احسب الربح: الإيرادات 2000 OMR إجمالي التكاليف 1500 OMR')[0].status, 'missing_inputs');
  assert.equal(resolveCalculationTools('احسب الربح الشهري: revenue 2000 OMR yearly total costs 1500 OMR monthly')[0].status, 'invalid_inputs');
  assert.equal(resolveCalculationTools('ROAS revenue 600 OMR ad spend 150 OMR أو 200 OMR')[0].status, 'invalid_inputs');
  assert.deepEqual(resolveCalculationTools('ما هو ROAS؟'), []);
  assert.deepEqual(resolveCalculationTools('اقترح اسمًا للمشروع'), []);
});
