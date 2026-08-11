const labels={
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
const keys=Object.keys(labels);
const isRo=()=>((window.CoreOpsI18n?.getLanguage?.()||localStorage.getItem('coreops_language'))==='ro-RO');
function sideButton(key){
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
    bar.innerHTML='<div class="topMenuBrand"><b>CoreOps</b><span>Workflow</span></div><div class="topMenuItems"></div>';
    const row=bar.querySelector('.topMenuItems');
    keys.forEach(key=>{const b=document.createElement('button');b.type='button';b.dataset.topKey=key;b.onclick=()=>sideButton(key)?.click();row.appendChild(b)});
    document.body.appendChild(bar);
  }
  document.documentElement.classList.add('coreopsTopMenuActive');
  bar.querySelectorAll('[data-top-key]').forEach(b=>{const key=b.dataset.topKey;b.textContent=labels[key][isRo()?1:0];b.classList.toggle('topActive',Boolean(sideButton(key)?.classList.contains('active')))});
}
const timer=setInterval(ensure,800);
window.addEventListener('beforeunload',()=>clearInterval(timer),{once:true});
window.addEventListener('coreops:language-changed',ensure);
document.addEventListener('click',()=>setTimeout(ensure,0),true);
ensure();
