const token=()=>localStorage.getItem('opscore_token')||'';
const lang=()=>window.CoreOpsI18n?.getLanguage?.()||localStorage.getItem('coreops_language')||'en-GB';
const ro=()=>lang()==='ro-RO';
const t=(en,romanian)=>ro()?romanian:en;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));

async function api(path){
 const r=await fetch(path,{headers:{...(token()?{Authorization:`Bearer ${token()}`}:{})}});
 const b=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(new Error(b.detail||b.error||`HTTP ${r.status}`),{payload:b});
 return b;
}

const cards=[
 ['customers','Customers','Clienți'],
 ['buildings','Buildings / Sites','Clădiri / Locații'],
 ['assets','DCAM Assets','Active DCAM'],
 ['workOrders','Work Orders','Ordine de lucru'],
 ['maintenancePlans','Planned Maintenance','Mentenanță planificată'],
 ['complianceServices','Compliance Services','Servicii de conformitate'],
 ['formTemplates','Forms / Inspections','Formulare / Inspecții'],
 ['reports','Reports','Rapoarte'],
 ['certificates','Certificates','Certificate'],
 ['serviceRequests','Service Requests','Solicitări de servicii'],
 ['defects','Defects / Corrective Actions','Defecte / Acțiuni corective'],
 ['users','DCAM Users','Utilizatori DCAM']
];

function workspace(){
 let el=document.getElementById('coreopsDcamWorkspace');
 if(!el){el=document.createElement('section');el.id='coreopsDcamWorkspace';document.querySelector('.app main')?.appendChild(el)}
 return el;
}

function activate(){
 const main=document.querySelector('.app main');
 main?.classList.remove('enterpriseModuleActive');
 main?.classList.add('dcamBridgeActive');
 document.querySelectorAll('.app aside nav button').forEach(b=>b.classList.remove('active'));
 document.querySelector('[data-dcam-overview]')?.classList.add('active');
}

function deactivate(){
 document.querySelector('.app main')?.classList.remove('dcamBridgeActive');
 document.querySelector('[data-dcam-overview]')?.classList.remove('active');
}

function addNav(){
 const nav=document.querySelector('.app aside nav');if(!nav||nav.querySelector('[data-dcam-overview]'))return;
 const headings=[...nav.querySelectorAll('h4')];
 const compliance=headings.find(h=>['Compliance','Conformitate'].includes(h.textContent.trim()));
 if(!compliance)return;
 const btn=document.createElement('button');
 btn.dataset.dcamOverview='1';
 btn.innerHTML='<span>DCAM Overview</span>';
 btn.onclick=()=>openOverview();
 compliance.insertAdjacentElement('afterend',btn);
 window.dispatchEvent(new CustomEvent('coreops:language-refresh'));
}

function renderLoading(){
 workspace().innerHTML=`<div class="dcamShell"><section class="dcamHero"><div><div class="eyebrow">CORE OPS COMPLIANCE / DCAM</div><h2>${t('Connecting to DCAM…','Se conectează la DCAM…')}</h2><p>${t('Reading the live compliance platform.','Se citesc datele live din platforma de conformitate.')}</p></div></section></div>`;
}

function render(data){
 const counts=data.counts||{};
 const modules=data.modules||{};
 workspace().innerHTML=`<div class="dcamShell">
  <section class="dcamHero"><div><div class="eyebrow">CORE OPS COMPLIANCE / DCAM</div><h2>${t('DCAM Compliance Operations','Operațiuni de conformitate DCAM')}</h2><p>${t('Live view of Digital Compliance & Asset Management. DCAM remains the compliance system of record while Core Ops provides the unified operational view.','Vizualizare live a Digital Compliance & Asset Management. DCAM rămâne sistemul principal pentru conformitate, iar Core Ops oferă vizualizarea operațională unificată.')}</p></div><div class="dcamConnection ${data.connected?'connected':'offline'}"><span>${data.connected?t('Connected','Conectat'):t('Unavailable','Indisponibil')}</span><strong>${esc(data.version||'—')}</strong></div></section>
  <section class="dcamStatusRow"><div><span>${t('Source','Sursă')}</span><b>${esc(data.name||'Digital Compliance & Asset Management')}</b></div><div><span>${t('Mode','Mod')}</span><b>${t('Read-only bridge','Legătură doar pentru citire')}</b></div><div><span>${t('Last checked','Ultima verificare')}</span><b>${data.checkedAt?new Date(data.checkedAt).toLocaleString(ro()?'ro-RO':'en-GB'):'—'}</b></div><button id="dcamRefresh" class="secondary">${t('Refresh DCAM','Reîmprospătează DCAM')}</button></section>
  <section class="dcamGrid">${cards.map(([key,en,romanian])=>`<article class="dcamCard"><span>${t(en,romanian)}</span><strong>${Number(counts[key]||0)}</strong></article>`).join('')}</section>
  <section class="dcamModulePanel"><div><h3>${t('Connected DCAM capabilities','Capabilități DCAM conectate')}</h3><p>${t('These capabilities are supplied by the existing DCAM application, not duplicated in Core Ops.','Aceste capabilități sunt furnizate de aplicația DCAM existentă și nu sunt duplicate în Core Ops.')}</p></div><div class="dcamChips">${Object.entries(modules).filter(([,v])=>v).map(([k])=>`<span>${esc(k.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase()))}</span>`).join('')}</div></section>
  <section class="dcamRoadmap"><h3>${t('Integration status','Starea integrării')}</h3><div class="dcamSteps"><div class="done"><b>1</b><span>${t('Live DCAM connection','Conexiune live DCAM')}</span></div><div><b>2</b><span>${t('Site & asset identity mapping','Maparea identității locațiilor și activelor')}</span></div><div><b>3</b><span>${t('DCAM record drill-in from Core Ops','Deschiderea înregistrărilor DCAM din Core Ops')}</span></div><div><b>4</b><span>${t('Shared users, workflow and audit','Utilizatori, fluxuri și audit partajate')}</span></div></div></section>
 </div>`;
 workspace().querySelector('#dcamRefresh').onclick=()=>openOverview();
}

function renderError(error){
 const detail=error?.message||String(error);
 workspace().innerHTML=`<div class="dcamShell"><section class="dcamHero"><div><div class="eyebrow">CORE OPS COMPLIANCE / DCAM</div><h2>${t('DCAM is not connected','DCAM nu este conectat')}</h2><p>${esc(detail)}</p></div><div class="dcamConnection offline"><span>${t('Unavailable','Indisponibil')}</span></div></section><section class="dcamModulePanel"><div><h3>${t('Core Ops compliance remains available','Conformitatea Core Ops rămâne disponibilă')}</h3><p>${t('The DCAM bridge can be configured without changing or migrating the DCAM database.','Legătura DCAM poate fi configurată fără modificarea sau migrarea bazei de date DCAM.')}</p></div><button id="dcamRetry" class="primary">${t('Retry','Reîncearcă')}</button></section></div>`;
 workspace().querySelector('#dcamRetry').onclick=()=>openOverview();
}

async function openOverview(){
 activate();renderLoading();
 try{render(await api('/api/dcam/summary'))}catch(e){renderError(e)}
}

function watchNavigation(){
 document.addEventListener('click',e=>{
  const btn=e.target.closest('.app aside nav button');
  if(!btn||btn.dataset.dcamOverview)return;
  if(document.querySelector('.app main')?.classList.contains('dcamBridgeActive'))deactivate();
 },true);
}

const observer=new MutationObserver(()=>addNav());
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('coreops:language-changed',()=>{addNav();if(document.querySelector('.app main')?.classList.contains('dcamBridgeActive'))openOverview()});
addNav();watchNavigation();
