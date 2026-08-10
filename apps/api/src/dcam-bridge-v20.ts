import type {Express} from 'express';

export function registerDcamBridgeV20(app:Express){
  const baseUrl=String(process.env.DCAM_API_URL||'').replace(/\/+$/,'');
  const integrationKey=String(process.env.DCAM_COREOPS_INTEGRATION_KEY||'');

  async function proxy(path:string,res:any){
    if(!baseUrl||!integrationKey){
      return res.json({ok:true,configured:false,connected:false,source:'DCAM',status:'Not configured',apiUrl:baseUrl||null});
    }
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
}
