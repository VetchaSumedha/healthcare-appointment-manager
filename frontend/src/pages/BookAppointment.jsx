import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function BookAppointment() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState([]);
  const [onLeave, setOnLeave] = useState(false);
  const [hold, setHold] = useState(null); // { holdId, expiresAt, slotStart }
  const [symptoms, setSymptoms] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(null);

  async function loadSlots() {
    setError('');
    setHold(null);
    const { data } = await api.get(`/doctors/${doctorId}/slots`, { params: { date } });
    setSlots(data.slots);
    setOnLeave(data.onLeave);
  }

  useEffect(() => {
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function pickSlot(slot) {
    setError('');
    try {
      const { data } = await api.post('/appointments/hold', {
        doctorId,
        slotStart: slot.start,
        slotEnd: slot.end,
      });
      setHold({ holdId: data.holdId, expiresAt: data.expiresAt, slotStart: slot.start });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not hold this slot');
      loadSlots();
    }
  }

  async function confirmBooking(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/appointments/confirm', { holdId: hold.holdId, symptomsText: symptoms });
      setConfirmed(data.appointment);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not confirm booking');
      setHold(null);
      loadSlots();
    }
  }

  if (confirmed) {
    return (
      <div className="card">
        <h2>Appointment confirmed!</h2>
        <p>Your appointment is booked for {new Date(confirmed.slotStart).toLocaleString()}.</p>
        <p>You'll receive a confirmation email and a reminder before your visit.</p>
        <button className="btn" onClick={() => navigate('/patient')}>
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2>Book an appointment</h2>
      {error && <div className="error">{error}</div>}

      {!hold && (
        <div className="card">
          <label>Date</label>
          <input type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} />
          {onLeave && <p className="error">Doctor is on leave this day.</p>}
          {!onLeave && slots.length === 0 && <p>No available slots for this date.</p>}
          <div className="slot-grid">
            {slots.map((s) => (
              <button key={s.start} className="slot-btn" onClick={() => pickSlot(s)}>
                {new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </button>
            ))}
          </div>
        </div>
      )}

      {hold && (
        <div className="card">
          <p>
            Holding slot at <b>{new Date(hold.slotStart).toLocaleString()}</b>. Please complete the symptom
            form to confirm (hold expires at {new Date(hold.expiresAt).toLocaleTimeString()}).
          </p>
          <form onSubmit={confirmBooking}>
            <label>Describe your symptoms</label>
            <textarea rows={4} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} required />
            <button className="btn" type="submit">
              Confirm appointment
            </button>
            <button
              type="button"
              className="btn secondary"
              style={{ marginLeft: 8 }}
              onClick={() => {
                setHold(null);
                loadSlots();
              }}
            >
              Choose a different slot
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
