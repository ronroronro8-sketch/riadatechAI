import { inspectDirectory, buildRecords, normalize, locationKey } from './importer.js';
export function createOmanDataService({Record,State,directory}) {
 async function reimport() {
  try{await State.create({_id:'import-lock',payload:{startedAt:new Date()}});}catch(e){if(e.code===11000)throw Object.assign(new Error('Import already running.'),{status:409});throw e;}
  try{
   const scan=await inspectDirectory(directory), {records,aliases}=buildRecords(scan);
   if(!records.length)throw new Error('No recognized records; previous snapshot retained.');
   const vocabulary={};for(const r of records)for(const [key,value]of Object.entries(r.dimensions)){(vocabulary[key]??=new Set()).add(value.normalized);}
   for(let i=0;i<records.length;i+=500)await Record.bulkWrite(records.slice(i,i+500).map(r=>({updateOne:{filter:{_id:r._id},update:{$setOnInsert:r},upsert:true}})));
   const payload={importedAt:new Date(),datasetIds:scan.datasets.map(d=>d.id),aliases,vocabulary:Object.fromEntries(Object.entries(vocabulary).map(([k,v])=>[k,[...v]])),datasets:scan.datasets.map(d=>({id:d.id,files:d.files,metadata:d.meta,tables:d.tables.map(t=>({sheet:t.sheet,type:t.type,rows:t.rows.length}))})),files:scan.files,ignored:scan.ignored,totalRecords:records.length};
   // Publish only after every immutable record has been written. Readers see one complete snapshot.
   await State.updateOne({_id:'active'},{$set:{payload}},{upsert:true});return payload;
  }finally{await State.deleteOne({_id:'import-lock'});}
 }
 async function query(filters={},limit=12){
  const state=(await State.findById('active').lean())?.payload;if(!state)return {status:'not_imported',results:[]};
  const match={datasetId:{$in:state.datasetIds},isTotal:false};
  for(const key of ['governorate','wilayat','activity','domain','legalForm','year','quarter'])if(filters[key]!==undefined){if(typeof filters[key]!=='string')throw new TypeError('Filters must be strings');const n=['governorate','wilayat'].includes(key)?locationKey(filters[key]):normalize(filters[key]);match[`dimensions.${key}.normalized`]=state.aliases[key]?.[n]??n;}
  if(filters.datasetType){if(typeof filters.datasetType!=='string')throw new TypeError('Invalid dataset type');match.datasetType=filters.datasetType;}
  if(filters.period){if(typeof filters.period!=='string')throw new TypeError('Invalid period');match['provenance.period.coverage']=filters.period;}
  if(filters.datasetId){if(!state.datasetIds.includes(filters.datasetId))return {status:'no_matching_data',results:[]};match.datasetId=filters.datasetId;}
  const cap=Math.max(1,Math.min(12,Number(limit)||12));
  const groups=await Record.aggregate([{$match:match},{$group:{_id:{datasetId:'$datasetId',sheet:'$sheet',period:'$provenance.period'},source:{$first:'$provenance'},rowCount:{$sum:1}}},{$sort:{'_id.datasetId':1,'_id.sheet':1}},{$limit:cap+1}]).option({maxTimeMS:5000});
  const results=[];
  for(const g of groups.slice(0,cap)){
   const m={...match,datasetId:g._id.datasetId,sheet:g._id.sheet,'provenance.period':g._id.period};
   const metrics=await Record.aggregate([{$match:m},{$unwind:'$fields'},{$match:{'fields.label':{$in:['العدد','تقارير النشرات السمعية','تقارير النشرات المرئية','count','Count']}}},{$group:{_id:'$fields.label',sum:{$sum:{$cond:[{$isNumber:'$fields.numericValue'},'$fields.numericValue',0]}},numericRows:{$sum:{$cond:[{$isNumber:'$fields.numericValue'},1,0]}}}}]).option({maxTimeMS:5000});
   const sample=await Record.find(m).select('fields dimensions sourceRow').limit(2).lean();
   results.push({datasetId:g._id.datasetId,sheet:g._id.sheet,provenance:g.source,rowCount:g.rowCount,rowCountMeaning:'matching source rows, not necessarily unique entities',metrics:metrics.map(v=>({label:v._id,value:v.numericRows===g.rowCount?v.sum:null,knownPartialSum:v.numericRows?v.sum:null,missingOrNonNumeric:g.rowCount-v.numericRows})),sample});
  }
  return {status:results.length?'available':'no_matching_data',filters,results,truncated:groups.length>cap};
 }
 async function context(message){
  try{
   const state=(await State.findById('active').lean())?.payload;if(!state)return {status:'not_imported',results:[]};
   const text=` ${normalize(message)} `;const filters={};
   const types=[['women_entrepreneurs',['رائدات','women']],['khareef_participants',['خريف','khareef']],['tourism_establishments',['سياح','tourism']],['startups',['ناش','startups']],['home_business_licenses',['منزلي','home based']],['industrial_licenses',['صناعي','industrial']],['news_reports',['نشرات','تقارير محلية','news reports']],['licensed_activities',['انشطة مرخصة','الانشطة المرخصة','licensed activities']],['commercial_registrations',['سجلات تجارية','السجلات التجارية','commercial records']],['geography',['اسماء المحافظات','اسماء الولايات']]];
   const hits=types.filter(([,words])=>words.some(w=>text.includes(w)));
   if(hits.length!==1)return {status:'needs_dataset_clarification',results:[],availableTypes:types.map(([k])=>k)};
   filters.datasetType=hits[0][0];
   for(const key of ['governorate','wilayat','activity','domain','legalForm']){
    const candidates=new Set();for(const v of state.vocabulary[key]??[])if(text.includes(` ${v} `))candidates.add(v);
    for(const [alias,value]of Object.entries(state.aliases[key]??{}))if(text.includes(` ${alias} `))candidates.add(value);
    if(candidates.size>1)return {status:'ambiguous_filters',dimension:key,results:[]};if(candidates.size)filters[key]=[...candidates][0];
   }
   if(filters.governorate && filters.wilayat && filters.governorate===filters.wilayat){
    if(text.includes('محافظة')||text.includes('governorate'))delete filters.wilayat;
    else if(text.includes('ولاية')||text.includes('wilayat'))delete filters.governorate;
    else return {status:'ambiguous_location',results:[]};
   }
   // Never silently drop an explicit time restriction or claim range data is annual data.
   const years=[...new Set(text.match(/\b20\d{2}\b/g)??[])];
   if(years.length){const q=text.match(/الربع (الاول|الثاني|الثالث|الرابع)/)?.[1];filters.period=years.length===2?years.join('-'):q?`${years[0]}-Q${['الاول','الثاني','الثالث','الرابع'].indexOf(q)+1}`:years[0];}
   const result=await query(filters,4);
   result.scopeWarning='Only the listed filters were resolved. Do not present these results as answering additional locations, activities, periods or rankings in the question. Ask for clarification when scope differs. Row counts are not unique entity counts; datasets may overlap. Never sum across datasets.';
   while(JSON.stringify(result).length>12000&&result.results.length) {result.results.pop();result.truncated=true;}
   if(!result.results.length&&result.status==='available')result.status='insufficient_context';return result;
  }catch{return {status:'unavailable',results:[]};}
 }
 return {reimport,query,context};
}
