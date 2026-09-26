import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
export function createOmanDataRouter(service,env=process.env){
 const router=Router();
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');const expected=env.OMAN_DATA_IMPORT_TOKEN;const supplied=req.get('Authorization')??'';
 if(!expected||expected.length<32)return res.status(503).json({error:'Internal data administration disabled.'});
 const a=Buffer.from(supplied),b=Buffer.from(`Bearer ${expected}`);if(a.length!==b.length||!timingSafeEqual(a,b))return res.status(403).json({error:'Forbidden.'});next();});
 router.post('/reimport',async(req,res)=>{try{res.json(await service.reimport());}catch(e){res.status(e.status??500).json({error:'Import failed; previous snapshot retained.'});}});
 return router;
}
