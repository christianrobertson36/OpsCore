const api=async(path,options={})=>{
  const token=localStorage.getItem('opscore_token');
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);
  return body;
};
const ro=()=>document.documentElement.lang==='ro';
const t=(en,rr)=>ro()?rr:en;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=value=>value?new Date(value).toLocaleString(ro()?'ro-RO':'en-GB'):'—';

function modal(title,body,fullscreen=false){
  const back=document.createElement('div');
  back.className=`p2Back${fullscreen?' p2Fullscreen':''}`;
  back.innerHTML=`<section class="p2Modal"><header><h2>${esc(title)}</h2><button aria-label="${t('Close','Închide')}">×</button></header><div class="p2Body">${body}</div></section>`;
  document.body.append(back);
  const close=()=>back.remove();
  back.onclick=event=>{if(event.target===back)close()};
  back.querySelector('header button').onclick=close;
  return back;
}
function timeline(rows=[]){
  if(!rows.length)return `<p>${t('No workflow activity yet.','Nu există încă activitate în flux.')}</p>`;
  return `<div class="p2Timeline">${rows.map(row=>`<article><b>${esc(row.action)}</b><span>${esc(row.actor||'System')} · ${fmt(row.created_at)}</span>${row.detail?`<p>${esc(row.detail)}</p>`:''}</article>`).join('')}</div>`;
}
function sla(record){
  return `<div class="p2Sla"><b>${esc(record.sla_policy||t('No matching SLA','Niciun SLA corespunzător'))}</b><span>${t('Response','Răspuns')}: ${esc(record.response_state||'—')} · ${t('Resolution','Rezolvare')}: ${esc(record.resolution_state||'—')}</span><small>${t('Resolution due','Termen rezolvare')}: ${fmt(record.resolution_due_at)}</small></div>`;
}
async function openWorkflow(type,id){
  const kind=type==='Incident'?'incidents':'requests';
  const data=await api(`/api/${kind}/${encodeURIComponent(id)}/detail`);
  const record=data[type.toLowerCase()];
  const statuses=type==='Incident'?['Open','Assigned','In Progress','Pending','Resolved','Closed']:['Open','Approved','In Progress','Pending','Fulfilled','Closed','Cancelled'];
  const resolution=type==='Incident'?`<label>${t('Resolution','Rezolvare')}<textarea name="resolution"></textarea></label>`:'';
  const back=modal(`${id} · ${record.title}`,`<div class="p2Grid"><div><h3>${t('Details','Detalii')}</h3><dl><dt>${t('Status','Stare')}</dt><dd>${esc(record.status)}</dd><dt>${t('Priority','Prioritate')}</dt><dd>${esc(record.priority||'P3')}</dd><dt>${t('Assigned to','Alocat către')}</dt><dd>${esc(record.assignee||record.assignment_group||'—')}</dd><dt>${t('Description','Descriere')}</dt><dd>${esc(record.description||'—')}</dd></dl>${sla(record)}<form class="p2Transition"><label>${t('Next status','Starea următoare')}<select name="status">${statuses.map(status=>`<option>${status}</option>`).join('')}</select></label><label>${t('Work note','Notă de lucru')}<textarea name="note"></textarea></label>${resolution}<button class="primary">${t('Update workflow','Actualizează fluxul')}</button></form></div><div><h3>${t('Activity','Activitate')}</h3>${timeline(data.history)}</div></div>`,true);
  back.querySelector('form').onsubmit=async event=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    await api(`/api/${kind}/${encodeURIComponent(id)}/transition`,{method:'POST',body:JSON.stringify(Object.fromEntries(form))});
    back.remove();
    openWorkflow(type,id).catch(showError);
  };
}
async function openAsset(id){
  if(window.CoreOpsPhase11?.open)return window.CoreOpsPhase11.open(id);
  const data=await api(`/api/assets/${encodeURIComponent(id)}/detail`),asset=data.asset;
  const relationships=data.relationships.length?data.relationships.map(item=>`<article class="p2Relation"><b>${esc(item.parent_number)} → ${esc(item.child_number)}</b><span>${esc(item.relationship_type)}</span></article>`).join(''):`<p>${t('No asset relationships.','Nu există relații între active.')}</p>`;
  modal(`${asset.id} · ${asset.name}`,`<div class="p2Grid"><div><h3>${t('Configuration item','Element de configurație')}</h3><dl><dt>${t('Type','Tip')}</dt><dd>${esc(asset.type)}</dd><dt>${t('State','Stare')}</dt><dd>${esc(asset.state)}</dd><dt>${t('Site','Locație')}</dt><dd>${esc(asset.site_name||'—')}</dd><dt>${t('Room / location','Cameră / amplasare')}</dt><dd>${esc(asset.location_name||'—')}</dd><dt>${t('Rack','Rack')}</dt><dd>${esc(asset.rack_name||'—')}</dd><dt>${t('Equipment','Echipament')}</dt><dd>${esc(asset.equipment_name||'—')}</dd></dl></div><div><h3>${t('Relationships','Relații')}</h3>${relationships}</div></div>`);
}
async function reporting(){
  const data=await api('/api/reporting/phase2');
  const cards=[[data.open_incidents,'Open incidents','Incidente deschise'],[data.open_requests,'Open requests','Solicitări deschise'],[data.sla_breaches,'SLA breaches','Încălcări SLA'],[data.services_down,'Services down','Servicii indisponibile'],[data.operational_assets,'Operational assets','Active operaționale'],[data.active_changes,'Active changes','Modificări active']];
  const workspace=document.getElementById('coreopsEnterpriseWorkspace');
  if(!workspace)return;
  workspace.innerHTML=`<section class="p2Report"><header><div><span>CORE OPS / PHASE 2</span><h2>${t('Operational reporting','Raportare operațională')}</h2><p>${t('A live view across service, monitoring, SLA and CMDB.','O vedere live asupra serviciilor, monitorizării, SLA și CMDB.')}</p></div><button class="secondary">${t('Refresh','Reîmprospătează')}</button></header><div>${cards.map(card=>`<article><b>${card[0]}</b><span>${t(card[1],card[2])}</span></article>`).join('')}</div><small>${t('Generated','Generat')}: ${fmt(data.generatedAt)}</small></section>`;
  workspace.querySelector('button').onclick=()=>reporting().catch(showError);
}
function showError(error){modal(t('Unable to open record','Înregistrarea nu poate fi deschisă'),`<p>${esc(error.message)}</p>`)}
document.addEventListener('click',event=>{
  const row=event.target.closest('.trow, .row.request');
  if(row&&!row.dataset.nativeRecord){
    const id=row.querySelector('.mono')?.textContent?.trim();
    if(/^INC/.test(id)){event.preventDefault();openWorkflow('Incident',id).catch(showError)}
    else if(/^REQ/.test(id)){event.preventDefault();openWorkflow('Request',id).catch(showError)}
    else if(/^AST/.test(id)){event.preventDefault();openAsset(id).catch(showError)}
  }
  const button=event.target.closest('button');
  if(button&&['Reporting','Raportare'].includes(button.textContent.trim()))setTimeout(()=>reporting().catch(showError),50);
},true);
window.addEventListener('coreops:notification-open',event=>{
  const detail=event.detail||{};
  if(detail.sourceType==='Monitoring')document.querySelector('[data-top-page="Monitoring"]')?.click();
  else if(detail.sourceType==='SLA')document.querySelector('[data-top-page="SLA Management"]')?.click();
  else if(/^INC/.test(detail.sourceId||''))openWorkflow('Incident',detail.sourceId).catch(showError);
});
