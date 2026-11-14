/**
 * File Service: Drive uploads and PDF file storage
 */

/**
 * Saves a generated PDF into the project's certificates folder and marks participant as Generated
 * @param {string} projectId 
 * @param {number} rowNum 
 * @param {string} filename 
 * @param {string} b64 
 * @returns {{fileId: string}}
 */
function savePdf(projectId, rowNum, filename, b64) {
  const { ss, folder } = openProject_(projectId);
  const dir = getOrCreateFolder_('certificates', folder);
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'application/pdf', filename);
  const f = dir.createFile(blob);

  const sh = ss.getSheetByName('Participants');
  writeRow_(sh, rowNum, {
    pdf_file_id: f.getId(),
    gen_status: 'Generated'
  });

  return { fileId: f.getId() };
}

/**
 * Uploads an asset (logo, signature, or background image) to the project's uploads folder
 * @param {string} projectId 
 * @param {string} filename 
 * @param {string} mimeType 
 * @param {string} b64 
 * @returns {{fileId: string, url: string}}
 */
function uploadAsset(projectId, filename, mimeType, b64) {
  const { folder } = openProject_(projectId);
  const dir = getOrCreateFolder_('uploads', folder);
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), mimeType, filename);
  const file = dir.createFile(blob);
  return {
    fileId: file.getId(),
    url: file.getUrl()
  };
}
