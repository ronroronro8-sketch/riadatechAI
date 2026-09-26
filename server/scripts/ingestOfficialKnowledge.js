import dotenv from 'dotenv';
import dns from 'node:dns';
import mongoose from 'mongoose';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { OfficialKnowledgeDocument as Document,OfficialKnowledgeChunk as Chunk,OfficialKnowledgeLock as Lock } from '../Models/OfficialKnowledge.js';
import { createOfficialKnowledgeService } from '../services/officialKnowledge/service.js';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
if(process.env.DNS_SERVERS)dns.setServers(process.env.DNS_SERVERS.split(',').map(s=>s.trim()).filter(Boolean));
try{
 if(!process.env.MONGO_URI)throw new Error('MONGO_URI missing');
 await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:10000});
 await Promise.all([Document.init(),Chunk.init(),Lock.init()]);
 const service=createOfficialKnowledgeService({Document,Chunk,Lock});
 const beforeDocs=await Document.find({available:true}).select('_id activeVersion').lean();
 const documentsBefore=beforeDocs.length;
 const chunksBefore=beforeDocs.length?await Chunk.countDocuments({$or:beforeDocs.map(d=>({documentId:d._id,versionHash:d.activeVersion}))}):0;
 const storedChunksBefore=await Chunk.countDocuments();
 const report=process.argv.includes('--verify-only')?{mode:'verification'}:await service.ingest();
 const docs=await Document.find({available:true}).select('_id activeVersion domain').lean();
 report.documentsBefore=documentsBefore;report.chunksBefore=chunksBefore;
 report.storedChunksBefore=storedChunksBefore;report.storedChunksAfter=await Chunk.countDocuments();
 report.documents=docs.length;
 report.chunks=docs.length?await Chunk.countDocuments({$or:docs.map(d=>({documentId:d._id,versionHash:d.activeVersion}))}):0;
 report.domains=[...new Set(docs.map(d=>d.domain))];
 report.probes=[];
 for(const question of ['كيف أطلع تصريح لمشروعي في عمان؟','بكم أقدر أسوي تصريح لمشروعي؟','كيف أسجل للضريبة؟','ما هي بطاقة ريادة؟']){
  const context=await service.context(question);report.probes.push({question,status:context?.status,sources:context?.sources,headings:context?.chunks.map(c=>c.heading)});
 }
 await writeFile(new URL('../OFFICIAL_KNOWLEDGE_REPORT.json',import.meta.url),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 if(report.failures?.length)process.exitCode=2;
}catch(error){console.error('Official knowledge task failed:',error.name);process.exitCode=1;}finally{await mongoose.disconnect();}
