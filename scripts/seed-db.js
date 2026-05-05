const { createUser, createRecord } = require('../src/db');

async function seedDatabase() {
  try {
    console.log('Seeding database with test data...');

    // Create test users
    const student1 = await createUser({
      isTeacher: false,
      studId: '2024-0012',
      firstName: 'Elena',
      lastName: 'Garcia',
      year: 3,
      section: 1,
      groupName: 'Group A',
      password: 'student123',
    });

    const student2 = await createUser({
      isTeacher: false,
      studId: '2024-0089',
      firstName: 'Michael',
      lastName: 'Torres',
      year: 2,
      section: 2,
      groupName: 'Group B',
      password: 'student456',
    });

    const teacher1 = await createUser({
      isTeacher: true,
      firstName: 'Sarah',
      lastName: 'Jenkins',
      year: null,
      section: null,
      groupName: 'Faculty',
      password: 'teacher123',
    });

    console.log('? Created test users');

    // Create test records
    await createRecord({
      studId: '2024-0012',
      date: new Date().toISOString(),
      typeOfUndertaking: 'CS101 - Introduction to Computer Science',
      totalScore: 100,
      score: 92,
      remarks: 'Excellent performance',
    });

    await createRecord({
      studId: '2024-0012',
      date: new Date(Date.now() - 86400000).toISOString(),
      typeOfUndertaking: 'MATH201 - Calculus II',
      totalScore: 100,
      score: 85,
      remarks: 'Good understanding of concepts',
    });

    console.log('? Created test records');
    console.log('? Database seeded successfully');
    console.log('\nTest credentials:');
    console.log('Student ID: 2024-0012, Password: student123');
    console.log('Student ID: 2024-0089, Password: student456');
    console.log('Teacher: Use any ID, Password: teacher123');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();
