/**
 * Automated test suite for backend services
 * Run this function from Apps Script Editor to verify the backend foundation
 */

function runBackendVerificationTests() {
  console.log('=== Starting Backend Verification Tests ===');

  // Test 1: Bootstrap Registry
  console.log('Test 1: Bootstrapping user registry...');
  const boot = bootstrap();
  if (!boot.registryId) throw new Error('Test 1 Failed: Registry ID missing');
  console.log('✓ Test 1 Passed: Registry ID = ' + boot.registryId);

  // Test 2: Project Creation
  console.log('Test 2: Creating a test project...');
  const proj = createProject({
    name: 'Automated Test Project ' + new Date().toISOString(),
    organization: 'Test College of Engineering',
    event_name: 'Hackathon 2026',
    event_date: '2026-11-20',
    cert_type: 'Participation'
  });
  if (!proj.projectId) throw new Error('Test 2 Failed: Project ID not returned');
  console.log('✓ Test 2 Passed: Project ID = ' + proj.projectId);

  // Test 3: List Projects
  console.log('Test 3: Listing user projects...');
  const list = listProjects();
  const found = list.find(p => p.project_id === proj.projectId);
  if (!found) throw new Error('Test 3 Failed: Created project not found in list');
  console.log('✓ Test 3 Passed: Found project in list');

  // Test 4: Save 3 Participants
  console.log('Test 4: Saving 3 sample participants...');
  const sampleParticipants = [
    {
      name: 'Ravi Kumar',
      email: 'ravi.test@example.com',
      college: 'Test College',
      department: 'CSE',
      reg_no: 'CSE001',
      position: 'Participant',
      cert_id: 'TEST-001',
      verify_token: 'tok001abc'
    },
    {
      name: 'Deepa Varma',
      email: 'deepa.test@example.com',
      college: 'Test College',
      department: 'ECE',
      reg_no: 'ECE002',
      position: 'Runner Up',
      cert_id: 'TEST-002',
      verify_token: 'tok002def'
    },
    {
      name: 'Dr. Montgomery Longname Testing autoShrink and limits',
      email: 'monty.test@example.com',
      college: 'Test College',
      department: 'MECH',
      reg_no: 'ME003',
      position: '1st Place',
      cert_id: 'TEST-003',
      verify_token: 'tok003ghi'
    }
  ];

  const saveRes = saveParticipants(proj.projectId, sampleParticipants);
  if (saveRes.saved !== 3) throw new Error('Test 4 Failed: Expected 3 saved, got ' + saveRes.saved);
  console.log('✓ Test 4 Passed: Saved 3 participants');

  // Test 5: Read Participants Back
  console.log('Test 5: Reading participants back...');
  const readBack = getParticipants(proj.projectId);
  if (readBack.length !== 3) throw new Error('Test 5 Failed: Expected 3 participants, got ' + readBack.length);
  if (readBack[0].name !== 'Ravi Kumar') throw new Error('Test 5 Failed: Name mismatch on participant 0');
  console.log('✓ Test 5 Passed: Successfully verified 3 saved participants');

  // Test 6: Verify Stats
  console.log('Test 6: Checking stats computation...');
  const stats = getParticipantStats(proj.projectId);
  if (stats.total !== 3 || stats.pending !== 3) {
    throw new Error('Test 6 Failed: Stats mismatch ' + JSON.stringify(stats));
  }
  console.log('✓ Test 6 Passed: Participant stats verified: ' + JSON.stringify(stats));

  console.log('=== All 6 Backend Verification Tests Passed! ===');
  return { ok: true, projectId: proj.projectId, testCount: 6 };
}
