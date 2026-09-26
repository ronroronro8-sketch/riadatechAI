import { CalculationInputError, parseMoney, moneyResult, ratioResult } from './money.js';

export const calculationDefinitions = Object.freeze({
  calculateBreakEven: { required: ['fixedCosts', 'unitPrice', 'unitVariableCost'],
    description: 'Break-even units for one product and one cost period. Fixed costs and unit costs must use the same scope.',
    formulas: { contributionPerUnit: 'unitPrice - unitVariableCost', breakEvenUnits: 'ceil(fixedCosts / contributionPerUnit)', breakEvenRevenue: 'breakEvenUnits * unitPrice' } },
  calculateROI: { required: ['netProfit', 'investment'], description: 'Non-annualized ROI; netProfit is already net of all included costs, not revenue.',
    formulas: { roi: 'netProfit / investment * 100' } },
  calculateROAS: { required: ['revenue', 'adSpend'], description: 'Advertising-attributed revenue / advertising spend for the same campaign and period. This is not ROI or profit.',
    formulas: { roas: 'revenue / adSpend' } },
  calculateMonthlyProfit: { required: ['revenue', 'totalCosts'], description: 'Monthly revenue minus all costs supplied for that same month. Does not infer tax or missing expenses.',
    formulas: { profit: 'revenue - totalCosts' } },
  calculateProfitMargin: { required: ['revenue', 'totalCosts'], description: 'Profit margin after the supplied total costs, not markup. Inputs must cover the same period.',
    formulas: { profit: 'revenue - totalCosts', profitMargin: '(revenue - totalCosts) / revenue * 100' } },
  calculateUnitEconomics: { required: ['unitPrice', 'unitVariableCost'], description: 'Per-unit contribution after variable costs, before fixed costs; not net profit or an inferred LTV/CAC.',
    formulas: { contributionPerUnit: 'unitPrice - unitVariableCost', contributionMargin: '(unitPrice - unitVariableCost) / unitPrice * 100' } },
});
function execute(tool, values, calculate) {
  const definition = calculationDefinitions[tool];
  const result = { tool, calculationType: definition.description, formulas: definition.formulas, inputs: {}, status: 'ok' };
  const raw = values && typeof values === 'object' ? values : {};
  const missing = definition.required.filter(key => raw[key] === undefined || raw[key] === null);
  if (missing.length) { result.status = 'missing_inputs'; result.missingInputs = missing; }
  try {
    const amounts = {};
    for (const key of definition.required.filter(k => !missing.includes(k))) {
      const parsed = parseMoney(raw[key], key, { signed: key === 'netProfit' });
      amounts[key] = parsed.baisa; result.inputs[key] = parsed.input;
    }
    if (!missing.length) result.results = calculate(amounts);
  } catch (error) {
    if (!(error instanceof CalculationInputError)) throw error;
    result.status = 'invalid_inputs'; result.errors = [{ field: error.field, reason: error.message }];
  }
  return result;
}
function positive(value, field) {
  if (value <= 0n) throw new CalculationInputError(field, 'Must be greater than zero.');
}
export const calculateROI = inputs => execute('calculateROI', inputs, ({ netProfit, investment }) => {
  positive(investment, 'investment'); return { roi: ratioResult(netProfit * 100n, investment, '%') };
});
export const calculateROAS = inputs => execute('calculateROAS', inputs, ({ revenue, adSpend }) => {
  positive(adSpend, 'adSpend'); return { roas: ratioResult(revenue, adSpend, 'x') };
});
export const calculateMonthlyProfit = inputs => execute('calculateMonthlyProfit', inputs, ({ revenue, totalCosts }) => ({ profit: moneyResult(revenue - totalCosts) }));
export const calculateProfitMargin = inputs => execute('calculateProfitMargin', inputs, ({ revenue, totalCosts }) => {
  positive(revenue, 'revenue'); return { profit: moneyResult(revenue - totalCosts), profitMargin: ratioResult((revenue - totalCosts) * 100n, revenue, '%') };
});
export const calculateUnitEconomics = inputs => execute('calculateUnitEconomics', inputs, ({ unitPrice, unitVariableCost }) => {
  positive(unitPrice, 'unitPrice'); return { contributionPerUnit: moneyResult(unitPrice - unitVariableCost), contributionMargin: ratioResult((unitPrice - unitVariableCost) * 100n, unitPrice, '%') };
});
export const calculateBreakEven = inputs => execute('calculateBreakEven', inputs, ({ fixedCosts, unitPrice, unitVariableCost }) => {
  positive(unitPrice, 'unitPrice');
  const contribution = unitPrice - unitVariableCost;
  if (contribution <= 0n) throw new CalculationInputError('unitVariableCost', 'No attainable break-even with non-positive unit contribution.');
  const units = (fixedCosts + contribution - 1n) / contribution;
  return { contributionPerUnit: moneyResult(contribution), theoreticalUnits: ratioResult(fixedCosts, contribution, 'units'),
    breakEvenUnits: { value: String(units), unit: 'units', rounding: 'ceiling to a whole saleable unit' },
    breakEvenRevenue: moneyResult(units * unitPrice) };
});
export const businessCalculationTools = Object.freeze({ calculateBreakEven, calculateROI, calculateROAS,
  calculateMonthlyProfit, calculateProfitMargin, calculateUnitEconomics });
