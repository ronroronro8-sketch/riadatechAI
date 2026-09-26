import { businessCalculationTools, calculationDefinitions } from './businessCalculations.js';

const intents = [
  ['calculateBreakEven', /نقطة التعادل|نقطه التعادل|break[ -]?even/i],
  ['calculateROI', /\bROI\b|العائد على الاستثمار/i],
  ['calculateROAS', /\bROAS\b|العائد على (?:الإنفاق|الانفاق) (?:الإعلاني|الاعلاني)/i],
  ['calculateProfitMargin', /هامش الربح|profit\s*margin/i],
  ['calculateUnitEconomics', /اقتصاديات الوحدة|هامش المساهمة|unit\s*economics/i],
];
const aliases = {
  revenue: '(?:إيرادات الإعلانات|ايرادات الاعلانات|إيرادات الحملة|إيرادات الشهر|الإيرادات|الايرادات|إيراداتي|ايراداتي|إيرادات|ايرادات|ad revenue|revenue)',
  totalCosts: '(?:إجمالي التكاليف|اجمالي التكاليف|التكاليف الإجمالية|التكاليف الاجمالية|التكاليف الكلية|total\\s*costs)',
  netProfit: '(?:صافي الربح|الربح الصافي|net\\s*profit)',
  investment: '(?:رأس المال المستثمر|المبلغ المستثمر|الاستثمار|investment)',
  adSpend: '(?:الإنفاق على الإعلانات|الانفاق على الاعلانات|الإنفاق الإعلاني|الانفاق الاعلاني|تكلفة الإعلانات|تكلفة الاعلانات|ad\\s*spend)',
  fixedCosts: '(?:التكاليف الثابتة|تكاليف ثابتة|fixed\\s*costs)',
  unitPrice: '(?:سعر البيع للوحدة|سعر الوحدة|unit\\s*price)',
  unitVariableCost: '(?:التكلفة المتغيرة للوحدة|تكلفة الوحدة المتغيرة|unit\\s*variable\\s*cost|variable cost per unit)',
};
const labels = { revenue: 'الإيراد للفترة المطلوبة (إيراد الإعلانات عند حساب ROAS)', totalCosts: 'إجمالي تكاليف الفترة',
  netProfit: 'صافي الربح', investment: 'المبلغ المستثمر', adSpend: 'الإنفاق الإعلاني للفترة نفسها',
  fixedCosts: 'التكاليف الثابتة للفترة', unitPrice: 'سعر بيع الوحدة', unitVariableCost: 'التكلفة المتغيرة للوحدة', period: 'تأكيد أن الإيرادات والتكاليف تخص الشهر نفسه' };
function normalize(text) {
  return text.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/٫/g, '.').replace(/٬/g, ',');
}
function moneyMatches(text) {
  const values = {}, ambiguous = [];
  const globalOMR = /(?:جميع|كل) (?:الأرقام|المبالغ|القيم) (?:بالريال العماني|بـ?OMR)|all (?:amounts|values) (?:are )?in OMR/i.test(text);
  for (const [field, alias] of Object.entries(aliases)) {
    const pattern = new RegExp(`(?:^|[\\s،,؛;:])(?:و)?${alias}\\s*(?:(?:=|:|هي|هو|تبلغ|بلغت)\\s*)?(-?\\d+(?:[.,]\\d+)*)(?:\\s*(ريال(?:ا|اً)?(?:\\s+عماني)?|بيسة|بيسات|OMR|baisa))?(?![\\p{L}\\d])`, 'giu');
    const matches = [...text.matchAll(pattern)];
    if (!matches.length) continue;
    const parsed = matches.map(m => {
      let amount = m[1];
      if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(amount)) amount = amount.replaceAll(',', '');
      const currency = /بيسة|بيسات|baisa/i.test(m[2] || '') ? 'baisa' : m[2] || globalOMR ? 'OMR' : undefined;
      return { amount, currency };
    });
    if (new Set(parsed.map(p => JSON.stringify(p))).size > 1) ambiguous.push(field);
    else values[field] = parsed[0];
  }
  return { values, ambiguous };
}

// No model call, eval, frontend tool arguments, or guessed Memory/Map mappings.
// A budget is not investment; a rent limit is not total cost or fixed cost.
export function resolveCalculationTools(message, previousResults = []) {
  const text = normalize(String(message));
  const { values, ambiguous } = moneyMatches(text);
  if (/ما هو|ما معنى|اشرح|الفرق بين|what is|explain|definition/i.test(text) && !Object.keys(values).length && !/احسب|calculate|compute/i.test(text)) return [];
  let selected = intents.filter(([, pattern]) => pattern.test(text)).map(([tool]) => tool);
  if (/الربح الشهري|monthly\s*profit/i.test(text) || (!selected.length && /(?:احسب|حساب|كم|calculate).*(?:ربح|profit)/i.test(text))) selected.push('calculateMonthlyProfit');
  const pending = previousResults.filter(r => ['missing_inputs', 'invalid_inputs'].includes(r.status) && calculationDefinitions[r.tool]);
  if (!selected.length && Object.keys(values).length) selected = pending.map(r => r.tool);
  selected = [...new Set(selected)];
  if (!selected.length) return [];
  return selected.map(tool => {
    const prior = pending.find(r => r.tool === tool);
    const inputs = Object.fromEntries(Object.entries(prior?.inputs || {}).map(([key, value]) => [key, { amount: value.amount, currency: value.currency }]));
    Object.assign(inputs, values);
    const source = Object.fromEntries(Object.keys(inputs).map(k => [k, values[k] ? 'current_user_message' : 'previous_pending_calculation']));
    let result = businessCalculationTools[tool](inputs);
    const relevantAmbiguous = ambiguous.filter(k => calculationDefinitions[tool].required.includes(k));
    // Refuse competing scenarios and negated/reported inputs rather than selecting
    // a convenient number. Users can restate one set of labelled inputs.
    const mixedPeriods = /شهري|الشهر|monthly|month/i.test(text) && /سنوي|السنة|السنه|year|annual|يومي|daily|day/i.test(text);
    const rangeOrChoice = /\d\s*(?:-|–|إلى|الى|to)\s*\d|(?:^|\s)(?:أو|او|or)(?:\s|$)/iu.test(text);
    if (relevantAmbiguous.length || mixedPeriods || rangeOrChoice || /(?:^|\s)(?:ليست|ليس|بدلاً|بدلا|قال|يقول)(?:\s|$)|["“”«»`]/u.test(text)) {
      result = { ...result, status: 'invalid_inputs', results: undefined,
        errors: [{ field: relevantAmbiguous.join(', ') || 'inputs', reason: 'Restate one unambiguous set of inputs for the same period; ranges, competing values and quoted/negated inputs are not used.' }] };
    }
    const monthly = /شهري|للشهر|هذا الشهر|الشهر نفسه|monthly|same month/i.test(text) || prior?.scope === 'monthly';
    if (tool === 'calculateMonthlyProfit' && !monthly && result.status !== 'invalid_inputs') {
      result = { ...result, status: 'missing_inputs', results: undefined, missingInputs: [...(result.missingInputs || []), 'period'] };
    }
    return { ...result, scope: tool === 'calculateMonthlyProfit' && monthly ? 'monthly' : 'same user-specified period',
      inputSources: source,
      missingInputLabels: (result.missingInputs || []).map(key => labels[key] || key) };
  });
}
