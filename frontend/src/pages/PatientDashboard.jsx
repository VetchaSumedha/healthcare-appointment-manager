import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function PatientDashboard() {
  const [doctors, setDoctors] = useState([]);
  const [specialisation, setSpecialisation] = useState('');
  const [appointments, setAppointments] = useState([]);

  async function loadDoctors() {
    const { data } = await api.get('/doctors', { params: specialisation ? { specialisation } : {} });
    setDoctors(data.doctors);
  }

  async function loadAppointments() {
    const { data } = await api.get('/appointments/mine');
    setAppointments(data.appointments);
  }

  useEffect(() => {
    loadDoctors();
    loadAppointments();
  }, []);

  async function cancelAppointment(id) {
    if (!confirm('Cancel this appointment?')) return;
    await api.post(`/appointments/${id}/cancel`, {});
    loadAppointments();
  }

  return (
    <div>
      <h2>Find a doctor</h2>
      <div className="card">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Search by specialisation (e.g. Cardiology)"
            value={specialisation}
            onChange={(e) => setSpecialisation(e.target.value)}
          />
          <button className="btn" onClick={loadDoctors} style={{ height: 40 }}>
            Search
          </button>
        </div>
      </div>

      {doctors.map((d) => (
        <div className="card" key={d.id}>
          <h3>{d.User.name}</h3>
          <p>{d.specialisation}</p>
          <p style={{ color: '#667' }}>{d.bio}</p>
          <Link className="btn" to={`/patient/book/${d.id}`}>
            Book appointment
          </Link>
        </div>
      ))}

      <h2>My appointments</h2>
      {appointments.length === 0 && <p>No appointments yet.</p>}
      {appointments.map((a) => (
        <div className="card" key={a.id}>
          <p>
            <b>Dr. {a.doctor?.User?.name}</b> ({a.doctor?.specialisation}) &mdash;{' '}
            {new Date(a.slotStart).toLocaleString()}
          </p>
          <p>Status: {a.status}</p>
          {a.SymptomForm?.aiSummary && (
            <p>
              <span className={`badge ${a.SymptomForm.aiSummary.urgency?.toLowerCase()}`}>
                {a.SymptomForm.aiSummary.urgency} urgency
              </span>
            </p>
          )}
          {a.status === 'confirmed' && (
            <button className="btn danger" onClick={() => cancelAppointment(a.id)}>
              Cancel
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
