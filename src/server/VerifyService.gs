/**
 * Verification management service (organizer side)
 */

/**
 * Revokes a certificate by ID
 * @param {string} projectId 
 * @param {string} certId 
 * @returns {{ok: boolean}}
 */
function revokeCertificate(projectId, certId) {
  const { ss } = openProject_(projectId);
  const sh = ss.getSheetByName('Participants');
  const data = sh.getDataRange().getValues();

  for (let r = 1; r < data.length; r++) {
    if (data[r][COL.cert_id] === certId) {
      writeRow_(sh, r + 1, { validity: 'revoked' });
      audit_(ss, 'cert_revoked', 'certId=' + certId);
      return { ok: true };
    }
  }
  throw new Error('Certificate ID not found: ' + certId);
}

/**
 * Restores a revoked certificate to valid
 * @param {string} projectId 
 * @param {string} certId 
 * @returns {{ok: boolean}}
 */
function restoreCertificate(projectId, certId) {
  const { ss } = openProject_(projectId);
  const sh = ss.getSheetByName('Participants');
  const data = sh.getDataRange().getValues();

  for (let r = 1; r < data.length; r++) {
    if (data[r][COL.cert_id] === certId) {
      writeRow_(sh, r + 1, { validity: 'valid' });
      audit_(ss, 'cert_restored', 'certId=' + certId);
      return { ok: true };
    }
  }
  throw new Error('Certificate ID not found: ' + certId);
}
