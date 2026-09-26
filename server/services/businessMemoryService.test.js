import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractExplicitBusinessFacts } from './businessMemoryService.js';

test('extracts explicit project facts without changing numbers or units', () => {
  const cases = [
    ['ميزانيتي لهذا المشروع 4200 ريال عماني.', 'budget', '4200 ريال عماني'],
    ['ميزانية المشروع: ٤٬٢٠٠ ريال عماني', 'budget', '٤٬٢٠٠ ريال عماني'],
    ['الإيجار 250 ريال عماني شهرياً', 'rent', '250 ريال عماني شهرياً'],
    ['رأس مالي 5000 ريال عماني', 'capital', '5000 ريال عماني'],
    ['عدد الموظفين 3', 'employees', '3'],
    ['فكرة مشروعي: مقهى متنقل', 'business_idea', 'مقهى متنقل'],
    ['مشروعي في صحار', 'location', 'صحار'],
    ['موقع مشروعي: مسقط', 'location', 'مسقط'],
    ['جمهوري المستهدف: طلاب الجامعة', 'target_audience', 'طلاب الجامعة'],
    ['سعر القهوة 750 بيسة', 'price:القهوة', '750 بيسة'],
    ['تكلفة العبوة: 0.250 ريال عماني', 'cost:العبوة', '0.250 ريال عماني'],
    ['هدفي من المشروع: الوصول إلى 100 عميل', 'goals', 'الوصول إلى 100 عميل'],
    ['قيود مشروعي: العمل مساءً فقط', 'constraints', 'العمل مساءً فقط'],
  ];
  for (const [text, key, value] of cases) assert.deepEqual(extractExplicitBusinessFacts(text), [{ key, value }], text);
});

test('rejects questions, guesses, negation, reported speech and conditional examples', () => {
  for (const text of [
    'هل ميزانيتي 4200 ريال عماني؟', 'ميزانيتي 4200 ريال عماني؟',
    'افترض أن ميزانيتي 4200 ريال عماني', 'ميزانيتي حوالي 4200 ريال عماني',
    'ميزانيتي ليست 4200 ريال عماني', 'ميزانيتي 4200 ريال عماني إذا حصلت على تمويل',
    'مثال: ميزانيتي 4200 ريال عماني.', 'قال صديقي: ميزانيتي 4200 ريال عماني.',
    'مثال افتراضي. ميزانيتي 4200 ريال عماني.', 'مشروعي ربما مقهى', 'مشروعي مقهى أو مطعم', 'لنفترض: ميزانيتي 4200 ريال عماني',
    'ميزانيتي سابقاً 4200 ريال عماني', '"ميزانيتي 4200 ريال عماني"',
  ]) assert.deepEqual(extractExplicitBusinessFacts(text), [], text);
});
