const STORAGE_KEY='coreops_language';
const SUPPORTED=['en-GB','ro-RO'];

const ro={
  'Checking secure Core Ops session…':'Se verifică sesiunea securizată Core Ops…',
  'Service, infrastructure and compliance operations.':'Operațiuni de servicii, infrastructură și conformitate.',
  'Email':'E-mail',
  'Password':'Parolă',
  'Sign in':'Autentificare',
  'Sign out':'Deconectare',
  'Protected workspace':'Spațiu de lucru protejat',
  'Secure access to Core Ops':'Acces securizat la Core Ops',
  'Sign in to manage service, infrastructure and compliance operations.':'Autentificați-vă pentru a gestiona operațiunile de servicii, infrastructură și conformitate.',
  'SECURE SESSION':'SESIUNE SECURIZATĂ',
  'Encrypted session  •  Role-based access  •  Protected workspace':'Sesiune criptată  •  Acces bazat pe roluri  •  Spațiu de lucru protejat',
  'Enterprise operations platform':'Platformă pentru operațiuni enterprise',
  'Enterprise operations.':'Operațiuni enterprise.',
  'Built for what’s critical.':'Creat pentru ceea ce este critic.',
  'Core Ops Workflow brings service, infrastructure and compliance into one secure operational workspace with shared assets, locations and controls.':'Core Ops Workflow reunește serviciile, infrastructura și conformitatea într-un singur spațiu operațional securizat, cu active, locații și controale partajate.',
  'Request':'Solicitare',
  'Capture operational work':'Înregistrați activitatea operațională',
  'Approve':'Aprobare',
  'Route ownership and decisions':'Direcționați responsabilitatea și deciziile',
  'Operate':'Operare',
  'Deliver service and infrastructure':'Furnizați servicii și infrastructură',
  'Comply':'Conformitate',
  'Evidence, controls and assurance':'Dovezi, controale și asigurare',
  'Secure by design':'Securizat prin proiectare',
  'Role-aware protected access':'Acces protejat în funcție de rol',
  'Connected operations':'Operațiuni conectate',
  'Service, assets and infrastructure':'Servicii, active și infrastructură',
  'Licence aware':'Gestionare licențe',
  'Trials, products and usage controls':'Perioade de probă, produse și limite de utilizare',

  'Dashboard':'Panou de control',
  'Service':'Servicii',
  'Incidents':'Incidente',
  'Requests':'Solicitări',
  'Problems':'Probleme',
  'Changes':'Modificări',
  'Knowledge':'Bază de cunoștințe',
  'Infrastructure':'Infrastructură',
  'Sites':'Locații',
  'Server Rooms':'Camere de servere',
  'Racks':'Rack-uri',
  'Equipment':'Echipamente',
  'Compliance':'Conformitate',
  'Audits':'Audituri',
  'Inspections':'Inspecții',
  'Evidence':'Dovezi',
  'Platform':'Platformă',
  'Assets / CMDB':'Active / CMDB',
  'Reporting':'Raportare',
  'Administration':'Administrare',
  'Licensing':'Licențiere',
  'Operations platform':'Platformă de operațiuni',

  'Operations Dashboard':'Panou de control operațional',
  'Service, infrastructure and compliance in one secure workspace.':'Servicii, infrastructură și conformitate într-un singur spațiu de lucru securizat.',
  'Open Incidents':'Incidente deschise',
  'Managed Assets':'Active administrate',
  'Open workspace →':'Deschide spațiul de lucru →',
  'Core Ops Service':'Servicii Core Ops',
  'Secure incidents, requests and operational workflows.':'Incidente, solicitări și fluxuri operaționale securizate.',
  'Live':'Activ',
  'Core Ops Infrastructure':'Infrastructură Core Ops',
  'Sites, rooms, racks and U-level equipment placement in one model.':'Locații, camere, rack-uri și amplasarea echipamentelor la nivel U într-un singur model.',
  'Equipment live':'Echipamente active',
  'Core Ops Compliance':'Conformitate Core Ops',
  'DCAM can reference the same physical hierarchy and CMDB identities.':'DCAM poate utiliza aceeași ierarhie fizică și aceleași identități CMDB.',
  'Foundation live':'Fundație activă',
  'Priority incidents':'Incidente prioritare',
  'Live from PostgreSQL':'Date live din PostgreSQL',
  'View all':'Vezi toate',
  'Physical operations status':'Starea operațiunilor fizice',
  'API':'API',
  'Healthy':'Funcțional',
  'Connecting':'Se conectează',
  'Unavailable':'Indisponibil',

  'Refresh':'Reîmprospătează',
  'Save':'Salvează',
  'Cancel':'Anulează',
  'Close':'Închide',
  'Edit':'Editează',
  'Delete':'Șterge',
  'Create':'Creează',
  'Add':'Adaugă',
  'New incident':'Incident nou',
  '+ New incident':'+ Incident nou',
  '+ Add asset':'+ Adaugă activ',
  '+ Add user':'+ Adaugă utilizator',
  '+ Add site':'+ Adaugă locație',
  '+ Add location':'+ Adaugă sublocație',
  '+ Add server room':'+ Adaugă cameră de servere',
  '+ Add rack':'+ Adaugă rack',
  'Search incidents':'Caută incidente',
  'Summary':'Rezumat',
  'Description':'Descriere',
  'Priority':'Prioritate',
  'Assignment group':'Grup de atribuire',
  'Caller':'Solicitant',
  'Asset / CI':'Activ / CI',
  'Create incident':'Creează incident',
  'Incident created':'Incident creat',
  'Signed out':'Deconectat',
  'Session expired':'Sesiunea a expirat',
  'Service requests':'Solicitări de servicii',
  'Shared request queue with assignment, collaboration and retained history.':'Coadă comună de solicitări cu alocare, colaborare și istoric păstrat.',
  'Search requests':'Caută solicitări',
  '+ New request':'+ Solicitare nouă',
  'New service request':'Solicitare de serviciu nouă',
  'Create and assign a tracked request with automatic SLA matching.':'Creați și alocați o solicitare urmărită, cu asociere SLA automată.',
  'Request title':'Titlul solicitării','Requested for':'Solicitat pentru','Assigned to':'Alocat către','Due date':'Data scadentă','Create request':'Creează solicitarea',
  'Saved views':'Vizualizări salvate','Saved views…':'Vizualizări salvate…','Save view':'Salvează vizualizarea',
  'Workflow':'Flux de lucru','Update status and retain a complete activity trail.':'Actualizați starea și păstrați un istoric complet al activității.','Status':'Stare','Work note':'Notă de lucru','Update workflow':'Actualizează fluxul',
  'Activity':'Activitate','Work notes, comments and workflow events.':'Note de lucru, comentarii și evenimente ale fluxului.','Visible to requester':'Vizibil solicitantului','Response template':'Șablon de răspuns','Choose a template…':'Alegeți un șablon…','Add activity':'Adaugă activitate',
  'Assignment':'Alocare','Save assignment':'Salvează alocarea','Policy':'Politică','Response':'Răspuns','Resolution':'Rezolvare','Due':'Scadență','Watchers':'Urmăritori','Add watcher':'Adaugă urmăritor','Attachments':'Atașamente','File name':'Numele fișierului','Secure file URL':'URL securizat al fișierului','Add reference':'Adaugă referință',

  'Sites / locations':'Locații / sublocații',
  'Locations':'Sublocații',
  'Location':'Sublocație',
  'Type':'Tip',
  'Parent':'Părinte',
  'Floor':'Etaj',
  'Assets':'Active',
  'All sites':'Toate locațiile',
  'Address not yet set':'Adresa nu este încă setată',
  'Shared physical locations used across Core Ops.':'Locații fizice partajate utilizate în Core Ops.',
  'Buildings, floors, rooms and operational spaces.':'Clădiri, etaje, camere și spații operaționale.',
  'Server rooms':'Camere de servere',
  'Racks in':'Rack-uri în',
  'Operational rooms tied to shared sites and locations.':'Camere operaționale asociate locațiilor și sublocațiilor partajate.',
  'All cabinets across Core Ops server rooms.':'Toate rack-urile din camerele de servere Core Ops.',
  'Rack Equipment':'Echipamente rack',
  'Select a rack to place servers, switches, storage and other rack-mounted devices.':'Selectați un rack pentru a amplasa servere, switch-uri, stocare și alte echipamente montate în rack.',
  'Rack specification':'Specificații rack',
  'Rack units':'Unități rack',
  'Dimensions':'Dimensiuni',
  'Max weight':'Greutate maximă',
  'Power capacity':'Capacitate electrică',
  'Cooling capacity':'Capacitate de răcire',
  'Asset tag':'Etichetă activ',
  'Serial number':'Număr de serie',
  'Owner':'Responsabil',
  'Department':'Departament',
  'Model':'Model',

  'Operational':'Operațional',
  'Planned':'Planificat',
  'Maintenance':'Mentenanță',
  'Retired':'Retras',
  'Installed':'Instalat',
  'Ordered':'Comandat',
  'Active':'Activ',
  'Disabled':'Dezactivat',
  'Closed':'Închis',
  'Unassigned':'Neatribuit',
  'Never':'Niciodată',
  'Allowed':'Permis',
  'Blocked':'Blocat',

  'Users & access':'Utilizatori și acces',
  'Manage local Core Ops accounts and roles.':'Gestionați conturile și rolurile locale Core Ops.',
  'Name':'Nume',
  'Role':'Rol',
  'Status':'Stare',
  'Last login':'Ultima autentificare',
  'Access':'Acces',
  'Your role does not have platform administration permission.':'Rolul dvs. nu are permisiuni pentru administrarea platformei.',

  'Language':'Limbă',
  'English (UK)':'Engleză (Regatul Unit)',
  'Romanian':'Română',
  'Română':'Română'
};

const originalText=new WeakMap();
const originalAttrs=new WeakMap();
let applying=false;

function preferredLanguage(){
  const stored=localStorage.getItem(STORAGE_KEY);
  if(SUPPORTED.includes(stored))return stored;
  return String(navigator.language||'').toLowerCase().startsWith('ro')?'ro-RO':'en-GB';
}

let language=preferredLanguage();

function translateString(value){
  if(language==='en-GB')return value;
  const trimmed=String(value).trim();
  if(!trimmed)return value;
  let translated=ro[trimmed];
  if(!translated&&trimmed.startsWith('Core Ops / '))translated=`Core Ops / ${translateString(trimmed.slice(11))}`;
  if(!translated&&trimmed.startsWith('Core Ops ')&&trimmed.endsWith(' workspace'))translated=`Spațiu de lucru Core Ops ${translateString(trimmed.slice(9,-10))}`;
  if(!translated)return value;
  const start=String(value).match(/^\s*/)?.[0]||'';
  const end=String(value).match(/\s*$/)?.[0]||'';
  return `${start}${translated}${end}`;
}

function translateTextNode(node){
  if(!originalText.has(node))originalText.set(node,node.nodeValue||'');
  const source=originalText.get(node)||'';
  const next=language==='en-GB'?source:translateString(source);
  if(node.nodeValue!==next)node.nodeValue=next;
}

function translateElement(el){
  if(!(el instanceof Element))return;
  if(el.closest('.coreopsLanguageControl'))return;
  for(const attr of ['placeholder','title','aria-label']){
    if(!el.hasAttribute(attr))continue;
    let store=originalAttrs.get(el);if(!store){store={};originalAttrs.set(el,store)}
    if(store[attr]===undefined)store[attr]=el.getAttribute(attr)||'';
    const source=store[attr];el.setAttribute(attr,language==='en-GB'?source:translateString(source));
  }
}

function walk(root=document.body){
  if(!root)return;
  if(root.nodeType===Node.TEXT_NODE){translateTextNode(root);return}
  if(root.nodeType===Node.ELEMENT_NODE)translateElement(root);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  let n;while((n=walker.nextNode())){if(n.nodeType===Node.TEXT_NODE)translateTextNode(n);else translateElement(n)}
}

function languageControl(location){
  const wrap=document.createElement('label');
  wrap.className=`coreopsLanguageControl ${location}`;
  wrap.innerHTML=`<span>${language==='ro-RO'?'Limbă':'Language'}</span><select aria-label="Language"><option value="en-GB">English (UK)</option><option value="ro-RO">Română</option></select>`;
  const select=wrap.querySelector('select');select.value=language;
  select.addEventListener('change',()=>setLanguage(select.value));
  return wrap;
}

function ensureControls(){
  const login=document.querySelector('.authCard');
  if(login&&!login.querySelector('.coreopsLanguageControl.login')){
    const control=languageControl('login');
    const small=login.querySelector('small');
    if(small)login.insertBefore(control,small);else login.appendChild(control);
  }
  const actions=document.querySelector('.headActions');
  if(actions&&!actions.querySelector('.coreopsLanguageControl.header'))actions.insertBefore(languageControl('header'),actions.firstChild);
}

function syncHtmlLanguage(){document.documentElement.lang=language==='ro-RO'?'ro':'en-GB'}

function apply(){
  if(applying)return;applying=true;
  try{syncHtmlLanguage();ensureControls();walk(document.body)}finally{applying=false}
}

function setLanguage(next){
  if(!SUPPORTED.includes(next))return;
  language=next;localStorage.setItem(STORAGE_KEY,next);
  document.querySelectorAll('.coreopsLanguageControl').forEach(x=>x.remove());
  apply();
  window.dispatchEvent(new CustomEvent('coreops:language-changed',{detail:{language}}));
}

const observer=new MutationObserver(()=>apply());
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('load',apply);
window.addEventListener('coreops:language-refresh',apply);
apply();

window.CoreOpsI18n={getLanguage:()=>language,setLanguage,translate:translateString,supported:[...SUPPORTED]};
