import type express from 'express';
import type pg from 'pg';

type Role = 'Administrator' | 'Service Desk' | 'Engineer' | 'Infrastructure' | 'Auditor' | 'Read Only';
type RequireRoles = (...roles:Role[]) => express.RequestHandler;

const VALID_SIDES = new Set(['Front','Rear']);
const VALID_STATES = new Set(['Planned','Installed','Maintenance','Retired']);

export function registerEquipmentV7(app:express.Application,pool:pg.Pool,requireRoles:RequireRoles){
  let schemaReady=false;

  async function ensureSchema(){
    if(schemaReady)return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rack_equipment (
        id SERIAL PRIMARY KEY,
        rack_id INTEGER NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
        asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
        equipment_code VARCHAR(60) NOT NULL,
        name VARCHAR(160) NOT NULL,
        equipment_type VARCHAR(80) NOT NULL DEFAULT 'Server',
        manufacturer VARCHAR(120) DEFAULT '',
        model VARCHAR(160) DEFAULT '',
        serial_number VARCHAR(160) DEFAULT '',
        asset_tag VARCHAR(120) DEFAULT '',
        start_u INTEGER NOT NULL,
        height_u INTEGER NOT NULL DEFAULT 1,
        mount_side VARCHAR(20) NOT NULL DEFAULT 'Front',
        depth_mm INTEGER NOT NULL DEFAULT 0,
        weight_kg NUMERIC(10,2) NOT NULL DEFAULT 0,
        power_draw_w NUMERIC(10,2) NOT NULL DEFAULT 0,
        status VARCHAR(40) NOT NULL DEFAULT 'Installed',
        owner VARCHAR(120) DEFAULT '',
        notes TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(rack_id,equipment_code)
      );
      CREATE INDEX IF NOT EXISTS idx_rack_equipment_rack ON rack_equipment(rack_id);
      CREATE INDEX IF NOT EXISTS idx_rack_equipment_asset ON rack_equipment(asset_id);
    `);
    schemaReady=true;
  }

  function occupiedRange(startU:number,heightU:number){return Array.from({length:heightU},(_,i)=>startU+i)}

  async function rackOr404(rackId:number){
    return (await pool.query('SELECT id,rack_units,width_mm,depth_mm,max_weight_kg,power_capacity_kw,cooling_capacity_kw,name,rack_code FROM racks WHERE id=$1',[rackId])).rows[0];
  }

  async function rackEquipment(rackId:number){
    return (await pool.query(`SELECT e.id,e.rack_id AS "rackId",e.asset_id AS "assetId",a.asset_number AS "assetNumber",e.equipment_code AS "equipmentCode",e.name,e.equipment_type AS "equipmentType",e.manufacturer,e.model,e.serial_number AS "serialNumber",e.asset_tag AS "assetTag",e.start_u AS "startU",e.height_u AS "heightU",e.mount_side AS "mountSide",e.depth_mm AS "depthMm",e.weight_kg::float8 AS "weightKg",e.power_draw_w::float8 AS "powerDrawW",e.status,e.owner,e.notes,e.created_at AS "createdAt",e.updated_at AS "updatedAt"
      FROM rack_equipment e LEFT JOIN assets a ON a.id=e.asset_id WHERE e.rack_id=$1 ORDER BY e.start_u DESC,e.mount_side,e.id`,[rackId])).rows;
  }

  function findCollision(items:any[],startU:number,heightU:number,mountSide:string,excludeId?:number){
    const candidate=new Set(occupiedRange(startU,heightU));
    return items.find(item=>Number(item.id)!==Number(excludeId||0)&&item.mountSide===mountSide&&occupiedRange(Number(item.startU),Number(item.heightU)).some(u=>candidate.has(u)));
  }

  function findNextFree(items:any[],rackUnits:number,heightU:number,mountSide:string){
    for(let start=1;start<=rackUnits-heightU+1;start++){
      if(!findCollision(items,start,heightU,mountSide))return start;
    }
    return null;
  }

  async function summary(rackId:number){
    const rack=await rackOr404(rackId); if(!rack)return null;
    const items=await rackEquipment(rackId);
    const front=new Set<number>(); const rear=new Set<number>();
    let weightKg=0,powerDrawW=0;
    for(const item of items){
      const target=item.mountSide==='Rear'?rear:front;
      occupiedRange(Number(item.startU),Number(item.heightU)).forEach(u=>target.add(u));
      weightKg+=Number(item.weightKg||0); powerDrawW+=Number(item.powerDrawW||0);
    }
    return {rack,items,frontOccupiedU:front.size,rearOccupiedU:rear.size,totalDevices:items.length,weightKg:Number(weightKg.toFixed(2)),powerDrawW:Number(powerDrawW.toFixed(2)),powerCapacityW:Number(rack.power_capacity_kw||0)*1000,weightCapacityKg:Number(rack.max_weight_kg||0)};
  }

  app.get('/api/racks/:id/equipment',async(req,res,next)=>{try{
    await ensureSchema(); const rackId=Number(req.params.id); const data=await summary(rackId); if(!data)return res.status(404).json({error:'rack not found'}); res.json(data);
  }catch(error){next(error)}});

  app.get('/api/racks/:id/next-free-u',async(req,res,next)=>{try{
    await ensureSchema(); const rackId=Number(req.params.id); const rack=await rackOr404(rackId); if(!rack)return res.status(404).json({error:'rack not found'});
    const heightU=Math.max(1,Number(req.query.heightU||1)); const mountSide=String(req.query.mountSide||'Front');
    if(!VALID_SIDES.has(mountSide))return res.status(400).json({error:'mountSide must be Front or Rear'});
    if(heightU>Number(rack.rack_units))return res.status(400).json({error:'equipment is taller than rack'});
    const items=await rackEquipment(rackId); const startU=findNextFree(items,Number(rack.rack_units),heightU,mountSide);
    res.json({rackId,heightU,mountSide,startU,available:startU!==null});
  }catch(error){next(error)}});

  app.post('/api/racks/:id/equipment',requireRoles('Administrator','Infrastructure'),async(req,res,next)=>{try{
    await ensureSchema(); const rackId=Number(req.params.id); const rack=await rackOr404(rackId); if(!rack)return res.status(404).json({error:'rack not found'});
    const equipmentCode=String(req.body?.equipmentCode||'').trim().toUpperCase(); const name=String(req.body?.name||'').trim();
    const equipmentType=String(req.body?.equipmentType||'Server').trim(); const manufacturer=String(req.body?.manufacturer||'').trim(); const model=String(req.body?.model||'').trim();
    const serialNumber=String(req.body?.serialNumber||'').trim(); const assetTag=String(req.body?.assetTag||'').trim(); const owner=String(req.body?.owner||'').trim(); const notes=String(req.body?.notes||'').trim();
    const mountSide=String(req.body?.mountSide||'Front'); const heightU=Math.max(1,Number(req.body?.heightU||1)); const depthMm=Math.max(0,Number(req.body?.depthMm||0));
    const weightKg=Math.max(0,Number(req.body?.weightKg||0)); const powerDrawW=Math.max(0,Number(req.body?.powerDrawW||0)); const status=String(req.body?.status||'Installed');
    const assetId=req.body?.assetId?Number(req.body.assetId):null;
    if(!equipmentCode||!name)return res.status(400).json({error:'equipment code and name are required'});
    if(!VALID_SIDES.has(mountSide))return res.status(400).json({error:'mountSide must be Front or Rear'});
    if(!VALID_STATES.has(status))return res.status(400).json({error:'invalid equipment status'});
    if(heightU>Number(rack.rack_units))return res.status(400).json({error:'equipment is taller than rack'});
    if(depthMm>Number(rack.depth_mm))return res.status(409).json({error:`device depth ${depthMm}mm exceeds rack depth ${rack.depth_mm}mm`});
    if(assetId){const asset=(await pool.query('SELECT id FROM assets WHERE id=$1',[assetId])).rows[0];if(!asset)return res.status(400).json({error:'invalid CMDB asset'});}
    const items=await rackEquipment(rackId); let startU=req.body?.startU?Number(req.body.startU):0;
    if(!startU)startU=findNextFree(items,Number(rack.rack_units),heightU,mountSide)||0;
    if(!startU)return res.status(409).json({error:`no ${heightU}U free space on ${mountSide.toLowerCase()} of rack`});
    if(startU<1||startU+heightU-1>Number(rack.rack_units))return res.status(400).json({error:'U position is outside rack limits'});
    const collision=findCollision(items,startU,heightU,mountSide); if(collision)return res.status(409).json({error:`U-space collision with ${collision.equipmentCode} (${collision.name})`});
    const projectedWeight=items.reduce((sum,item)=>sum+Number(item.weightKg||0),0)+weightKg;
    if(Number(rack.max_weight_kg)>0&&projectedWeight>Number(rack.max_weight_kg))return res.status(409).json({error:'rack maximum weight would be exceeded'});
    const projectedPower=items.reduce((sum,item)=>sum+Number(item.powerDrawW||0),0)+powerDrawW;
    if(Number(rack.power_capacity_kw)>0&&projectedPower>Number(rack.power_capacity_kw)*1000)return res.status(409).json({error:'rack power capacity would be exceeded'});
    const result=await pool.query(`INSERT INTO rack_equipment (rack_id,asset_id,equipment_code,name,equipment_type,manufacturer,model,serial_number,asset_tag,start_u,height_u,mount_side,depth_mm,weight_kg,power_draw_w,status,owner,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,[rackId,assetId,equipmentCode,name,equipmentType,manufacturer,model,serialNumber,assetTag,startU,heightU,mountSide,depthMm,weightKg,powerDrawW,status,owner,notes]);
    res.status(201).json((await rackEquipment(rackId)).find(item=>Number(item.id)===Number(result.rows[0].id)));
  }catch(error:any){if(error?.code==='23505')return res.status(409).json({error:'equipment code already exists in this rack'});next(error)}});

  app.patch('/api/rack-equipment/:id',requireRoles('Administrator','Infrastructure'),async(req,res,next)=>{try{
    await ensureSchema(); const id=Number(req.params.id); const current=(await pool.query('SELECT * FROM rack_equipment WHERE id=$1',[id])).rows[0]; if(!current)return res.status(404).json({error:'equipment not found'});
    const rack=await rackOr404(Number(current.rack_id)); if(!rack)return res.status(404).json({error:'rack not found'}); const items=await rackEquipment(Number(current.rack_id));
    const startU=req.body?.startU!==undefined?Number(req.body.startU):Number(current.start_u); const heightU=req.body?.heightU!==undefined?Math.max(1,Number(req.body.heightU)):Number(current.height_u); const mountSide=req.body?.mountSide!==undefined?String(req.body.mountSide):String(current.mount_side);
    if(!VALID_SIDES.has(mountSide))return res.status(400).json({error:'mountSide must be Front or Rear'}); if(startU<1||startU+heightU-1>Number(rack.rack_units))return res.status(400).json({error:'U position is outside rack limits'});
    const collision=findCollision(items,startU,heightU,mountSide,id); if(collision)return res.status(409).json({error:`U-space collision with ${collision.equipmentCode} (${collision.name})`});
    await pool.query('UPDATE rack_equipment SET start_u=$1,height_u=$2,mount_side=$3,status=COALESCE($4,status),updated_at=NOW() WHERE id=$5',[startU,heightU,mountSide,req.body?.status||null,id]);
    res.json((await rackEquipment(Number(current.rack_id))).find(item=>Number(item.id)===id));
  }catch(error){next(error)}});

  app.delete('/api/rack-equipment/:id',requireRoles('Administrator','Infrastructure'),async(req,res,next)=>{try{
    await ensureSchema(); const r=await pool.query('DELETE FROM rack_equipment WHERE id=$1 RETURNING id',[Number(req.params.id)]); if(!r.rows[0])return res.status(404).json({error:'equipment not found'}); res.json({ok:true,id:r.rows[0].id});
  }catch(error){next(error)}});
}
