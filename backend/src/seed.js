require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User, DoctorProfile } = require('./models');

async function seed() {
  await sequelize.sync({ alter: true });

  const adminEmail = 'admin@clinic.com';
  const existingAdmin = await User.findOne({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('Admin@123', 10);
    await User.create({ name: 'Clinic Admin', email: adminEmail, passwordHash, role: 'admin' });
    console.log(`Created admin: ${adminEmail} / Admin@123`);
  }

  const doctorEmail = 'dr.smith@clinic.com';
  let doctorUser = await User.findOne({ where: { email: doctorEmail } });
  if (!doctorUser) {
    const passwordHash = await bcrypt.hash('Doctor@123', 10);
    doctorUser = await User.create({ name: 'Dr. Jane Smith', email: doctorEmail, passwordHash, role: 'doctor' });
    await DoctorProfile.create({
      userId: doctorUser.id,
      specialisation: 'General Medicine',
      slotDurationMinutes: 30,
      workingHours: {
        mon: { start: '09:00', end: '13:00' },
        tue: { start: '09:00', end: '13:00' },
        wed: { start: '09:00', end: '13:00' },
        thu: { start: '09:00', end: '13:00' },
        fri: { start: '09:00', end: '13:00' },
        sat: null,
        sun: null,
      },
      bio: 'General physician with 10 years of experience.',
    });
    console.log(`Created doctor: ${doctorEmail} / Doctor@123`);
  }

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
