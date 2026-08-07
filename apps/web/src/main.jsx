import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const initialIncidents = [
  { id: 'INC000001', title: 'VPN access unavailable', priority: 'P2', status: 'In Progress', group: 'Service Desk', caller: 'A. User', asset: 'LT-0142' },
  { id: 'INC000002', title: 'Printer offline in Finance', priority: 'P3', status: 'Open', group: 'Deskside', caller: 'J. Smith', asset: 'PRN-FIN-01' },
  { id: 'INC000003', title: 'Hypervisor storage alert', priority: 'P1', status: 'Open', group: 'Infrastructure', caller: 'Monitoring', asset: 'SRV-HV-004' }
];

const requests = [
  { id: 'REQ000001', title: 'New starter equipment', status: 'Awaiting Approval', requestedFor: 'M. Brown' },
  { id: 'REQ000002', title: 'Microsoft 365 licence', status: 'Fulfilment', requestedFor: 'S. Wilson' }
];

const assets = [
  { id: 'AST-000142', name: 'SRV-HV-004', type: 'Server', site: 'Workington', owner: 'Infrastructure', state: 'Operational' },
  { id: 'AST-000143', name: 'LT-0142', type: 'Laptop', site: 'Workington', owner: 'A. User', state: 'Operational' },
  { id: 'AST-000144', name: 'SW-R04-01', type: 'Network Switch', site: 'Workington', owner: 'Networks', state: 'Operational' }
];

const navGroups = [
  ['Service', ['Incidents','Requests','Problems','Changes','Knowledge']],
  ['Infrastructure', ['Sites','Server Rooms','Racks','Equipment']],
  ['Compliance', ['Audits','Inspections','Evidence']],
  ['Platform', ['Assets / CMDB','Reporting','Administration']]
];

function Badge({children, tone='blue'}) { return <span className={`badge ${tone}`}>{children}</span>; }

function App(){
  const [page,setPage] = useState('Dashboard');
  const [incidents,setIncidents] = useState(initialIncidents);
  const [search,setSearch] = useState('');
  const [modal,setModal] = useState(false);
  const [toast,setToast] = useState('');

  const filteredIncidents = useMemo(() => incidents.filter(i => `${i.id} ${i.title} ${i.group} ${i.asset}`.toLowerCase().includes(search.toLowerCase())), [incidents,search]);
  const notify = (text) => { setToast(text); window.setTimeout(()=>setToast(''),2200); };

  function createIncident(e){
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const next = String(incidents.length + 1).padStart(6,'0');
    setIncidents([{ id:`INC${next}`, title:f.get('title'), priority:f.get('priority'), status:'Open', group:f.get('group'), caller:f.get('caller') || 'Portal User', asset:f.get('asset') || 'Unassigned' }, ...incidents]);
    setModal(false); setPage('Incidents'); notify('Incident created');
  }

  const title = page === 'Dashboard' ? 'Operations Dashboard' : page;
  const subtitle = page === 'Dashboard' ? 'Service, infrastructure and compliance in one workspace.' : `OpsCore ${page} workspace`;

  function Dashboard(){
    const cards=[['Open Incidents',incidents.filter(i=>i.status!=='Closed').length,'Incidents'],['Service Requests',requests.length,'Requests'],['Managed Assets',assets.length,'Assets / CMDB'],['SLA Breaches','0','Reporting']];
    return <>
      <section className="cards">{cards.map(([t,v,target])=><button className="card" key={t} onClick={()=>setPage(target)}><span>{t}</span><strong>{v}</strong><small>Open workspace →</small></button>)}</section>
      <section className="modules">
        <button className="module service" onClick={()=>setPage('Incidents')}><div className="moduleIcon">S</div><div><h3>OpsCore Service</h3><p>Incidents, requests, changes, problems, knowledge and SLAs.</p><Badge tone="green">Active</Badge></div></button>
        <button className="module infra" onClick={()=>setPage('Server Rooms')}><div className="moduleIcon">I</div><div><h3>OpsCore Infrastructure</h3><p>Server rooms, racks, equipment, physical assets, power and cooling.</p><Badge>Integration workspace</Badge></div></button>
        <button className="module compliance" onClick={()=>setPage('Inspections')}><div className="moduleIcon">C</div><div><h3>OpsCore Compliance</h3><p>DCAM inspections, evidence, controls, audits and corrective actions.</p><Badge tone="purple">Integration workspace</Badge></div></button>
      </section>
      <section className="grid2">
        <div className="panel"><div className="panelHead"><div><h2>Priority incidents</h2><p>Live service desk workload</p></div><button className="linkBtn" onClick={()=>setPage('Incidents')}>View all</button></div>{incidents.slice(0,3).map(i=><div className="row" key={i.id} onClick={()=>notify(`${i.id}: ${i.title}`)}><span className="mono">{i.id}</span><strong>{i.title}</strong><Badge tone={i.priority==='P1'?'red':i.priority==='P2'?'amber':'blue'}>{i.priority}</Badge><span>{i.group}</span></div>)}</div>
        <div className="panel"><div className="panelHead"><div><h2>Platform health</h2><p>Shared OpsCore services</p></div></div><div className="health"><span><i className="ok"/>API</span><b>Healthy</b></div><div className="health"><span><i className="ok"/>Database</span><b>Healthy</b></div><div className="health"><span><i className="ok"/>Web workspace</span><b>v2</b></div><div className="health"><span><i className="warn"/>Infrastructure integration</span><b>Ready to connect</b></div></div>
      </section>
    </>;
  }

  function Incidents(){ return <section className="panel"><div className="toolbar"><div><h2>Incidents</h2><p>Record, prioritise and resolve service interruptions.</p></div><div className="toolbarActions"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search incidents"/><button className="primary" onClick={()=>setModal(true)}>+ New incident</button></div></div><div className="table"><div className="thead"><span>Number</span><span>Summary</span><span>Priority</span><span>Status</span><span>Assignment group</span><span>Asset</span></div>{filteredIncidents.map(i=><button className="trow" key={i.id} onClick={()=>notify(`Opened ${i.id}`)}><span className="mono">{i.id}</span><strong>{i.title}</strong><span><Badge tone={i.priority==='P1'?'red':i.priority==='P2'?'amber':'blue'}>{i.priority}</Badge></span><span>{i.status}</span><span>{i.group}</span><span>{i.asset}</span></button>)}</div></section>; }
  function Requests(){ return <section className="panel"><div className="panelHead"><div><h2>Service requests</h2><p>Catalogue and fulfilment queue.</p></div><button className="primary" onClick={()=>notify('Service catalogue builder will be next')}>+ New request</button></div>{requests.map(r=><div className="row request" key={r.id}><span className="mono">{r.id}</span><strong>{r.title}</strong><span>{r.requestedFor}</span><Badge>{r.status}</Badge></div>)}</section>; }
  function Assets(){ return <section className="panel"><div className="panelHead"><div><h2>Assets / CMDB</h2><p>One shared asset record across Service, Infrastructure and Compliance.</p></div><button className="primary" onClick={()=>notify('Asset creation is queued for v3')}>+ Add asset</button></div><div className="table assets"><div className="thead"><span>ID</span><span>Configuration item</span><span>Type</span><span>Site</span><span>Owner</span><span>State</span></div>{assets.map(a=><button className="trow" key={a.id} onClick={()=>notify(`${a.name} selected`)}><span className="mono">{a.id}</span><strong>{a.name}</strong><span>{a.type}</span><span>{a.site}</span><span>{a.owner}</span><span><Badge tone="green">{a.state}</Badge></span></button>)}</div></section>; }
  function Integration({type}){ const infra=type==='Infrastructure'; return <section className="panel heroPanel"><Badge tone={infra?'blue':'purple'}>{infra?'OpsCore Infrastructure':'OpsCore Compliance'}</Badge><h2>{page}</h2><p>{infra?'This workspace is reserved for the Server Room Manager integration. The shared asset model will connect sites, rooms, racks and equipment directly to Service records.':'This workspace is reserved for the DCAM integration. Audits, inspections, evidence and corrective actions will share the same organisations, sites and assets as Service.'}</p><div className="integrationMap"><div>OpsCore Core</div><span>→</span><div>{infra?'Server Room Manager':'DCAM'}</div><span>→</span><div>Shared CMDB</div></div><button className="primary" onClick={()=>notify(`${infra?'Infrastructure':'Compliance'} integration boundary ready`)}>Check integration boundary</button></section>; }
  function Generic(){ return <section className="panel empty"><div className="emptyIcon">◇</div><h2>{page}</h2><p>This OpsCore v2 workspace is wired into navigation and ready for its functional module.</p><button className="secondary" onClick={()=>setPage('Dashboard')}>Back to dashboard</button></section>; }
  function Current(){ if(page==='Dashboard') return <Dashboard/>; if(page==='Incidents') return <Incidents/>; if(page==='Requests') return <Requests/>; if(page==='Assets / CMDB') return <Assets/>; if(['Sites','Server Rooms','Racks','Equipment'].includes(page)) return <Integration type="Infrastructure"/>; if(['Audits','Inspections','Evidence'].includes(page)) return <Integration type="Compliance"/>; return <Generic/>; }

  return <div className="app">
    <aside><div className="logoRow"><div className="logoMark">O</div><div><div className="brand">OpsCore</div><div className="sub">Operations Platform</div></div></div><nav><button className={page==='Dashboard'?'active':''} onClick={()=>setPage('Dashboard')}>⌂ <span>Dashboard</span></button>{navGroups.map(([group,items])=><React.Fragment key={group}><h4>{group}</h4>{items.map(item=><button key={item} className={page===item?'active':''} onClick={()=>setPage(item)}><span>{item}</span></button>)}</React.Fragment>)}</nav><div className="asideFooter"><div className="avatar">CR</div><div><strong>Platform Admin</strong><span>OpsCore v2</span></div></div></aside>
    <main><header><div><div className="eyebrow">OpsCore / {page}</div><h1>{title}</h1><p>{subtitle}</p></div><div className="headActions"><button className="iconBtn" onClick={()=>notify('No new notifications')}>◔</button><span className="pill">v2</span></div></header><Current/></main>
    {modal&&<div className="modalBack" onMouseDown={()=>setModal(false)}><form className="modal" onSubmit={createIncident} onMouseDown={e=>e.stopPropagation()}><div className="panelHead"><div><h2>New incident</h2><p>Create a Service incident.</p></div><button type="button" className="close" onClick={()=>setModal(false)}>×</button></div><label>Summary<input name="title" required autoFocus placeholder="Describe the issue"/></label><div className="formGrid"><label>Priority<select name="priority"><option>P3</option><option>P4</option><option>P2</option><option>P1</option></select></label><label>Assignment group<select name="group"><option>Service Desk</option><option>Deskside</option><option>Infrastructure</option><option>Networks</option></select></label></div><div className="formGrid"><label>Caller<input name="caller" placeholder="User or monitoring"/></label><label>Asset / CI<input name="asset" placeholder="e.g. SRV-HV-004"/></label></div><div className="modalActions"><button type="button" className="secondary" onClick={()=>setModal(false)}>Cancel</button><button className="primary">Create incident</button></div></form></div>}
    {toast&&<div className="toast">{toast}</div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
