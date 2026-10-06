'use strict';

import { api } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { toast } from '../../components/feedback/feedback.js';
import { joinPreRequestsWithPatients, formatDate, to12Hour } from './preHelpers.js';

/** Ported from PRE/pages/admitted.html + admitted.js. */
export default function AdmittedPage() {
  useDocumentTitle('Admitted Patients');

  const { data, reload } = useApi(async () => {
    const [preRequests, patients, doctors, beds] = await Promise.all([
      api.preRequests.list(),
      api.patients.list(),
      api.doctors.list(),
      api.wards.beds(),
    ]);
    const doctorsById = {};
    doctors.forEach((d) => (doctorsById[d.doctor_id] = d));
    const bedsById = {};
    beds.forEach((b) => (bedsById[b.bed_id] = b));

    const admitted = joinPreRequestsWithPatients(preRequests, patients, doctorsById).filter((r) => r.status === 'ADMITTED');
    return { admitted, bedsById };
  }, []);

  const admitted = data?.admitted || [];
  const bedsById = data?.bedsById || {};

  async function dischargePatient(id) {
    try {
      await api.preRequests.update(id, { status: 'DISCHARGE_REQUESTED' });
      toast('Discharge request sent to HOM', 'success');
      await reload();
    } catch (err) {
      toast(err.message || 'Could not request discharge', 'error');
    }
  }

  return (
    <div className="container">
      <h2>Admitted Patient Records</h2>
      <table>
        <thead>
          <tr>
            <th>Patient ID</th><th>Name</th><th>Age</th><th>Gender</th><th>Department</th>
            <th>Doctor</th><th>Appointment Date</th><th>Appointment Time</th><th>Status</th><th>Bed No</th><th>Action</th>
          </tr>
        </thead>
        <tbody id="admittedTable">
          {admitted.length === 0 ? (
            <tr><td colSpan="11">No Admitted Patients Found</td></tr>
          ) : (
            admitted.map((r) => {
              const bed = bedsById[r.bed_id];
              return (
                <tr key={r.pre_request_id}>
                  <td>{r.patientUhid}</td>
                  <td>{r.patientName}</td>
                  <td>{r.patientAge}</td>
                  <td>{r.patientGender}</td>
                  <td>{r.department}</td>
                  <td>{r.doctorName}</td>
                  <td>{formatDate(r.requested_date)}</td>
                  <td>{to12Hour(r.requested_time) || '-'}</td>
                  <td>Admitted</td>
                  <td>{bed ? bed.bed_number : '-'}</td>
                  <td>
                    <button className="btn reject" onClick={() => dischargePatient(r.pre_request_id)}>
                      Discharge request
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

