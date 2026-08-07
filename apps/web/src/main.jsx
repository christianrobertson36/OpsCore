import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const cards=[
  ['Open Incidents','1'],
  ['Service Requests','1'],
  ['Assets','0'],
  ['SLA Breaches','0']
];

function App(){
  return <div className="app">
    <aside>
      <div className="brand">OpsCore</div>
      <div className="sub">Operations Platform</div>
      <nav>
        <a className="active">Dashboard</a>
        <h4>Service</h4>
        <a>Incidents</a><a>Requests</a><a>Problems</a><a>Changes</a><a>Knowledge</a>
        <h4>Infrastructure</h4>
        <a>Sites</a><a>Server Rooms</a><a>Racks</a><a>Equipment</a>
        <h4>Compliance</h4>
        <a>Audits</a><a>Inspections</a><a>Evidence</a>
        <h4>Platform</h4>
        <a>Assets / CMDB</a><a>Reporting</a><a>Administration</a>
      </nav>
    </aside>
    <main>
      <header><div><h1>Operations Dashboard</h1><p>Service, infrastructure and compliance in one platform.</p></div><span className="pill">OpsCore v1</span></header>
      <section className="cards">{cards.map(([t,v])=><div className="card" key={t}><span>{t}</span><strong>{v}</strong></div>)}</section>
      <section className="modules">
        <div className="module"><h3>OpsCore Service</h3><p>IT service management, incidents, requests, changes and SLAs.</p><b>Active</b></div>
        <div className="module"><h3>OpsCore Infrastructure</h3><p>Server rooms, racks, equipment, power and cooling.</p><b>Integration ready</b></div>
        <div className="module"><h3>OpsCore Compliance</h3><p>DCAM compliance, inspections, evidence and corrective actions.</p><b>Integration ready</b></div>
      </section>
      <section className="panel"><h2>Service Management</h2><div className="ticket"><span>INC000001</span><strong>Example incident</strong><span>P3</span><span>Open</span><span>Service Desk</span></div></section>
    </main>
  </div>
}

createRoot(document.getElementById('root')).render(<App/>);
