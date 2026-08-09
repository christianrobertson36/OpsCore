import './licensing-v9.css';

const PRODUCT_GROUPS={
 OPSCORE:['Incidents','Requests','Problems','Changes','Knowledge'],
 SERVER_MANAGER:['Server Rooms','Racks','Equipment'],
 DCAM:['Audits','Inspections','Evidence']
};
let licence=null;let lastToken='';let installed=false;

function token(){return localStorage.getItem('opscore_token')||''}
async function api(path,options={}){const t=token();const r=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{}) ,...(options.headers||{})}});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||`HTTP ${r.status}`);return body}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]))}
function productName(p){return p==='SERVER_MANAGER'?'Server Manager':p==='OPSCORE'?'OpsCore':'DCAM'}
function fmtDate(v){return v?new Date(v).toLocaleDateString('en-GB'):'—'}

function ensureShell(){
 if(installed)return;
 const root=document.createElement('div');root.id='opscoreLicensingV9';document.body.appendChild(root);installed=true;
 document.addEventListener('click',e=>{
  const btn=e.target.closest('aside nav button');if(!btn||!licence)return;const name=btn.textContent.trim().replace(/^🔒\s*/,'');
  for(const [product,items] of Object.entries(PRODUCT_GROUPS))if(items.includes(name)&&!licence.entitlements?.[product]){e.preventDefault();e.stopImmediatePropagation();openLicence(product);return}
 },true);
}

function applyLocks(){
 if(!licence)return;document.querySelectorAll('aside nav button').forEach(btn=>{const raw=btn.textContent.trim().replace(/^🔒\s*/,'');let locked=false;for(const [product,items] of Object.entries(PRODUCT_GROUPS))if(items.includes(raw)&&!licence.entitlements?.[product])locked=true;btn.classList.toggle('licenceLocked',locked);if(locked&&!btn.textContent.trim().startsWith('🔒'))btn.textContent=`🔒 ${raw}`;if(!locked&&btn.textContent.trim().startsWith('🔒'))btn.textContent=raw});
 const nav=document.querySelector('aside nav');if(nav&&!nav.querySelector('[data-v9-licensing]')){const b=document.createElement('button');b.dataset.v9Licensing='1';b.innerHTML='<span>Licensing</span>';b.addEventListener('click',()=>openLicence());nav.appendChild(b)}
 document.querySelectorAll('.pill').forEach(x=>{if(/^v\d/.test(x.textContent.trim()))x.textContent='v9'});
 document.querySelectorAll('.asideFooter span').forEach(x=>{x.textContent=x.textContent.replace(/v\d+(?:-\w+)?/,'v9')});
 renderBanner();
}

function renderBanner(){let b=document.getElementById('licenceTrialBanner');if(b)b.remove();if(!licence)return;const main=document.querySelector('.app main');if(!main)return;
 const show=licence.licenceType==='Trial'||licence.mode!=='Active';if(!show)return;b=document.createElement('button');b.id='licenceTrialBanner';b.type='button';b.className=`licenceBanner ${licence.mode==='Active'?'trial':'warning'}`;
 b.innerHTML=licence.licenceType==='Trial'&&licence.mode==='Active'?`<strong>Full Suite Trial</strong><span>${licence.daysRemaining} day${licence.daysRemaining===1?'':'s'} remaining · ${esc(licence.organisationName)}</span><b>View licence →</b>`:`<strong>${esc(licence.status)}</strong><span>${licence.mode==='Read Only'?'Licence is in read-only grace period':'Licence requires attention'}</span><b>View licence →</b>`;b.onclick=()=>openLicence();main.prepend(b)}

function usage(label,value,max){const p=max?Math.min(100,Math.round(value/max*100)):0;return `<div class="licUsage"><div><span>${label}</span><b>${value} / ${max}</b></div><div class="licTrack"><i style="width:${p}%"></i></div></div>`}
function openLicence(focusProduct=''){
 ensureShell();const root=document.getElementById('opscoreLicensingV9');if(!licence){root.innerHTML='<div class="licenceBack"><div class="licencePanel"><p>Loading licence…</p></div></div>';return}
 const isAdmin=[...document.querySelectorAll('.headActions .badge')].some(x=>x.textContent.trim()==='Administrator');
 const cards=['OPSCORE','DCAM','SERVER_MANAGER'].map(p=>`<label class="licProduct ${licence.entitlements?.[p]?'on':'off'} ${focusProduct===p?'focus':''}"><div><strong>${productName(p)}</strong><span>${p==='OPSCORE'?'Service management and core OpsCore workflows':p==='DCAM'?'Compliance, audits, inspections and evidence':'Server rooms, racks and equipment management'}</span></div>${isAdmin?`<input type="checkbox" data-entitlement="${p}" ${licence.entitlements?.[p]?'checked':''}>`:`<b>${licence.entitlements?.[p]?'Licensed':'Not licensed'}</b>`}</label>`).join('');
 root.innerHTML=`<div class="licenceBack"><section class="licencePanel"><header><div><div class="licEyebrow">Administration / Licensing</div><h1>OpsCore Licensing</h1><p>Customer entitlement, trial and installation control.</p></div><button class="licClose">×</button></header><div class="licHero"><div><span>${esc(licence.licenceType)}</span><h2>${esc(licence.planName)}</h2><p>${esc(licence.organisationName)}</p></div><div class="licStatus ${licence.mode==='Active'?'ok':'warn'}"><b>${esc(licence.status)}</b><span>${licence.licenceType==='Trial'?`${licence.daysRemaining} days remaining`:licence.mode}</span></div></div><div class="licStats"><div><span>Licence ID</span><b>${esc(licence.licenceKey)}</b></div><div><span>Installation ID</span><b>${esc(licence.installationId)}</b></div><div><span>Trial ends</span><b>${fmtDate(licence.trialEndsAt)}</b></div><div><span>Expires</span><b>${fmtDate(licence.expiresAt)}</b></div></div><section class="licSection"><h3>Products</h3><p>Any combination can be enabled for this customer.</p><div class="licProducts">${cards}</div></section><section class="licSection"><h3>Usage & limits</h3>${usage('Users',licence.usage?.users||0,licence.maxUsers)}${usage('Sites',licence.usage?.sites||0,licence.maxSites)}${usage('Assets',licence.usage?.assets||0,licence.maxAssets)}</section>${isAdmin?`<section class="licSection"><h3>Licence administration</h3><div class="licFormGrid"><label>Licence type<select id="licType"><option ${licence.licenceType==='Trial'?'selected':''}>Trial</option><option ${licence.licenceType==='Paid'?'selected':''}>Paid</option></select></label><label>Plan<input id="licPlan" value="${esc(licence.planName)}"></label><label>Max users<input id="licUsers" type="number" min="1" value="${licence.maxUsers}"></label><label>Max sites<input id="licSites" type="number" min="1" value="${licence.maxSites}"></label><label>Max assets<input id="licAssets" type="number" min="1" value="${licence.maxAssets}"></label><label>Trial end<input id="licTrial" type="date" value="${licence.trialEndsAt?new Date(licence.trialEndsAt).toISOString().slice(0,10):''}"></label></div><div id="licError" class="licError"></div><button id="licSave" class="licSave">Save licence</button></section>`:''}<footer><span>OpsCore v9 licensing foundation</span><button class="licClose secondary">Close</button></footer></section></div>`;
 root.querySelectorAll('.licClose').forEach(b=>b.onclick=()=>root.innerHTML='');
 const save=root.querySelector('#licSave');if(save)save.onclick=async()=>{const err=root.querySelector('#licError');err.textContent='';save.disabled=true;try{const ent={};root.querySelectorAll('[data-entitlement]').forEach(x=>ent[x.dataset.entitlement]=x.checked);licence=await api('/api/licensing',{method:'PATCH',body:JSON.stringify({licenceType:root.querySelector('#licType').value,planName:root.querySelector('#licPlan').value,maxUsers:Number(root.querySelector('#licUsers').value),maxSites:Number(root.querySelector('#licSites').value),maxAssets:Number(root.querySelector('#licAssets').value),trialEndsAt:root.querySelector('#licTrial').value||null,entitlements:ent})});applyLocks();openLicence()}catch(e){err.textContent=e.message}finally{save.disabled=false}};
}

async function refreshLicence(){const t=token();if(!t){licence=null;lastToken='';return}try{licence=await api('/api/licensing/status');lastToken=t;ensureShell();applyLocks()}catch(e){console.warn('OpsCore licensing status unavailable',e.message)}}
ensureShell();setInterval(()=>{const t=token();if(t&&t!==lastToken)refreshLicence();if(t&&licence)applyLocks()},1500);if(token())refreshLicence();
