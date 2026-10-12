import React, {useEffect, useRef, useState} from 'react';
import {Search, Building2, MessageSquare, Star, Crown, ArrowUpLeft, Package, RotateCcw} from 'lucide-react';
import {STORAGE_KEY, categories, uid, premium, featured, money, seedMarketplace, loadMarketplace} from './duqmConnectData';
import './DuqmConnect.css';

const blankProfile={name:'',category:categories[0],location:'الدقم، محافظة الوسطى',email:'',phone:'',description:''};
function ProfileForm({supplier, onSave, onCancel}) {
  const [form,setForm]=useState(supplier || blankProfile);
  const field=(key,label,type='text')=><label>{label}<input required type={type} maxLength={160} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>;
  return <form className="dc-panel dc-form" onSubmit={e=>{e.preventDefault();if(form.name.trim())onSave({...form,name:form.name.trim()});}}>
    <h2>{supplier?'تعديل ملف المورد':'تسجيل مورد مجانًا'}</h2>
    <p>ملف ومنتجات وخدمات وظهور عادي في البحث — مجانًا. جميع المدخلات ضمن هذه التجربة محلية وDEMO.</p>
    <div className="dc-form-grid">{field('name','اسم النشاط')}<label>الفئة<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>{field('location','الموقع')}{field('email','البريد الإلكتروني','email')}{field('phone','تفاصيل التواصل')}<label>نبذة عن المنتجات والخدمات<textarea required maxLength={1000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label></div>
    <div className="dc-actions"><button className="dc-primary" type="submit">حفظ الملف</button><button type="button" onClick={onCancel}>إلغاء</button></div>
  </form>;
}
function ListingForm({listing, canPromote, onSave, onCancel}) {
  const [form,setForm]=useState(listing || {name:'',type:'خدمة',price:'',unit:'يبدأ من',description:'',promoted:false});
  return <form className="dc-panel dc-form" onSubmit={e=>{e.preventDefault();if(form.name.trim() && Number.isFinite(Number(form.price))) onSave({...form,name:form.name.trim(),price:Number(form.price),promoted:canPromote && form.promoted});}}>
    <h3>{listing?'تعديل العرض':'إضافة منتج أو خدمة'}</h3><div className="dc-form-grid">
      <label>اسم العرض<input required maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label>النوع<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option>خدمة</option><option>منتج</option></select></label>
      <label>السعر التجريبي (ر.ع.)<input required type="number" min="0" max="1000000" step="0.001" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label>
      <label>وحدة التسعير<input required maxLength={60} value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}/></label>
      <label className="dc-wide">وصف العرض<textarea required maxLength={1000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      {canPromote && <label className="dc-check"><input type="checkbox" checked={form.promoted} onChange={e=>setForm({...form,promoted:e.target.checked})}/>عرض ترويجي Premium</label>}
    </div><div className="dc-actions"><button className="dc-primary">حفظ العرض</button><button type="button" onClick={onCancel}>إلغاء</button></div>
  </form>;
}

export default function DuqmConnect() {
  const [initial]=useState(loadMarketplace);
  const [role,setRole]=useState(null), [choosingRole,setChoosingRole]=useState(true);
  const roleDialog=useRef(null), roleButton=useRef(null), roleAccounts=useRef({});
  useEffect(()=>{
    if(!choosingRole){roleButton.current?.focus();return;}
    const dialog=roleDialog.current, overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialog.showModal();
    return()=>{dialog.close();document.body.style.overflow=overflow;};
  },[choosingRole]);
  const [db,setDb]=useState(initial.data), [notice,setNotice]=useState(initial.warning), [storageError,setStorageError]=useState('');
  const [view,setView]=useState('market'), [query,setQuery]=useState(''), [category,setCategory]=useState(''), [budget,setBudget]=useState(''), [sort,setSort]=useState('priority');
  const [selected,setSelected]=useState(null), [editProfile,setEditProfile]=useState(false), [editListing,setEditListing]=useState(null), [threadId,setThreadId]=useState(null), [message,setMessage]=useState('');
  const supplier=db.suppliers.find(s=>s.id===db.activeAccount), company=db.companies.find(c=>c.id===db.activeAccount), admin=db.activeAccount==='admin';
  const favorites=db.favorites[db.activeAccount] || [], comparisons=db.comparisons[db.activeAccount] || [];
  const accountName=supplier?.name || company?.name || 'إدارة المنصة — DEMO';
  const threads=db.threads.filter(t=>t.companyId===db.activeAccount || t.supplierId===db.activeAccount);
  const thread=threads.find(t=>t.id===threadId);
  const unread=threads.reduce((n,t)=>n+t.messages.filter(m=>!m.readBy.includes(db.activeAccount)).length,0);
  const updateSupplier=(id,fn)=>setDb(d=>({...d,suppliers:d.suppliers.map(s=>s.id===id?fn(s):s)}));
  const go=next=>{setView(next);setSelected(null);setEditProfile(false);setEditListing(null);setNotice('');};
  useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db));setStorageError('');}catch{setStorageError('التخزين المحلي غير متاح أو ممتلئ. التغييرات الحالية لن تبقى بعد إغلاق الصفحة.');}},[db]);
  useEffect(()=>{const sync=e=>{if(e.key===STORAGE_KEY){setDb(loadMarketplace().data);setRole(null);setChoosingRole(true);}};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
  const cheapest=s=>s.listings.length?Math.min(...s.listings.map(l=>Number(l.price))):Infinity;
  const normalize=s=>s.toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي');
  const visible=db.suppliers.filter(s=>(!category||s.category===category)&&normalize([s.name,s.category,s.location,s.description,...s.listings.map(l=>l.name+' '+l.description)].join(' ')).includes(normalize(query.trim()))&&(budget===''||cheapest(s)<=Number(budget)))
    .sort((a,b)=>sort==='price'?cheapest(a)-cheapest(b):sort==='name'?a.name.localeCompare(b.name,'ar'):(Number(featured(b))-Number(featured(a))||Number(premium(b))-Number(premium(a))||a.name.localeCompare(b.name,'ar')));
  function switchAccount(id){setDb(d=>({...d,activeAccount:id}));go(role==='supplier'?'dashboard':'market');setThreadId(null);setMessage('');}
  function chooseRole(nextRole){
    if(role)roleAccounts.current[role]=db.activeAccount;
    const accounts=nextRole==='supplier'?db.suppliers:db.companies;
    const id=[roleAccounts.current[nextRole],db.activeAccount].find(id=>accounts.some(a=>a.id===id)) || accounts[0]?.id;
    setRole(nextRole);setDb(d=>({...d,activeAccount:id}));
    go(nextRole==='supplier'?'dashboard':'market');setThreadId(null);setMessage('');setChoosingRole(false);
  }
  function toggleSaved(field,id){
    if(!company){setNotice('اختر حساب شركة من مبدّل الحسابات لاستخدام المفضلة والمقارنة.');return;}
    const list=db[field][company.id] || [];
    if(field==='comparisons' && !list.includes(id) && list.length===3){setNotice('يمكن مقارنة 3 موردين كحد أقصى. أزل موردًا أولًا.');return;}
    setDb(d=>({...d,[field]:{...d[field],[company.id]:list.includes(id)?list.filter(x=>x!==id):[...list,id]}}));
  }
  function openProfile(s){updateSupplier(s.id,x=>({...x,views:x.views+1}));setSelected(s.id);setView('profile');setNotice('');}
  function openThread(id){setThreadId(id);setMessage('');setView('messages');setDb(d=>({...d,threads:d.threads.map(t=>t.id===id?{...t,messages:t.messages.map(m=>({...m,readBy:[...new Set([...m.readBy,d.activeAccount])]}))}:t)}));}
  function inquire(s){
    if(!company){setNotice('لإرسال استفسار، اختر حساب شركة من مبدّل الحسابات أعلى الصفحة.');return;}
    let t=db.threads.find(t=>t.companyId===company.id && t.supplierId===s.id);
    if(!t){t={id:uid(),companyId:company.id,supplierId:s.id,messages:[]};setDb(d=>({...d,threads:[...d.threads,t]}));}
    openThread(t.id);
  }
  function send(e){e.preventDefault();if(!message.trim()||!thread)return;const entry={id:uid(),from:db.activeAccount,text:message.trim(),at:new Date().toISOString(),readBy:[db.activeAccount]};setDb(d=>({...d,threads:d.threads.map(t=>t.id===thread.id?{...t,messages:[...t.messages,entry]}:t)}));setMessage('');}
  function saveProfile(form){
    if(supplier){updateSupplier(supplier.id,s=>({...s,...form}));setEditProfile(false);setNotice('تم حفظ الملف.');}
    else {const id=uid();setDb(d=>({...d,activeAccount:id,suppliers:[...d.suppliers,{...form,id,listings:[],views:0,premiumUntil:null,featuredOverride:null}]}));go('dashboard');setNotice('تم إنشاء حساب المورد مجانًا.');}
  }
  const stats=[['موردون محليون',db.suppliers.length],['قطاعات أعمال',categories.length],['شركات تجريبية',db.companies.length]];
  function card(s){return <article className="dc-card" key={s.id}>
    <div className="dc-card-top"><span className="dc-icon"><Building2 size={24}/></span><span className="dc-tag">DEMO</span>{premium(s)&&<span className="dc-premium"><Crown size={14}/>Premium</span>}</div>
    <span className="dc-category">{s.category}</span><h3>{s.name}</h3><p>{s.location}</p><p className="dc-description">{s.description}</p>
    <div className="dc-price">{Number.isFinite(cheapest(s))?<>من <strong>{money(cheapest(s))}</strong></>:'اطلب عرض سعر'} <small>أسعار DEMO</small></div>
    {premium(s)&&s.listings.some(l=>l.promoted)&&<span className="dc-tag">عرض ترويجي متاح</span>}
    <div className="dc-actions"><button className="dc-primary" onClick={()=>openProfile(s)}>عرض الملف <ArrowUpLeft size={16}/></button><button onClick={()=>inquire(s)}>استفسار</button></div>
    {company&&<div className="dc-actions dc-small"><button aria-pressed={favorites.includes(s.id)} onClick={()=>toggleSaved('favorites',s.id)}><Star size={15}/>{favorites.includes(s.id)?'إزالة من المفضلة':'حفظ'}</button><button aria-pressed={comparisons.includes(s.id)} onClick={()=>toggleSaved('comparisons',s.id)}>{comparisons.includes(s.id)?'إزالة من المقارنة':'أضف للمقارنة'}</button></div>}
  </article>;}
  const profile=db.suppliers.find(s=>s.id===selected);
  return <main className="dc-page" dir="rtl">
    <div className="dc-demo">DEMO — جميع الأنشطة والأسماء والعروض والمراسلات في هذه الصفحة تجريبية. لا توجد مدفوعات أو رسائل خارجية.</div>
    <header className="dc-heading"><div><span className="dc-kicker">RIADATECH AI · سوق الأعمال</span><h1>Duqm <span>Connect</span></h1><p>شريكك المحلي، لفرص أكبر في الدقم.</p></div>{role&&!choosingRole&&<div className="dc-entry-controls"><button ref={roleButton} onClick={()=>setChoosingRole(true)}>تغيير نوع الدخول</button><label className="dc-account">الحساب التجريبي النشط<select value={db.activeAccount} onChange={e=>switchAccount(e.target.value)}>{(role==='supplier'?db.suppliers:db.companies).map(a=><option key={a.id} value={a.id}>{a.name} — DEMO</option>)}{role==='supplier'&&<option value="admin">إدارة المنصة — DEMO</option>}</select></label></div>}</header>
    {choosingRole&&<dialog ref={roleDialog} className="dc-role-modal" aria-labelledby="dc-role-title" aria-describedby="dc-role-description" onCancel={e=>{if(!role)e.preventDefault();else setChoosingRole(false);}}>
      <h2 id="dc-role-title">كيف تريد استخدام دقم كونيكت؟</h2><p id="dc-role-description">اختر طريقة الدخول المناسبة لك</p>
      <div className="dc-role-cards">
        <button className="dc-role-card" onClick={()=>chooseRole('supplier')}><Building2 size={34}/><strong>أنا مورد</strong><span>اعرض شركتك ومنتجاتك وخدماتك وتواصل مع العملاء.</span><span className="dc-role-cta">الدخول كمورد</span></button>
        <button className="dc-role-card" onClick={()=>chooseRole('buyer')}><Search size={34}/><strong>أبحث عن موردين</strong><span>اكتشف الموردين المحليين وقارن الخدمات والعروض.</span><span className="dc-role-cta">استكشاف الموردين</span></button>
      </div><p className="dc-role-note">اختيار واجهة DEMO فقط، وليس تسجيل دخول أو تحققًا من الهوية.</p>{role&&<button onClick={()=>setChoosingRole(false)}>العودة</button>}
    </dialog>}
    {role&&!choosingRole&&<>
    <nav className="dc-nav" aria-label="أقسام Duqm Connect">{[...(role==='buyer'?[['market','السوق']]:[]),['dashboard',admin?'لوحة الإدارة':role==='supplier'?'لوحة المورد':'لوحة الشركة'],...(!admin?[['messages',`الرسائل${unread?' ('+unread+')':''}`]]:[]),...(role==='buyer'?[['favorites','المفضلة'],['compare',`المقارنة (${comparisons.length}/3)`]]:!admin?[['register','إنشاء ملف مورد مجانًا']]:[])].map(([key,label])=><button key={key} aria-current={view===key?'page':undefined} onClick={()=>go(key)}>{label}</button>)}<button onClick={()=>{if(window.confirm('إعادة ضبط جميع بيانات Duqm Connect المحلية وحذف التعديلات والرسائل؟')){setDb(seedMarketplace());setRole(null);setChoosingRole(true);roleAccounts.current={};go('market');setThreadId(null);setMessage('');setQuery('');setCategory('');setBudget('');setSort('priority');setNotice('تمت إعادة ضبط التجربة.');}}}><RotateCcw size={14}/>إعادة ضبط DEMO</button></nav>
    {storageError&&<p className="dc-alert" role="alert">{storageError}</p>}{notice&&<p className="dc-notice" role="status">{notice}</p>}
    {view==='market'&&role==='buyer'&&<>
      <section className="dc-hero"><div><span className="dc-tag">للشركات والموردين في الدقم</span><h2>كل ما يحتاجه مشروعك،<br/><span>في شبكة أعمال واحدة.</span></h2><p>اكتشف الموردين، قارن عروضهم، وابدأ الحوار. التسجيل والظهور الأساسي مجانيان دائمًا في هذه التجربة.</p><div className="dc-actions"><button onClick={()=>document.getElementById('dc-search')?.focus()}>ابحث عن شريك</button></div></div><div className="dc-stats">{stats.map(([label,n])=><div key={label}><strong>{n}</strong><span>{label}</span></div>)}</div></section>
      <div className="dc-categories"><button aria-pressed={!category} onClick={()=>setCategory('')}>كل القطاعات</button>{categories.map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</div>
      <section className="dc-panel dc-search"><label><span><Search size={16}/> ابحث عن مورد أو خدمة</span><input id="dc-search" type="search" placeholder="مثال: نقل، صيانة، معدات..." value={query} onChange={e=>setQuery(e.target.value)}/></label><label>حد السعر التجريبي (ر.ع.)<input type="number" min="0" value={budget} onChange={e=>setBudget(e.target.value)}/></label><label>ترتيب النتائج<select value={sort} onChange={e=>setSort(e.target.value)}><option value="priority">الأولوية والموردون المميزون</option><option value="price">السعر الأقل</option><option value="name">الاسم</option></select></label><button onClick={()=>{setQuery('');setCategory('');setBudget('');setSort('priority');}}>مسح الفلاتر</button></section>
      {visible.some(featured)&&<section><div className="dc-section-title"><h2><Crown size={22}/> موردون مميزون</h2><span>ظهور ترويجي · DEMO</span></div><div className="dc-grid">{visible.filter(featured).slice(0,3).map(card)}</div></section>}
      <div className="dc-section-title"><h2>اكتشف الموردين</h2><span>{visible.length} مورد · الأسعار بوحدات مختلفة، راجع تفاصيل العرض</span></div><div className="dc-grid">{visible.map(card)}</div>{!visible.length&&<p className="dc-empty">لا توجد نتائج. جرّب كلمة أخرى أو امسح الفلاتر.</p>}
    </>}
    {view==='register'&&role==='supplier'&&<ProfileForm key="new" onSave={form=>{const id=uid();setDb(d=>({...d,activeAccount:id,suppliers:[...d.suppliers,{...form,id,listings:[],views:0,premiumUntil:null,featuredOverride:null}]}));go('dashboard');setNotice('تم تسجيل المورد مجانًا. أضف عروضك من لوحة الحساب.');}} onCancel={()=>go('dashboard')}/>}
    {view==='profile'&&profile&&<section className="dc-panel"><button onClick={()=>go(role==='supplier'?'dashboard':'market')}>{role==='supplier'?'العودة للوحة':'العودة للسوق'}</button><span className="dc-tag">DEMO</span><h2>{profile.name} {premium(profile)&&<span className="dc-premium">Premium</span>}</h2><p>{profile.description}</p><p>{profile.category} · {profile.location}</p><p>{profile.email} · {profile.phone}</p>{role==='buyer'&&<button className="dc-primary" onClick={()=>inquire(profile)}><MessageSquare size={16}/>إرسال استفسار محلي</button>}<h3>المنتجات والخدمات</h3><div className="dc-grid">{profile.listings.map(l=><article className="dc-card" key={l.id}><span className="dc-tag">{l.type} · DEMO</span>{premium(profile)&&l.promoted&&<span className="dc-premium">عرض ترويجي</span>}<h3>{l.name}</h3><p>{l.description}</p><strong>{money(l.price)} / {l.unit}</strong>{role==='buyer'&&<button onClick={()=>inquire(profile)}>استفسر عن العرض</button>}</article>)}</div>{!profile.listings.length&&<p>لم يضف المورد عروضًا بعد. يمكنك إرسال استفسار.</p>}</section>}
    {view==='favorites'&&company&&<><h2>الموردون المحفوظون</h2><div className="dc-grid">{db.suppliers.filter(s=>favorites.includes(s.id)).map(card)}</div>{!favorites.length&&<p className="dc-empty">لم تحفظ موردين بعد. استخدم زر «حفظ» في السوق.</p>}</>}
    {view==='compare'&&company&&<section className="dc-panel"><h2>قارن حتى 3 موردين</h2><p>الأسعار تجريبية وقد تختلف وحدة التسعير ونطاق العمل بين الموردين.</p><div className="dc-grid">{db.suppliers.filter(s=>comparisons.includes(s.id)).map(s=><article className="dc-card" key={s.id}><h3>{s.name}</h3><p>{s.category}</p><p>{s.location}</p><p>{premium(s)?'Premium':'مجاني'} · DEMO</p>{s.listings.map(l=><p key={l.id}>{l.name}: {money(l.price)} / {l.unit}</p>)}<button onClick={()=>inquire(s)}>إرسال استفسار</button><button onClick={()=>toggleSaved('comparisons',s.id)}>إزالة من المقارنة</button></article>)}</div>{!comparisons.length&&<p className="dc-empty">اختر الموردين من السوق لإضافتهم إلى المقارنة.</p>}</section>}
    {view==='messages'&&<section className="dc-panel"><h2>مراسلات {accountName}</h2><p>للتبديل بين طرفي المحادثة، استخدم «تغيير نوع الدخول» ثم اختر الحساب التجريبي المقصود. الرسائل محفوظة في هذا المتصفح فقط.</p><div className="dc-inbox"><aside>{threads.map(t=><button key={t.id} aria-pressed={threadId===t.id} onClick={()=>openThread(t.id)}><MessageSquare size={16}/>{supplier?db.companies.find(c=>c.id===t.companyId)?.name:db.suppliers.find(s=>s.id===t.supplierId)?.name}<small>{t.messages.filter(m=>!m.readBy.includes(db.activeAccount)).length} غير مقروءة</small></button>)}{!threads.length&&<p>لا توجد محادثات بعد.</p>}</aside><div>{thread?<><div className="dc-messages" aria-live="polite">{thread.messages.map(m=><div key={m.id} className={`dc-message ${m.from===db.activeAccount?'dc-mine':''}`}><strong>{db.suppliers.find(s=>s.id===m.from)?.name || db.companies.find(c=>c.id===m.from)?.name}</strong><p>{m.text}</p><small>{new Date(m.at).toLocaleString('ar-OM')}</small></div>)}{!thread.messages.length&&<p>اكتب استفسارك الأول.</p>}</div><form className="dc-compose" onSubmit={send}><label>الرسالة<textarea required maxLength={3000} value={message} onChange={e=>setMessage(e.target.value)} placeholder={role==='supplier'?'اكتب ردك على العميل...':'أخبر المورد باحتياجاتك...'}/></label><button className="dc-primary" disabled={!message.trim()}>إرسال</button></form></>:<p className="dc-empty">اختر محادثة أو أرسل استفسارًا من ملف مورد.</p>}</div></div></section>}
    {view==='dashboard'&&supplier&&<>
      <div className="dc-section-title"><div><h2>مرحبًا، {supplier.name}</h2><p>لوحة المورد · DEMO</p></div><button onClick={()=>openProfile(supplier)}>معاينة الملف</button></div>
      <section className="dc-panel dc-plan"><div><h3>{premium(supplier)?'خطتك الحالية: Premium':'خطتك الحالية: مجانية'}</h3><p>المجانية: تسجيل، ملف أعمال، منتجات وخدمات، وظهور عادي في البحث.</p><p>Premium: ظهور مميز وأولوية في البحث، عروض ترويجية، شارة وإحصاءات أساسية.</p><strong>9 ر.ع. / شهر</strong><p>تفعيل DEMO فقط — لا دفع ولا تجديد تلقائي.</p>{premium(supplier)&&<p>تنتهي التجربة في {new Date(supplier.premiumUntil).toLocaleDateString('ar-OM')}</p>}</div><button className="dc-primary" onClick={()=>{updateSupplier(supplier.id,s=>({...s,premiumUntil:premium(s)?null:new Date(Date.now()+30*86400000).toISOString()}));setNotice(premium(supplier)?'تم التحويل للخطة المجانية مع بقاء العروض.':'تم تفعيل Premium التجريبي وتحديث أولوية الظهور فورًا.');}}>{premium(supplier)?'العودة للخطة المجانية':'تفعيل Premium التجريبي'}</button></section>
      {premium(supplier)&&<div className="dc-stats">{[['مشاهدات الملف المحلية',supplier.views],['الاستفسارات',threads.length],['العروض',supplier.listings.length]].map(([label,n])=><div key={label}><strong>{n}</strong><span>{label}</span></div>)}</div>}
      <div className="dc-actions"><button onClick={()=>setEditProfile(!editProfile)}>تعديل الملف</button><button onClick={()=>setEditListing({})}><Package size={16}/>إضافة منتج أو خدمة</button><button onClick={()=>go('messages')}>عرض الاستفسارات ({unread})</button></div>
      {editProfile&&<ProfileForm key={supplier.id} supplier={supplier} onSave={saveProfile} onCancel={()=>setEditProfile(false)}/>}
      {editListing&&<ListingForm key={editListing.id || 'new'} listing={editListing.id?editListing:null} canPromote={premium(supplier)} onCancel={()=>setEditListing(null)} onSave={form=>{updateSupplier(supplier.id,s=>({...s,listings:form.id?s.listings.map(l=>l.id===form.id?form:l):[...s.listings,{...form,id:uid()}]}));setEditListing(null);setNotice('تم حفظ العرض.');}}/>}
      <div className="dc-grid">{supplier.listings.map(l=><article className="dc-card" key={l.id}><span className="dc-tag">{l.type} · DEMO</span><h3>{l.name}</h3><p>{l.description}</p><strong>{money(l.price)} / {l.unit}</strong><div className="dc-actions"><button onClick={()=>setEditListing(l)}>تعديل</button><button onClick={()=>{if(window.confirm('حذف هذا العرض التجريبي؟'))updateSupplier(supplier.id,s=>({...s,listings:s.listings.filter(x=>x.id!==l.id)}));}}>حذف العرض</button></div></article>)}</div>
    </>}
    {view==='dashboard'&&company&&<section className="dc-panel"><h2>{company.name}</h2><div className="dc-stats">{[['favorites','المفضلة',favorites.length],['compare','المقارنات',comparisons.length],['messages','المحادثات',threads.length]].map(([key,label,n])=><button key={key} onClick={()=>go(key)}><strong>{n}</strong>{label}</button>)}</div><button className="dc-primary" onClick={()=>go('market')}>البحث عن الموردين</button></section>}
    {view==='dashboard'&&admin&&<section className="dc-panel"><h2>لوحة إدارة DEMO</h2><div className="dc-stats">{[['الموردون',db.suppliers.length],['الشركات',db.companies.length],['موردو Premium',db.suppliers.filter(premium).length],['المحادثات',db.threads.length],['الرسائل',db.threads.reduce((n,t)=>n+t.messages.length,0)]].map(([label,n])=><div key={label}><strong>{n}</strong>{label}</div>)}</div><h3>إدارة الموردين المميزين</h3><div className="dc-admin-list">{db.suppliers.map(s=><div key={s.id}><span>{s.name} · {s.category} · DEMO</span><button onClick={()=>updateSupplier(s.id,x=>({...x,featuredOverride:!featured(x)}))}>{featured(s)?'إزالة التمييز':'تمييز المورد'}</button><button onClick={()=>updateSupplier(s.id,x=>({...x,featuredOverride:null}))}>حسب الخطة</button><button onClick={()=>openProfile(s)}>عرض</button></div>)}</div><h3>الشركات</h3>{db.companies.map(c=><p key={c.id}>{c.name}</p>)}</section>}
    </>}
    <footer className="dc-footer">Duqm Connect · RiadaTech AI — سوق B2B تجريبي، دون معاملات أو جهات تجارية حقيقية.</footer>
  </main>;
}
