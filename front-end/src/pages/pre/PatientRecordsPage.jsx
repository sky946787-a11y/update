'use strict';

import { useState } from 'react';
import { api } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatAge } from './preHelpers.js';
import Patient360Modal from './Patient360Modal.jsx';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

/**
 * Ported from PRE/pages/patient-records.html + patient-records.js.
 *
 * The status ladder is order-sensitive - inpatient first, then pending
 * bed request, discharge/follow-up states, scheduled work, pending intake,
 * completed OPD, and finally "any encounter at all". Reordering it changes
 * which badge a patient shows.
 */
export default function PatientRecordsPage() {
  useDocumentTitle('Patient Directory & Records – Federico PRE');

  const [query, setQuery] = useState('');
  const [bloodFilter, setBloodFilter] = useState('');
  const [detailId, setDetailId] = useState(null);

  const { data, error } = useApi(async () => {
    const [patients, insurances, preRequests, appointments, admissions, beds, doctors, bedRequests] = await Promise.all([
      api.patients.list().catch(() => []),
      api.patients.insuranceAll().catch(() => []),
      api.preRequests.list().catch(() => []),
      api.appointments.list().catch(() => []),
      api.admissions.list().catch(() => []),
      api.wards.beds().catch(() => []),
      api.doctors.list().catch(() => []),
      api.wards.bedRequests.list().catch(() => []),
    ]);

    const doctorsById = {};
    (doctors || []).forEach((d) => (doctorsById[d.doctor_id] = d));
    const bedsById = {};
    (beds || []).forEach((b) => (bedsById[b.bed_id] = b));

    const insurancesByPatient = {};
    (insurances || []).forEach((ins) => (insurancesByPatient[ins.patient_id] = ins));

    const group = (rows, key) => {
      const out = {};
      (rows || []).forEach((r) => {
        if (!out[r[key]]) out[r[key]] = [];
        out[r[key]].push(r);
      });
      return out;
    };
    const preByPatient = group(preRequests, 'patient_id');
    const aptByPatient = group(appointments, 'patient_id');
    const admByPatient = group(admissions, 'patient_id');
    const pendingBedPatientIds = new Set(
      (bedRequests || []).filter((r) => r.status === 'PENDING').map((r) => r.patient_id),
    );

    const rows = (patients || []).map((p) => {
      const pInsur = insurancesByPatient[p.patient_id] || null;
      const pApts = aptByPatient[p.patient_id] || [];
      const pAdms = admByPatient[p.patient_id] || [];
      const pPres = preByPatient[p.patient_id] || [];

      const activeAdm = pAdms.find((a) => a.status === 'ACTIVE' || a.status === 'ADMITTED');
      const activePre = pPres.find((pr) => pr.status === 'ADMITTED');
      const activeBedId = (activeAdm && activeAdm.bed_id) || (activePre && activePre.bed_id);
      const activeBed = activeBedId ? bedsById[activeBedId] : null;

      const totalEncounters = pApts.length + pAdms.length + pPres.length;
      // A department is only derived from the patient's OWN encounters; a
      // freshly registered patient keeps null rather than a fabricated default.
      const latestDept =
        (pPres[0] && pPres[0].department) || (pApts[0] && pApts[0].department) || (pAdms[0] && pAdms[0].department) || null;

      const activeInpatient = Boolean(activeBed);

      return {
        ...p,
        age: formatAge(p.dob),
        insurance: pInsur,
        activeBed,
        isInpatient: activeInpatient,
        /* OLD: pendingBedRequest also checked old visit_type values ('Admit'/'Inpatient').
           The new workflow uses the Bed Request table (pendingBedPatientIds) exclusively.
        pendingBedRequest: pendingBedPatientIds.has(p.patient_id) || pPres.some((pr) => pr.status === 'APPROVED' && (pr.visit_type === 'Admit' || pr.visit_type === 'Inpatient')),
        */
        pendingBedRequest: pendingBedPatientIds.has(p.patient_id),
        hasDischarged: !activeInpatient && (pPres.some((pr) => pr.status === 'DISCHARGED') || pAdms.some((a) => a.status === 'DISCHARGED')),
        hasFollowUp: pPres.some((pr) => pr.status === 'CONSULTATION_DONE' && pr.visit_type === 'Follow-Up'),
        hasScheduled: pPres.some((pr) => pr.status === 'APPROVED' || pr.status === 'CONFIRMED') || pApts.some((apt) => apt.status === 'CONFIRMED' || apt.status === 'SCHEDULED'),
        hasPendingIntake: pPres.some((pr) => pr.status === 'PENDING'),
        hasConsultationDone: pPres.some((pr) => pr.status === 'CONSULTATION_DONE') || pApts.some((apt) => apt.status === 'COMPLETED'),
        totalEncounters,
        latestDept,
        appointments: pApts,
        admissions: pAdms,
        preRequests: pPres,
      };
    });

    return { rows, doctorsById, bedsById };
  }, []);

  const rows = data?.rows || [];

  const total = rows.length;
  const inpatients = rows.filter((p) => p.isInpatient).length;
  const insured = rows.filter((p) => p.insurance).length;

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((p) => {
    if (bloodFilter && p.blood_group !== bloodFilter) return false;
    if (!q) return true;
    return (
      (p.uhid || '').toLowerCase().includes(q) ||
      (p.name || '').toLowerCase().includes(q) ||
      (p.phone || '').toLowerCase().includes(q) ||
      (p.address || '').toLowerCase().includes(q)
    );
  });

  const chip = (bg, color, border, weight, text) => (
    <span className="status pending" style={{ background: bg, color, border: '1px solid ' + border, fontWeight: weight, fontSize: 11, padding: '3px 8px', borderRadius: 12 }}>
      {text}
    </span>
  );

  function statusBadge(p) {
    if (p.isInpatient) return chip('#e0f2fe', '#0369a1', '#bae6fd', 600, 'Inpatient (' + (p.activeBed ? p.activeBed.bed_number : 'Bed Assigned') + ')');
    if (p.pendingBedRequest) return chip('#fef3c7', '#92400e', '#fde68a', 600, 'Pending');
    if (p.hasDischarged) return chip('#f1f5f9', '#475569', '#cbd5e1', 400, 'Discharged');
    if (p.hasFollowUp) return chip('#dcfce7', '#15803d', '#bbf7d0', 400, 'Follow Up');
    if (p.hasScheduled) return chip('#f3e8ff', '#6b21a8', '#d8b4fe', 600, 'Scheduled');
    if (p.hasPendingIntake) return chip('#fef9c3', '#854d0e', '#fef08a', 400, 'Pending Request');
    if (p.hasConsultationDone) return chip('#dcfce7', '#15803d', '#bbf7d0', 400, 'Completed (OPD)');
    if (p.totalEncounters > 0) return chip('#dcfce7', '#15803d', '#bbf7d0', 400, 'Outpatient');
    return chip('#f1f5f9', '#475569', '#e2e8f0', 400, 'Registered');
  }

  return (
    <>
      <div className="cards">
        <div className="card"><h3>Total Registered Patients</h3><p id="kpi-total-patients">{total} Patients</p></div>
        <div className="card"><h3>Active Inpatients</h3><p id="kpi-active-inpatients" style={{ color: 'var(--status-warning-fg, #b45309)' }}>{inpatients} In Beds</p></div>
        <div className="card"><h3>Insured Patients</h3><p id="kpi-insured-patients" style={{ color: 'var(--status-success, #15803d)' }}>{insured} Policies</p></div>
      </div>

      <div className="container">
        <div className="directory-header">
          <div className="directory-title-group">
            <h2>Master Patient Directory</h2>
            <p>Review verified patient demographics, active insurance policies, and complete clinical encounter logs.</p>
          </div>
          <div className="directory-toolbar">
            <input type="text" id="patientSearchInput" placeholder="Search by name, UHID, phone..." className="directory-search-input"
              value={query} onChange={(e) => setQuery(e.target.value)} />
            <select id="filterBloodGroup" className="directory-filter-select" value={bloodFilter} onChange={(e) => setBloodFilter(e.target.value)}>
              <option value="">All Blood Groups</option>
              {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        <div className="table-container" style={{ margin: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Patient UHID</th><th>Patient Name</th><th>Age / Gender</th><th>Contact Details</th>
                <th>Blood Group</th><th>Insurance Coverage</th><th>Activity Summary</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody id="recordTable">
              {error ? (
                <tr><td colSpan="9" style={{ color: 'var(--status-error)' }}>Failed to load patient directory: {error.message}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: 32, color: 'var(--color-muted-fg)' }}>No matching patient records found</td></tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.patient_id}>
                    <td style={{ textAlign: 'left', padding: '12px 16px' }}>
                      <a href="javascript:void(0)" onClick={() => setDetailId(p.patient_id)} style={{ fontWeight: 700, color: 'var(--md-primary, #6750a4)', textDecoration: 'none' }}>
                        {p.uhid}
                      </a>
                    </td>
                    <td style={{ textAlign: 'left', padding: '12px 16px' }}>
                      <strong>{p.name}</strong>
                      {p.address ? <div style={{ fontSize: 11, color: 'var(--color-muted-fg)', marginTop: 2 }}>{p.address}</div> : null}
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px 14px' }}>{p.age || '—'} / {p.gender || '—'}</td>
                    <td style={{ textAlign: 'left', padding: '12px 16px' }}>
                      <div>{p.phone || '—'}</div>
                      {p.emergency_contact_phone ? <div style={{ fontSize: 10, color: 'var(--color-muted-fg)', marginTop: 2 }}>Em: {p.emergency_contact_phone}</div> : null}
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px 12px' }}>
                      {p.blood_group ? (
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, border: '1px solid #fecaca', background: '#fef2f2', fontWeight: 700, fontSize: 11, color: '#991b1b' }}>
                          {p.blood_group}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-muted-fg)', fontSize: 12 }}>{'—'}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                      {p.insurance ? (
                        <span className="status confirmed" title={'Policy #' + (p.insurance.policy_number || '')}
                          style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 12 }}>
                          {p.insurance.provider_name || 'Insured'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-muted-fg)', fontSize: 11, padding: '3px 8px', border: '1px solid var(--md-outline-variant, #e2e8f0)', borderRadius: 12, background: 'var(--md-surface-container-low, #f8fafc)' }}>
                          Self Pay
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'left', padding: '12px 16px' }}>
                      <div>{p.latestDept || <span style={{ color: 'var(--color-muted-fg)' }}>{'—'}</span>}</div>
                      <small style={{ color: 'var(--color-muted-fg)', fontSize: 11 }}>
                        {p.totalEncounters > 0 ? p.totalEncounters + ' Care Encounter(s)' : 'No visits yet'}
                      </small>
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px 14px' }}>{statusBadge(p)}</td>
                    <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <button className="btn blue" type="button" style={{ padding: '6px 16px', fontSize: 12, borderRadius: 'var(--radius-full, 9999px)' }} onClick={() => setDetailId(p.patient_id)}>
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Patient360Modal
        patient={rows.find((p) => p.patient_id === detailId) || null}
        doctorsById={data?.doctorsById || {}}
        bedsById={data?.bedsById || {}}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}

