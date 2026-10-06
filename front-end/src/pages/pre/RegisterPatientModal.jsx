'use strict';

/*
 * ============================================================
 * OLD CODE — RegisterPatientModal has been REMOVED from the PRE workflow.
 * The "+ Register" button from the Patient Record (Patient Directory) section
 * has been removed. Patient registration via this modal is no longer used
 * in the PRE Patient Records page.
 * This entire file is commented out and kept for reference only.
 * ============================================================

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api/index.js';
import { toast } from '../../components/feedback/feedback.js';

const BLANK = {
  name: '', dob: '', gender: 'Male', bloodGroup: 'O+', phone: '', altPhone: '', address: '',
  insProvider: '', insPolicyNo: '', insLimit: '', insType: 'Self',
};

function validate({ name, dob, gender, phone, altPhone, insProvider, insPolicyNo, insLimit }) {
  if (!name || name.length < 2) return "Enter the patient's full name (at least 2 characters).";
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(name)) return 'Name may only contain letters, spaces, apostrophes and hyphens.';
  if (!gender) return "Select the patient's gender.";

  if (!dob) return "Select the patient's date of birth.";
  const dobDate = new Date(dob);
  if (Number.isNaN(dobDate.getTime())) return 'Enter a valid date of birth.';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dobDate > today) return 'Date of birth cannot be in the future.';
  const age = (today - dobDate) / (365.25 * 24 * 60 * 60 * 1000);
  if (age > 120) return 'Date of birth is not realistic (age over 120).';

  if (!/^\d{10}$/.test(phone)) return 'Primary phone must be exactly 10 digits.';
  if (altPhone && !/^\d{10}$/.test(altPhone)) return 'Alternate phone must be exactly 10 digits.';

  if ((insProvider && !insPolicyNo) || (!insProvider && insPolicyNo)) {
    return 'Enter both the insurance provider and policy/card number, or leave both blank.';
  }
  if (insLimit && !(Number(insLimit) >= 0)) return 'Insurance coverage limit must be a non-negative number.';
  return '';
}

export default function RegisterPatientModal({ open, onClose, onChanged }) {
  const [f, setF] = useState(BLANK);
  const [frontFile, setFrontFile] = useState(null);
  const [backFile, setBackFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    if (!open) return;
    setF(BLANK);
    setFrontFile(null);
    setBackFile(null);
    setUploadStatus('');
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
    const payloadIn = {
      name: f.name.trim(), dob: f.dob, gender: f.gender, phone: f.phone.trim(),
      altPhone: f.altPhone.trim(), insProvider: f.insProvider.trim(),
      insPolicyNo: f.insPolicyNo.trim(), insLimit: f.insLimit.trim(),
    };
    const validationError = validate(payloadIn);
    if (validationError) {
      toast(validationError, 'error');
      return;
    }

    try {
      const newPatient = await api.patients.create({
        name: payloadIn.name,
        dob: f.dob,
        gender: f.gender,
        blood_group: f.bloodGroup,
        phone: payloadIn.phone,
        emergency_contact_phone: payloadIn.altPhone || null,
        address: f.address.trim() || null,
      });

      if (payloadIn.insProvider && payloadIn.insPolicyNo) {
        let cardFrontUrl = null;
        let cardBackUrl = null;
        try {
          if (frontFile) {
            setUploadStatus('Uploading front card image…');
            cardFrontUrl = (await api.uploads.document(frontFile)).url;
          }
          if (backFile) {
            setUploadStatus('Uploading back card image…');
            cardBackUrl = (await api.uploads.document(backFile)).url;
          }
          setUploadStatus('');
        } catch (upErr) {
          setUploadStatus('');
          toast('Insurance card image upload failed: ' + (upErr.message || 'unknown error'), 'warning');
        }

        try {
          const insPayload = {
            patient_id: newPatient.patient_id,
            provider_name: payloadIn.insProvider,
            policy_number: payloadIn.insPolicyNo,
            coverage_limit: payloadIn.insLimit ? Number(payloadIn.insLimit) : 0,
            coverage_type: f.insType,
          };
          if (cardFrontUrl) insPayload.card_front_url = cardFrontUrl;
          if (cardBackUrl) insPayload.card_back_url = cardBackUrl;
          await api.patients.createInsurance(insPayload);
        } catch (insErr) {
          toast(
            'Patient registered, but the insurance policy could not be saved: ' + (insErr.message || 'unknown error'),
            'warning',
          );
        }
      }

      toast('Patient ' + newPatient.name + ' (' + newPatient.uhid + ') registered successfully!', 'success');
      onClose();
      await onChanged();
    } catch (err) {
      toast(err.message || 'Could not register patient', 'error');
    }
  }

  const bloodGroups = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

  return createPortal(
    <div id="registerPatientModal" className="popup active" role="dialog" aria-modal="true" style={{ display: 'flex' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="emergency-modal-content" style={{ maxWidth: 600 }}>
        <div className="emergency-modal-head">
          <div>
            <h2 id="registerModalTitle" style={{ color: 'var(--md-primary, #0f766e)' }}>Register New Patient</h2>
            <p>Create a verified hospital record with unique UHID generation.</p>
          </div>
          <button className="emergency-modal-close" type="button" onClick={onClose} aria-label="Close modal">{'✕'}</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="emergency-form-group" style={{ marginBottom: 0 }}>
            <label className="emergency-form-label" htmlFor="regName">Full Name *</label>
            <input type="text" id="regName" placeholder="e.g. Rahul Sharma" className="emergency-form-control" value={f.name} onChange={set('name')} />
          </div>
          <div className="emergency-form-group" style={{ marginBottom: 0 }}>
            <label className="emergency-form-label" htmlFor="regDob">Date of Birth *</label>
            <input type="date" id="regDob" className="emergency-form-control" value={f.dob} onChange={set('dob')} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="emergency-form-group" style={{ marginBottom: 0 }}>
            <label className="emergency-form-label" htmlFor="regGender">Gender *</label>
            <select id="regGender" className="emergency-form-control" value={f.gender} onChange={set('gender')}>
              <option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option>
            </select>
          </div>
          <div className="emergency-form-group" style={{ marginBottom: 0 }}>
            <label className="emergency-form-label" htmlFor="regBloodGroup">Blood Group</label>
            <select id="regBloodGroup" className="emergency-form-control" value={f.bloodGroup} onChange={set('bloodGroup')}>
              {bloodGroups.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="emergency-form-group" style={{ marginBottom: 0 }}>
            <label className="emergency-form-label" htmlFor="regPhone">Primary Phone (10-Digit) *</label>
            <input type="text" id="regPhone" placeholder="e.g. 9876543210" className="emergency-form-control" value={f.phone} onChange={set('phone')} />
          </div>
          <div className="emergency-form-group" style={{ marginBottom: 0 }}>
            <label className="emergency-form-label" htmlFor="regAltPhone">Alternate Phone</label>
            <input type="text" id="regAltPhone" placeholder="Optional" className="emergency-form-control" value={f.altPhone} onChange={set('altPhone')} />
          </div>
        </div>

        <div className="emergency-form-group">
          <label className="emergency-form-label" htmlFor="regAddress">Residential Address</label>
          <input type="text" id="regAddress" placeholder="e.g. 14 MG Road, Hyderabad" className="emergency-form-control" value={f.address} onChange={set('address')} />
        </div>

        <div className="quick-patient-box" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--color-fg)' }}>Health Insurance Policy (Optional)</strong>
            <span style={{ fontSize: 11, color: 'var(--color-muted-fg)' }}>For instant cashless billing</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
            <input type="text" id="regInsProvider" placeholder="Provider (e.g. Star Health)" className="emergency-form-control" value={f.insProvider} onChange={set('insProvider')} />
            <input type="text" id="regInsPolicyNo" placeholder="Policy / Card No" className="emergency-form-control" value={f.insPolicyNo} onChange={set('insPolicyNo')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input type="number" id="regInsLimit" placeholder="Coverage Limit (₹)" className="emergency-form-control" value={f.insLimit} onChange={set('insLimit')} />
            <select id="regInsType" className="emergency-form-control" value={f.insType} onChange={set('insType')}>
              <option value="Self">Individual Policy</option>
              <option value="Family">Family Floater</option>
              <option value="Corporate">Corporate / Group</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
            <label style={{ fontSize: 11, color: 'var(--color-muted-fg)' }}>
              Insurance card — front
              <input type="file" id="regInsCardFront" accept="image/*,.pdf" className="emergency-form-control" style={{ padding: 6 }}
                onChange={(e) => setFrontFile(e.target.files?.[0] || null)} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--color-muted-fg)' }}>
              Insurance card — back
              <input type="file" id="regInsCardBack" accept="image/*,.pdf" className="emergency-form-control" style={{ padding: 6 }}
                onChange={(e) => setBackFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <div id="regInsUploadStatus" style={{ fontSize: 11, color: 'var(--color-muted-fg)', marginTop: 6 }}>{uploadStatus}</div>
        </div>

        <div className="emergency-modal-actions">
          <button className="btn reject" type="button" onClick={onClose}>Cancel</button>
          <button className="btn green" type="button" onClick={submit}>Create Patient Record</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

*/
