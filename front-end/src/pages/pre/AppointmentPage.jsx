'use strict';

import { useEffect, useState } from 'react';
import { api } from '../../api/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useSearchParam } from '../../hooks/useSearchParam.js';
import DepartmentSelect from '../../components/forms/DepartmentSelect.jsx';
import { toast } from '../../components/feedback/feedback.js';
import { formatAge, to12Hour } from './preHelpers.js';
import RegisterWalkInPopup from './RegisterWalkInPopup.jsx';
import SearchResultPopup from './SearchResultPopup.jsx';

/**
 * Ported from PRE/pages/APPointment.html + js/Appointment.js.
 *
 * Reached at /PRE/pages/appointment.html - the spelling every link in the app
 * uses. The uppercase filename also routes here (DEC-7).
 */
const TIME_SLOTS = [
  ['09:00 AM', '09:00 AM – Morning'],
  ['10:00 AM', '10:00 AM – Morning'],
  ['11:30 AM', '11:30 AM – Morning'],
  ['02:00 PM', '02:00 PM – Afternoon'],
  ['03:30 PM', '03:30 PM – Afternoon'],
  ['05:00 PM', '05:00 PM – Evening'],
];

function toPickerShape(patient) {
  return {
    patientId: patient.uhid || 'UHID-' + patient.patient_id,
    realId: patient.patient_id,
    name: patient.name,
    age: formatAge(patient.dob),
    gender: patient.gender || '—',
    phone: patient.phone || '—',
    address: patient.address || '—',
  };
}

export default function AppointmentPage() {
  useDocumentTitle('Create Appointment – Federico PRE');
  const patientIdParam = useSearchParam('patient_id');
  const doctorIdParam = useSearchParam('doctor_id');

  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  const [department, setDepartment] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00 AM');
  const [visitType, setVisitType] = useState('Consultation');
  const [reason, setReason] = useState('');

  const { data, reload } = useApi(async () => {
    const [patients, doctors, availabilities] = await Promise.all([
      api.patients.list().catch(() => []),
      api.doctors.list().catch(() => []),
      api.doctors.availabilityAll().catch(() => []),
    ]);
    return { patients: patients || [], doctors: doctors || [], availabilities: availabilities || [] };
  }, []);

  const patients = data?.patients || [];
  const doctors = data?.doctors || [];
  const availabilities = data?.availabilities || [];

  // ?patient_id= / ?doctor_id= prefill, once the catalogs have loaded.
  useEffect(() => {
    if (!data) return;
    if (patientIdParam) {
      const matched = patients.find((p) => p.patient_id === Number(patientIdParam));
      if (matched) fillPatient(toPickerShape(matched));
    }
    if (doctorIdParam) {
      const doc = doctors.find((d) => d.doctor_id === Number(doctorIdParam));
      if (doc) {
        setDepartment(doc.specialization);
        setDoctorId(String(doc.doctor_id));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function fillPatient(shape) {
    setSelected(shape);
    setPickerQuery(shape.name + ' (' + shape.patientId + ')');
    setPickerOpen(false);
  }

  function clearForm() {
    setSelected(null);
    setPickerQuery('');
    setSearchPhone('');
    setDepartment('');
    setDoctorId('');
    setDate('');
    setTime('10:00 AM');
    setVisitType('Consultation');
    setReason('');
    setPickerOpen(false);
  }

  const availMap = {};
  availabilities.forEach((a) => {
    if (!availMap[a.doctor_id]) availMap[a.doctor_id] = a;
  });

  const matchingDoctors = doctors.filter((d) => {
    if (!department) return true;
    const target = department.toLowerCase();
    const docDept = (d.department || '').toLowerCase();
    const docSpec = (d.specialization || '').toLowerCase();
    return docDept === target || docSpec === target || docSpec.includes(target) || docDept.includes(target);
  });

  const q = pickerQuery.trim().toLowerCase();
  const pickerMatches = patients
    .map(toPickerShape)
    .filter((p) => (!q ? true : [p.patientId, p.name, p.phone].join(' ').toLowerCase().includes(q)));

  /** Matches UHID exactly, phone by suffix, or name by substring - in that order. */
  async function searchPatient() {
    const rawQuery = searchPhone.trim();
    if (!rawQuery) {
      toast('Enter phone number or UHID to search', 'error');
      return;
    }
    const cleanPhone = rawQuery.replace(/\D/g, '');
    const lowerQuery = rawQuery.toLowerCase();

    const found = patients.find((p) => {
      const matchUhid = (p.uhid || '').toLowerCase() === lowerQuery;
      const matchPhone = cleanPhone && (p.phone || '').replace(/\D/g, '').endsWith(cleanPhone);
      const matchName = (p.name || '').toLowerCase().includes(lowerQuery);
      return matchUhid || matchPhone || matchName;
    });

    if (found) {
      const shape = toPickerShape(found);
      fillPatient(shape);
      setSearchResult(shape);
    } else {
      toast('No verified patient found matching query', 'error');
    }
  }

  async function createAppointment() {
    if (!selected) {
      toast('Please select a verified patient from the directory first', 'error');
      return;
    }
    if (!date || !department) {
      toast('Please select appointment date and clinical department', 'error');
      return;
    }
    try {
      // `appointment_time` and `status` are not in createPreRequestRules, but
      // the validator does not strip unknown fields, so both reach the service.
      const result = await api.preRequests.create({
        patient_id: selected.realId,
        department,
        doctor_id: doctorId ? Number(doctorId) : null,
        visit_type: visitType,
        requested_date: date,
        appointment_time: time,
        status: 'APPROVED',
      });
      toast('Appointment scheduled successfully (Ref #' + result.pre_request_id + ')', 'success');
      clearForm();
    } catch (err) {
      toast(err.message || 'Could not create appointment', 'error');
    }
  }

  return (
    <>
      <div className="container" style={{ maxWidth: 1080, margin: '24px auto' }}>
        <div className="directory-header">
          <div className="directory-title-group">
            <h2>Schedule Patient Appointment</h2>
            <p>Select verified patient record, assign specialty department &amp; consulting physician, and allocate appointment time slots.</p>
          </div>
          <div className="directory-toolbar">
            <button className="btn green directory-action-btn" type="button" onClick={() => setRegisterOpen(true)}>
              + Register Walk-In Patient
            </button>
          </div>
        </div>

        <div className="appointment-grid">
          <div className="appointment-card-section">
            <h3 className="appointment-section-title">1. Patient Identification</h3>

            <div className="appointment-form-group">
              <label className="emergency-form-label" htmlFor="searchPhone">Quick Search by Phone or UHID</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" id="searchPhone" placeholder="Enter 10-digit phone or UHID..." className="emergency-form-control" style={{ flex: 1 }}
                  value={searchPhone} onChange={(e) => setSearchPhone(e.target.value)} onFocus={() => setPickerOpen(false)} />
                <button className="btn suggest" type="button" onClick={searchPatient} style={{ height: 40, padding: '0 16px', margin: 0, borderRadius: 'var(--radius-sm, 6px)' }}>
                  Search
                </button>
              </div>
            </div>

            <div className="appointment-form-group">
              <label className="emergency-form-label" htmlFor="patientId">Select from Patient Directory</label>
              <div className={'appointment-patient-picker' + (pickerOpen ? ' is-open' : '')} id="appointmentPatientPicker">
                <input type="text" id="patientId" placeholder="Click or type name, UHID, phone..." autoComplete="off" className="emergency-form-control"
                  value={pickerQuery}
                  onFocus={() => setPickerOpen(true)}
                  onClick={() => setPickerOpen(true)}
                  onChange={(e) => { setPickerQuery(e.target.value); setSelected(null); setPickerOpen(true); }}
                  onKeyDown={(e) => { if (e.key === 'Escape') setPickerOpen(false); }}
                  onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                />
                <div className="appointment-picker-dropdown" id="appointmentPatientDropdown" hidden={!pickerOpen}>
                  {pickerMatches.length === 0 ? (
                    <div className="appointment-picker-empty">
                      <strong>No matching records found</strong>
                      <span>Click &quot;+ Register Walk-In Patient&quot; above to add a new patient profile.</span>
                    </div>
                  ) : (
                    pickerMatches.map((p) => (
                      <button key={p.patientId} type="button" className="appointment-picker-option"
                        onMouseDown={(e) => { e.preventDefault(); fillPatient(p); }}>
                        <div className="appointment-picker-row">
                          <strong>{p.name}</strong>
                          <span style={{ fontSize: 11, color: 'var(--md-primary, #0f766e)', fontWeight: 600 }}>{p.patientId}</span>
                        </div>
                        <div className="appointment-picker-row appointment-picker-meta">
                          <span>{p.age} {'•'} {p.gender}</span>
                          <span>{p.phone}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="appointment-picker-helper">Type to search existing hospital records or browse all registered patients.</div>
            </div>

            <div id="selectedPatientCard" className="quick-patient-box" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                {/* fillPatientForm() applied a per-field fallback to every one
                    of these, so a record missing a name still reads "Verified
                    Patient" rather than going blank. */}
                <strong id="cardPatientName" style={{ fontSize: 15, color: 'var(--color-fg)' }}>
                  {selected ? selected.name || 'Verified Patient' : 'No Patient Selected'}
                </strong>
                <span id="cardPatientUhid" className="status pending" style={{ background: '#f1f5f9', color: '#475569', fontSize: 11, padding: '2px 8px', borderRadius: 12 }}>
                  {selected ? selected.patientId || 'UHID' : '—'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                <div><span style={{ color: 'var(--color-muted-fg)' }}>Age / Gender:</span> <strong id="cardPatientAgeGender">{selected ? (selected.age || '—') + ' / ' + (selected.gender || '—') : '—'}</strong></div>
                <div><span style={{ color: 'var(--color-muted-fg)' }}>Contact:</span> <strong id="cardPatientPhone">{selected ? selected.phone || '—' : '—'}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--color-muted-fg)' }}>Address:</span> <strong id="cardPatientAddress">{selected ? selected.address || '—' : '—'}</strong></div>
              </div>
            </div>
          </div>

          <div className="appointment-card-section">
            <h3 className="appointment-section-title">2. Clinical &amp; Scheduling Details</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="appointment-form-group">
                <label className="emergency-form-label" htmlFor="department">Specialty Department *</label>
                <DepartmentSelect id="department" className="emergency-form-control" doctors={doctors} value={department}
                  placeholder="Select Department" onChange={(v) => { setDepartment(v); setDoctorId(''); }} />
              </div>

              <div className="appointment-form-group">
                <label className="emergency-form-label" htmlFor="doctorSelect">Attending Physician</label>
                <select id="doctorSelect" className="emergency-form-control" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                  <option value="">Any Available Specialist</option>
                  {matchingDoctors.map((d) => {
                    const avail = availMap[d.doctor_id];
                    const timeHint = avail?.start_time ? ' (' + to12Hour(avail.start_time) + ' – ' + to12Hour(avail.end_time) + ')' : '';
                    const title = d.name.startsWith('Dr.') ? d.name : 'Dr. ' + d.name;
                    return (
                      <option key={d.doctor_id} value={d.doctor_id}>
                        {title} (DOC-{String(d.doctor_id).padStart(3, '0')}){timeHint}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="appointment-form-group">
                <label className="emergency-form-label" htmlFor="appointmentDate">Appointment Date *</label>
                <input type="date" id="appointmentDate" className="emergency-form-control" min={new Date().toISOString().split('T')[0]}
                  value={date} onChange={(e) => setDate(e.target.value)} />
              </div>

              <div className="appointment-form-group">
                <label className="emergency-form-label" htmlFor="appointmentTime">Preferred Time Slot *</label>
                <select id="appointmentTime" className="emergency-form-control" value={time} onChange={(e) => setTime(e.target.value)}>
                  {TIME_SLOTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="appointment-form-group">
                <label className="emergency-form-label" htmlFor="visitType">Encounter Type *</label>
                <select id="visitType" className="emergency-form-control" value={visitType} onChange={(e) => setVisitType(e.target.value)}>
                  <option value="Consultation">Consultation (OPD)</option>
                  <option value="Admit">Admission Referral (IPD)</option>
                  <option value="Follow-Up">Follow-Up Review</option>
                </select>
              </div>

              <div className="appointment-form-group">
                <label className="emergency-form-label" htmlFor="appointmentReason">Chief Complaint / Notes</label>
                <input type="text" id="appointmentReason" placeholder="e.g. Routine checkup, follow-up..." className="emergency-form-control"
                  value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>

            <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn suggest" type="button" onClick={clearForm} style={{ height: 44, padding: '0 20px', borderRadius: 'var(--radius-sm, 6px)' }}>
                Clear Form
              </button>
              <button className="btn green" type="button" onClick={createAppointment} style={{ height: 44, padding: '0 24px', borderRadius: 'var(--radius-sm, 6px)', fontSize: 13, fontWeight: 600 }}>
                Confirm &amp; Schedule Appointment
              </button>
            </div>
          </div>
        </div>
      </div>

      <RegisterWalkInPopup
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onRegistered={async (patient) => {
          await reload();
          fillPatient(toPickerShape(patient));
        }}
      />

      <SearchResultPopup patient={searchResult} onClose={() => setSearchResult(null)} />
    </>
  );
}

