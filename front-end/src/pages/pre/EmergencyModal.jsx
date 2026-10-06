'use strict';

/*
 * ============================================================
 * OLD CODE — EmergencyModal has been REMOVED from the PRE workflow.
 * Emergency registration/triage is no longer part of the PRE workflow.
 * This entire file is commented out and kept for reference only.
 * ============================================================

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api/index.js';
import { toast } from '../../components/feedback/feedback.js';

const DEPARTMENTS = [
  'Emergency Medicine',
  'Trauma & Surgery',
  'Cardiology (ICU)',
  'Critical Care (CCU)',
  'Pediatrics Emergency',
  'Neurology Emergency',
];

export default function EmergencyModal({ open, patients, doctors, onClose, onChanged }) {
  const [patientId, setPatientId] = useState('');
  const [showQuick, setShowQuick] = useState(false);
  const [quick, setQuick] = useState({ name: '', age: '', gender: 'Male', phone: '' });
  const [dept, setDept] = useState(DEPARTMENTS[0]);
  const [doctorId, setDoctorId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setPatientId('');
    setShowQuick(false);
    setQuick({ name: '', age: '', gender: 'Male', phone: '' });
    setDept(DEPARTMENTS[0]);
    setDoctorId('');
    setNotes('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeydown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [open, onClose]);

  if (!open) return null;

  async function submit() {
    let resolvedPatientId = patientId;

    if (showQuick) {
      const name = quick.name.trim();
      const age = quick.age.trim();
      const phone = quick.phone.trim();
      if (!name || !age || !phone) {
        toast('Please enter patient name, age, and phone', 'error');
        return;
      }
      const birthYear = new Date().getFullYear() - Number(age);
      try {
        const createdPatient = await api.patients.create({
          name,
          dob: birthYear + '-01-01',
          gender: quick.gender,
          phone,
          address: 'Emergency Walk-In',
        });
        resolvedPatientId = createdPatient.patient_id;
      } catch (err) {
        toast(err.message || 'Could not register new patient', 'error');
        return;
      }
    }

    if (!resolvedPatientId) {
      toast('Please select or create a patient', 'error');
      return;
    }

    const noteText = notes.trim() || 'Urgent walk-in emergency';
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    try {
      const preRequest = await api.preRequests.create({
        patient_id: Number(resolvedPatientId),
        department: dept,
        doctor_id: doctorId ? Number(doctorId) : null,
        visit_type: 'Emergency',
        status: 'EMERGENCY',
        requested_date: today,
        requested_time: nowTime,
        note: noteText,
      });

      await api.wards.bedRequests.create({
        pre_request_id: preRequest.pre_request_id,
        patient_id: Number(resolvedPatientId),
        priority: 'CRITICAL',
        notes: 'Urgent Emergency Bed Request (' + dept + '): ' + noteText,
      });

      toast('Emergency case #' + preRequest.pre_request_id + ' registered and queued to HOM!', 'success');
      onClose();
      await onChanged();
    } catch (err) {
      toast(err.message || 'Could not register emergency case', 'error');
    }
  }

  return createPortal(
    <div
      id="emergencyModal"
      className="popup active"
      role="dialog"
      aria-modal="true"
      style={{ display: 'flex' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="emergency-modal-content">
        <div className="emergency-modal-head">
          <div>
            <h2 id="emergencyModalTitle">Register Walk-In Emergency</h2>
            <p>Quickly register an urgent triage case. A priority bed request will automatically be queued to HOM.</p>
          </div>
          <button className="emergency-modal-close" type="button" onClick={onClose} aria-label="Close modal">{'✕'}</button>
        </div>

        <div className="emergency-form-group">
          <label className="emergency-form-label" htmlFor="emergencyPatientSelect">Patient Selection</label>
          <select id="emergencyPatientSelect" className="emergency-form-control" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">-- Select Existing Patient --</option>
            {patients.map((p) => (
              <option key={p.patient_id} value={p.patient_id}>
                {p.uhid} - {p.name} ({p.phone || 'No phone'})
              </option>
            ))}
          </select>
        </div>

        <div id="quickPatientFields" className="quick-patient-box" style={{ display: showQuick ? 'block' : 'none' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label className="emergency-form-label" htmlFor="quickName">Full Name</label>
              <input type="text" id="quickName" placeholder="Patient Full Name" className="emergency-form-control"
                value={quick.name} onChange={(e) => setQuick((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="emergency-form-label" htmlFor="quickAge">Age (Years)</label>
              <input type="number" id="quickAge" placeholder="Age" min="1" max="120" className="emergency-form-control"
                value={quick.age} onChange={(e) => setQuick((p) => ({ ...p, age: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="emergency-form-label" htmlFor="quickGender">Gender</label>
              <select id="quickGender" className="emergency-form-control" value={quick.gender} onChange={(e) => setQuick((p) => ({ ...p, gender: e.target.value }))}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="emergency-form-label" htmlFor="quickPhone">Phone Number</label>
              <input type="text" id="quickPhone" placeholder="10-digit Phone" className="emergency-form-control"
                value={quick.phone} onChange={(e) => setQuick((p) => ({ ...p, phone: e.target.value }))} />
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right', marginBottom: 16 }}>
          <button type="button" id="btnToggleNewPatient" onClick={() => setShowQuick((v) => !v)}
            style={{ background: 'none', border: 'none', color: 'var(--md-primary, #0f766e)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 0' }}>
            {showQuick ? '- Use Existing Patient Dropdown' : '+ Or Quick Create New Patient'}
          </button>
        </div>

        <div className="emergency-form-group">
          <label className="emergency-form-label" htmlFor="emergencyDeptSelect">Emergency Department / Unit</label>
          <select id="emergencyDeptSelect" className="emergency-form-control" value={dept} onChange={(e) => setDept(e.target.value)}>
            {DEPARTMENTS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>

        <div className="emergency-form-group">
          <label className="emergency-form-label" htmlFor="emergencyDoctorSelect">On-Duty Emergency Physician</label>
          <select id="emergencyDoctorSelect" className="emergency-form-control" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            <option value="">-- Assign Emergency Specialist (Optional) --</option>
            {doctors.map((d) => (
              <option key={d.doctor_id} value={d.doctor_id}>{d.name} - {d.specialization}</option>
            ))}
          </select>
        </div>

        <div className="emergency-form-group">
          <label className="emergency-form-label" htmlFor="emergencyNotes">Chief Complaint / Clinical Triage Notes</label>
          <textarea id="emergencyNotes" rows="3" placeholder="e.g., Acute respiratory distress, SPO2 88%, severe chest pain..."
            className="emergency-form-control" style={{ resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="emergency-modal-actions">
          <button className="btn reject" type="button" onClick={onClose}>Cancel</button>
          <button className="btn green" type="button" onClick={submit}>Register &amp; Request Bed</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

*/
