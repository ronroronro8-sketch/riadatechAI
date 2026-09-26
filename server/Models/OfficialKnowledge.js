import mongoose from 'mongoose';
const documentSchema=new mongoose.Schema({
 _id:String,requestedUrl:String,canonicalUrl:{type:String,unique:true},title:String,authority:String,domain:String,language:String,topics:[String],
 rawText:String,cleanedText:String,contentHash:String,activeVersion:String,version:Number,
 officialUpdatedAt:String,officialUpdatedRaw:String,officialPublishedAt:String,officialPublishedRaw:String,
 retrievedAt:Date,lastAttemptAt:Date,available:Boolean,lastError:String,
},{versionKey:false,bufferCommands:false});
documentSchema.index({topics:1,available:1});
const chunkSchema=new mongoose.Schema({
 _id:String,documentId:{type:String,index:true},versionHash:String,ordinal:Number,heading:String,text:String,tokens:[String],topics:[String],source:mongoose.Schema.Types.Mixed,
},{versionKey:false,bufferCommands:false});
chunkSchema.index({documentId:1,versionHash:1,ordinal:1},{unique:true});
chunkSchema.index({tokens:1});
export const OfficialKnowledgeDocument=mongoose.model('OfficialKnowledgeDocument',documentSchema);
export const OfficialKnowledgeChunk=mongoose.model('OfficialKnowledgeChunk',chunkSchema);
export const OfficialKnowledgeLock=mongoose.model('OfficialKnowledgeLock',new mongoose.Schema({_id:String,startedAt:Date},{versionKey:false,bufferCommands:false}));
