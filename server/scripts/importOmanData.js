import dns from 'node:dns';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { StructuredOmanRecord as Record, StructuredOmanState as State } from '../Models/StructuredOmanData.js';
import { createOmanDataService } from '../services/omanData/service.js';
import { inspectDirectory,buildRecords } from '../services/omanData/importer.js';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
if(process.env.DNS_SERVERS)dns.setServers(process.env.DNS_SERVERS.split(',').map(s=>s.trim()).filter(Boolean));
try{
 let report;
 if(process.argv.includes('--inspect')){const scan=await inspectDirectory();report={mode:'inspection_only',files:scan.files,ignored:scan.ignored,datasets:scan.datasets.map(d=>({files:d.files,metadata:d.meta,tables:d.tables.map(t=>({sheet:t.sheet,type:t.type,rows:t.rows.length}))})),totalRecords:buildRecords(scan).records.length};}
 else {if(!process.env.MONGO_URI)throw new Error('MONGO_URI missing');await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:10000});report=await createOmanDataService({Record,State}).reimport();}
 await fs.writeFile(new URL('../data/oman-data-import-report.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({mode:report.mode??'imported',totalRecords:report.totalRecords,datasets:report.datasets.map(d=>({files:d.files,tables:d.tables})),ignored:report.ignored},null,2));
}catch(e){console.error('Oman data import failed:',e.name);process.exitCode=1;}finally{await mongoose.disconnect();}
