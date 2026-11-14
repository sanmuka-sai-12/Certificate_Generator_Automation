/**
 * Template Service: Save, load, and manage certificate JSON templates
 */

/**
 * Saves a certificate design template to Drive and registers it
 * @param {{name: string, json: string, thumb: string}} t 
 * @returns {{templateId: string}}
 */
function saveTemplate(t) {
  const root = getOrCreateFolder_(CFG.ROOT_FOLDER);
  const folder = getOrCreateFolder_('_templates', root);
  const id = Utilities.getUuid().slice(0, 8);

  const jf = folder.createFile(id + '.json', t.json, 'application/json');
  const tf = folder.createFile(id + '_thumb.txt', t.thumb || '', 'text/plain');

  registry_().getSheetByName('Templates').appendRow([
    id,
    t.name || 'Untitled Template',
    'designer',
    jf.getId(),
    tf.getId(),
    new Date()
  ]);

  return { templateId: id };
}

/**
 * Loads a certificate design JSON from Drive
 * @param {string} id 
 * @returns {string} JSON string
 */
function loadTemplate(id) {
  const v = registry_().getSheetByName('Templates').getDataRange().getValues();
  const r = v.find((x, i) => i > 0 && x[0] === id);
  if (!r) throw new Error('Template not found: ' + id);
  return DriveApp.getFileById(r[3]).getBlob().getDataAsString();
}

/**
 * Lists all available templates
 * @returns {Array<Object>}
 */
function listTemplates() {
  const v = registry_().getSheetByName('Templates').getDataRange().getValues();
  if (v.length <= 1) return [];
  const head = v.shift();
  return v.map(r => ({
    templateId: r[0],
    name: r[1],
    type: r[2],
    jsonFileId: r[3],
    thumbFileId: r[4],
    createdAt: r[5] instanceof Date ? r[5].toISOString() : r[5]
  }));
}

/**
 * Deletes a template
 * @param {string} id 
 * @returns {{ok: boolean}}
 */
function deleteTemplate(id) {
  const sh = registry_().getSheetByName('Templates');
  const v = sh.getDataRange().getValues();
  const idx = v.findIndex((x, i) => i > 0 && x[0] === id);
  if (idx < 0) throw new Error('Template not found: ' + id);

  const row = v[idx];
  try { if (row[3]) DriveApp.getFileById(row[3]).setTrashed(true); } catch (e) {}
  try { if (row[4]) DriveApp.getFileById(row[4]).setTrashed(true); } catch (e) {}

  sh.deleteRow(idx + 1);
  return { ok: true };
}
