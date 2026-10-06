'use strict';

import { useCallback, useState } from 'react';
import { api } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { usePolling } from '../../hooks/usePolling.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useSession } from '../../auth/useSession.js';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { statusLabel, formatDateTime, joinPreRequestsWithPatients } from './homHelpers.js';
import AdmissionRequestModal from './AdmissionRequestModal.jsx';
import { usePageStyles } from '../../hooks/usePageStyles.js';
import dashboardCss from '../../styles/hom/dashboard.css?inline';

/**
 * Ported from HOM/screen-01-dashboard.html + dashboard.js.
 *
 * DEFECT D1 IS DELIBERATE AND MUST NOT BE "FIXED" HERE.
 * The legacy file called a bare `showMessage(...)` on four error paths; that
 * function is defined nowhere in the codebase, so every one of those paths
 * throws ReferenceError instead of telling the user anything. Constraint 1 of
 * react-migration-plan.md says to keep wrong behaviour wrong and flag it, and
 * DEC-6 records the decision. The obvious repair - route these to
 * feedback.toast(msg, 'error'), which is what every sibling HOM file does - is
 * queued as Phase 2 work in section 8 of the plan.
 */

function parseOperationalLog(log) {
  const text = log.text || '';
  const meta = log.meta || {};
  let category = 'OPERATION';
  let badgeVariant = 'neutral';
  let title = text;
  let subtitle = 'Hospital operational event';
  const actor = meta.actorRole ? 'By ' + meta.actorRole : 'System';

  if (/allocated/i.test(text)) {
    category = 'BED ALLOCATED';
    badgeVariant = 'success';
    subtitle = 'Physical bed assigned and patient admitted to ward';
  } else if (/Bed requested/i.test(text)) {
    category = 'BED REQUESTED';
    badgeVariant = 'info';
    subtitle = 'Bed allocation queued for incoming patient';
  } else if (/Pre-registration submitted/i.test(text)) {
    category = 'ADMISSION QUEUED';
    badgeVariant = 'info';
    subtitle = 'New patient pre-registration submitted';
  } else if (/DISCHARGE_REQUESTED/i.test(text)) {
    category = 'DISCHARGE CLEARANCE';
    badgeVariant = 'warning';
    title = 'Discharge clearance requested for Pre-request #' + (meta.preRequestId || '');
    subtitle = 'Awaiting HOM operational discharge sign-off';
  } else if (/DISCHARGE_APPROVED/i.test(text)) {
    category = 'DISCHARGE APPROVED';
    badgeVariant = 'success';
    title = 'Discharge approved by HOM for Pre-request #' + (meta.preRequestId || '');
    subtitle = 'Patient cleared for release and bed turnover';
  } else if (/ADMITTED/i.test(text)) {
    category = 'PATIENT ADMITTED';
    badgeVariant = 'success';
    title = 'Inpatient admission confirmed for Pre-request #' + (meta.preRequestId || '');
    subtitle = 'Patient active under hospital ward care';
  } else if (/Emergency/i.test(text)) {
    category = 'ADMISSION';
    badgeVariant = 'error';
    subtitle = 'High-priority walk-in registered';
  } else if (/denied/i.test(text)) {
    category = 'REQUEST DENIED';
    badgeVariant = 'error';
    subtitle = 'Bed request denied by HOM';
  } else if (/Ledger|Charge|Billing/i.test(text)) {
    category = 'BILLING EVENT';
    badgeVariant = 'neutral';
    subtitle = 'Patient billing ledger updated';
  }

  return { category, badgeVariant, title, subtitle, actor };
}

function timeAgo(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin + 'm ago';
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return diffHour + 'h ago';
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return diffDays + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function HomDashboardPage() {
  usePageStyles(dashboardCss);
  useDocumentTitle('Dashboard | Federico Hospital HOM');
  const { actor } = useSession();
  const [selectedBedRequestId, setSelectedBedRequestId] = useState(null);

  const { data, reload } = useApi(async () => {
    const [preRequests, patients, wards, beds, bedRequests, activity, doctors] = await Promise.all([
      api.preRequests.list().catch(() => []),
      api.patients.list().catch(() => []),
      api.wards.list().catch(() => []),
      api.wards.beds().catch(() => []),
      api.wards.bedRequests.list().catch(() => []),
      api.activityLog.list().catch(() => []),
      api.doctors.list().catch(() => []),
    ]);
    const arr = (v) => (Array.isArray(v) ? v : []);
    return {
      preRequests: arr(preRequests),
      patients: arr(patients),
      wards: arr(wards),
      beds: arr(beds),
      bedRequests: arr(bedRequests),
      activity: arr(activity),
      doctors: arr(doctors),
    };
  }, []);

  usePolling(reload, 15000);

  const d = data || { preRequests: [], patients: [], wards: [], beds: [], bedRequests: [], activity: [], doctors: [] };

  const totalBeds = d.wards.reduce((sum, w) => sum + (w.total_beds || 0), 0);
  const occupied = d.wards.reduce((sum, w) => sum + (w.occupied_beds || 0), 0);
  const available = Math.max(0, totalBeds - occupied);
  const occupancyRate = totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0;

  const activeStatuses = ['ADMITTED', 'DISCHARGE_REQUESTED', 'DISCHARGE_APPROVED'];
  const activeInpatients = d.preRequests.filter((r) => activeStatuses.includes(r.status)).length;
  const pending = d.bedRequests.filter((r) => r.status === 'PENDING');

  const patientsById = {};
  d.patients.forEach((p) => (patientsById[p.patient_id] = p));
  const preRequestsById = {};
  d.preRequests.forEach((r) => (preRequestsById[r.pre_request_id] = r));
  const doctorsById = {};
  d.doctors.forEach((x) => (doctorsById[x.doctor_id] = x));

  const joined = joinPreRequestsWithPatients(d.preRequests, d.patients, doctorsById);
  const dischargePending = joined.filter((r) => r.status === 'DISCHARGE_REQUESTED');
  const dischargeApproved = joined.filter((r) => r.status === 'DISCHARGE_APPROVED');

  const sortedLogs = [...d.activity].sort((a, b) => {
    const tA = new Date(a.created_at || 0).getTime();
    const tB = new Date(b.created_at || 0).getTime();
    if (tB !== tA) return tB - tA;
    return (b.id || b.log_id || 0) - (a.id || a.log_id || 0);
  });

  const approveDischarge = useCallback(
    async (preRequestId) => {
      try {
        await api.preRequests.update(preRequestId, { status: 'DISCHARGE_APPROVED' });
      } catch (err) {
        // D1: `showMessage` is intentionally undefined - see the file header.
        // eslint-disable-next-line no-undef
        showMessage(err.message || 'Unable to approve discharge.');
        return;
      }
      await reload();
    },
    [reload],
  );

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const profileLabel =
    actor === 'HOM' ? 'Super User · Full CRUD Access' : 'Hospital Operations Manager';

  const kpi = (label, value, footer, valueStyle) => (
    <div className="kpi-card">
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value" style={valueStyle}>{value}</div>
      </div>
      <div className="kpi-footer">{footer}</div>
    </div>
  );

  return (
    <>
      <main className="dashboard-container">
        <div className="header-section">
          <div>
            <h1 className="h1" style={{ marginBottom: 8 }}>Bed &amp; Patient Operations Dashboard</h1>
            <p className="body-text" id="dashboard-date-subtitle">{today} {'·'} Live operational overview</p>
          </div>
          <span id="role-badge"><Badge variant="info">{profileLabel}</Badge></span>
        </div>

        <div className="metrics-grid" id="metrics-container">
          {kpi('Total Beds Managed', totalBeds, <Badge variant="neutral">{available + ' Available · ' + occupied + ' Occupied'}</Badge>)}
          {kpi('Active Inpatients', activeInpatients, <Badge variant="success">Admitted &amp; Flow</Badge>)}
          {kpi(
            'Bed Occupancy Rate',
            occupancyRate + '%',
            <Badge variant={occupancyRate >= 90 ? 'error' : occupancyRate >= 75 ? 'warning' : 'success'}>
              {occupancyRate >= 75 ? 'Nearing capacity' : 'Healthy'}
            </Badge>,
            { color: occupancyRate >= 90 ? 'var(--status-error-fg, #b3261e)' : occupancyRate >= 75 ? 'var(--status-warning-fg, #7a5300)' : 'var(--text-primary)' },
          )}
          {kpi(
            'Pending Bed Requests',
            pending.length,
            <Badge variant={pending.length > 0 ? 'error' : 'success'}>
              {pending.length > 0 ? 'Requires action' : 'All clear'}
            </Badge>,
            { color: pending.length > 0 ? 'var(--status-error-fg, #b3261e)' : 'var(--text-primary)' },
          )}
        </div>

        <div className="dashboard-stack">
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 className="h2" style={{ fontSize: 18 }}>Pending Admission Requests</h2>
              <span id="pending-badge-header"><Badge variant="warning">{pending.length + ' Pending'}</Badge></span>
            </div>
            <div className="table-scroll-container" style={{ maxHeight: 380 }}>
              <table className="data-table">
                <thead>
                  <tr><th>Patient</th><th>UHID</th><th>Dept</th><th>Requested By</th><th>Time</th><th>Action</th></tr>
                </thead>
                <tbody id="admissions-table-body">
                  {pending.length === 0 ? (
                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24 }}>No pending bed requests</td></tr>
                  ) : (
                    pending.map((request) => {
                      const patient = patientsById[request.patient_id] || {};
                      const preRequest = request.pre_request_id ? preRequestsById[request.pre_request_id] : null;
                      return (
                        <tr key={request.bed_request_id} onClick={() => setSelectedBedRequestId(request.bed_request_id)} style={{ cursor: 'pointer' }}>
                          <td style={{ fontWeight: 500 }}>{patient.name || '-'}</td>
                          <td>{patient.uhid || '-'}</td>
                          <td>{preRequest?.department || '-'}</td>
                          <td>{preRequest ? 'PRE' : 'HOM'}</td>
                          <td>{formatDateTime(request.requested_at)}</td>
                          <td><Button variant="secondary" size="sm">Assign Bed</Button></td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 className="h2" style={{ fontSize: 18 }}>PRE Discharge Requests</h2>
              <span id="pre-discharge-badge">
                <Badge variant={dischargePending.length ? 'warning' : 'success'}>{dischargePending.length + ' Open'}</Badge>
              </span>
            </div>
            <div className="table-scroll-container" style={{ maxHeight: 320 }}>
              <table className="data-table">
                <thead>
                  <tr><th>Patient</th><th>Department</th><th>Doctor</th><th>PRE Status</th><th>HOM Status</th><th>Action</th></tr>
                </thead>
                <tbody id="pre-discharge-body">
                  {dischargePending.length === 0 && dischargeApproved.length === 0 ? (
                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: 24 }}>No discharge requests from PRE.</td></tr>
                  ) : (
                    <>
                      {dischargePending.map((r) => (
                        <tr key={'p' + r.pre_request_id}>
                          <td>{r.patientName}</td>
                          <td>{r.department || '-'}</td>
                          <td>{r.doctorName}</td>
                          <td>{statusLabel(r.status)}</td>
                          <td>{r.hom_status || '-'}</td>
                          <td>
                            <Button variant="primary" size="sm" onClick={() => approveDischarge(r.pre_request_id)}>
                              Approve Discharge
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {dischargeApproved.map((r) => (
                        <tr key={'a' + r.pre_request_id}>
                          <td>{r.patientName}</td>
                          <td>{r.department || '-'}</td>
                          <td>{r.doctorName}</td>
                          <td>{statusLabel(r.status)}</td>
                          <td>{r.hom_status || '-'}</td>
                          <td><span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Approved {'—'} awaiting PRE sign-off</span></td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <h2 className="h2" style={{ fontSize: 18, marginBottom: 16 }}>Operational Activity Log</h2>
            <div id="activity-log-container" className="scrollable-feed flex-col" style={{ gap: 16, maxHeight: 240 }}>
              {sortedLogs.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
                  No activity recorded yet.
                </p>
              ) : (
                sortedLogs.slice(0, 12).map((log, i) => {
                  const parsed = parseOperationalLog(log);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--md-surface-container, #ffffff)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md, 12px)', gap: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                        <span className={'badge badge-' + parsed.badgeVariant} style={{ fontSize: 11, flexShrink: 0 }}>{parsed.category}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{parsed.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{parsed.subtitle}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }} title={formatDateTime(log.created_at)}>{timeAgo(log.created_at)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{parsed.actor}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      <AdmissionRequestModal
        bedRequestId={selectedBedRequestId}
        data={d}
        onClose={() => setSelectedBedRequestId(null)}
        onChanged={reload}
      />
    </>
  );
}

