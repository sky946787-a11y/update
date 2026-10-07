'use strict';

import { useState } from 'react';
import { api } from '../../api/index.js';
import { toast } from '../../components/feedback/feedback.js';
import { sortDoctorsForDepartment, to24Hour } from './preHelpers.js';
import PrePopup, { DoctorOptions } from './PrePopup.jsx';

async function checkDoctorAvailability(doctorId, date, time24) {
  const [slots, allAppointments] = await Promise.all([
    api.doctors.availabilityForDoctor(doctorId),
    api.appointments.list(),
  ]);

  const allSlots = slots || [];
  const slotsOnDate = allSlots.filter((s) => String(s.available_date || '').slice(0, 10) === date);

  function toMinutes(t) {
    if (!t) return null;
    const parts = String(t).trim().split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1] || '0', 10);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }

  const reqMins = toMinutes(time24);
  const coveredBySlot = slotsOnDate.some((s) => {
    if (String(s.status || 'AVAILABLE').toUpperCase() !== 'AVAILABLE') return false;
    const start = toMinutes(s.start_time);
    const end = toMinutes(s.end_time);
    return start !== null && end !== null && reqMins !== null && reqMins >= start && reqMins < end;
  });

  if (slotsOnDate.length > 0 && !coveredBySlot) {
    return {
      available: false,
      reason: 'Doctor is not available at this time. Please select another time slot.',
    };
  }

  const docId = Number(doctorId);
  const conflict = (allAppointments || []).some((appt) => {
    if (Number(appt.doctor_id) !== docId) return false;
    if (appt.status === 'CANCELLED' || appt.status === 'COMPLETED') return false;

    const apptDate = (appt.appointment_date || '').slice(0, 10);
    if (apptDate !== date) return false;

    const apptMins = toMinutes((appt.appointment_time || '').slice(0, 5));
    return apptMins !== null && reqMins !== null && Math.abs(apptMins - reqMins) < 30;
  });

  if (conflict) {
    return {
      available: false,
      reason: 'Doctor is not available at this time. Please select another time slot.',
    };
  }

  return { available: true, reason: null };
}

/** Ported from openApprove / confirmApprove in PRE/js/requests.js. */
export default function ApprovePopup({ request, doctors, onClose, onDone }) {
  const [doctorId, setDoctorId] = useState(request?.doctor_id ? String(request.doctor_id) : '');

  // Parse the existing requested_time into its components so we can pre-fill
  // the three separate controls (hour, minute, meridiem).
  function parseInitialTime(rawTime) {
    const t24 = to24Hour(rawTime); // normalise to HH:MM
    if (!t24) return { hour: '', minute: '00', meridiem: 'AM' };
    const [h, m] = t24.split(':');
    const hourNum = parseInt(h, 10);
    if (Number.isNaN(hourNum)) return { hour: '', minute: m || '00', meridiem: 'AM' };
    const meridiem = hourNum >= 12 ? 'PM' : 'AM';
    const hour12 = hourNum % 12 || 12;
    return { hour: String(hour12), minute: m || '00', meridiem };
  }

  const init = parseInitialTime(request?.requested_time);
  const [hour, setHour] = useState(init.hour);
  const [minute, setMinute] = useState(init.minute);
  const [meridiem, setMeridiem] = useState(init.meridiem);

  // Availability error shown inline beneath the time picker.
  const [availError, setAvailError] = useState('');
  // Prevents double-click while the availability check is in flight.
  const [checking, setChecking] = useState(false);

  if (!request) return null;

  async function confirm() {
    if (!doctorId) {
      toast('Select a doctor', 'error');
      return;
    }

    // Clear any previous availability error before re-checking.
    setAvailError('');

    // Build the requested time in 24-hour format for the availability check.
    // If no hour is picked, fall back to the patient's originally requested time.
    let time24 = '';
    if (hour) {
      // Convert the selected 12-hour components to 24-hour for the check.
      let h = parseInt(hour, 10);
      if (meridiem === 'PM' && h < 12) h += 12;
      if (meridiem === 'AM' && h === 12) h = 0;
      time24 = `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } else {
      // Use the patient's originally requested time (converted to 24h).
      time24 = to24Hour(request.requested_time);
    }

    // Use the patient's requested date for the slot check.
    const date = (request.requested_date || '').slice(0, 10);

    if (!date || !time24) {
      setAvailError('Doctor is not available at this time. Please select another time slot.');
      return;
    }

    setChecking(true);
    let checkResult;
    try {
      checkResult = await checkDoctorAvailability(doctorId, date, time24);
    } catch (err) {
      checkResult = {
        available: false,
        reason: err.message || 'Doctor is not available at this time. Please select another time slot.',
      };
    } finally {
      setChecking(false);
    }

    if (!checkResult.available) {
      setAvailError(checkResult.reason || 'Doctor is not available at this time. Please select another time slot.');
      return;
    }

    // ── Doctor is available — proceed with normal approval ──
    try {
      const payload = { status: 'APPROVED', doctor_id: Number(doctorId) };

      // Build the 12-hour time string only when the user has picked an hour.
      // An empty hour keeps the patient's originally requested slot.
      if (hour) {
        const hh = String(hour).padStart(2, '0');
        const mm = String(minute).padStart(2, '0');
        payload.requested_time = `${hh}:${mm} ${meridiem}`;
      }

      await api.preRequests.update(request.pre_request_id, payload);
      onClose();
      toast('Approved', 'success');
      await onDone();
    } catch (err) {
      toast(err.message || 'Could not approve this request', 'error');
    }
  }

  // Clear the availability error whenever the doctor or time selection changes
  // so the user gets fresh feedback after adjusting.
  function handleDoctorChange(e) {
    setDoctorId(e.target.value);
    setAvailError('');
  }
  function handleHourChange(e) {
    setHour(e.target.value);
    setAvailError('');
  }
  function handleMinuteChange(e) {
    setMinute(e.target.value);
    setAvailError('');
  }
  function handleMeridiemChange(e) {
    setMeridiem(e.target.value);
    setAvailError('');
  }

  // Hour options 1–12
  const hourOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  // Minute options 00, 05, 10 … 55
  const minuteOptions = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

  const inputStyle = {
    border: '1px solid var(--border, #d1d5db)',
    borderRadius: 6,
    padding: '6px 8px',
    fontSize: 14,
    background: 'var(--surface, #fff)',
    color: 'var(--text-primary, #111)',
    cursor: 'pointer',
  };

  return (
    <PrePopup className="approve-popup" id="approvePopup" onClose={onClose}>
      <div className="approve-box">
        <div className="popup-header-block">
          <span className="popup-kicker popup-kicker-approve">Approval</span>
          <h2>Approve Appointment</h2>
          <p>Assign a doctor. Leave time empty to keep the patient&apos;s requested slot.</p>
        </div>
        <div className="popup-form-layout">
          <div className="popup-summary-row">
            <span className="popup-summary-pill">{request.patientName || 'Patient'}</span>
            <span className="popup-summary-pill">{request.department || 'General'}</span>
          </div>
          <div className="form-group">
            <label htmlFor="doctorSelect">Doctor</label>
            <select id="doctorSelect" className="custom-select popup-input" value={doctorId} onChange={handleDoctorChange}>
              <DoctorOptions doctors={doctors} department={request.department} sortFn={sortDoctorsForDepartment} />
            </select>
          </div>
          <div className="form-group">
            <label>Appointment Time</label>
            {/* AM/PM time picker: three separate selects so the user can
                explicitly choose hour, minute and meridiem without the
                browser's native time widget hiding AM/PM on some systems. */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Hour */}
              <select value={hour} onChange={handleHourChange} style={inputStyle} aria-label="Hour">
                <option value="">HH</option>
                {hourOptions.map((h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
                ))}
              </select>

              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-secondary)' }}>:</span>

              {/* Minute */}
              <select value={minute} onChange={handleMinuteChange} style={inputStyle} aria-label="Minute">
                {minuteOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              {/* AM / PM */}
              <select value={meridiem} onChange={handleMeridiemChange} style={{ ...inputStyle, fontWeight: 600 }} aria-label="AM or PM">
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
            <small className="popup-helper">Optional. Leave hour blank to keep the requested time.</small>

            {/* Availability error — shown only when the doctor is unavailable */}
            {availError && (
              <div style={{
                marginTop: 8,
                padding: '8px 12px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 6,
                color: '#991b1b',
                fontSize: 13,
                fontWeight: 500,
              }}>
                {availError}
              </div>
            )}
          </div>
        </div>
        <div className="popup-buttons">
          <button onClick={confirm} disabled={checking}>
            {checking ? 'Checking…' : 'Submit'}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </PrePopup>
  );
}
