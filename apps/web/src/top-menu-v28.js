const labels={
  'Service Portfolio':['Services','Servicii'],
  'Governance':['Governance','Guvernanță'],
  'Operations Hub':['Operations','Operațiuni'],
  'Service Catalogue':['Catalogue','Catalog'],
  'My Work':['My Work','Activitatea mea'],
  'Dashboard':['Dashboard','Panou de control'],
  'Incidents':['Incidents','Incidente'],
  'Requests':['Requests','Solicitări'],
  'SLA Management':['SLA','SLA'],
  'Assets / CMDB':['Assets','Active'],
  'Sites':['Sites','Locații'],
  'Server Rooms':['Server Rooms','Camere server'],
  'Racks':['Racks','Rack-uri'],
  'Equipment':['Equipment','Echipamente'],
  'Monitoring':['Monitoring','Monitorizare'],
  'Notifications':['Notifications','Notificări'],
  'Audits':['Audits','Audituri'],
  'Inspections':['Inspections','Inspecții'],
  'Evidence':['Evidence','Dovezi'],
  'DCAM Overview':['DCAM','DCAM'],
  'Reporting':['Reporting','Raportare'],
  'Projects':['Projects','Proiecte'],
  'Procurement':['Procurement','Achiziții'],
  'Administration':['Admin','Administrare'],
  'Licensing':['Licensing','Licențiere']
};
// Primary shortcuts live here; the sidebar remains the complete module navigator.
const keys=['Dashboard','My Work','Incidents','Requests','Assets / CMDB','Monitoring'];
const icons={'Dashboard':'⌂','My Work':'✓','Incidents':'!','Requests':'↗','Assets / CMDB':'◇','Monitoring':'◉'};
const isRo=()=>((window.CoreOpsI18n?.getLanguage?.()||localStorage.getItem('coreops_language'))==='ro-RO');
function sideButton(key){
  if(key==='Service Portfolio')return {click:()=>window.CoreOpsPhase7?.open?.(),classList:{contains:()=>document.querySelector('.app main')?.classList.contains('phase7Active')}};
  if(key==='Governance')return {click:()=>window.CoreOpsPhase5?.open?.(),classList:{contains:()=>document.querySelector('.app main')?.classList.contains('phase5Active')}};
  if(key==='Operations Hub')return {click:()=>window.CoreOpsPhase4?.hub?.(),classList:{contains:()=>document.querySelector('.app main')?.classList.contains('phase4Active')}};
  if(key==='Service Catalogue')return {click:()=>window.CoreOpsPhase12?.catalogue?.()||window.CoreOpsPhase4?.catalogue?.(),classList:{contains:()=>document.querySelector('.app main')?.classList.contains('phase12Active')}};
  if(key==='My Work')return {click:()=>window.CoreOpsPhase3?.openMyWork?.(),classList:{contains:()=>document.querySelector('.app main')?.classList.contains('phase3Active')}};
  if(key==='DCAM Overview')return document.querySelector('[data-dcam-overview]');
  if(key==='Monitoring')return document.querySelector('[data-monitoring]');
  if(key==='Notifications')return document.querySelector('[data-notifications]');
  if(key==='SLA Management')return document.querySelector('[data-sla]');
  if(key==='Projects'||key==='Procurement')return document.querySelector(`[data-enterprise-module="${key}"]`);
  const variants={
    'Dashboard':['Dashboard','Panou de control'],'Incidents':['Incidents','Incidente'],'Requests':['Requests','Solicitări'],'Assets / CMDB':['Assets / CMDB','Active / CMDB'],'Sites':['Sites','Locații'],'Server Rooms':['Server Rooms','Camere de servere'],'Racks':['Racks','Rack-uri'],'Equipment':['Equipment','Echipamente'],'Audits':['Audits','Audituri'],'Inspections':['Inspections','Inspecții'],'Evidence':['Evidence','Dovezi'],'Reporting':['Reporting','Raportare'],'Administration':['Administration','Administrare'],'Licensing':['Licensing','Licențiere']
  }[key]||[key];
  return [...document.querySelectorAll('.app aside nav button')].find(b=>variants.includes((b.textContent||'').trim()))||null;
}
function ensure(){
  if(!document.querySelector('.app')){document.getElementById('coreopsTopMenu')?.remove();document.documentElement.classList.remove('coreopsTopMenuActive');return}
  let bar=document.getElementById('coreopsTopMenu');
  if(!bar){
    bar=document.createElement('div');bar.id='coreopsTopMenu';
    bar.innerHTML='<div class="topMenuBrand"><i class="topBrandIcon" aria-hidden="true"></i><div><b>Core Ops</b><span>Workflow</span></div></div><div class="topMenuItems"></div><div class="topMenuUtility"></div>';
    const row=bar.querySelector('.topMenuItems');
    keys.forEach(key=>{const b=document.createElement('button');b.type='button';b.dataset.topKey=key;b.innerHTML=`<span class="topNavIcon" aria-hidden="true">${icons[key]||'•'}</span><span class="topNavLabel"></span>`;b.onclick=()=>{sideButton(key)?.click();window.scrollTo({top:0,left:0,behavior:'auto'})};row.appendChild(b)});
    document.body.appendChild(bar);
  }
  document.documentElement.classList.add('coreopsTopMenuActive');
  bar.querySelectorAll('[data-top-key]').forEach(b=>{const key=b.dataset.topKey;const label=b.querySelector('.topNavLabel');if(label)label.textContent=labels[key][isRo()?1:0];b.title=labels[key][isRo()?1:0];b.classList.toggle('topActive',Boolean(sideButton(key)?.classList.contains('active')))});
  const utility=bar.querySelector('.topMenuUtility'),actions=document.querySelector('.app main>header .headActions');
  if(utility&&actions){
    const user=actions.querySelector('.uxUserButton'),role=actions.querySelector('.badge'),refresh=actions.querySelector('.iconBtn');
    if(!utility.dataset.ready){
      utility.innerHTML='<label class="topLanguage"><span>Language</span><select aria-label="Language"><option value="en-GB">English</option><option value="ro-RO">Română</option></select></label><button class="topUser" data-top-user aria-label="User menu"></button><span class="topRole"></span><button class="topRefresh" data-top-refresh aria-label="Refresh">↻</button>';
      utility.dataset.ready='true';
      const select=utility.querySelector('select');select.onchange=()=>window.CoreOpsI18n?.setLanguage?.(select.value);
      utility.querySelector('[data-top-user]').onclick=()=>document.querySelector('.app main>header .uxUserButton')?.click();
      utility.querySelector('[data-top-refresh]').onclick=()=>document.querySelector('.app main>header .iconBtn')?.click();
    }
    const select=utility.querySelector('select'),languageLabel=utility.querySelector('.topLanguage span');
    if(select&&document.activeElement!==select)select.value=window.CoreOpsI18n?.getLanguage?.()||localStorage.getItem('coreops_language')||'en-GB';
    if(languageLabel)languageLabel.textContent=isRo()?'Limbă':'Language';
    utility.querySelector('.topUser').textContent=user?.textContent.trim()||'PA';
    utility.querySelector('.topRole').textContent=role?.textContent.trim()||'';
    utility.querySelector('.topRefresh').hidden=!refresh;
  }
}
const timer=setInterval(ensure,800);
window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
window.addEventListener('coreops:language-changed',ensure);
document.addEventListener('click',()=>setTimeout(ensure,0),true);
ensure();
