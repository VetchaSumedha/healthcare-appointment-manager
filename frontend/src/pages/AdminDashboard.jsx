import { useEffect, useState } from 'react';
import api from '../api/client';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function NewDoctorForm({ onCreated }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    specialisation: '',
    slotDurationMinutes: 30,
  });
  const [workingDays, setWorkingDays] = useState({ mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false });
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const workingHours = {};
    DAYS.forEach((d) => {
      workingHours[d] = workingDays[d] ? { start, end } : null;
    });
    try {
      await api.post('/admin/doctors', { ...form, workingHours });
      setForm({ name: '', email: '', password: '', specialisation: '', slotDurationMinutes: 30 });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create doctor');
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <h3>Add doctor</h3>
      {error && <div className="error">{error}</div>}
      <label>Name</label>
      <input value={form.name} onChange={(e) => update('name', e.target.value)} required />
      <label>Email</label>
      <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
      <label>Temporary password</label>
      <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required />
      <label>Specialisation</label>
      <input value={form.specialisation} onChange={(e) => update('specialisation', e.target.value)} required />
      <label>Slot duration (minutes)</label>
      <input
        type="number"
        value={form.slotDurationMinutes}
        onChange={(e) => update('slotDurationMinutes', Number(e.target.value))}
      />
      <label>Working days</label>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {DAYS.map((d) => (
          <label key={d} style={{ display: 'flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={workingDays[d]}
              onChange={(e) => setWorkingDays((w) => ({ ...w, [d]: e.target.checked }))}
            />
            {d}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label>Start time</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label>End time</label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <button className="btn" type="submit">
        Create doctor
      </button>
    </form>
  );
}

function LeaveForm({ doctor, onSet }) {
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const { data } = await api.post(`/admin/doctors/${doctor.id}/leave`, { date, reason });
    setResult(data);
    onSet();
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
      <div>
        <label>Leave date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div style={{ flex: 1 }}>
        <label>Reason</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <button className="btn secondary" type="submit" style={{ height: 40 }}>
        Mark on leave
      </button>
      {result && <span style={{ fontSize: 12 }}>{result.affectedAppointments} patient(s) notified</span>}
    </form>
  );
}

export default function AdminDashboard() {
  const [doctors, setDoctors] = useState([]);

  async function load() {
    const { data } = await api.get('/admin/doctors');
    setDoctors(data.doctors);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h2>Admin: Doctors</h2>
      <NewDoctorForm onCreated={load} />
      {doctors.map((d) => (
        <div className="card" key={d.id}>
          <h3>{d.User.name}</h3>
          <p>
            {d.specialisation} &mdash; {d.slotDurationMinutes} min slots
          </p>
          <LeaveForm doctor={d} onSet={load} />
        </div>
      ))}
    </div>
  );
}
