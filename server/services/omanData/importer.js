import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
export const DATA_DIR = fileURLToPath(new URL('../../data/oman-open-data/', import.meta.url));
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/[٠-٩]/g, c => String(c.charCodeAt(0)-1632)).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
export const locationKey = value => normalize(value).replace(/\bgovernorate\b|\bof\b|محافظة|محافظه/g, '').trim().replace(/\s+/g, ' ');
const aliases = { governorate:['المحافظة','المحافظات','governorate','regionname'], wilayat:['الولاية','wilayat','wilayatname'], activity:['النشاط','الانشطة','النشاط الحرفي','النشاط السياحي','النشاط الاقتصادي','activity'], domain:['نشاط المشروع','مجال المشروع','domain','sector'], legalForm:['الشكل القانوني','legal form','legalform'], period:['الفترة','period'], year:['السنة','year'], quarter:['الربع','quarter'] };
export function dimension(header) { const n=normalize(header); return Object.keys(aliases).find(k=>aliases[k].some(a=>normalize(a)===n)); }
const present = v => v !== null && v !== undefined && String(v).trim() !== '';
export function classify(rows) {
 const cells=rows.slice(0,8).flat().map(normalize);
 if(cells.includes('اسم المتغير') || cells.includes('variable name')) return 'dictionary';
 if(cells.includes('اسم مجموعة البيانات') || cells.includes('dataset name')) return 'metadata';
 return 'data';
}
function metadata(sheets) {
 const pairs=[];for(const s of sheets.filter(s=>s.kind==='metadata')) for(const row of s.rows) for(let i=0;i<row.length-1;i+=2) if(present(row[i])) pairs.push({key:row[i],value:row[i+1]??null});
 const get=(...names)=>pairs.find(p=>names.map(normalize).includes(normalize(p.key)))?.value??null;
 const title=get('اسم مجموعة البيانات','dataset name'), description=get('وصف مجموعة البيانات','description');
 const reference=get('الفترة المرجعية للبيانات','reference period');
 const text=normalize(`${title??''} ${description??''}`);
 const quarter=text.match(/الربع (الاول|الثاني|الثالث|الرابع)/)?.[1];
 const year=text.match(/\b20\d{2}\b/)?.[0];
 const period={reference,coverage:quarter&&year?`${year}-Q${['الاول','الثاني','الثالث','الرابع'].indexOf(quarter)+1}`:text.includes('النصف الاول')&&year?`${year}-H1`:reference===null?null:String(reference),publication:get('تاريخ النشر','publication date'),evidence:quarter||text.includes('النصف الاول')?description:null};
 return {title,description,source:get('المصدر','source'),period,pairs};
}
function typeOf(meta,sheet,headers) {
 const t=normalize(meta.title), s=normalize(sheet);
 if(headers.includes('RegionName')||headers.includes('WilayatName'))return 'geography';
 if(t.includes('رائدات')) return 'women_entrepreneurs';
 if(t.includes('خريف'))return 'khareef_participants';
 if(t.includes('سياحي'))return 'tourism_establishments';
 if(t.includes('الناش'))return 'startups';
 if(t.includes('المنزلي'))return 'home_business_licenses';
 if(t.includes('الصناعي'))return 'industrial_licenses';
 if(t.includes('التقارير'))return 'news_reports';
 if(t.includes('الانشطة المرخصة'))return 'licensed_activities';
 if(t.includes('السجلات التجارية'))return 'commercial_registrations';
 return `custom_${hash(headers).slice(0,12)}`;
}
export async function inspectDirectory(directory=DATA_DIR) {
 const datasets=[], ignored=[], files=[];
 for(const file of (await fs.readdir(directory)).sort()) {
  if(!/\.(xlsx|csv)$/i.test(file)){ignored.push({file,reason:'unsupported extension'});continue;}
  const bytes=await fs.readFile(path.join(directory,file));
  let sheets;
  if(/\.csv$/i.test(file)) sheets=[{name:'CSV',rows:parse(bytes.toString('utf8'),{bom:true,relax_column_count:true,skip_empty_lines:false})}];
  else {const book=XLSX.read(bytes,{type:'buffer'});sheets=book.SheetNames.map(name=>({name,rows:XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:null,blankrows:true})}));}
  sheets.forEach(s=>s.kind=classify(s.rows));const meta=metadata(sheets);
  const tables=[];
  for(const sheet of sheets) {
   if(sheet.kind!=='data')continue;
   const at=sheet.rows.findIndex(row=>row.filter(present).length>=2&&row.some(h=>dimension(h)));
   if(at<0){ignored.push({file,sheet:sheet.name,reason:'no recognized tabular header; requires mapping'});continue;}
   const headers=sheet.rows[at].map((label,column)=>({label,column})).filter(h=>present(h.label));
   const rows=sheet.rows.slice(at+1).map((r,i)=>({row:at+i+2,values:headers.map(h=>r[h.column]??null)})).filter(r=>r.values.some(present));
   tables.push({sheet:sheet.name,headers,rows,type:typeOf(meta,sheet.name,headers.map(h=>h.label))});
  }
  const signature=hash({meta,tables:tables.map(t=>({...t,rows:t.rows.map(r=>r.values)}))});
  const existing=datasets.find(d=>d.signature===signature);
  const info={file,sha256:createHash('sha256').update(bytes).digest('hex'),sheets:sheets.map(s=>({name:s.name,kind:s.kind})),rows:tables.reduce((n,t)=>n+t.rows.length,0)};
  files.push(info);
  if(existing){existing.files.push(file);ignored.push({file,reason:'identical content including metadata',duplicateOf:existing.files[0]});continue;}
  datasets.push({id:signature,signature,files:[file],meta,tables});
 }
 return {datasets,files,ignored};
}
export function buildRecords(scan, importedAt=new Date()) {
 const governors=new Map(), placeAliases={governorate:new Map(),wilayat:new Map()};
 for(const d of scan.datasets)for(const t of d.tables)for(const r of t.rows){const obj=Object.fromEntries(t.headers.map((h,i)=>[h.label,r.values[i]]));for(const [field,ar,en] of [['governorate','RegionName','RegionNameEN'],['wilayat','WilayatName','WilayatNameEN']])if(obj[ar]){const canonical=locationKey(obj[ar]);placeAliases[field].set(locationKey(obj[ar]),canonical);if(obj[en])placeAliases[field].set(locationKey(obj[en]),canonical);if(field==='governorate')governors.set(obj.RegionId,obj[ar]);}}
 const records=[];
 for(const d of scan.datasets)for(const t of d.tables)for(const r of t.rows){
  const fields=t.headers.map((h,i)=>({column:h.column,label:h.label,value:r.values[i],numericValue: typeof r.values[i]==='number'?r.values[i]:typeof r.values[i]==='string'&&/^-?\d+(\.\d+)?$/.test(r.values[i].trim())?Number(r.values[i]):null,normalized:typeof r.values[i]==='string'?normalize(r.values[i]):null}));
  const dimensions={};for(const f of fields){const k=dimension(f.label);if(k&&present(f.value)){const n=['governorate','wilayat'].includes(k)?locationKey(f.value):normalize(f.value);dimensions[k]={original:f.value,normalized:placeAliases[k]?.get(n)??n};}}
  if(t.headers.some(h=>h.label==='WilayatName')){const id=fields.find(f=>f.label==='RegionId')?.value;const original=governors.get(id);if(original)dimensions.governorate={original,normalized:locationKey(original),derivedFrom:'RegionId join'};}
  const isTotal=r.values.some(v=>/^(الاجمالي|المجموع|total|grand total)$/.test(normalize(v)));
  records.push({_id:hash([d.id,t.sheet,r.row]),datasetId:d.id,datasetType:t.type,sheet:t.sheet,sourceRow:r.row,isTotal,fields,dimensions,provenance:{dataset:d.meta.title??t.sheet,files:d.files,source:d.meta.source,portal:'https://opendata.gov.om',period:{...d.meta.period,...Object.fromEntries(['period','year','quarter'].filter(k=>dimensions[k]).map(k=>[k,dimensions[k].original]))},importedAt}});
 }
 return {records,aliases:Object.fromEntries(Object.entries(placeAliases).map(([k,v])=>[k,Object.fromEntries(v)]))};
}
