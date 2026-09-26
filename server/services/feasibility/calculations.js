import { createHash } from 'node:crypto';
import { businessCalculationTools } from '../../tools/businessCalculations.js';
import { parseMoney, moneyResult } from '../../tools/money.js';

export function calculateStudy(inputs, previous = {}, tools = businessCalculationTools) {
  const values = { ...inputs }, derived = {}, calculations = {}, recomputed = [];
  if (!values.monthlyRevenue && values.unitPrice && values.dailyOrders && values.operatingDays) {
    try {
      const daily = String(values.dailyOrders.value), days = String(values.operatingDays.value);
      if (!/^\d+$/.test(daily) || !/^\d+$/.test(days) || +days < 1 || +days > 31) throw new Error('Invalid counts');
      const amount = parseMoney({ amount: values.unitPrice.value, currency: values.unitPrice.unit }, 'unitPrice');
      const result = moneyResult(amount.baisa * BigInt(daily) * BigInt(days));
      const dependencies = ['unitPrice', 'dailyOrders', 'operatingDays'];
      values.monthlyRevenue = derived.monthlyRevenue = { value: result.value, unit: 'OMR', period: 'monthly', kind: 'calculated',
        scenario: dependencies.some(key => values[key].kind === 'assumption'),
        formula: 'average ticket * daily customers/orders * operating days per month',
        limitation: 'One paid average ticket per supplied customer/order; scenario revenue, not a sales forecast.',
        dependencies: Object.fromEntries(dependencies.map(key => [key, values[key]])) };
    } catch { /* Missing/invalid quantities never become defaults or zero. */ }
  }
  const mapping = {
    calculateUnitEconomics: { unitPrice: 'unitPrice', unitVariableCost: 'unitVariableCost' },
    calculateBreakEven: { fixedCosts: 'fixedCosts', unitPrice: 'unitPrice', unitVariableCost: 'unitVariableCost' },
    calculateMonthlyProfit: { revenue: 'monthlyRevenue', totalCosts: 'monthlyTotalCosts' },
    calculateProfitMargin: { revenue: 'monthlyRevenue', totalCosts: 'monthlyTotalCosts' },
    calculateROI: { netProfit: 'monthlyNetProfit', investment: 'investment' },
    calculateROAS: { revenue: 'monthlyAdRevenue', adSpend: 'monthlyAdSpend' },
  };
  for (const [name, fields] of Object.entries(mapping)) {
    const dependencies = Object.values(fields);
    // Return only relevant tools; missing inputs remain explicit for the next short question.
    if (!dependencies.some(key => values[key])) continue;
    const selected = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, values[field] ?? null]));
    const fingerprint = createHash('sha256').update(JSON.stringify(selected)).digest('hex');
    if (previous[name]?.fingerprint === fingerprint) { calculations[name] = previous[name]; continue; }
    const args = Object.fromEntries(Object.entries(fields).filter(([, field]) => values[field])
      .map(([key, field]) => [key, { amount: values[field].value, currency: values[field].unit }]));
    calculations[name] = { fingerprint, kind: 'calculated',
      scenario: dependencies.some(key => values[key]?.kind === 'assumption' || values[key]?.scenario),
      period: name === 'calculateUnitEconomics' ? 'per_unit' : 'monthly',
      dependencies: selected, result: tools[name](args) };
    recomputed.push(name);
  }
  return { calculations, derived, recomputed };
}
