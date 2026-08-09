import logoUrl from './core-ops-logo.svg';
import './branding-v15.css';

document.documentElement.classList.add('coreopsV14');
document.title='Core Ops Workflow';

function ensureLoginPresentation(){
  let hero=document.getElementById('coreopsLoginPresentation');
  if(hero)return hero;
  hero=document.createElement('section');
  hero.id='coreopsLoginPresentation';
  hero.setAttribute('aria-hidden','true');
  hero.innerHTML=`
    <div class="v14HeroInner">
      <img class="v14HeroLogo" src="${logoUrl}" alt="">
      <div class="v14Eyebrow">Enterprise operations platform</div>
      <h1>Enterprise operations.<br><span>Built for what’s critical.</span></h1>
      <p class="v14Lead">Core Ops Workflow brings service, infrastructure and compliance into one secure operational workspace with shared assets, locations and controls.</p>
      <div class="v14FlowGrid">
        <div class="v14Flow"><i>01</i><div><b>Request</b><span>Capture operational work</span></div></div>
        <div class="v14Flow"><i>02</i><div><b>Approve</b><span>Route ownership and decisions</span></div></div>
        <div class="v14Flow"><i>03</i><div><b>Operate</b><span>Deliver service and infrastructure</span></div></div>
        <div class="v14Flow"><i>04</i><div><b>Comply</b><span>Evidence, controls and assurance</span></div></div>
      </div>
      <div class="v14TrustGrid">
        <div><strong>Secure by design</strong><span>Role-aware protected access</span></div>
        <div><strong>Connected operations</strong><span>Service, assets and infrastructure</span></div>
        <div><strong>Licence aware</strong><span>Trials, products and usage controls</span></div>
      </div>
    </div>`;
  document.body.appendChild(hero);
  return hero;
}

function syncLoginPresentation(){
  const login=Boolean(document.querySelector('.authScreen form.authCard'));
  ensureLoginPresentation();
  document.documentElement.classList.toggle('coreopsLoginActive',login);
}

function setupCompactMenu(){
  const nav=document.querySelector('.app aside nav');
  if(!nav||nav.dataset.compactMenu==='15')return;
  nav.dataset.compactMenu='15';
  const headings=[...nav.querySelectorAll('h4')];
  headings.forEach((heading,index)=>{
    heading.setAttribute('role','button');
    heading.tabIndex=0;
    const raw=(heading.textContent||'').trim();
    const key=raw.toLowerCase().replace(/\s+/g,'-');
    heading.dataset.menuGroup=key;
    const toggle=()=>{
      const open=heading.classList.contains('menuOpen');
      headings.forEach(h=>h.classList.remove('menuOpen'));
      if(!open)heading.classList.add('menuOpen');
      applyGroups();
    };
    heading.addEventListener('click',toggle);
    heading.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
    if(index===0)heading.classList.add('menuOpen');
  });
  applyGroups();
}

function applyGroups(){
  const nav=document.querySelector('.app aside nav');
  if(!nav)return;
  let current=null;
  [...nav.children].forEach(el=>{
    if(el.tagName==='H4'){current=el;return}
    if(el.tagName==='BUTTON'&&current)el.classList.toggle('compactHidden',!current.classList.contains('menuOpen'));
  });
}

function tick(){syncLoginPresentation();setupCompactMenu();applyGroups()}
setInterval(tick,700);
tick();
