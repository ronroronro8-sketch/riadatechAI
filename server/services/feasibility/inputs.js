// Conservative extraction of explicit, labelled inputs. Unrecognised language remains in
// conversation history; it never becomes an invented financial input.
export function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
    .replace(/[\u064b-\u065f\u0670ـ]/g, '').replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي').replace(/٫/g, '.').replace(/[٬,](?=\d{3}(?:\D|$))/g, '');
}
export function isFeasibilityIntent(message) {
  const text = normalize(message);
  if (/^(?:لا اريد|لا تعمل|don't|do not)(?:\s|$)/.test(text)) return false;
  return /(?:دراس[ةه]|تحليل|تقييم).{0,25}(?:جدوي|مشروع)|(?:مشروع|فكر[ةه]).{0,25}(?:مجد|مربح|جدوي)|هل.{0,25}(?:ينجح|مربح)|feasibility|business\s+(?:study|plan|viability)|(?:assess|evaluate).{0,30}(?:business|project)|(?:viable|profitable).{0,25}(?:business|project)/i.test(text);
}
const activityNames = [
  ['مقهى', /مقهي|كوفي|coffee\s*shop|cafe|café/], ['مطعم', /مطعم|restaurant/],
  ['مخبز', /مخبز|bakery/], ['بقالة', /بقال[ةه]|grocery/], ['صالون', /صالون|salon/],
  ['متجر ملابس', /ملابس|clothes?\s*(?:shop|store)/], ['صيدلية', /صيدلي[ةه]|pharmacy/],
  ['متجر عطور', /عطور|perfume/], ['متجر إلكترونيات', /الكترونيات|electronics/],
];
const numericFields = {
  budget: ['(?:ميزاني(?:تي|تنا|ة|ه)|budget)', 'OMR', null],
  rent: ['(?:الايجار|ايجار|rent)', 'OMR', null],
  investment: ['(?:الاستثمار|استثماري|investment)', 'OMR', null],
  startupCosts: ['(?:تكاليف التاسيس|startup costs?)', 'OMR', null],
  unitPrice: ['(?:متوسط الفاتورة|متوسط فاتورة|سعر البيع|سعر الوحدة|average ticket|unit price|selling price)', 'OMR', 'per_unit'],
  unitVariableCost: ['(?:التكلفة المتغيرة للوحدة|تكلفة الوحدة المتغيرة|تكلفة الوحدة|unit variable cost|variable cost per unit)', 'OMR', 'per_unit'],
  fixedCosts: ['(?:التكاليف الثابتة الشهرية|تكاليف ثابتة شهرية|monthly fixed costs?)', 'OMR', 'monthly'],
  monthlyRevenue: ['(?:الايرادات الشهرية|ايرادات شهرية|monthly revenue)', 'OMR', 'monthly'],
  monthlyTotalCosts: ['(?:اجمالي التكاليف الشهرية|التكاليف الشهرية الاجمالية|monthly total costs?|total monthly costs?)', 'OMR', 'monthly'],
  monthlyNetProfit: ['(?:صافي الربح الشهري|monthly net profit)', 'OMR', 'monthly'],
  monthlyAdRevenue: ['(?:الايراد الاعلاني الشهري|ايرادات الاعلانات الشهرية|monthly ad revenue)', 'OMR', 'monthly'],
  monthlyAdSpend: ['(?:الانفاق الاعلاني الشهري|monthly ad spend)', 'OMR', 'monthly'],
  operatingDays: ['(?:ايام العمل في الشهر|ايام العمل الشهرية|operating days per month)', 'days', 'monthly'],
  employees: ['(?:الموظفين|موظفين|employees)', 'persons', null],
};
export function extractInputs(message, locations = [], provenance = {}) {
  const text = normalize(message), inputs = {};
  // Questions are not assertions, except explicit edit/scenario requests.
  const assumption = /افترض|نفترض|ماذا لو|لو افترض|what if|assum(?:e|ing)/.test(text);
  const question = /^(?:هل|كم|ما هي|ما هو|ما رايك|is |are |how |could |should )/.test(text);
  const put = (key, value, unit = null, period = null) => {
    inputs[key] = { value, unit, period, kind: assumption ? 'assumption' : 'user_input',
      original: message.slice(0, 2000), provenance };
  };
  if (question && !assumption && !isFeasibilityIntent(message)) return inputs;
  if (/(?:قال صديقي|صديقي يقول|مثال توضيحي|for example|someone said|my friend says)/.test(text)) return inputs;
  const activities = activityNames.filter(([, re]) => re.test(text));
  if (activities.length === 1 && (isFeasibilityIntent(text) || /مشروعي|نشاطي|مشروع |my project|my business|اريد افتح|اريد افتتاح|غير المشروع|غير النشاط/.test(text) || activities[0][1].exec(text)?.[0] === text.trim())) put('project', activities[0][0]);
  if (!activities.length) {
    const named = text.match(/(?:مشروعي|نشاطي|my project|my business)\s*[:=]?\s*(.{2,60}?)(?=\s+(?:في|in|وميزاني|with)|[،,.!?؟]|$)/);
    if (named) put('project', named[1].trim());
  }
  const places = locations.filter(row => [row.wilayat_ar, row.wilayat].filter(Boolean)
    .some(name => new RegExp(`(?:^|[\\s،])${normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s،.!?؟])`).test(text)));
  if (places.length === 1) put('location', places[0].wilayat_ar || places[0].wilayat);
  for (const [key, [label, unit, period]] of Object.entries(numericFields)) {
    const re = new RegExp(`${label}\\s*(?:(?:الي|الى|to|is|هي|هو|تكون|=|:)\\s*)?(-?\\d+(?:\\.\\d+)?)(?:\\s*(ريال(?:ا)?|omr|بيسة|بيسه|baisa|usd|دولار))?`, 'g');
    const matches = [...text.matchAll(re)];
    if (matches.length !== 1) continue;
    const match = matches[0];
    let value = match[1], currency = unit;
    if (unit === 'OMR') currency = /بيس|baisa/.test(match[2] || '') ? 'baisa' : /usd|دولار/.test(match[2] || '') ? 'USD' : match[2] ? 'OMR' : null;
    put(key, value, currency, period);
    if (key === 'rent' && /^(?:\s*ريال)?\s*(?:شهريا|شهري|monthly|per month)/.test(text.slice(match.index + match[0].length))) inputs[key].period = 'monthly';
  }
  const daily = text.match(/(\d+)\s*(?:عميل|زبون|طلب|customers?|orders?)\s*(?:يوميا|باليوم|daily|per day|a day)/);
  if (daily) put('dailyOrders', daily[1], 'orders_or_customers', 'daily');
  const area = text.match(/(?:المحل|المساحة|مساحة|shop|area)\s*(?:مساحته|is|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:متر|م²|sqm|square met)/);
  if (area) put('area', area[1], 'm²');
  return inputs;
}
