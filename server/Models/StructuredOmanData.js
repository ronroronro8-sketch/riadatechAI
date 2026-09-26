import mongoose from 'mongoose';
const recordSchema=new mongoose.Schema({
 _id:String,datasetId:{type:String,index:true},datasetType:{type:String,index:true},sheet:String,sourceRow:Number,isTotal:Boolean,
 fields:[{_id:false,column:Number,label:String,value:mongoose.Schema.Types.Mixed,numericValue:Number,normalized:String}],
 dimensions:mongoose.Schema.Types.Mixed,provenance:mongoose.Schema.Types.Mixed
},{versionKey:false,bufferCommands:false});
for(const key of ['governorate','wilayat','activity','domain','legalForm'])recordSchema.index({datasetId:1,[`dimensions.${key}.normalized`]:1});
export const StructuredOmanRecord=mongoose.model('StructuredOmanRecord',recordSchema);
export const StructuredOmanState=mongoose.model('StructuredOmanState',new mongoose.Schema({_id:String,payload:mongoose.Schema.Types.Mixed},{versionKey:false,bufferCommands:false}));
