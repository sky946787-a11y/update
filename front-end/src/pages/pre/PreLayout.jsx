'use strict';

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSession } from '../../auth/useSession.js';
import ModuleLock from '../../components/layout/ModuleLock.jsx';
import { LOGIN_PATH } from '../../auth/actorHome.js';
import { usePageStyles } from '../../hooks/usePageStyles.js';
import baseCss from '../../styles/pre/base.css?inline';
import layoutCss from '../../styles/pre/layout.css?inline';
import componentsCss from '../../styles/pre/components.css?inline';

/**
 * The PRE navbar, which every one of the ten PRE pages repeated verbatim in its
 * own HTML. It lives here once.
 *
 * The "Create Appointment" link keeps its legacy lowercase href
 * (appointment.html) - every link in the original used that spelling even
 * though the file on disk was APPointment.html. Both paths are routed (DEC-7).
 */
const LINKS = [
  { href: '/PRE/pages/PRE.html', label: 'Dashboard' },
  { href: '/PRE/pages/patient-records.html', label: 'Patient record', module: 'PATIENT' },
  { href: '/PRE/pages/doctor.html', label: 'Doctor availability', module: 'DOCTOR' },
  { href: '/PRE/pages/appointment.html', label: 'Create Appointment', module: 'APPOINTMENTS' },
  { href: '/PRE/pages/hom.html', label: 'HOM', module: 'ADMISSIONS' },
];

export default function PreLayout() {
  usePageStyles(baseCss, layoutCss, componentsCss);
  const navigate = useNavigate();
  const { tenant, logout } = useSession();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* best effort */
    }
    navigate(LOGIN_PATH);
  }

  return (
    <>
      <div className="navbar">
        <div className="logo">
          <div className="icon">F</div>
          <div className="text">
            <h2>Federico</h2>
            <p>patient relational executive</p>
            {tenant?.organization_name ? (
              <p className="tenant-org-label">{tenant.organization_name}</p>
            ) : null}
          </div>
        </div>

        <ul className="nav-links">
          {LINKS.map((item) => {
            const li = (
              <NavLink to={item.href} className={({ isActive }) => (isActive ? 'active-link' : '')}>
                {item.label}
              </NavLink>
            );
            return (
              <li key={item.href}>
                {item.module ? <ModuleLock module={item.module}>{li}</ModuleLock> : li}
              </li>
            );
          })}
        </ul>

        <button className="logout" onClick={handleLogout}>LOG OUT</button>
      </div>

      <Outlet />
    </>
  );
}

