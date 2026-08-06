const { getDb, initDb } = require('./db');

async function seed() {
  
  await initDb();
  
  const db = await getDb();

  const users = [
    { name: 'System Admin', email: 'admin@lnmiit.ac.in', role: 'admin' }
  ];

  for (const user of users) {
    const existing = await db.get('SELECT * FROM users WHERE email = ?', [user.email]);
    if (!existing) {
      await db.run(
        'INSERT INTO users (name, email, role) VALUES (?, ?, ?)',
        [user.name, user.email, user.role]
      );
      console.log(`Seeded user: ${user.name} (${user.role})`);
    } else {
      console.log(`User already exists: ${user.name}`);
    }
  }

  const resources = [
    {
      name: 'Central Seminar Hall',
      description: 'Air-conditioned seminar hall with 200 capacity and projector support.',
      location: 'Main Building, Ground Floor',
      category: 'hall',
      openTime: '09:00',
      closeTime: '18:00',
      availableDays: '1,2,3,4,5,6', 
      shifts: '09:00-18:00' 
    },
    {
      name: 'LT-1 Lecture Theatre',
      description: 'Large lecture theatre for exams, guest lectures, and presentations.',
      location: 'Academic Block 1',
      category: 'hall',
      openTime: '08:00',
      closeTime: '18:00',
      availableDays: '1,2,3,4,5,6', 
      shifts: '08:00-12:00,14:00-18:00' 
    },
    {
      name: 'Music Room',
      description: 'Sound-proof room equipped with drums, keyboards, and acoustic/electric guitars.',
      location: 'Student Activity Center, 1st Floor',
      category: 'room',
      openTime: '16:00',
      closeTime: '22:00',
      availableDays: '1,2,3,4,5', 
      shifts: '16:00-18:00,20:00-22:00' 
    },
    {
      name: 'Advanced Electronics Lab',
      description: 'Equipped with digital oscilloscopes, spectrum analyzers, and micro-controller boards.',
      location: 'ECE Department Building, Room 204',
      category: 'room',
      openTime: '09:00',
      closeTime: '21:00',
      availableDays: '1,2,3,4,5', 
      shifts: '09:00-12:00,13:00-18:00,19:00-21:00' 
    },
    {
      name: 'Sony DSLR Alpha 7 III',
      description: 'Professional mirrorless camera with 28-70mm lens kit. Handed out for official events.',
      location: 'Media Club Desk, SAC',
      category: 'equipment',
      openTime: '09:00',
      closeTime: '17:00',
      availableDays: '1,2,3,4,5', 
      shifts: '09:00-17:00'
    },
    {
      name: 'Epson Projector P3',
      description: 'Portable high-brightness HDMI projector with tripod stand.',
      location: 'Central IT Store, Library Building',
      category: 'equipment',
      openTime: '09:00',
      closeTime: '18:00',
      availableDays: '1,2,3,4,5', 
      shifts: '09:00-18:00'
    },
    {
      name: 'Robotics Club Kit B',
      description: 'Arduino/Raspberry Pi kit with assorted sensors, motors, and chassis parts.',
      location: 'Robotics Lab, SAC Room 5',
      category: 'equipment',
      openTime: '10:00',
      closeTime: '18:00',
      availableDays: '1,2,3,4,5,6', 
      shifts: '10:00-18:00'
    }
  ];

  for (const res of resources) {
    const existing = await db.get('SELECT * FROM resources WHERE name = ?', [res.name]);
    if (!existing) {
      await db.run(
        `INSERT INTO resources (name, description, location, category, openTime, closeTime, availableDays, shifts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [res.name, res.description, res.location, res.category, res.openTime, res.closeTime, res.availableDays, res.shifts]
      );
      console.log(`Seeded resource: ${res.name} (Shifts: ${res.shifts})`);
    } else {
      
      await db.run(
        `UPDATE resources SET availableDays = ?, shifts = ? WHERE name = ?`,
        [res.availableDays, res.shifts, res.name]
      );
      console.log(`Updated operating days & shifts for existing resource: ${res.name}`);
    }
  }

  console.log('Database seeding complete.');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}

module.exports = seed;
