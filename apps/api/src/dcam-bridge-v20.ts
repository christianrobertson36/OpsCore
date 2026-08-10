import type {Express} from 'express';

export function registerDcamBridgeV20(app:Express,pool:any,requireRoles:any){
  const baseUrl=String(process.env.DCAM_API_URL||'').replace(/\/+$/,'');
  const integrationKey=String(process.env.DCAM_COREOPS_INTEGRATION_KEY||'');

  pool.query(`CREATE TABLE IF NOT EXISTS dcam_identity_mappings(
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('site','asset')),
    coreops_id BIGINT NOT NULL,
    dcam_id BIGINT NOT NULL,
    match_method TEXT NOT NULL DEFAULT 'manual',
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(entity_type,coreops_id),
    UNIQUE(entity_type,dcam_id)
  )`).catch((error:any)=>console.error('Core Ops DCAM mapping schema failed',error));

  async function proxy(path:string,res:any){
    if(!baseUrl||!integrationKey)return res.json({ok:true,configured:false,connected:false,source:'DCAM',status:'Not configured',apiUrl:baseUrl||null});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch(`${baseUrl}${path}`,{headers:{'X-DCAM-CoreOps-Key':integrationKey},signal:controller.signal});
      const body:any=await response.json().catch(()=>({}));
      if(!response.ok)return res.status(502).json({ok:false,configured:true,connected:false,source:'DCAM',status:'Unavailable',apiUrl:baseUrl,detail:body.error||`DCAM HTTP ${response.status}`});
      return res.json({ok:true,configured:true,connected:true,status:'Connected',apiUrl:baseUrl,...body});
    }catch(error:any){
      return res.status(502).json({ok:false,configured:true,connected:false,source:'DCAM',status:'Unavailable',apiUrl:baseUrl,detail:error?.name==='AbortError'?'DCAM connection timed out':String(error?.message||error)});
    }finally{clearTimeout(timer)}
  }

  app.get('/api/dcam/summary',async(_req:any,res:any)=>proxy('/api/integration/coreops/summary',res));
  app.get('/api/dcam/identity',async(_req:any,res:any)=>proxy('/api/integration/coreops/identity',res));

  app.get('/api/dcam/mappings',async(_req:any,res:any,next:any)=>{
    try{
      const result=await pool.query(`SELECT id,entity_type,coreops_id,dcam_id,match_method,created_by,created_at,updated_at FROM dcam_identity_mappings ORDER BY entity_type,coreops_id`);
      res.json({ok:true,mappings:result.rows});
    }catch(error){next(error)}
  });

  app.post('/api/dcam/mappings',requireRoles('Administrator','Infrastructure'),async(req:any,res:any,next:any)=>{
    try{
      const entityType=String(req.body?.entityType||'');
      const coreopsId=Number(req.body?.coreopsId);
      const dcamId=Number(req.body?.dcamId);
      const method=String(req.body?.matchMethod||'manual').slice(0,40);
      if(!['site','asset'].includes(entityType)||!Number.isInteger(coreopsId)||coreopsId<1||!Number.isInteger(dcamId)||dcamId<1)return res.status(400).json({error:'invalid identity mapping'});
      await pool.query(`DELETE FROM dcam_identity_mappings WHERE entity_type=$1 AND (coreops_id=$2 OR dcam_id=$3)`,[entityType,coreopsId,dcamId]);
      const result=await pool.query(`INSERT INTO dcam_identity_mappings(entity_type,coreops_id,dcam_id,match_method,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[entityType,coreopsId,dcamId,method,req.authUser?.email||req.authUser?.name||'Core Ops']);
      res.status(201).json({ok:true,mapping:result.rows[0]});
    }catch(error){next(error)}
  });

  app.delete('/api/dcam/mappings/:id',requireRoles('Administrator','Infrastructure'),async(req:any,res:any,next:any)=>{
    try{
      const id=Number(req.params.id);if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'invalid mapping id'});
      await pool.query(`DELETE FROM dcam_identity_mappings WHERE id=$1`,[id]);
      res.json({ok:true});
    }catch(error){next(error)}
  });
}
