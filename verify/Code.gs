/**
 * Public Certificate Verification Service
 * Deployed as: Execute as Me, Access: Anyone (Anonymous)
 */

function doGet(e) {
  const id = String((e && e.parameter && e.parameter.id) || '').trim();
  const token = String((e && e.parameter && e.parameter.t) || '').trim();

  const regId = PropertiesService.getScriptProperties().getProperty('REGISTRY_ID');
  if (!regId) {
    return HtmlService.createHtmlOutput('<h3>Verification system not configured.</h3>')
      .setTitle('Certificate Verification');
  }

  const sh = SpreadsheetApp.openById(regId).getSheetByName('Certs');
  if (!sh) {
    return HtmlService.createHtmlOutput('<h3>Certificate registry not found.</h3>')
      .setTitle('Certificate Verification');
  }

  const v = sh.getDataRange().getValues();
  const hit = v.find((r, i) => i > 0 && r[0] === id && r[1] === token);

  let statusClass = 'not-found';
  let bodyContent = '';

  if (!hit) {
    bodyContent = `
      <div class="badge badge-error">Not Found</div>
      <h2>Invalid Certificate</h2>
      <p>This certificate could not be verified in the official registry.</p>
    `;
  } else if (hit[7] !== 'valid') {
    statusClass = 'revoked';
    bodyContent = `
      <div class="badge badge-warning">Revoked</div>
      <h2>Certificate Revoked</h2>
      <p>This certificate was previously issued but has since been revoked by the issuing authority.</p>
      <div class="details">
        <b>Recipient:</b> ${esc(hit[2])}<br>
        <b>Event:</b> ${esc(hit[3])}<br>
        <b>Certificate ID:</b> ${esc(id)}
      </div>
    `;
  } else {
    statusClass = 'valid';
    bodyContent = `
      <div class="badge badge-success">✓ Verified Valid</div>
      <h2>Official Certificate</h2>
      <div class="details">
        <p><b>Recipient:</b> ${esc(hit[2])}</p>
        <p><b>Event:</b> ${esc(hit[3])}</p>
        <p><b>Organization:</b> ${esc(hit[4])}</p>
        <p><b>Award:</b> ${esc(hit[5])}</p>
        <p><b>Issued Date:</b> ${esc(hit[6])}</p>
        <p><b>Certificate ID:</b> <code>${esc(id)}</code></p>
      </div>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Certificate Verification</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 16px; }
        .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; max-width: 480px; width: 100%; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; }
        .badge { display: inline-block; padding: 6px 14px; border-radius: 9999px; font-weight: 600; font-size: 0.85rem; margin-bottom: 16px; }
        .badge-success { background: #dcfce7; color: #15803d; }
        .badge-warning { background: #fef9c3; color: #854d0e; }
        .badge-error { background: #fee2e2; color: #b91c1c; }
        h2 { margin: 0 0 12px 0; font-size: 1.4rem; }
        p { color: #64748b; font-size: 0.95rem; margin: 8px 0; line-height: 1.5; }
        .details { text-align: left; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 20px; font-size: 0.9rem; }
        .details p { margin: 6px 0; color: #334155; }
        code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem; }
      </style>
    </head>
    <body>
      <div class="card ${statusClass}">
        ${bodyContent}
      </div>
    </body>
    </html>
  `;

  return HtmlService.createHtmlOutput(html).setTitle('Certificate Verification');
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
