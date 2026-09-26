import { parse } from 'parse5';
import { createHash } from 'node:crypto';
export const digest = text => createHash('sha256').update(text).digest('hex');
const hosts = new Set(['gov.om','www.gov.om','tejarah.gov.om','www.tejarah.gov.om','taxoman.gov.om','www.taxoman.gov.om','tms.taxoman.gov.om','sme.gov.om','www.sme.gov.om']);
export function officialURL(input, base) {
  const u = new URL(input, base);
  if (u.protocol !== 'https:' || !hosts.has(u.hostname) || u.username || u.password || (u.port && u.port !== '443') || /(?:login|sign-in|signin|oauth|auth\/|logout)/i.test(u.pathname)) throw new Error('Disallowed official source URL');
  u.hash = ''; for (const key of [...u.searchParams.keys()]) if (key !== 'ID') u.searchParams.delete(key);
  return u.href;
}
export async function fetchOfficialPage(url, fetchImpl = fetch) {
  let target = officialURL(url);
  const signal = AbortSignal.timeout(25000);
  for (let hop = 0; hop < 5; hop++) {
    const response = await fetchImpl(target, { redirect: 'manual', signal, headers: { Accept: 'text/html', 'User-Agent': 'RiadaTech-OfficialKnowledge/1.0 (public service information)' } });
    if ([301,302,303,307,308].includes(response.status)) { const next=response.headers.get('location');await response.body?.cancel();if(!next)throw new Error('Redirect without location');target=officialURL(next,target);continue; }
    if (!response.ok) { await response.body?.cancel();throw new Error(`HTTP ${response.status}`); }
    if (!response.headers.get('content-type')?.includes('text/html')) { await response.body?.cancel();throw new Error('HTML sources only'); }
    const reader = response.body.getReader(); const chunks=[];let size=0;
    try { while(true) { const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)throw new Error('Source exceeds size limit');chunks.push(Buffer.from(value)); } }
    finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
    return { html: Buffer.concat(chunks).toString('utf8'), url: target };
  }
  throw new Error('Too many redirects');
}
const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value??'';
function all(node,predicate,out=[]) { if(predicate(node))out.push(node);for(const c of node.childNodes??[])all(c,predicate,out);return out; }
const clean = text => text.replace(/\u00a0/g,' ').replace(/[ \t\r]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim().replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email omitted]');
const dropTags = new Set(['script','style','noscript','nav','footer','header','form','input','button','gup-button','iframe','svg','dialog']);
function visible(node, headings=false) {
  if(node.nodeName==='#text')return node.value;
  if(dropTags.has(node.tagName)||/navigation|breadcrumb|cookie|footer|social-share|service-user-info|startnow-link|feedback/i.test(attr(node,'class')+' '+attr(node,'id')))return '';
  if(node.tagName==='img')return /oman-rial|^OMR$/i.test(attr(node,'alt'))?' OMR ':'';
  const text=(node.childNodes??[]).map(n=>visible(n,headings)).join('');
  if(/^h[1-6]$/.test(node.tagName))return `\n\n${headings?'## ':''}${clean(text)}\n\n`;
  if(['p','li','div','section','article','tr','ul','ol','time','br'].includes(node.tagName))return '\n'+text+'\n';
  if(['td','th'].includes(node.tagName))return text+' | ';
  return text;
}
export function officialDate(raw) {
  if(!raw)return null;
  const months=['يناير','فبراير','مارس','ابريل','مايو','يونيو','يوليو','اغسطس','سبتمبر','اكتوبر','نوفمبر','ديسمبر'];
  let value=raw.replace(/[أإآ]/g,'ا').replace(/[٠-٩]/g,c=>c.charCodeAt(0)-1632);
  for(let i=0;i<months.length;i++) if(value.includes(months[i])) { const nums=value.match(/\d+/g)??[];const y=nums.find(n=>n.length===4),d=nums.find(n=>n.length<3);return y&&d?`${y}-${String(i+1).padStart(2,'0')}-${d.padStart(2,'0')}`:null; }
  const iso=value.match(/\b(20\d{2}-\d{2}-\d{2})\b/);if(iso)return iso[1];
  if(/[A-Za-z]/.test(value)&&/20\d{2}/.test(value)){const timestamp=Date.parse(value.replace(/Updated:|Published:/i,''));if(Number.isFinite(timestamp))return new Date(timestamp).toISOString().slice(0,10);}
  return null;
}
export function extractPage(html, url, spec) {
  const tree=parse(html);
  const find=predicate=>all(tree,predicate)[0];
  const root=find(n=>n.tagName==='article'&&attr(n,'class').includes('service-detail')) || find(n=>n.tagName==='main') || find(n=>n.tagName==='article') || find(n=>attr(n,'id')==='content') || find(n=>n.tagName==='body');
  if(!root)throw new Error('No article body');
  const rawText=clean(visible(root));
  let cleanedText=clean(visible(root,true));
  cleanedText=cleanedText.replace(/هل هذه المعلومات مفيدة؟/g,'').replace(/من خلال تحديد[^\n]*\n?إعادة توجيهك الى موقع المؤسسة/g,'').replace(/بالضغط على "ابدأ الخدمة"[^\n]*\n?المؤسسة المقدمة للخدمة\./g,'');
  const lines=cleanedText.split('\n').filter(l=>!/^((اظهر|اخف|إخفاء|Show|Hide)|ابدأ الخدمة|Start now|Visit website|دخول)$/.test(l.trim()));
  // Collapse adjacent duplicate boilerplate, not substantive repeated conditions.
  cleanedText=lines.filter((l,i)=>l!==lines[i-1]).join('\n');
  const h1=all(root,n=>n.tagName==='h1')[0];
  let title=clean(h1?visible(h1):attr(find(n=>n.tagName==='meta'&&attr(n,'property')==='og:title')??{},'content') || visible(find(n=>n.tagName==='title')??{})).replace(/\s*[-|]\s*(Gov.om|Tax Portal).*$/i,'');
  if(/ServiceDetails/i.test(title))title=rawText.split('\n').find(line=>line.trim())??title;
  if(!title||cleanedText.length<160||/access denied|just a moment|page not found|الصفحة غير موجودة/i.test(title))throw new Error('No usable official article');
  const canonical=attr(find(n=>n.tagName==='link'&&attr(n,'rel')==='canonical')??{},'href');
  const canonicalUrl=canonical?officialURL(canonical,url):officialURL(url);
  const updatedRaw=attr(find(n=>n.tagName==='meta'&&['article:modified_time','dateModified'].includes(attr(n,'property')||attr(n,'name')))??{},'content') || clean(visible(all(root,n=>n.tagName==='time')[0]??{})) || null;
  const publishedRaw=attr(find(n=>n.tagName==='meta'&&['article:published_time','datePublished'].includes(attr(n,'property')||attr(n,'name')))??{},'content')||null;
  const entity=all(root,n=>attr(n,'class').split(/\s+/).includes('entities'))[0];
  const authority=entity?clean(visible(entity)):spec.authority;
  return { title, canonicalUrl, domain:new URL(canonicalUrl).hostname, authority, language:(cleanedText.match(/[\u0600-\u06ff]/g)?.length??0)>(cleanedText.match(/[a-z]/gi)?.length??0)?'ar':'en',topics:spec.topics,
    rawText,cleanedText,officialUpdatedRaw:updatedRaw,officialUpdatedAt:officialDate(updatedRaw),officialPublishedRaw:publishedRaw,officialPublishedAt:officialDate(publishedRaw) };
}
export function chunkPage(page, maxChars=1600) {
  const chunks=[];let heading=page.title,parts=[];
  const flush=()=>{if(parts.length){chunks.push({heading,text:parts.join('\n\n')});parts=[];}};
  for(const block of page.cleanedText.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean)) {
    if(block.startsWith('## ')){flush();heading=block.slice(3);continue;}
    // Paragraph/sentence boundaries first; very long paragraphs split at word boundaries.
    const units=block.length>maxChars?block.split(/(?<=[.!؟؛])\s+|\n/):[block];
    for(const unit of units){let fragment='';for(const word of unit.split(/\s+/)){if(fragment.length+word.length>maxChars){flush();chunks.push({heading,text:fragment});fragment='';}fragment+=(fragment?' ':'')+word;}
      if(parts.join('\n\n').length+fragment.length>maxChars)flush();if(fragment)parts.push(fragment);}
  }
  flush();return chunks.filter(c=>c.text.trim().length>1);
}
