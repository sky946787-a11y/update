'use strict';

import { useState } from 'react';
import { api } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { Link } from 'react-router-dom';
import { toast } from '../../components/feedback/feedback.js';
import { joinPreRequestsWithPatients, formatDate, to12Hour } from './preHelpers.js';
import BedRequestModal from './BedRequestModal.jsx';

/**
 * Ported from PRE/pages/PRE.html + PRE.js.
 *
 * NEW WORKFLOW: Each approved patient row now shows two action buttons:
 *   - Follow Up: completes the visit as an OPD follow-up (normal discharge flow).
 *   - Admitted: opens the existing Bed Request form → Dispatch → Pending → HOM assigns bed → ADMITTED.
 *
 * OLD WORKFLOW (commented out — no longer active):
 * The visit-type <select> per row called POST /pre-requests/:id/check-in, which
 * created the OPD ledger or dispatched the bed request based on the selected type.
 */
export default function PreDashboardPage() {
  useDocumentTitle('Dashboard');
  const [bedRequestId, setBedRequestId] = useState(null);

  const { data, reload } = useApi(async () => {
    const [preRequests, patients, doctors, admissions, wards, bedRequests] = await Promise.all([
      api.preRequests.list().catch(() => []),
      api.patients.list().catch(() => []),
      api.doctors.list().catch(() => []),
      api.admissions.list().catch(() => []),
      api.wards.list().catch(() => []),
      api.wards.bedRequests.list().catch(() => []),
    ]);

    const doctorsById = {};
    (doctors || []).forEach((d) => (doctorsById[d.doctor_id] = d));
    const joined = joinPreRequestsWithPatients(preRequests, patients, doctorsById);

    const admissionById = {};
    (admissions || []).forEach((a) => (admissionById[a.admission_id] = a));

    const rows = joined.map((r) => {
      const adm = r.admission_id
        ? admissionById[r.admission_id]
        : (admissions || []).find(
            (a) => a.patient_id === r.patient_id && (a.visit_type === 'OPD' || a.appointment_id === r.appointment_id),
          );
      return { ...r, isPaid: Boolean(adm && (adm.status === 'PAYMENT_CONFIRMED' || adm.bills_cleared === true)) };
    });

    return { rows, all: preRequests || [], wards: wards || [], bedRequests: bedRequests || [] };
  }, []);

  const rows = data?.rows || [];
  const all = data?.all || [];
  const wards = data?.wards || [];
  const bedRequests = data?.bedRequests || [];
  const pendingBedRequestIds = new Set(
    bedRequests
      .filter((r) => r.status === 'PENDING')
      .map((r) => r.pre_request_id)
      .filter(Boolean),
  );

  const counters = {
    pending: all.filter((r) => r.status === 'PENDING').length,
    rejected: all.filter((r) => r.status === 'REJECTED').length,
    admitted: all.filter((r) => r.status === 'ADMITTED').length,
    discharge: all.filter((r) => r.status === 'DISCHARGE_APPROVED' || r.status === 'DISCHARGE_REQUESTED').length,
  };

  // Approved queue: everything still awaiting PRE action.
  const approved = rows.filter((r) => {
    if (['REJECTED', 'DISCHARGED'].includes(r.status)) return false;
    if (r.status === 'ADMITTED') return false;
    if (r.status === 'CONSULTATION_DONE') return false;
    return r.status === 'APPROVED';
  });

  async function completeFollowUp(id) {
    try {
      await api.preRequests.checkIn(id, { visit_type: 'OPD' });
      await api.preRequests.update(id, { visit_type: 'Follow-Up' });
      toast('Follow up completed and patient record updated.', 'success');
    } catch (err) {
      toast(err.message || 'Could not complete follow up', 'error');
    }
    await reload();
  }

  const card = (to, title, value) => (
    <Link to={to} className="card">
      <h3>{title}</h3>
      <p>{value}</p>
    </Link>
  );

  return (
    <>
      <div className="cards">
        {card('/PRE/pages/request.html', 'Pending Requests', counters.pending + ' Requests')}
        {card('/PRE/pages/rejected.html', 'Rejected Requests', counters.rejected + ' Requests')}
        {card('/PRE/pages/admitted.html', 'Admitted Patients', counters.admitted + ' Patients')}
        {card('/PRE/pages/discharge.html', 'Discharge Approvals', counters.discharge + ' In Queue')}
      </div>

      <div className="table-container">
        <h2>Approved Patients</h2>
        <table>
          <thead>
            <tr>
              <th>Patient ID</th><th>Name</th><th>Age</th><th>Gender</th><th>Department</th>
              <th>Doctor</th><th>Appointment Date</th><th>Appointment Time</th><th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody id="approvedTable">
            {approved.length === 0 ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
                  No Scheduled Patients Awaiting Check-in
                </td>
              </tr>
            ) : (
              approved.map((r) => {
                const hasPendingBedRequest = pendingBedRequestIds.has(r.pre_request_id);

                let statusBadge = <span className="badge badge-neutral">Scheduled</span>;
                if (hasPendingBedRequest) {
                  statusBadge = <span className="badge badge-info">Pending Bed Request</span>;
                }

                return (
                  <tr key={r.pre_request_id}>
                    <td><strong>{r.patientUhid}</strong></td>
                    <td>{r.patientName}</td>
                    <td>{r.patientAge}</td>
                    <td>{r.patientGender}</td>
                    <td>{r.department}</td>
                    <td>{r.doctorName}</td>
                    <td>{formatDate(r.requested_date)}</td>
                    <td>{to12Hour(r.requested_time) || '-'}</td>
                    <td>{statusBadge}</td>
                    <td>
                      {hasPendingBedRequest ? (
                        <span style={{ color: 'var(--color-muted-fg)', fontSize: 12 }}>Awaiting HOM</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button className="btn suggest" type="button" onClick={() => completeFollowUp(r.pre_request_id)}>
                            Follow Up
                          </button>
                          <button className="btn approve" type="button" onClick={() => setBedRequestId(r.pre_request_id)}>
                            Admitted
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <BedRequestModal
        request={approved.find((r) => r.pre_request_id === bedRequestId) || null}
        wards={wards}
        onClose={() => setBedRequestId(null)}
        onSubmitted={reload}
      />
    </>
  );
}

