export function normalizeKnowledge(value) {
  return String(value??'').normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى|ئ/g,'ي').replace(/ؤ/g,'و').replace(/ة/g,'ه').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
const stop=new Set('ما ماذا كيف هل في من عن علي الي او و ان انا هي هو هذه هذا الذي التي عمان سلطنه مشروع الخاص اريد يمكن the a an of to in for how what is my i and or'.split(' '));
export function tokens(value) {
 return [...new Set(normalizeKnowledge(value).split(' ').map(w=>w.replace(/^(?:وال|بال|لل|ال)/,'')).filter(w=>w.length>1&&!stop.has(w)))].slice(0,1200);
}
const topicWords={
 starting_business:['فتح مشروع','افتح مشروع','فتح محل','افتح محل','ابدا مشروع','بدء مشروع','تاسيس','انشاء شرك','اسس شرك','start a business','starting a business','start business','set up a company'],
 commercial_registration:['سجل تجاري','السجل التجاري','commercial regist'],
 legal_forms:['شكل قانوني','الاشكال القانونيه','شركه الشخص','محدوده المسووليه','legal form'],
 renewal:['تجديد السجل','اجدد السجل','جدد السجل','renew commercial'],
 amendment:['تعديل السجل','اعدل السجل','تحديث السجل','amend commercial'],
 home_business:['منزلي','المنزل','home business'],investment_license:['ترخيص استثماري','الترخيص الاستثماري','رخصه استثمار','investment license'],
 activity_license:['تصريح','تصاريح','ترخيص','ترخيص نشاط','تراخيص','ترخيص مزاوله','رخصه','license','permit'],
 riyada_card:['بطاقه رياده','بطاقه ريادا','riyada card','entrepreneurship card'],
 sme_support:['الموسسات الصغيره','دعم الموسسات','sme support','small and medium'],
 vat:['القيمه المضافه','vat'],income_tax:['ضريبه الدخل','income tax'],
 tax_registration:['اسجل للضريبه','اسجل في الضريبه','تسجيل ضريبي','التسجيل الضريبي','tax registration','register for tax'],
 business_setup:['عمان للاعمال','استثمر بسهوله','oman business','invest easy'],
 municipal_license:['بلدي','بلديه','municipal'],
 ecommerce:['تجاره الكترونيه','التجاره الالكترونيه','متجر الكتروني','e-commerce','ecommerce'],
 street_vendors:['متجول','street vendor'],
 card_renewal:['تجديد بطاقه','اجدد بطاقه','renew card'],
 startup_card:['بطاقه للشركات الناشئه','بطاقه رياده للشركات الناشئه','startup card'],
 mentoring:['توجيه','mentoring'],
};
export function classifyKnowledgeQuestion(message) {
 const n=normalizeKnowledge(message);
 if(/عدد السجلات|عدد الشركات|عدد الموسسات|how many companies|number of registrations/.test(n)&&!/رسوم|شروط|اجراء|ضريب/.test(n))return [];
 let topics=Object.entries(topicWords).filter(([,words])=>words.some(w=>n.includes(w))).map(([key])=>key);
 if(/(?:^| )(?:سجل|السجل)(?: |$)/.test(n))topics.push('commercial_registration');
 if(/كم يكلف|كم الرسوم|بكم/.test(n)&&/مشروع|محل|رسوم/.test(n)&&!topics.length)topics=['starting_business','commercial_registration'];
 if(topics.includes('activity_license')&&!topics.some(t=>['home_business','investment_license','municipal_license','ecommerce','street_vendors'].includes(t)))topics.push('starting_business','commercial_registration','business_setup');
 if(topics.includes('starting_business'))topics.push('business_setup','commercial_registration');
 if(topics.some(t=>['home_business','investment_license'].includes(t)))topics=topics.filter(t=>t!=='activity_license');
 if(topics.includes('renewal'))topics=['renewal'];
 else if(topics.includes('amendment'))topics=['amendment'];
 if(topics.includes('vat'))topics=topics.filter(t=>t!=='income_tax'&&t!=='tax_registration');
 if(topics.includes('riyada_card'))topics=topics.filter(t=>t!=='sme_support');
 if(!topics.length && /ضريب|ضرائب|tax|متطلبات|اجراءات|رسوم|تصريح/.test(n))topics=['unknown_official'];
 return [...new Set(topics)];
}
export function rankChunks(question, candidates, topics) {
 const n=normalizeKnowledge(question);
 const expansion=topics.includes('activity_license')?' ترخيص تصريح رخصة مزاولة نشاط':topics.includes('commercial_registration')?' سجل تجاري تسجيل':'';
 const query=tokens(question);
 const expanded=tokens(expansion).filter(t=>!query.includes(t));
 const generalSetup=topics.includes('business_setup');
 const wantingConditions=/متطلبات|مستند|شروط|requirements|conditions|documents/.test(n),wantingFees=/رسوم|تكلفه|يكلف|بكم|fees|cost/.test(n);
 return candidates.map(c=>{
  const bag=new Set(c.tokens);const overlap=query.filter(t=>bag.has(t)).length;
  const heading=normalizeKnowledge(c.heading);const title=normalizeKnowledge(c.source.title);
  let score=overlap*2+expanded.filter(t=>bag.has(t)).length*.5+query.filter(t=>tokens(title).includes(t)).length*1.5;
  if(c.topics.some(t=>topics.includes(t)))score+=4;
  if(wantingConditions&&/شروط|مستند|متطلبات|conditions|documents/.test(heading))score+=5;
  if(wantingFees&&/رسوم|fees/.test(heading))score+=6;
  if(heading===title)score+=wantingConditions?1:2;
  if(/موقع طلب الخدمه|service location/.test(heading)&&!/مده|وقت|ساع|duration|time/.test(n))score-=12;
  if(topics.includes('starting_business')) {
    if(c.topics.includes('home_business'))score-=5;
    if(heading===title&&c.topics.includes('starting_business'))score+=2;
    if(/خطوات|مستند|شروط/.test(heading))score+=3;
  }
  if(topics.includes('tax_registration')&&!/قيمه مضافه|vat/.test(n)&&c.topics.includes('income_tax'))score+=3;
  if(generalSetup) {
    if(c.topics.includes('business_setup')&&/تسجيل الشركه/.test(heading))score+=10;
    if(c.topics.includes('commercial_registration')&&/خطوات/.test(heading))score+=4;
    // Specialized fees (e.g. Madayn) are not a general business permit price.
    if(!c.topics.some(t=>['starting_business','business_setup'].includes(t)))score-=10;
  }
  if(topics.includes('riyada_card')&&!topics.includes('card_renewal')&&c.topics.includes('card_renewal'))score-=7;
  if(topics.includes('municipal_license')&&!c.topics.includes('municipal_license'))score-=8;
  if(topics.includes('ecommerce')&&!c.topics.includes('ecommerce'))score-=8;
  if(c.source.domain==='gov.om')score+=1;
  const date=Date.parse(c.source.updatedAt??c.source.publishedAt??'');
  if(Number.isFinite(date))score+=Math.max(0,1-(Date.now()-date)/(1000*86400*730));
  return {...c,score};
 }).filter(c=>c.score>=5).sort((a,b)=>b.score-a.score||a._id.localeCompare(b._id));
}
