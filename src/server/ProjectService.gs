/**
 * Project Service: CRUD operations and workspace setup
 */

/**
 * Creates a new project with dedicated spreadsheet and Drive folder
 * @param {Object} p 
 * @returns {{projectId: string, sheetId: string, folderId: string}}
 */
function createProject(p) {
  const root = getOrCreateFolder_(CFG.ROOT_FOLDER);
  const id = Utilities.getUuid().slice(0, 8);
  const folder = root.createFolder('Project_' + id + '_' + (p.name || 'Untitled'));
  folder.createFolder('certificates');
  folder.createFolder('uploads');

  const ss = SpreadsheetApp.create('CertGen - ' + (p.name || 'Untitled'));
  DriveApp.getFileById(ss.getId()).moveTo(folder);

  // Setup Participants sheet
  const sh = ss.getSheets()[0].setName('Participants');
  sh.getRange(1, 1, 1, P_COLS.length).setValues([P_COLS]).setFontWeight('bold');
  sh.setFrozenRows(1);

  // Setup supplementary sheets
  ['Mapping', 'EmailLog', 'Audit', 'Control'].forEach(sheetName => {
    ss.insertSheet(sheetName);
  });

  // Setup Control sheet
  ss.getSheetByName('Control').getRange(1, 1, 4, 2).setValues([
    ['run_state', 'idle'],
    ['batch_size', CFG.DEFAULT_BATCH_SIZE],
    ['subject', ''],
    ['cursor', 1]
  ]);

  // Register in user's Registry
  registry_().getSheetByName('Projects').appendRow([
    id,
    p.name || 'Untitled Project',
    p.organization || '',
    p.event_name || '',
    p.event_date || '',
    p.cert_type || 'Participation',
    p.template_id || '',
    ss.getId(),
    folder.getId(),
    Session.getActiveUser().getEmail(),
    'draft',
    new Date()
  ]);

  audit_(ss, 'project_created', p.name || 'Untitled Project');

  return {
    projectId: id,
    sheetId: ss.getId(),
    folderId: folder.getId()
  };
}

/**
 * Lists all projects owned by the authenticated user
 * @returns {Array<Object>}
 */
function listProjects() {
  const reg = registry_();
  const sh = reg.getSheetByName('Projects');
  const values = sh.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values.shift();
  return values.map(row => {
    return Object.fromEntries(
      headers.map((h, i) => [
        h,
        row[i] instanceof Date ? row[i].toISOString() : row[i]
      ])
    );
  });
}

/**
 * Opens a project spreadsheet and folder with ownership check
 * @param {string} projectId 
 * @returns {{ss: GoogleAppsScript.Spreadsheet.Spreadsheet, folder: GoogleAppsScript.Drive.Folder, row: Array}}
 */
function openProject_(projectId) {
  const rows = registry_().getSheetByName('Projects').getDataRange().getValues();
  const row = rows.find((r, i) => i > 0 && r[0] === projectId);
  if (!row) {
    throw new Error('Project not found or unauthorized access: ' + projectId);
  }
  return {
    ss: SpreadsheetApp.openById(row[7]),
    folder: DriveApp.getFolderById(row[8]),
    row: row
  };
}

/**
 * Retrieves details of a specific project
 * @param {string} projectId 
 * @returns {Object}
 */
function getProject(projectId) {
  const { row } = openProject_(projectId);
  return {
    projectId: row[0],
    name: row[1],
    organization: row[2],
    event_name: row[3],
    event_date: row[4],
    cert_type: row[5],
    template_id: row[6],
    sheetId: row[7],
    folderId: row[8],
    sender_email: row[9],
    status: row[10],
    created_at: row[11] instanceof Date ? row[11].toISOString() : row[11]
  };
}

/**
 * Updates project metadata
 * @param {Object} p 
 * @returns {{ok: boolean}}
 */
function updateProject(p) {
  const reg = registry_();
  const sh = reg.getSheetByName('Projects');
  const values = sh.getDataRange().getValues();
  const rowIndex = values.findIndex((r, i) => i > 0 && r[0] === p.projectId);
  if (rowIndex < 0) throw new Error('Project not found: ' + p.projectId);

  const rowNum = rowIndex + 1;
  const current = values[rowIndex];

  sh.getRange(rowNum, 2, 1, 6).setValues([[
    p.name !== undefined ? p.name : current[1],
    p.organization !== undefined ? p.organization : current[2],
    p.event_name !== undefined ? p.event_name : current[3],
    p.event_date !== undefined ? p.event_date : current[4],
    p.cert_type !== undefined ? p.cert_type : current[5],
    p.template_id !== undefined ? p.template_id : current[6]
  ]]);

  return { ok: true };
}

/**
 * Duplicates a project (cloning settings and template reference, without participants)
 * @param {string} projectId 
 * @param {string} [newName] 
 * @returns {{projectId: string}}
 */
function duplicateProject(projectId, newName) {
  const orig = getProject(projectId);
  const created = createProject({
    name: newName || (orig.name + ' (Copy)'),
    organization: orig.organization,
    event_name: orig.event_name,
    event_date: orig.event_date,
    cert_type: orig.cert_type,
    template_id: orig.template_id
  });
  return created;
}

/**
 * Permanently deletes a project, moving its Drive folder and sheet to trash
 * @param {string} projectId 
 * @returns {{ok: boolean}}
 */
function deleteProject(projectId) {
  const reg = registry_();
  const sh = reg.getSheetByName('Projects');
  const values = sh.getDataRange().getValues();
  const rowIndex = values.findIndex((r, i) => i > 0 && r[0] === projectId);
  if (rowIndex < 0) throw new Error('Project not found: ' + projectId);

  const row = values[rowIndex];
  const sheetId = row[7];
  const folderId = row[8];

  // Move Drive folder & spreadsheet to trash
  try {
    if (folderId) DriveApp.getFolderById(folderId).setTrashed(true);
  } catch (e) {
    console.warn('Could not trash folder: ' + folderId, e);
  }
  try {
    if (sheetId) DriveApp.getFileById(sheetId).setTrashed(true);
  } catch (e) {
    console.warn('Could not trash sheet: ' + sheetId, e);
  }

  // Delete row from registry
  sh.deleteRow(rowIndex + 1);

  return { ok: true };
}
