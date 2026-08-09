import logoUrl from './core-ops-logo.svg';
import './branding-v10.css';

const HERO=`
<section class="coreopsHero" aria-label="Core Ops Workflow overview">
  <div>
    <img class="coreopsBrandLogo" src="${logoUrl}" alt="Core Ops Workflow">
    <div class="coreopsHeroCopy">
      <span class="coreopsEyebrow">Enterprise operations platform</span>
      <h2>Enterprise operations.<br>Built for what’s <span>critical.</span></h2>
      <p>Core Ops Workflow unifies service, infrastructure and compliance operations in one secure workspace, with shared assets, locations, workflows and licensing.</p>
      <div class="coreopsWorkflowMap">
        <div class="coreopsFlowCard"><strong>Request</strong><span>Capture operational work</span></div>
        <div class="coreopsFlowCard"><strong>Approve</strong><span>Route ownership and decisions</span></div>
        <div class="coreopsFlowCard"><strong>Operate</strong><span>Service and infrastructure delivery</span></div>
        <div class="coreopsFlowCard"><strong>Comply</strong><span>Evidence, controls and assurance</span></div>
      </div>
    </div>
  </div>
  <div class="coreopsHeroFooter">
    <div class="coreopsFeature"><b>Secure by design</b><span>Role-aware access and protected operational data.</span></div>
    <div class="coreopsFeature"><b>Connected operations</b><span>One platform for service, assets and infrastructure.</span></div>
    <div class="coreopsFeature"><b>Commercial ready</b><span>Trials, product entitlements and usage controls built in.</span></div>
  </div>
</section>`;

function patchLogin(){
  const screen=document.querySelector('.authScreen');
  const form=screen?.querySelector('form.authCard');
  if(!screen||!form)return;

  screen.classList.add('coreopsLogin');

  if(!screen.querySelector('.coreopsHero'))screen.insertAdjacentHTML('afterbegin',HERO);

  if(!form.closest('.coreopsLoginAside')){
    const aside=document.createElement('section');
    aside.className='coreopsLoginAside';
    form.parentNode.insertBefore(aside,form);
    aside.appendChild(form);
  }

  if(!form.querySelector('.coreopsLoginBrand')){
    const brand=document.createElement('div');
    brand.className='coreopsLoginBrand';
    brand.innerHTML=`<img src="${logoUrl}" alt="Core Ops Workflow">`;
    form.prepend(brand);
  }

  const heading=form.querySelector('h1');
  if(heading){heading.textContent='Secure access';heading.classList.add('coreopsLoginHeading')}
  const headingWrap=heading?.parentElement;
  if(headingWrap){
    headingWrap.classList.add('coreopsLoginIntro');
    const p=headingWrap.querySelector('p');
    if(p)p.textContent='Sign in to Core Ops Workflow to manage service, infrastructure and compliance operations.';
  }

  if(!form.querySelector('.coreopsSecureBar')){
    const firstLabel=form.querySelector('label');
    if(firstLabel){
      const secure=document.createElement('div');
      secure.className='coreopsSecureBar';
      secure.innerHTML='<div class="coreopsSecureIcon">✓</div><div><b>Secure session</b><span>Protected access to your operational workspace</span></div>';
      firstLabel.before(secure);
    }
  }

  const small=form.querySelector('small');
  if(small)small.textContent='Core Ops Workflow · Protected workspace';
}

function patchSidebar(){
  const aside=document.querySelector('.app aside');
  if(!aside)return;
  const oldLogo=aside.querySelector('.logoMark');
  if(!oldLogo)return;

  const brandHost=oldLogo.parentElement;
  if(!brandHost)return;

  if(!brandHost.classList.contains('coreopsSidebarHost')){
    brandHost.classList.add('coreopsSidebarHost');
    brandHost.innerHTML=`<div class="coreopsSidebarBrand"><img src="${logoUrl}" alt="Core Ops Workflow"></div>`;
  }
}

function replaceVisibleBranding(){
  document.title='Core Ops Workflow';
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
    const parent=node.parentElement;
    if(!parent||parent.closest('script,style,textarea,input'))continue;
    let value=node.nodeValue||'';
    if(value.includes('OpsCore Licensing'))value=value.replaceAll('OpsCore Licensing','Core Ops Workflow Licensing');
    if(value.includes('OpsCore Service'))value=value.replaceAll('OpsCore Service','Core Ops Service');
    if(value.includes('OpsCore Infrastructure'))value=value.replaceAll('OpsCore Infrastructure','Core Ops Infrastructure');
    if(value.includes('OpsCore Compliance'))value=value.replaceAll('OpsCore Compliance','Core Ops Compliance');
    if(value.includes('OpsCore v'))value=value.replace(/OpsCore v/g,'Core Ops Workflow v');
    if(value.trim()==='OpsCore')value='Core Ops Workflow';
    node.nodeValue=value;
  }
}

let queued=false;
function patch(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{
    queued=false;
    patchLogin();
    patchSidebar();
    replaceVisibleBranding();
  });
}

new MutationObserver(patch).observe(document.documentElement,{subtree:true,childList:true});
patch();
