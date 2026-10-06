'use strict';

import { api } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { toast } from '../../components/feedback/feedback.js';
import { joinPreRequestsWithPatients } from './preHelpers.js';

/** PRE read-only coordination view for HOM bed assignment and discharge clearance. */
export default function HomCoordinationPage() {
  useDocumentTitle('HOM Coordination - Federico PRE');

  const { data, reload } = useApi(async () => {
    const [preRequests, patients, bedRequests, wards, beds, doctors] = await Promise.all([
      api.preRequests.list().catch(() => []),
      api.patients.list().catch(() => []),
      api.wards.bedRequests.list().catch(() => []),
      api.wards.list().catch(() => []),
      api.wards.beds().catch(() => []),
      api.doctors.list().catch(() => []),
    ]);

    const patientsById = {};
    (patients || []).forEach((p) => (patientsById[p.patient_id] = p));
    const wardsById = {};
    (wards || []).forEach((w) => (wardsById[w.ward_id] = w));
    const bedsById = {};
    (beds || []).forEach((b) => (bedsById[b.bed_id] = b));
    const doctorsById = {};
    (doctors || []).forEach((d) => (doctorsById[d.doctor_id] = d));

    const dischargeList = joinPreRequestsWithPatients(preRequests, patients, doctorsById).filter(
      (r) => r.status === 'DISCHARGE_REQUESTED' || r.status === 'DISCHARGE_APPROVED',
    );

    return {
      bedRequests: (bedRequests || []).filter((r) => r.status === 'PENDING'),
      patientsById,
      wardsById,
      bedsById,
      dischargeList,
    };
  }, []);

  const d = data || { bedRequests: [], patientsById: {}, wardsById: {}, bedsById: {}, dischargeList: [] };

  async function finalizeDischarge(preRequestId) {
    try {
      await api.preRequests.update(preRequestId, { status: 'DISCHARGED' });
      toast('Patient discharge finalized and released successfully', 'success');
    } catch (err) {
      toast(err.message || 'Could not finalize discharge', 'error');
      return;
    }
    await reload();
  }

  const pill = (bg, border, color, weight, text) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, border: '1px solid ' + border, background: bg, fontSize: 11, fontWeight: weight, color }}>
      {text}
    </span>
  );

  return (
    <div className="container" style={{ margin: '24px 20px' }}>
      <div className="directory-header">
        <div className="directory-title-group">
          <h2>Hospital Operations Management (HOM) Coordination</h2>
          <p>Monitor bed allocation requests submitted from PRE and process finalized patient discharges.</p>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>1. Inpatient Bed Allocation Queue</h3>
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
                <th style={{ textAlign: 'center', padding: '12px 14px' }}>Status</th>
              </tr>
            </thead>
            <tbody id="homRequestTable">
              {d.bedRequests.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: 28, color: 'var(--color-muted-fg)' }}>No pending bed allocation requests</td></tr>
              ) : (
                d.bedRequests.map((r) => {
                  const patient = d.patientsById[r.patient_id] || {};
                  const wardName = r.ward_id ? d.wardsById[r.ward_id]?.ward_name || 'Ward Requested' : 'HOM Decides';

                  const priorityBadge =
                    r.priority === 'CRITICAL' ? pill('#fef2f2', '#fecaca', '#991b1b', 700, 'Critical')
                    : r.priority === 'HIGH' ? pill('#fef3c7', '#fde68a', '#b45309', 700, 'High')
                    : pill('#f8fafc', '#e2e8f0', '#475569', 600, 'Normal');

                  return (
                    <tr key={r.bed_request_id}>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}>
                        <strong style={{ color: 'var(--md-primary, #0f766e)' }}>{patient.uhid || 'UHID-' + r.patient_id}</strong>
                      </td>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}><strong>{patient.name || '-'}</strong></td>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}>{wardName}</td>
                      <td style={{ textAlign: 'center', padding: '12px 14px' }}>{priorityBadge}</td>
                      <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                        <span className="status pending" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontSize: 11, padding: '3px 8px', borderRadius: 12 }}>
                          Pending
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>2. Inpatient Discharge Clearance &amp; Final Release</h3>
          <span style={{ fontSize: 12, color: 'var(--color-muted-fg)' }}>Clearances processed through HOM and verified by PRE</span>
        </div>
        <div className="table-container" style={{ margin: 0 }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Patient UHID</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Patient Name</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Department</th>
                <th style={{ textAlign: 'left', padding: '12px 16px' }}>Attending Doctor</th>
                <th style={{ textAlign: 'center', padding: '12px 14px' }}>Assigned Bed</th>
                <th style={{ textAlign: 'center', padding: '12px 14px' }}>HOM Clearance Status</th>
                <th style={{ textAlign: 'center', padding: '12px 16px' }}>PRE Action</th>
              </tr>
            </thead>
            <tbody id="homDischargeTable">
              {d.dischargeList.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: 28, color: 'var(--color-muted-fg)' }}>No pending discharge clearance requests</td></tr>
              ) : (
                d.dischargeList.map((r) => {
                  const bedNumber = r.bed_id && d.bedsById[r.bed_id] ? d.bedsById[r.bed_id].bed_number : 'Bed Assigned';
                  const approved = r.status === 'DISCHARGE_APPROVED';
                  return (
                    <tr key={r.pre_request_id}>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}>
                        <strong style={{ color: 'var(--md-primary, #0f766e)' }}>{r.patientUhid}</strong>
                      </td>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}><strong>{r.patientName}</strong></td>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}>{r.department}</td>
                      <td style={{ textAlign: 'left', padding: '12px 16px' }}>{r.doctorName}</td>
                      <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                        <span className="hom-ward-pill">{bedNumber}</span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                        {approved ? (
                          <span className="status confirmed" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', fontSize: 11, padding: '3px 8px', borderRadius: 12 }}>
                            Discharge Approved by HOM
                          </span>
                        ) : (
                          <span className="status pending" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontSize: 11, padding: '3px 8px', borderRadius: 12 }}>
                            Pending HOM Inspection
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                        {approved ? (
                          <button className="btn green" type="button" style={{ padding: '6px 12px', fontSize: 11, borderRadius: 4 }} onClick={() => finalizeDischarge(r.pre_request_id)}>
                            Finalize Release
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-muted-fg)', fontSize: 12 }}>Awaiting HOM</span>
                        )}
                      </td>
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
