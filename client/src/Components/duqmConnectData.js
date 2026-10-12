export const STORAGE_KEY = 'riadatech.duqm-connect.v1';
export const categories = ['اللوجستيات', 'النقل', 'الإنشاءات', 'الصيانة', 'التموين', 'المستلزمات الصناعية', 'التنظيف', 'التقنية'];
export const uid = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const premium = supplier => new Date(supplier.premiumUntil || 0).getTime() > Date.now();
export const featured = supplier => supplier.featuredOverride ?? premium(supplier);
export const money = n => `${Number(n).toLocaleString('ar-OM')} ر.ع.`;
export function seedMarketplace() {
  const names = ['مدار الدقم اللوجستية', 'مسارات الدقم للنقل', 'روافد الدقم للمقاولات', 'إتقان الدقم للصيانة', 'مائدة الدقم للتموين', 'ركائز الدقم الصناعية', 'نقاء الدقم للتنظيف', 'أفق الدقم للتقنية'];
  const services = ['تنسيق التخزين والشحن', 'نقل موظفين بحافلة', 'أعمال تجهيز المكاتب', 'صيانة معدات ومرافق', 'وجبات للشركات', 'معدات السلامة المهنية', 'تنظيف المكاتب والمرافق', 'دعم الشبكات والحواسيب'];
  const prices = [120, 85, 250, 45, 3, 18, 35, 60];
  return {version:1, activeAccount:'company-1', companies:[{id:'company-1',name:'شركة مشاريع الدقم — DEMO'},{id:'company-2',name:'شركة الميناء للأعمال — DEMO'}], suppliers:names.map((name,i)=>({
    id:`supplier-${i+1}`, name, category:categories[i], location:'الدقم، محافظة الوسطى', email:`supplier${i+1}@example.invalid`, phone:'غير متاح — استخدم رسائل DEMO',
    description:`مورد افتراضي لخدمات ${categories[i]} للشركات في الدقم. هذه بيانات محاكاة وليست منشأة حقيقية.`,
    premiumUntil:[1,5].includes(i)?new Date(Date.now()+30*86400000).toISOString():null, featuredOverride:null, views:0,
    listings:[{id:`listing-${i}`,name:services[i],type:i===5?'منتج':'خدمة',price:prices[i],unit:i===4?'للوجبة':'يبدأ من',description:'عرض تجريبي قابل للتعديل — السعر ليس عرضًا تجاريًا حقيقيًا.',promoted:i===1||i===5}],
  })), favorites:{}, comparisons:{}, threads:[]};
}
export function loadMarketplace() {
  try {
    const raw=localStorage.getItem(STORAGE_KEY);
    if (!raw) return {data:seedMarketplace(),warning:''};
    const d=JSON.parse(raw);
    if (d.version!==1 || !Array.isArray(d.suppliers) || !Array.isArray(d.companies) || !Array.isArray(d.threads) || !d.favorites || !d.comparisons || !d.suppliers.every(s=>Array.isArray(s.listings))) throw new Error();
    return {data:d,warning:''};
  } catch {return {data:seedMarketplace(),warning:'تعذر قراءة البيانات المحلية. تم فتح نسخة DEMO جديدة؛ قد يكون التخزين محظورًا.'};}
}
