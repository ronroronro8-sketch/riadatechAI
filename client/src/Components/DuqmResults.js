import React from 'react';

export default function DuqmResults({ result, locale, onFocus }) {
  const ar = locale === 'ar';
  return <div className="rt-map-accordion-stack" data-testid="duqm-results">
    <div className="rt-map-status-banner" role="status">
      <strong>{ar ? 'مصادر البيانات' : 'Data sources'}: {result.data_mode}</strong>
      <p>{ar ? result.notice_ar : result.notice_en}</p>
      <p>{ar ? 'تاريخ تنزيل بيانات الخرائط' : 'Map data downloaded'}: {result.retrievedAt || (ar ? 'بيانات تجريبية' : 'DEMO only')}</p>
      <p>{ar ? 'هذه مناطق بحث وليست عقارات متاحة للإيجار. لا تتوفر أرقام موثقة للسكان أو الإيجارات.' : 'These are search areas, not properties available to rent. Verified population and rental figures are unavailable.'}</p>
      <p>{ar ? 'الأوزان: المنافسة 30%، الخدمات المرتبطة 30%، مؤشر الجمهور 20%، القرب من الخدمات 20%. عند إدخال حد الإيجار، يُخصص 15% من النتيجة لملاءمة الإيجار التجريبي. الميزانية الاستثمارية واسم المشروع والحي معلومات سياقية وليست مؤشرات موثقة.' : 'Weights: competition 30%, related services 30%, audience proxy 20%, service proximity 20%. With a rent limit, 15% of the final score is demo rent fit. Startup budget, project name and neighborhood are context, not verified scoring inputs.'}</p>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors (ODbL)</a>
    </div>
    <h3>{ar ? 'أفضل 3 مواقع مقترحة في الدقم' : 'Top 3 recommended locations in Duqm'}</h3>
    <div className="rt-duqm-recommendations">
      {result.recommendations.map((r, index) => <article key={r.id} className="rt-map-result-card">
        <h4>{index + 1}. {ar ? r.area_name_ar : r.area_name}</h4>
        <strong>{r.score} / 100 · {ar ? 'تقديري' : 'ESTIMATED'}</strong>
        <p>{ar ? r.explanation_ar : r.explanation_en}</p>
        <p>{ar ? 'كثافة المنافسين المسجلين / كم²' : 'Recorded competitors / km²'}: {r.competitor_density}</p>
        <p>{ar ? 'مؤشرات التقييم: المنافسة / النشاط / الجمهور / القرب من الخدمات' : 'Scores: competition / activity / audience proxy / service proximity'}: {r.score_breakdown.competition} / {r.score_breakdown.activity} / {r.score_breakdown.audience} / {r.score_breakdown.accessibility}</p>
        {r.demo_monthly_rent !== null && <p>DEMO · {ar ? 'إيجار شهري افتراضي' : 'Simulated monthly rent'}: {r.demo_monthly_rent} OMR · {ar ? 'ليس عرض إيجار حقيقيًا' : 'Not a real listing'}</p>}
        <p>{ar ? 'الخدمات القريبة' : 'Nearby services'}: {r.nearby_services.length ? r.nearby_services.map(p => `${p.name} [${p.data_kind}]`).join(' · ') : (ar ? 'لا توجد سجلات كافية' : 'Limited records')}</p>
        <button type="button" className="rt-map-button" onClick={() => onFocus(r)}>{ar ? 'عرض على الخريطة' : 'Focus on map'} {index + 1}</button>
      </article>)}
    </div>
    <section className="rt-map-result-card">
      <h3>{ar ? 'المنافسون حول الموقع الذي تم تحليله' : 'Competitors around analyzed location'} ({result.competitor_count})</h3>
      <p>{result.competitor_location.latitude.toFixed(5)}, {result.competitor_location.longitude.toFixed(5)}</p>
      <p>{ar ? 'ضمن نطاق البحث؛ لا يمثل تعدادًا شاملاً للسوق.' : 'Within your search radius; not a complete market census.'}</p>
      {!result.competitors.length && <p>{ar ? 'لا توجد سجلات ضمن هذا النطاق. وسّع نطاق البحث؛ هذا لا يعني غياب المنافسين.' : 'No records within this radius. Increase the radius; this does not establish an absence of competitors.'}</p>}
      {result.competitors.map(p => <p key={p.id}>{p.name} · {p.category} · {p.distanceKm} km · <strong>{p.data_kind}</strong></p>)}
    </section>
  </div>;
}
