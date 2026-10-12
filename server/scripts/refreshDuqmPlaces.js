import { writeFile, rename } from 'node:fs/promises';
// Explicit maintenance command only. Never geocode on each page visit.
// Respect the public Nominatim policy: one request at a time, >1 second apart.
const records = [];
const searches = ['hotels','cafes','restaurants','supermarkets','car repair','fuel stations','logistics','industrial areas','residential areas'];
for (const term of searches) {
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({q:term+' in Duqm Oman',format:'json',limit:'15',viewbox:'57.50,19.85,57.83,19.48',bounded:'1'});
  const response = await fetch(url,{headers:{'User-Agent':'RiadaTech-Local-Research/1.0'},signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`Lookup failed (${response.status}); previous cache preserved.`);
  const rows = await response.json();
  if(!Array.isArray(rows)) throw new Error('Invalid response; previous cache preserved.');
  records.push(...rows.map(row=>({...row,queryUrl:url})));
  console.log(term,rows.length);
  await new Promise(resolve=>setTimeout(resolve,1100));
}
if (!records.length) throw new Error('Empty refresh; previous cache preserved.');
const destination = new URL('../data/processed/duqm-places.json',import.meta.url);
const temporary = new URL('../data/processed/duqm-places.tmp.json',import.meta.url);
await writeFile(temporary,JSON.stringify({source:'OpenStreetMap / Nominatim',retrievedAt:new Date().toISOString(),records},null,2));
await rename(temporary,destination);
console.log('Updated Duqm cache. OSM coverage is incomplete and not a verified business registry.');
