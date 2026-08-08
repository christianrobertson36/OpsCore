import type express from 'express';
import type pg from 'pg';

type Role='Administrator'|'Service Desk'|'Engineer'|'Infrastructure'|'Auditor'|'Read Only';
type RequireRoles=(...roles:Role[])=>express.RequestHandler;

const SIDES=new Set(['Front','Rear','Left Zero-U','Right Zero-U']);
const STATES=new Set(['Planned','Installed','Reserved','Maintenance','Retired']);
const half=(n:number)=>Math.round(n*2)/2;

export function registerEquipmentV8(app:express.Application,pool:pg.Pool,requireRoles:RequireRoles){
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
    manufacturer VARCHAR(120) DEFAULT '', model VARCHAR(160) DEFAULT '', serial_number VARCHAR(160) DEFAULT '', asset_tag VARCHAR(120) DEFAULT '',
    start_u NUMERIC(6,1), height_u NUMERIC(6,1) NOT NULL DEFAULT 1,
    mount_side VARCHAR(30) NOT NULL DEFAULT 'Front', depth_mm INTEGER NOT NULL DEFAULT 0,
    weight_kg NUMERIC(10,2) NOT NULL DEFAULT 0, power_draw_w NUMERIC(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'Installed', owner VARCHAR(120) DEFAULT '', notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(rack_id,equipment_code)
   );
   ALTER TABLE rack_equipment ALTER COLUMN start_u DROP NOT NULL;
   ALTER TABLE rack_equipment ALTER COLUMN start_u TYPE NUMERIC(6,1) USING start_u::numeric;
   ALTER TABLE rack_equipment ALTER COLUMN height_u TYPE NUMERIC(6,1) USING height_u::numeric;
   ALTER TABLE rack_equipment ALTER COLUMN mount_side TYPE VARCHAR(30);
   CREATE INDEX IF NOT EXISTS idx_rack_equipment_rack ON rack_equipment(rack_id);
  `);
  schemaReady=true;
 }
 async function rack(rackId:number){return (await pool.query('SELECT id,rack_units,width_mm,depth_mm,max_weight_kg,power_capacity_kw,cooling_capacity_kw,name,rack_code FROM racks WHERE id=$1',[rackId])).rows[0]}
 async function items(rackId:number){return (await pool.query(`SELECT e.id,e.rack_id AS "rackId",e.asset_id AS "assetId",a.asset_number AS "assetNumber",e.equipment_code AS "equipmentCode",e.name,e.equipment_type AS "equipmentType",e.manufacturer,e.model,e.serial_number AS "serialNumber",e.asset_tag AS "assetTag",e.start_u::float8 AS "startU",e.height_u::float8 AS "heightU",e.mount_side AS "mountSide",e.depth_mm AS "depthMm",e.weight_kg::float8 AS "weightKg",e.power_draw_w::float8 AS "powerDrawW",e.status,e.owner,e.notes FROM rack_equipment e LEFT JOIN assets a ON a.id=e.asset_id WHERE e.rack_id=$1 ORDER BY e.start_u DESC NULLS LAST,e.mount_side,e.id`,[rackId])).rows}
 const zeroU=(side:string)=>side.includes('Zero-U');
 const uOverlap=(aStart:number,aHeight:number,bStart:number,bHeight:number)=>Math.max(aStart,bStart)<Math.min(aStart+aHeight,bStart+bHeight);
 function collision(all:any[],startU:number|null,heightU:number,side:string,depthMm:number,rackDepth:number,exclude=0){
  return all.find(it=>{
   if(Number(it.id)===exclude)return false;
   if(zeroU(side)||zeroU(it.mountSide))return side===it.mountSide;
   if(startU===null||it.startU===null)return false;
   if(!uOverlap(startU,heightU,Number(it.startU),Number(it.heightU)))return false;
   if(side===it.mountSide)return true;
   if((side==='Front'&&it.mountSide==='Rear')||(side==='Rear'&&it.mountSide==='Front')) return depthMm+Number(it.depthMm||0)>rackDepth;
   return false;
  });
 }
 function nextFree(all:any[],rackUnits:number,heightU:number,side:string,depthMm:number,rackDepth:number){
  if(zeroU(side))return null;
  for(let s=1;s+heightU<=rackUnits+1;s+=0.5)if(!collision(all,s,heightU,side,depthMm,rackDepth))return half(s);
  return null;
 }
 async function summary(rackId:number){
  const r=await rack(rackId);if(!r)return null;const all=await items(rackId);
  const occupied=(side:string)=>{let total=0;for(let u=1;u<=Number(r.rack_units);u+=0.5){if(all.some(i=>i.mountSide===side&&!zeroU(i.mountSide)&&i.startU!==null&&u>=Number(i.startU)&&u<Number(i.startU)+Number(i.heightU)))total+=0.5}return total};
  const active=all.filter(i=>i.status!=='Retired');
  const weight=active.reduce((s,i)=>s+Number(i.weightKg||0),0),power=active.reduce((s,i)=>s+Number(i.powerDrawW||0),0);
  return {rack:r,items:all,frontOccupiedU:occupied('Front'),rearOccupiedU:occupied('Rear'),zeroUDevices:active.filter(i=>zeroU(i.mountSide)).length,totalDevices:active.length,plannedDevices:active.filter(i=>i.status==='Planned').length,reservations:active.filter(i=>i.status==='Reserved').length,weightKg:+weight.toFixed(2),powerDrawW:+power.toFixed(2),powerCapacityW:Number(r.power_capacity_kw||0)*1000,weightCapacityKg:Number(r.max_weight_kg||0)};
 }
 app.get('/api/racks/:id/equipment',async(req,res,next)=>{try{await ensureSchema();const d=await summary(Number(req.params.id));if(!d)return res.status(404).json({error:'rack not found'});res.json(d)}catch(e){next(e)}});
 app.get('/api/racks/:id/next-free-u',async(req,res,next)=>{try{await ensureSchema();const rid=Number(req.params.id),r=await rack(rid);if(!r)return res.status(404).json({error:'rack not found'});const h=half(Math.max(.5,Number(req.query.heightU||1))),side=String(req.query.mountSide||'Front'),depth=Math.max(0,Number(req.query.depthMm||0));if(!SIDES.has(side))return res.status(400).json({error:'invalid mount side'});const all=await items(rid),s=nextFree(all,Number(r.rack_units),h,side,depth,Number(r.depth_mm));res.json({rackId:rid,heightU:h,mountSide:side,startU:s,available:zeroU(side)||s!==null})}catch(e){next(e)}});
 app.post('/api/racks/:id/equipment',requireRoles('Administrator','Infrastructure'),async(req,res,next)=>{try{
  await ensureSchema();const rid=Number(req.params.id),r=await rack(rid);if(!r)return res.status(404).json({error:'rack not found'});
  const code=String(req.body?.equipmentCode||'').trim().toUpperCase(),name=String(req.body?.name||'').trim(),type=String(req.body?.equipmentType||'Server').trim();
  const side=String(req.body?.mountSide||'Front'),status=String(req.body?.status||'Installed'),h=half(Math.max(.5,Number(req.body?.heightU||1))),depth=Math.max(0,Number(req.body?.depthMm||0));
  const weight=Math.max(0,Number(req.body?.weightKg||0)),power=Math.max(0,Number(req.body?.powerDrawW||0)),assetId=req.body?.assetId?Number(req.body.assetId):null;
  if(!code||!name)return res.status(400).json({error:'equipment code and name are required'});if(!SIDES.has(side))return res.status(400).json({error:'invalid mount side'});if(!STATES.has(status))return res.status(400).json({error:'invalid placement state'});if(h>.5&&Math.round(h*2)!==h*2)return res.status(400).json({error:'height must use 0.5U increments'});if(depth>Number(r.depth_mm))return res.status(409).json({error:`device depth ${depth}mm exceeds rack depth ${r.depth_mm}mm`});
  if(assetId){const a=(await pool.query('SELECT id FROM assets WHERE id=$1',[assetId])).rows[0];if(!a)return res.status(400).json({error:'invalid CMDB asset'})}
  const all=await items(rid);let start:number|null=zeroU(side)?null:(req.body?.startU?half(Number(req.body.startU)):null);if(!zeroU(side)&&start===null)start=nextFree(all,Number(r.rack_units),h,side,depth,Number(r.depth_mm));
  if(!zeroU(side)&&start===null)return res.status(409).json({error:`no ${h}U free space on ${side.toLowerCase()} of rack`});if(start!==null&&(start<1||start+h-1>Number(r.rack_units)))return res.status(400).json({error:'U position is outside rack limits'});
  const hit=collision(all,start,h,side,depth,Number(r.depth_mm));if(hit){const depthConflict=side!==hit.mountSide&&!zeroU(side)&&!zeroU(hit.mountSide);return res.status(409).json({error:depthConflict?`depth collision with ${hit.equipmentCode} (${hit.name}); combined depth exceeds ${r.depth_mm}mm`:`placement collision with ${hit.equipmentCode} (${hit.name})`})}
  const active=all.filter(i=>i.status!=='Retired'&&i.status!=='Reserved');const projectedWeight=active.reduce((s,i)=>s+Number(i.weightKg||0),0)+(status==='Reserved'?0:weight),projectedPower=active.reduce((s,i)=>s+Number(i.powerDrawW||0),0)+(status==='Reserved'?0:power);
  if(Number(r.max_weight_kg)>0&&projectedWeight>Number(r.max_weight_kg))return res.status(409).json({error:'rack maximum weight would be exceeded'});if(Number(r.power_capacity_kw)>0&&projectedPower>Number(r.power_capacity_kw)*1000)return res.status(409).json({error:'rack power capacity would be exceeded'});
  const vals=[rid,assetId,code,name,type,String(req.body?.manufacturer||'').trim(),String(req.body?.model||'').trim(),String(req.body?.serialNumber||'').trim(),String(req.body?.assetTag||'').trim(),start,h,side,depth,weight,power,status,String(req.body?.owner||'').trim(),String(req.body?.notes||'').trim()];
  const ins=await pool.query(`INSERT INTO rack_equipment (rack_id,asset_id,equipment_code,name,equipment_type,manufacturer,model,serial_number,asset_tag,start_u,height_u,mount_side,depth_mm,weight_kg,power_draw_w,status,owner,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,vals);res.status(201).json((await items(rid)).find(i=>Number(i.id)===Number(ins.rows[0].id)));
 }catch(e:any){if(e?.code==='23505')return res.status(409).json({error:'equipment code already exists in this rack'});next(e)}});
 app.patch('/api/rack-equipment/:id',requireRoles('Administrator','Infrastructure'),async(req,res,next)=>{try{await ensureSchema();const id=Number(req.params.id),cur=(await pool.query('SELECT * FROM rack_equipment WHERE id=$1',[id])).rows[0];if(!cur)return res.status(404).json({error:'equipment not found'});const r=await rack(Number(cur.rack_id)),all=await items(Number(cur.rack_id));const side=String(req.body?.mountSide??cur.mount_side),h=half(Number(req.body?.heightU??cur.height_u)),depth=Number(req.body?.depthMm??cur.depth_mm),start=zeroU(side)?null:half(Number(req.body?.startU??cur.start_u));const hit=collision(all,start,h,side,depth,Number(r.depth_mm),id);if(hit)return res.status(409).json({error:`placement collision with ${hit.equipmentCode} (${hit.name})`});await pool.query('UPDATE rack_equipment SET start_u=$1,height_u=$2,mount_side=$3,depth_mm=$4,status=COALESCE($5,status),updated_at=NOW() WHERE id=$6',[start,h,side,depth,req.body?.status||null,id]);res.json((await items(Number(cur.rack_id))).find(i=>Number(i.id)===id))}catch(e){next(e)}});
 app.delete('/api/rack-equipment/:id',requireRoles('Administrator','Infrastructure'),async(req,res,next)=>{try{await ensureSchema();const q=await pool.query('DELETE FROM rack_equipment WHERE id=$1 RETURNING id',[Number(req.params.id)]);if(!q.rows[0])return res.status(404).json({error:'equipment not found'});res.json({ok:true,id:q.rows[0].id})}catch(e){next(e)}});
}
