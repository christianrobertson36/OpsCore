const API='/api';
const token=()=>localStorage.getItem('opscore_token')||'';
const lang=()=>window.CoreOpsI18n?.getLanguage?.()||localStorage.getItem('coreops_language')||'en-GB';
const ro=()=>lang()==='ro-RO';
const txt=(en,romanian)=>ro()?romanian:en;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt=v=>v?new Date(v).toLocaleString(ro()?'ro-RO':'en-GB'):'—';

async function api(path,options={}){
 const t=token();
 const r=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{}) ,...(options.headers||{})}});
 const b=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(b.error||`HTTP ${r.status}`);
 return b;
}

const statusRo={Open:'Deschis',Closed:'Închis',Draft:'Ciornă',Planned:'Planificat',Scheduled:'Programat',Completed:'Finalizat',Published:'Publicat',Current:'Curent',Pending:'În așteptare',Approved:'Aprobat',Rejected:'Respins','In Progress':'În lucru',Cancelled:'Anulat',Active:'Activ',Requested:'Solicitat',Ordered:'Comandat',Delivered:'Livrat',Failed:'Eșuat'};
const showStatus=v=>ro()?(statusRo[v]||v):v;

const modules={
 Problems:{api:'/api/problems',title:['Problem Management','Managementul problemelor'],subtitle:['Root cause, workaround and recurring incident control.','Controlul cauzei principale, soluțiilor temporare și incidentelor recurente.'],number:'number',columns:[['number','Number','Număr'],['title','Problem','Problemă'],['priority','Priority','Prioritate'],['status','Status','Stare'],['owner','Owner','Responsabil'],['related_incident','Related incident','Incident asociat']],fields:[['title','Problem title','Titlul problemei','text',true],['description','Description','Descriere','textarea'],['priority','Priority','Prioritate','select',['P1','P2','P3','P4']],['status','Status','Stare','select',['Open','In Progress','Closed']],['owner','Owner','Responsabil','text'],['relatedIncident','Related incident','Incident asociat','text'],['rootCause','Root cause','Cauză principală','textarea'],['workaround','Workaround','Soluție temporară','textarea']]},
 Changes:{api:'/api/changes',title:['Change Management','Managementul modificărilor'],subtitle:['Plan, assess, approve and control operational changes.','Planificați, evaluați, aprobați și controlați modificările operaționale.'],number:'number',columns:[['number','Number','Număr'],['title','Change','Modificare'],['change_type','Type','Tip'],['risk','Risk','Risc'],['approval_status','Approval','Aprobare'],['status','Status','Stare']],fields:[['title','Change title','Titlul modificării','text',true],['description','Description','Descriere','textarea'],['changeType','Change type','Tip modificare','select',['Standard','Normal','Emergency']],['risk','Risk','Risc','select',['Low','Medium','High','Critical']],['status','Status','Stare','select',['Draft','Planned','In Progress','Completed','Cancelled']],['approvalStatus','Approval status','Stare aprobare','select',['Pending','Approved','Rejected']],['owner','Owner','Responsabil','text'],['plannedStart','Planned start','Început planificat','datetime-local'],['plannedEnd','Planned end','Sfârșit planificat','datetime-local'],['implementationPlan','Implementation plan','Plan de implementare','textarea'],['rollbackPlan','Rollback plan','Plan de revenire','textarea']]},
 Knowledge:{api:'/api/knowledge',title:['Knowledge Management','Managementul cunoștințelor'],subtitle:['Create reusable operational knowledge and published guidance.','Creați cunoștințe operaționale reutilizabile și ghiduri publicate.'],number:'number',columns:[['number','Article','Articol'],['title','Title','Titlu'],['category','Category','Categorie'],['status','Status','Stare'],['author','Author','Autor'],['updated_at','Updated','Actualizat']],fields:[['title','Article title','Titlul articolului','text',true],['summary','Summary','Rezumat','textarea'],['category','Category','Categorie','text'],['status','Status','Stare','select',['Draft','Published','Retired']],['author','Author','Autor','text'],['content','Article content','Conținut articol','textarea']]},
 Audits:{api:'/api/audits',title:['Compliance Audits','Audituri de conformitate'],subtitle:['Plan audits, record scope and track findings.','Planificați audituri, definiți domeniul și urmăriți constatările.'],number:'number',columns:[['number','Audit','Audit'],['title','Title','Titlu'],['framework','Framework','Cadru'],['site_name','Site','Locație'],['finding_count','Findings','Constatări'],['status','Status','Stare']],fields:[['title','Audit title','Titlul auditului','text',true],['framework','Framework','Cadru','text'],['scope','Scope','Domeniu','textarea'],['siteId','Site','Locație','site'],['owner','Owner','Responsabil','text'],['status','Status','Stare','select',['Planned','In Progress','Completed']],['scheduledAt','Scheduled','Programat','datetime-local'],['findingCount','Finding count','Număr constatări','number'],['notes','Notes','Note','textarea']]},
 Inspections:{api:'/api/inspections',title:['Inspections','Inspecții'],subtitle:['Schedule operational inspections and record results.','Programați inspecții operaționale și înregistrați rezultatele.'],number:'number',columns:[['number','Inspection','Inspecție'],['title','Title','Titlu'],['inspection_type','Type','Tip'],['site_name','Site','Locație'],['result','Result','Rezultat'],['status','Status','Stare']],fields:[['title','Inspection title','Titlul inspecției','text',true],['inspectionType','Inspection type','Tip inspecție','text'],['siteId','Site','Locație','site'],['assetId','Asset / CI','Activ / CI','asset'],['inspector','Inspector','Inspector','text'],['status','Status','Stare','select',['Scheduled','In Progress','Completed']],['scheduledAt','Scheduled','Programat','datetime-local'],['result','Result','Rezultat','select',['Pending','Pass','Fail','Advisory']],['notes','Notes','Note','textarea']]},
 Evidence:{api:'/api/evidence',title:['Evidence Library','Bibliotecă de dovezi'],subtitle:['Evidence linked to audits, inspections, sites and assets.','Dovezi asociate auditurilor, inspecțiilor, locațiilor și activelor.'],number:'number',columns:[['number','Evidence','Dovadă'],['title','Title','Titlu'],['evidence_type','Type','Tip'],['reference_number','Reference','Referință'],['owner','Owner','Responsabil'],['status','Status','Stare']],fields:[['title','Evidence title','Titlul dovezii','text',true],['evidenceType','Evidence type','Tip dovadă','select',['Document','Photo','Report','Certificate','Log']],['referenceType','Reference type','Tip referință','select',['Audit','Inspection','Asset','Site','Other']],['referenceNumber','Reference number','Număr referință','text'],['siteId','Site','Locație','site'],['assetId','Asset / CI','Activ / CI','asset'],['owner','Owner','Responsabil','text'],['status','Status','Stare','select',['Current','Expired','Retired']],['fileName','File name','Nume fișier','text'],['fileUrl','File URL','URL fișier','text'],['notes','Notes','Note','textarea']]},
 Projects:{api:'/api/projects',title:['Projects','Proiecte'],subtitle:['Operational project portfolio and delivery progress.','Portofoliu de proiecte operaționale și progresul livrării.'],number:'number',columns:[['number','Project','Proiect'],['name','Name','Nume'],['owner','Owner','Responsabil'],['priority','Priority','Prioritate'],['progress','Progress','Progres'],['status','Status','Stare']],fields:[['name','Project name','Numele proiectului','text',true],['description','Description','Descriere','textarea'],['owner','Owner','Responsabil','text'],['status','Status','Stare','select',['Planned','In Progress','Completed','Cancelled']],['priority','Priority','Prioritate','select',['Low','Medium','High','Critical']],['startDate','Start date','Data începerii','date'],['targetDate','Target date','Data țintă','date'],['progress','Progress %','Progres %','number']]},
 Procurement:{api:'/api/procurement',title:['Procurement','Achiziții'],subtitle:['Track purchasing requests, suppliers, value and delivery status.','Urmăriți solicitările de achiziție, furnizorii, valoarea și starea livrării.'],number:'number',columns:[['number','Record','Înregistrare'],['title','Request','Solicitare'],['supplier','Supplier','Furnizor'],['amount','Amount','Valoare'],['required_date','Required','Necesar la'],['status','Status','Stare']],fields:[['title','Request title','Titlul solicitării','text',true],['supplier','Supplier','Furnizor','text'],['requestedBy','Requested by','Solicitat de','text'],['status','Status','Stare','select',['Requested','Approved','Ordered','Delivered','Cancelled']],['amount','Amount','Valoare','number'],['currency','Currency','Monedă','select',['GBP','EUR','RON','USD']],['requiredDate','Required date','Data necesară','date'],['notes','Notes','Note','textarea']]}
};

const navAliases={Problems:'Problems','Probleme':'Problems',Changes:'Changes','Modificări':'Changes',Knowledge:'Knowledge','Bază de cunoștințe':'Knowledge',Audits:'Audits','Audituri':'Audits',Inspections:'Inspections','Inspecții':'Inspections',Evidence:'Evidence','Dovezi':'Evidence',Reporting:'Reporting','Raportare':'Reporting',Projects:'Projects','Proiecte':'Projects',Procurement:'Procurement','Achiziții':'Procurement'};
let current=null,rows=[],refs={sites:[],assets:[]},search='';

function ensureWorkspace(){
 let w=document.getElementById('coreopsEnterpriseWorkspace');
 if(!w){w=document.createElement('section');w.id='coreopsEnterpriseWorkspace';document.querySelector('.app main')?.appendChild(w)}
 return w;
}
function activateMain(on){const main=document.querySelector('.app main');if(main)main.classList.toggle('enterpriseModuleActive',on)}
function deactivate(){current=null;activateMain(false);const w=document.getElementById('coreopsEnterpriseWorkspace');if(w)w.innerHTML=''}

function addNav(){
 const nav=document.querySelector('.app aside nav');if(!nav)return;
 if(!nav.querySelector('[data-enterprise-module="Projects"]')){
  const admin=[...nav.querySelectorAll('button')].find(b=>['Administration','Administrare'].includes(b.textContent.trim()));
  for(const key of ['Projects','Procurement']){const b=document.createElement('button');b.className='enterpriseNavAdded compactHidden';b.dataset.enterpriseModule=key;b.innerHTML=`<span>${key}</span>`;admin?nav.insertBefore(b,admin):nav.appendChild(b)}
  window.dispatchEvent(new CustomEvent('coreops:language-refresh'));
 }
}

function cell(row,key){
 let v=row[key];
 if(key==='updated_at'||key==='created_at'||key==='required_date'||key==='scheduled_at')return key==='required_date'&&v?new Date(v).toLocaleDateString(ro()?'ro-RO':'en-GB'):fmt(v);
 if(key==='status'||key==='approval_status'||key==='result')v=showStatus(v);
 if(key==='amount')return `${Number(v||0).toFixed(2)} ${row.currency||''}`;
 if(key==='progress')return `${Number(v||0)}%`;
 return v??'—';
}
function rowStatus(row){return row.status||row.approval_status||row.result||''}

async function openModule(key){
 current=key;search='';activateMain(true);ensureWorkspace().innerHTML=`<div class="enterpriseShell"><div class="enterpriseHero"><div><div class="eyebrow">CORE OPS WORKFLOW</div><h2>${txt('Loading…','Se încarcă…')}</h2></div></div></div>`;
 try{
  if(key==='Reporting'){await renderReporting();return}
  const cfg=modules[key];if(!cfg)return deactivate();
  const support=[];if(cfg.fields.some(f=>f[3]==='site'))support.push(api('/api/sites').then(x=>refs.sites=x));if(cfg.fields.some(f=>f[3]==='asset'))support.push(api('/api/assets').then(x=>refs.assets=x));
  const data=await Promise.all([api(cfg.api),...support]);rows=data[0];renderModule();
 }catch(e){renderError(e.message)}
}

function renderError(message){const w=ensureWorkspace();w.innerHTML=`<div class="enterpriseError">${esc(message)}</div>`}

function renderModule(){
 const cfg=modules[current],w=ensureWorkspace();if(!cfg)return;
 const q=search.toLowerCase();const filtered=rows.filter(r=>!q||Object.values(r).some(v=>String(v??'').toLowerCase().includes(q)));
 const cols=cfg.columns;const template=`repeat(${cols.length},minmax(0,1fr)) 90px`;
 w.innerHTML=`<div class="enterpriseShell">
  <section class="enterpriseHero"><div><div class="eyebrow">CORE OPS WORKFLOW / ${esc(current)}</div><h2>${esc(txt(...cfg.title))}</h2><p>${esc(txt(...cfg.subtitle))}</p></div><button class="primary" id="enterpriseNew">+ ${esc(txt('New','Nou'))}</button></section>
  <div class="enterpriseToolbar"><input id="enterpriseSearch" value="${esc(search)}" placeholder="${esc(txt('Search records…','Caută înregistrări…'))}"><button class="secondary" id="enterpriseRefresh">${esc(txt('Refresh','Reîmprospătează'))}</button></div>
  <section class="enterpriseTable"><div class="enterpriseHead" style="grid-template-columns:${template}">${cols.map(c=>`<span>${esc(txt(c[1],c[2]))}</span>`).join('')}<span></span></div>
  ${filtered.length?filtered.map(r=>`<div class="enterpriseRow" data-enterprise-open="${esc(current)}" data-enterprise-id="${r.id}" style="grid-template-columns:${template}">${cols.map((c,i)=>`<${i===1?'strong':'span'} class="${i===0?'mono':''}">${c[0]==='status'?`<i class="enterpriseStatus ${esc(r.status||'')}">${esc(cell(r,c[0]))}</i>`:esc(cell(r,c[0]))}</${i===1?'strong':'span'}>`).join('')}<span class="enterpriseActions"><button class="miniBtn" data-enterprise-edit="${r.id}">${esc(txt('Edit','Editează'))}</button></span></div>`).join(''):`<div class="enterpriseEmpty">${esc(txt('No records yet.','Nu există încă înregistrări.'))}</div>`}</section>
 </div>`;
 w.querySelector('#enterpriseNew').onclick=()=>openForm();
 w.querySelector('#enterpriseRefresh').onclick=()=>openModule(current);
 const input=w.querySelector('#enterpriseSearch');input.oninput=e=>{search=e.target.value;renderModule();requestAnimationFrame(()=>{const n=document.querySelector('#enterpriseSearch');n?.focus();n?.setSelectionRange(search.length,search.length)})};
 w.querySelectorAll('[data-enterprise-edit]').forEach(b=>b.onclick=()=>openForm(rows.find(r=>String(r.id)===String(b.dataset.enterpriseEdit))));
 w.querySelectorAll('[data-enterprise-open]').forEach(row=>row.onclick=e=>{if(e.target.closest('[data-enterprise-edit]'))return;if(['Problems','Changes','Knowledge'].includes(row.dataset.enterpriseOpen))window.CoreOpsPhase10?.open?.(row.dataset.enterpriseOpen,row.dataset.enterpriseId)});
}

function originalValue(row,key){
 const map={rootCause:'root_cause',relatedIncident:'related_incident',changeType:'change_type',approvalStatus:'approval_status',plannedStart:'planned_start',plannedEnd:'planned_end',implementationPlan:'implementation_plan',rollbackPlan:'rollback_plan',siteId:'site_id',assetId:'asset_id',inspectionType:'inspection_type',scheduledAt:'scheduled_at',findingCount:'finding_count',evidenceType:'evidence_type',referenceType:'reference_type',referenceNumber:'reference_number',fileName:'file_name',fileUrl:'file_url',startDate:'start_date',targetDate:'target_date',requestedBy:'requested_by',requiredDate:'required_date'};
 let v=row?.[map[key]||key]??'';
 if(['plannedStart','plannedEnd','scheduledAt'].includes(key)&&v){const d=new Date(v);v=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
 if(['startDate','targetDate','requiredDate'].includes(key)&&v)v=String(v).slice(0,10);
 return v;
}
function fieldHtml(f,row){
 const [key,en,rr,type,extra]=f;const value=originalValue(row,key);const label=txt(en,rr);const full=type==='textarea'?' full':'';
 if(type==='textarea')return `<label class="${full}">${esc(label)}<textarea name="${key}">${esc(value)}</textarea></label>`;
 if(type==='select')return `<label>${esc(label)}<select name="${key}">${extra.map(x=>`<option value="${esc(x)}" ${String(value)===String(x)?'selected':''}>${esc(showStatus(x))}</option>`).join('')}</select></label>`;
 if(type==='site')return `<label>${esc(label)}<select name="${key}"><option value="">—</option>${refs.sites.map(x=>`<option value="${x.id}" ${String(value)===String(x.id)?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`;
 if(type==='asset')return `<label>${esc(label)}<select name="${key}"><option value="">—</option>${refs.assets.map(x=>`<option value="${x.id}" ${String(value)===String(x.id)?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`;
 return `<label>${esc(label)}<input name="${key}" type="${type}" value="${esc(value)}" ${extra===true?'required':''}></label>`;
}
function openForm(row=null){
 const cfg=modules[current];if(!cfg)return;
 const back=document.createElement('div');back.className='enterpriseModalBack';
 back.innerHTML=`<form class="enterpriseModal"><div class="enterpriseModalHead"><div><div class="eyebrow">${esc(txt(row?'Edit record':'New record',row?'Editează înregistrarea':'Înregistrare nouă'))}</div><h2>${esc(txt(...cfg.title))}</h2></div><button type="button" class="close">×</button></div><div class="enterpriseModalBody">${cfg.fields.map(f=>fieldHtml(f,row)).join('')}<div id="enterpriseFormError" class="enterpriseError full" style="display:none"></div></div><div class="enterpriseModalActions"><button type="button" class="secondary cancel">${esc(txt('Cancel','Anulează'))}</button><button class="primary">${esc(txt(row?'Save changes':'Create',row?'Salvează modificările':'Creează'))}</button></div></form>`;
 document.body.appendChild(back);const close=()=>back.remove();back.querySelector('.close').onclick=close;back.querySelector('.cancel').onclick=close;back.onclick=e=>{if(e.target===back)close()};
 back.querySelector('form').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),body={};for(const [k,v] of fd.entries())body[k]=v;for(const f of cfg.fields)if(f[3]==='number')body[f[0]]=Number(body[f[0]]||0);for(const f of cfg.fields)if(['site','asset'].includes(f[3]))body[f[0]]=body[f[0]]?Number(body[f[0]]):null;const err=back.querySelector('#enterpriseFormError');try{await api(row?`${cfg.api}/${row.id}`:cfg.api,{method:row?'PATCH':'POST',body:JSON.stringify(body)});close();await openModule(current)}catch(x){err.style.display='block';err.textContent=x.message}};
}

async function renderReporting(){
 try{const s=await api('/api/reporting/summary');const cards=[['Open incidents','Incidente deschise',s.incidents],['Open problems','Probleme deschise',s.problems],['Active changes','Modificări active',s.changes],['Published knowledge','Articole publicate',s.knowledge],['Open audits','Audituri deschise',s.audits],['Open inspections','Inspecții deschise',s.inspections],['Current evidence','Dovezi curente',s.evidence],['Managed assets','Active administrate',s.assets],['Sites','Locații',s.sites],['Server rooms','Camere de servere',s.serverRooms],['Racks','Rack-uri',s.racks],['Active projects','Proiecte active',s.projects]];ensureWorkspace().innerHTML=`<div class="enterpriseShell"><section class="enterpriseHero"><div><div class="eyebrow">CORE OPS WORKFLOW / REPORTING</div><h2>${esc(txt('Operational Reporting','Raportare operațională'))}</h2><p>${esc(txt('Live summary across service, infrastructure and compliance.','Rezumat live pentru servicii, infrastructură și conformitate.'))}</p></div><button class="secondary" id="enterpriseReportRefresh">${esc(txt('Refresh','Reîmprospătează'))}</button></section><div class="enterpriseReportGrid">${cards.map(c=>`<div class="enterpriseReportCard"><span>${esc(txt(c[0],c[1]))}</span><b>${c[2]}</b></div>`).join('')}</div><small>${esc(txt('Generated','Generat'))}: ${fmt(s.generatedAt)}</small></div>`;document.querySelector('#enterpriseReportRefresh').onclick=()=>renderReporting()}catch(e){renderError(e.message)}
}

function clickHandler(e){
 const btn=e.target.closest('.app aside nav button');if(!btn)return;
 const explicit=btn.dataset.enterpriseModule;const name=(btn.textContent||'').replace(/^🔒\s*/,'').trim();const key=explicit||navAliases[name];
 if(key){e.preventDefault();e.stopImmediatePropagation();openModule(key)}else deactivate();
}
document.addEventListener('click',clickHandler,true);
window.addEventListener('coreops:language-changed',()=>{addNav();if(current)current==='Reporting'?renderReporting():renderModule()});
setInterval(addNav,1000);addNav();
