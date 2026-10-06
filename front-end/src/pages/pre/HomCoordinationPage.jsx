'use strict';

import { api } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

/*
 * REMOVED: toast, joinPreRequestsWithPatients, doctors API call, doctorsById,
 * bedRequestByPreRequestId, dischargeList, finalizeDischarge, and the entire
 * "2. Inpatient Discharge Clearance & Final Release" card.
 *
 * That card was a duplicate of the Discharge Approval section already built
 * in the PRE Dashboard (PreDashboardPage.jsx / DischargePage.jsx). The
 * canonical Discharge Approval workflow remains fully functional there.
 * Only the Bed Allocation Queue (section 1) is kept here.
 */

/** PRE read-only coordination view for HOM bed assignment status. */
export default function HomCoordinationPage() {
  useDocumentTitle('HOM Coordination - Federico PRE');

  const { data } = useApi(async () => {
    const [patients, bedRequests, wards, beds] = await Promise.all([
      api.patients.list().catch(() => []),
      api.wards.bedRequests.list().catch(() => []),
      api.wards.list().catch(() => []),
      api.wards.beds().catch(() => []),
    ]);

    const patientsById = {};
    (patients || []).forEach((p) => (patientsById[p.patient_id] = p));
    const wardsById = {};
    (wards || []).forEach((w) => (wardsById[w.ward_id] = w));
    const bedsById = {};
    (beds || []).forEach((b) => (bedsById[b.bed_id] = b));

    // Show PENDING + ALLOCATED + DENIED so PRE can see the full HOM response.
    const allBedRequests = (bedRequests || []).filter((r) =>
      r.status === 'PENDING' || r.status === 'ALLOCATED' || r.status === 'DENIED',
    );

    return { allBedRequests, patientsById, wardsById, bedsById };
  }, []);

  const d = data || { allBedRequests: [], patientsById: {}, wardsById: {}, bedsById: {} };

  const pill = (bg, border, color, weight, text) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, border: '1px solid ' + border, background: bg, fontSize: 11, fontWeight: weight, color }}>{text}</span>
  );

  return (
    <div className="container" style={{ margin: '24px 20px' }}>
      <div className="directory-header">
        <div className="directory-title-group">
          <h2>Hospital Operations Management (HOM) Coordination</h2>
          <p>Monitor bed allocation requests submitted from PRE. Discharge approvals are managed in the PRE Dashboard.</p>
        </div>
      </div>

      {/* ── Bed Allocation Queue (PENDING + ALLOCATED + DENIED) ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Inpatient Bed Allocation Queue</h3>
          <span style={{ fontSize: 12, color: 'var(--color-muted-fg)' }}>Bed assignment is handled in HOM</span>
        </div>
        <div className="table-container" style={{ margin: 0 }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Patient UHID</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Patient Name</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Requested Ward</th>
                <th style={{ textAlign: 'center', padding: '12px 14px' }}>Priority</th>
                <th style={{ textAlign: 'center', padding: '12px 14px' }}>Bed</th>
                <th style={{ textAlign: 'center', padding: '12px 14px' }}>Status</th>
              </tr>
            </thead>
            <tbody id="homRequestTable">
              {d.allBedRequests.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 28, color: 'var(--color-muted-fg)' }}>No bed allocation requests</td></tr>
              ) : (
                d.allBedRequests.map((r) => {
                  const patient = d.patientsById[r.patient_id] || {};
                  const wardName = r.ward_id ? d.wardsById[r.ward_id]?.ward_name || 'Ward Requested' : 'HOM Decides';

                  const priorityBadge =
                    r.priority === 'CRITICAL' ? pill('#fef2f2', '#fecaca', '#991b1b', 700, 'Critical')
                    : r.priority === 'HIGH'   ? pill('#fef3c7', '#fde68a', '#b45309', 700, 'High')
                    : pill('#f8fafc', '#e2e8f0', '#475569', 600, 'Normal');

                  // Bed column — real bed number for ALLOCATED, N/A for DENIED, — for PENDING
                  let bedCell = <span style={{ color: 'var(--color-muted-fg)', fontSize: 12 }}>—</span>;
                  if (r.status === 'ALLOCATED' && r.bed_id && d.bedsById[r.bed_id]) {
                    bedCell = <strong style={{ color: 'var(--md-primary, #0f766e)' }}>{d.bedsById[r.bed_id].bed_number}</strong>;
                  } else if (r.status === 'DENIED') {
                    bedCell = <span style={{ color: '#6b7280', fontStyle: 'italic' }}>N/A</span>;
                  }

                  // Status badge
                  let statusBadge;
                  if (r.status === 'ALLOCATED') {
                    statusBadge = <span className="status confirmed" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', fontSize: 11, padding: '3px 8px', borderRadius: 12 }}>Allocated</span>;
                  } else if (r.status === 'DENIED') {
                    statusBadge = <span className="status rejected" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', fontSize: 11, padding: '3px 8px', borderRadius: 12 }}>Rejected</span>;
                  } else {
                    statusBadge = <span className="status pending" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontSize: 11, padding: '3px 8px', borderRadius: 12 }}>Pending</span>;
                  }

                  return (
                    <tr key={r.bed_request_id}>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}>
                        <strong style={{ color: 'var(--md-primary, #0f766e)' }}>{patient.uhid || 'UHID-' + r.patient_id}</strong>
                      </td>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}><strong>{patient.name || '-'}</strong></td>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}>{wardName}</td>
                      <td style={{ textAlign: 'center', padding: '12px 14px' }}>{priorityBadge}</td>
                      <td style={{ textAlign: 'center', padding: '12px 14px' }}>{bedCell}</td>
                      <td style={{ textAlign: 'center', padding: '12px 14px' }}>{statusBadge}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
