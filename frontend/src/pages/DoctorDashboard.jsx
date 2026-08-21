import { useEffect, useState } from 'react';
import api from '../api/client';

function VisitNoteForm({ appointment, onSubmitted }) {
  const [doctorNotes, setDoctorNotes] = useState('');
  const [prescriptionText, setPrescriptionText] = useState('');
  const [meds, setMeds] = useState([{ medication: '', dosage: '', timesPerDay: 1, durationDays: 5 }]);
  const [error, setError] = useState('');

  function updateMed(i, field, value) {
    setMeds((m) => m.map((med, idx) => (idx === i ? { ...med, [field]: value } : med)));
  }
  function addMed() {
    setMeds((m) => [...m, { medication: '', dosage: '', timesPerDay: 1, durationDays: 5 }]);
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/appointments/${appointment.id}/visit-note`, {
        doctorNotes,
        prescriptionText,
        prescriptionStructured: meds.filter((m) => m.medication),
      });
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit visit note');
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
      {error && <div className="error">{error}</div>}
      <label>Clinical notes</label>
      <textarea rows={3} value={doctorNotes} onChange={(e) => setDoctorNotes(e.target.value)} required />
      <label>Prescription (free text, optional)</label>
      <textarea rows={2} value={prescriptionText} onChange={(e) => setPrescriptionText(e.target.value)} />
      <label>Medications (for reminders)</label>
      {meds.map((m, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input placeholder="Name" value={m.medication} onChange={(e) => updateMed(i, 'medication', e.target.value)} />
          <input placeholder="Dosage" value={m.dosage} onChange={(e) => updateMed(i, 'dosage', e.target.value)} />
          <input
            type="number"
            placeholder="x/day"
            value={m.timesPerDay}
            onChange={(e) => updateMed(i, 'timesPerDay', Number(e.target.value))}
            style={{ width: 80 }}
          />
          <input
            type="number"
            placeholder="days"
            value={m.durationDays}
            onChange={(e) => updateMed(i, 'durationDays', Number(e.target.value))}
            style={{ width: 80 }}
          />
        </div>
      ))}
      <button type="button" className="btn secondary" onClick={addMed}>
        + Add medication
      </button>
      <div style={{ marginTop: 12 }}>
        <button className="btn" type="submit">
          Submit visit note
        </button>
      </div>
    </form>
  );
}

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [openNoteFor, setOpenNoteFor] = useState(null);

  async function load() {
    const { data } = await api.get('/doctors/me/appointments');
    setAppointments(data.appointments);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h2>My appointments</h2>
      {appointments.length === 0 && <p>No appointments scheduled.</p>}
      {appointments.map((a) => (
        <div className="card" key={a.id}>
          <p>
            <b>{a.patient.name}</b> &mdash; {new Date(a.slotStart).toLocaleString()} &mdash; Status: {a.status}
          </p>
          {a.SymptomForm && (
            <div style={{ background: '#f7f9fa', padding: 10, borderRadius: 6, marginBottom: 10 }}>
              <p style={{ margin: 0 }}>
                <b>Symptoms:</b> {a.SymptomForm.symptomsText}
              </p>
              {a.SymptomForm.aiStatus === 'success' && a.SymptomForm.aiSummary && (
                <>
                  <p style={{ margin: '6px 0' }}>
                    <span className={`badge ${a.SymptomForm.aiSummary.urgency?.toLowerCase()}`}>
                      {a.SymptomForm.aiSummary.urgency} urgency
                    </span>
                  </p>
                  <p style={{ margin: '6px 0' }}>
                    <b>Chief complaint:</b> {a.SymptomForm.aiSummary.chiefComplaint}
                  </p>
                  <p style={{ margin: '6px 0' }}>
                    <b>Suggested questions:</b>
                  </p>
                  <ul style={{ margin: 0 }}>
                    {a.SymptomForm.aiSummary.suggestedQuestions?.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </>
              )}
              {a.SymptomForm.aiStatus === 'failed' && (
                <p style={{ color: '#c0392b', margin: '6px 0' }}>
                  AI summary unavailable ({a.SymptomForm.aiError}). Please review symptoms manually.
                </p>
              )}
              {a.SymptomForm.aiStatus === 'pending' && <p style={{ color: '#888' }}>Generating AI summary...</p>}
            </div>
          )}

          {a.status === 'confirmed' && openNoteFor !== a.id && (
            <button className="btn" onClick={() => setOpenNoteFor(a.id)}>
              Add visit note
            </button>
          )}
          {openNoteFor === a.id && (
            <VisitNoteForm
              appointment={a}
              onSubmitted={() => {
                setOpenNoteFor(null);
                load();
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
