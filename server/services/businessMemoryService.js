import { ConversationError } from "./conversationService.js";

// Deliberately conservative V1: accept explicit declarations, never model output,
// quoted examples, questions, conditional scenarios or inferred financial facts.
const uncertain = /[?؟"“”«»`]|(?:^|\s)(?:هل|لو|إذا|اذا|إن|افترض|افتراضي|لنفترض|فرضاً|فرضًا|تخيل|تخيّل|مثال|مثلاً|مثلا|ربما|قد|محتمل|ممكن|يمكن|أو|او|تقديري|تقديرية|تقريباً|تقريبا|حوالي|أتوقع|اتوقع|أعتقد|اعتقد|أقدر|اقدر|ليس|ليست|لا|لم|لن|كانت|كان|سابقاً|سابقا|سابق|قال|يقول|اقتباس)(?:\s|[،,:：]|$)/u;
const number = '[0-9٠-٩۰-۹]+(?:[.,٫٬،][0-9٠-٩۰-۹]+)*';
const money = `${number}\\s*(?:ريال(?:اً|ا)?(?:\\s+(?:عماني|عمانياً|عمانيا))?|بيسة|بيسات|ر\\.ع\\.?)(?:\\s+(?:شهريًا|شهرياً|شهريا|سنوياً|سنويا|سنويًا|يوميًا|يومياً|يوميا|للشهر|للسنة|للوحدة))?`;
const separator = '(?:\\s*(?::|：|=)\\s*|\\s+(?:(?:هي|هو|تبلغ|يبلغ|أصبحت|أصبح|الآن|الان)\\s+)*)';
const rules = [
  ['budget', '(?:ميزانيتي(?: لهذا المشروع| للمشروع)?|ميزانية مشروعي|ميزانية المشروع)', money],
  ['rent', '(?:إيجاري|ايجاري|إيجار مشروعي|ايجار مشروعي|إيجار المحل|ايجار المحل|الإيجار|الايجار)', money],
  ['capital', '(?:رأس مالي|راس مالي|رأس المال|راس المال|رأس مال المشروع)', money],
  ['employees', '(?:عدد موظفي مشروعي|عدد موظفي|عدد الموظفين(?: في مشروعي)?)', '[0-9٠-٩۰-۹]+(?:\\s+(?:موظفين|موظفاً|موظفا|موظف|عاملين|عمال))?'],
  ['business_idea', '(?:فكرة مشروعي|نوع مشروعي|مشروعي)', '[^\\n]{2,300}'],
  ['location', '(?:موقع مشروعي|موقع المشروع|مدينة مشروعي|ولاية مشروعي|مشروعي في)', '[^\\n]{2,200}'],
  ['target_audience', '(?:جمهوري المستهدف|الجمهور المستهدف لمشروعي|الجمهور المستهدف)', '[^\\n]{2,300}'],
  ['goals', '(?:هدفي من المشروع|هدف مشروعي|أهداف مشروعي|اهداف مشروعي)', '[^\\n]{2,300}'],
  ['constraints', '(?:قيود مشروعي|قيود المشروع)', '[^\\n]{2,300}'],
].map(([key, prefix, value]) => ({ key, pattern: new RegExp(`^${prefix}${separator}(${value})$`, 'u') }));

export function extractExplicitBusinessFacts(text) {
  if (typeof text !== 'string') return [];
  // Reject reported speech and hypothetical multi-sentence examples as a whole.
  if (uncertain.test(text)) return [];
  const facts = new Map();
  const ordered = [...rules.filter(r => r.key === 'location'), ...rules.filter(r => r.key !== 'location')];
  for (const raw of text.split(/\n+|[؛;]|(?<=[.!])\s+/u).slice(0, 20)) {
    const clause = raw.trim().replace(/[.!]+$/u, '').trim();
    if (!clause || clause.length > 400) continue;
    // Location must precede the broad "my business is ..." rule.
    let found = false;
    for (const { key, pattern } of ordered) {
      const match = clause.match(pattern);
      if (match) { facts.set(key, match[1].trim()); found = true; break; }
    }
    if (!found) {
      const match = clause.match(new RegExp(`^(سعر|تكلفة) ([^:=：\\n]{1,60}?)${separator}(${money})$`, 'u'));
      if (match) facts.set(`${match[1] === 'سعر' ? 'price' : 'cost'}:${match[2].trim()}`, match[3].trim());
    }
  }
  return [...facts].map(([key, value]) => ({ key, value }));
}

export function createBusinessMemoryService({ Memory, Conversation, Message }) {
  return {
    async rememberMessage(userId, conversationId, messageId) {
      if (!userId) throw new ConversationError(401, 'Authentication required.');
      const owner = await Conversation.exists({ _id: conversationId, userId, status: { $ne: 'deleted' } });
      if (!owner) throw new ConversationError(404, 'Conversation not found.');
      const source = await Message.findOne({ _id: messageId, conversationId, role: 'user', status: 'completed' }).lean();
      if (!source) throw new ConversationError(404, 'User message not found.');
      const facts = extractExplicitBusinessFacts(source.text);
      if (!facts.length) return;
      await Memory.init();
      for (const { key, value } of facts) {
        // Retrying an older turn must never overwrite a newer declaration from
        // another conversation. Equal timestamps are ordered by source ObjectId.
        const filter = { userId, key, $or: [
          { sourceCreatedAt: { $lt: source.createdAt } },
          { sourceCreatedAt: source.createdAt, sourceMessageId: { $lt: source._id } },
        ] };
        const update = { $set: { value, sourceConversationId: source.conversationId,
          sourceMessageId: source._id, sourceCreatedAt: source.createdAt } };
        try {
          await Memory.updateOne(filter, update, { upsert: true, runValidators: true });
        } catch (error) {
          if (error.code !== 11000) throw error;
          // Existing newer/same fact, or a concurrent insert: update only if older.
          await Memory.updateOne(filter, update, { runValidators: true });
        }
      }
    },
    async getForUser(userId) {
      if (!userId) throw new ConversationError(401, 'Authentication required.');
      const coreKeys = rules.map(rule => rule.key);
      const fields = 'key value sourceConversationId sourceMessageId createdAt updatedAt -_id';
      const [core, items] = await Promise.all([
        Memory.find({ userId, key: { $in: coreKeys } }).sort({ key: 1 }).select(fields).lean(),
        Memory.find({ userId, key: { $nin: coreKeys } }).sort({ updatedAt: -1, key: 1 })
          .limit(100 - coreKeys.length).select(fields).lean(),
      ]);
      return [...core, ...items];
    },
  };
}
