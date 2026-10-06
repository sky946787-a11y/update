'use strict';

/*
 * ============================================================
 * OLD CODE — Emergency has been REMOVED from the PRE workflow.
 * The PRE Dashboard now only has: Follow Up and Admitted.
 * This entire file is commented out and kept for reference only.
 * The /PRE/pages/emergency.html route now redirects to the dashboard.
 * ============================================================

import { useState } from 'react';
import { api } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { toast } from '../../components/feedback/feedback.js';
import { joinPreRequestsWithPatients, formatDate, to12Hour } from './preHelpers.js';
import EmergencyModal from './EmergencyModal.jsx';

export default function EmergencyPage() {
  useDocumentTitle('Emergency Cases – Federico PRE');

  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const { data, error, reload } = useApi(async () => {
    const [preRequests, patients, doctors, beds, bedRequests] = await Promise.all([
      api.preRequests.list(),
      api.patients.list(),
      api.doctors.list(),
      api.wards.beds(),
      api.wards.bedRequests.list().catch(() => []),
    ]);

    const doctorsById = {};
    (doctors || []).forEach((d) => (doctorsById[d.doctor_id] = d));
    const bedsById = {};
    (beds || []).forEach((b) => (bedsById[b.bed_id] = b));

    const pendingBedRequests = new Set(
      (bedRequests || []).filter((br) => br.status === 'PENDING').map((br) => br.pre_request_id),
    );

    const records = joinPreRequestsWithPatients(preRequests, patients, doctorsById)
      .filter((r) => {
        const isEmergencyType = r.visit_type === 'Emergency';
        const isEmergencyStatus = r.status === 'EMERGENCY';
        const isAdmittedEmergency = isEmergencyType && ['ADMITTED', 'DISCHARGE_REQUESTED', 'DISCHARGE_APPROVED'].includes(r.status);
        const isPendingEmergency = isEmergencyType && ['PENDING', 'APPROVED', 'EMERGENCY'].includes(r.status);
        return isEmergencyStatus || isAdmittedEmergency || isPendingEmergency;
      })
      .map((r) => ({
        ...r,
        bed: bedsById[r.bed_id] || null,
        hasPendingBedRequest: pendingBedRequests.has(r.pre_request_id),
      }));

    return { records, patients: patients || [], doctors: doctors || [] };
  }, []);

  const records = data?.records || [];

  const total = records.length;
  const awaitingBed = records.filter((r) => !r.bed_id && ['EMERGENCY', 'PENDING', 'APPROVED'].includes(r.status)).length;
  const admitted = records.filter((r) => r.status === 'ADMITTED').length;
  const dischargePending = records.filter((r) => r.status === 'DISCHARGE_REQUESTED' || r.status === 'DISCHARGE_APPROVED').length;

  const q = query.trim().toLowerCase();
  const filtered = records.filter((r) => {
    if (!q) return true;
    return (
      (r.patientUhid || '').toLowerCase().includes(q) ||
      (r.patientName || '').toLowerCase().includes(q) ||
      (r.department || '').toLowerCase().includes(q) ||
      (r.doctorName || '').toLowerCase().includes(q)
    );
  });

  async function requestHomBed(r) {
    try {
      await api.wards.bedRequests.create({
        pre_request_id: r.pre_request_id,
        patient_id: r.patient_id,
        priority: 'CRITICAL',
        notes: 'Urgent Emergency Bed Request for ' + (r.patientName || 'Patient') + ' (' + (r.department || 'Emergency') + ')',
      });
      toast('Emergency bed request queued for HOM triage.', 'success');
      await reload();
    } catch (err) {
      toast(err.message || 'Could not queue bed request', 'error');
    }
  }

  async function dischargePatient(id) {
    try {
      await api.preRequests.update(id, { status: 'DISCHARGE_REQUESTED' });
      toast('Discharge request sent to HOM', 'success');
      await reload();
    } catch (err) {
      toast(err.message || 'Could not request discharge', 'error');
    }
  }

  async function finalizeDischarge(id) {
    try {
      await api.preRequests.update(id, { status: 'DISCHARGED' });
      toast('Emergency patient discharged and bed released.', 'success');
      await reload();
    } catch (err) {
      toast(err.message || 'Could not finalize discharge', 'error');
    }
  }

  return (
    <>
      <div className="cards">
        <div className="card"><h3>Active Emergencies</h3><p id="total-emergency">{total} Cases</p></div>
        <div className="card"><h3>Awaiting Bed Allocation</h3><p id="awaiting-bed" style={{ color: 'var(--status-warning-fg, #b45309)' }}>{awaitingBed} Cases</p></div>
        <div className="card"><h3>Admitted Under Care</h3><p id="admitted-emergency" style={{ color: 'var(--status-success, #15803d)' }}>{admitted} Patients</p></div>
        <div className="card"><h3>Discharge in Progress</h3><p id="discharge-emergency" style={{ color: 'var(--status-error, #b91c1c)' }}>{dischargePending} In Queue</p></div>
      </div>

      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0 }}>Emergency Patient Triage &amp; Bed Tracking</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--color-muted-fg)', fontSize: 13 }}>
              Manage critical emergency intakes, request priority bed allocations from HOM, and process inpatient discharges.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <input type="text" id="emergencySearch" placeholder="Search patient, UHID, dept..." value={query} onChange={(e) => setQuery(e.target.value)}
              style={{ padding: '10px 16px', border: '1px solid var(--md-outline, #cbd5e1)', borderRadius: 'var(--radius-full, 99px)', fontSize: 13, outline: 'none', minWidth: 240 }} />
            <button className="btn green" id="btnRegisterEmergency" type="button" onClick={() => setModalOpen(true)}>
              + Register Walk-In Emergency
            </button>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Patient ID</th><th>Patient Name</th><th>Age / Gender</th><th>Department / Complaint</th>
                <th>Attending Doctor</th><th>Triage Date &amp; Time</th><th>Triage Status</th><th>Bed Allocation</th><th>Action</th>
              </tr>
            </thead>
            <tbody id="admittedTable">
              {error ? (
                <tr><td colSpan="9" style={{ color: 'var(--status-error)' }}>Failed to load emergency records: {error.message}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="9">No emergency cases found</td></tr>
              ) : (
                filtered.map((r) => {
                  const isAdmitted = r.status === 'ADMITTED';
                  const isDischargeRequested = r.status === 'DISCHARGE_REQUESTED';
                  const isDischargeApproved = r.status === 'DISCHARGE_APPROVED';
                  const isAwaitingBed = !r.bed_id && ['EMERGENCY', 'PENDING', 'APPROVED'].includes(r.status);

                  let statusBadge = <span className="status pending">Emergency</span>;
                  if (isAwaitingBed) statusBadge = <span className="status overdue" style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: 700 }}>Critical Triage</span>;
                  else if (isAdmitted) statusBadge = <span className="status confirmed">Admitted</span>;
                  else if (isDischargeRequested) statusBadge = <span className="status pending" style={{ background: '#fef3c7', color: '#b45309' }}>Discharge Pending</span>;
                  else if (isDischargeApproved) statusBadge = <span className="status confirmed" style={{ background: '#dcfce7', color: '#15803d' }}>Discharge Ready</span>;

                  let action = null;
                  if (isAwaitingBed) {
                    action = r.hasPendingBedRequest ? (
                      <span style={{ color: 'var(--status-warning-fg, #b45309)', fontSize: 12, fontWeight: 600 }}>Bed Request Queued in HOM</span>
                    ) : (
                      <button className="btn green" type="button" onClick={() => requestHomBed(r)}>Request Bed from HOM</button>
                    );
                  } else if (isAdmitted) {
                    action = <button className="discharge-btn" type="button" onClick={() => dischargePatient(r.pre_request_id)}>Discharge Request</button>;
                  } else if (isDischargeRequested) {
                    action = <span style={{ color: 'var(--color-muted-fg)', fontSize: 12 }}>Awaiting HOM Clearance</span>;
                  } else if (isDischargeApproved) {
                    action = <button className="btn approve" type="button" onClick={() => finalizeDischarge(r.pre_request_id)}>Finalize Release</button>;
                  }

                  return (
                    <tr key={r.pre_request_id}>
                      <td><strong>{r.patientUhid}</strong></td>
                      <td>
                        <strong>{r.patientName}</strong>
                        {r.note ? <div style={{ fontSize: 11, color: 'var(--color-muted-fg)', maxWidth: 200, marginTop: 2 }}>&quot;{r.note}&quot;</div> : null}
                      </td>
                      <td>{r.patientAge || '—'} / {r.patientGender || '—'}</td>
                      <td>{r.department || 'Emergency Medicine'}</td>
                      <td>{r.doctorName || 'On-Duty ER Doctor'}</td>
                      <td>
                        {formatDate(r.requested_date || r.created_at)}
                        <div style={{ fontSize: 11, color: 'var(--color-muted-fg)' }}>{to12Hour(r.requested_time) || 'Immediate'}</div>
                      </td>
                      <td>{statusBadge}</td>
                      <td>
                        {r.bed ? (
                          <>
                            <strong>{r.bed.bed_number}</strong>{' '}
                            <small style={{ color: 'var(--color-muted-fg)' }}>({r.bed.ward_type || 'ICU/Emergency'})</small>
                          </>
                        ) : (
                          <span style={{ color: 'var(--color-muted-fg)', fontStyle: 'italic' }}>Awaiting Bed</span>
                        )}
                      </td>
                      <td>{action}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EmergencyModal
        open={modalOpen}
        patients={data?.patients || []}
        doctors={data?.doctors || []}
        onClose={() => setModalOpen(false)}
        onChanged={reload}
      />
    </>
  );
}

*/
