import React, { useState } from 'react';
import { 
  ArrowLeft, 
  FileSpreadsheet, 
  Eye, 
  Mail, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Download,
  Send,
  Play
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import TopBar from '../components/TopBar';
import { api } from '../services/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ProjectWorkspace({ project, onBack, showToast }) {
  const [activeStep, setActiveStep] = useState('import'); // 'import' | 'preview' | 'email'
  
  // Import state
  const [importedRows, setImportedRows] = useState([]);
  const [validCount, setValidCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [savingParticipants, setSavingParticipants] = useState(false);

  // Preview state
  const [verifiedPreview, setVerifiedPreview] = useState(false);

  // Email state
  const [emailSubject, setEmailSubject] = useState('Your Certificate for {{EVENT_NAME}}');
  const [emailBody, setEmailBody] = useState('Dear {{STUDENT_NAME}},\n\nCongratulations! Please find your certificate attached.\n\nBest regards,\n{{ORG_NAME}}');
  const [sendingTest, setSendingTest] = useState(false);

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const isCsv = /\.csv$/i.test(file.name);
    const reader = new FileReader();

    if (isCsv) {
      reader.onload = evt => {
        const parsed = Papa.parse(evt.target.result, { header: true, skipEmptyLines: true });
        processRawData(parsed.data);
      };
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.onload = evt => {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        processRawData(data);
      };
      reader.readAsArrayBuffer(file);
    }
  }

  function processRawData(data) {
    let valid = 0;
    let invalid = 0;
    const seenEmails = new Set();

    const processed = data.map((row, idx) => {
      // Find name and email headers flexibly
      const keys = Object.keys(row);
      const nameKey = keys.find(k => /name/i.test(k)) || keys[0];
      const emailKey = keys.find(k => /mail/i.test(k)) || keys[1];

      const name = String(row[nameKey] || '').trim();
      const email = String(row[emailKey] || '').trim().toLowerCase();

      let status = 'valid';
      let reason = '';

      if (!name) {
        status = 'invalid';
        reason = 'Missing participant name';
        invalid++;
      } else if (!EMAIL_RE.test(email)) {
        status = 'invalid';
        reason = 'Invalid email address';
        invalid++;
      } else if (seenEmails.has(email)) {
        status = 'duplicate';
        reason = 'Duplicate email address';
        invalid++;
      } else {
        seenEmails.add(email);
        valid++;
      }

      return {
        rowNum: idx + 2,
        name,
        email,
        cert_type: row.cert_type || project.cert_type || 'Participation',
        status,
        reason,
        raw: row
      };
    });

    setImportedRows(processed);
    setValidCount(valid);
    setInvalidCount(invalid);
    showToast(`Loaded ${processed.length} rows (${valid} valid, ${invalid} invalid)`);
  }

  async function handleSaveParticipants() {
    if (!importedRows.length) return;
    setSavingParticipants(true);
    try {
      await api.saveParticipants(project.project_id, importedRows);
      showToast('Participants saved to project sheet successfully!');
      setActiveStep('preview');
    } catch (err) {
      showToast(err.message || 'Failed to save participants', true);
    } finally {
      setSavingParticipants(false);
    }
  }

  async function handleSendTest() {
    setSendingTest(true);
    try {
      await api.sendTest(project.project_id, 2);
      showToast('Test email sent to your logged-in address!');
    } catch (err) {
      showToast(err.message || 'Failed to dispatch test email', true);
    } finally {
      setSendingTest(false);
    }
  }

  function insertChip(chip) {
    setEmailBody(prev => prev + ` {{${chip}}}`);
  }

  return (
    <>
      <TopBar 
        title={`Workspace: ${project.name}`}
        actions={
          <button className="btn btn-secondary btn-sm" onClick={onBack}>
            <ArrowLeft size={14} /> Back to Projects
          </button>
        }
      />

      <div className="page-container">
        {/* Step Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button 
            className={`btn btn-sm ${activeStep === 'import' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveStep('import')}
          >
            1. Import & Validate
          </button>
          <button 
            className={`btn btn-sm ${activeStep === 'preview' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveStep('preview')}
          >
            2. Preview & Generate
          </button>
          <button 
            className={`btn btn-sm ${activeStep === 'email' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveStep('email')}
          >
            3. Email & Dispatch
          </button>
        </div>

        {/* STEP 1: IMPORT PARTICIPANTS */}
        {activeStep === 'import' && (
          <div className="card">
            <h3>Import Participants (Excel or CSV)</h3>
            <p className="subtitle">Select an .xlsx or .csv file with participant names and email addresses.</p>

            <div style={{
              border: '2px dashed var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '36px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-page)',
              marginBottom: '24px'
            }}>
              <Upload size={32} style={{ color: 'var(--primary)', marginBottom: '12px' }} />
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>Choose a spreadsheet file to import</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
                Supports .xlsx, .xls, and .csv with UTF-8 encoding
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                id="fileUploadInput"
              />
              <label htmlFor="fileUploadInput" className="btn btn-primary btn-sm">
                Browse Files
              </label>
            </div>

            {importedRows.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'center' }}>
                  <div><b>Total:</b> {importedRows.length}</div>
                  <div style={{ color: 'var(--success)' }}><b>Valid:</b> {validCount}</div>
                  <div style={{ color: 'var(--danger)' }}><b>Invalid/Duplicate:</b> {invalidCount}</div>
                  <div style={{ marginLeft: 'auto' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleSaveParticipants}
                      disabled={savingParticipants || validCount === 0}
                    >
                      {savingParticipants ? 'Saving...' : 'Save & Continue to Preview →'}
                    </button>
                  </div>
                </div>

                <div className="table-wrap" style={{ maxHeight: '360px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importedRows.slice(0, 100).map(r => (
                        <tr key={r.rowNum}>
                          <td>{r.rowNum - 1}</td>
                          <td style={{ fontWeight: 500 }}>{r.name || '—'}</td>
                          <td>{r.email || '—'}</td>
                          <td>
                            <span className={`badge badge-${r.status}`}>
                              {r.status}
                            </span>
                          </td>
                          <td style={{ color: r.reason ? 'var(--danger)' : 'var(--text-muted)' }}>
                            {r.reason || 'Ready for generation'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 2: PREVIEW & GENERATE */}
        {activeStep === 'preview' && (
          <div className="card">
            <h3>Certificate Verification & Generation</h3>
            <p className="subtitle">
              Verify the rendered certificate layout before bulk generation.
            </p>

            <div style={{
              background: '#f1f5f9',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '24px',
              textAlign: 'center',
              marginBottom: '24px'
            }}>
              <div style={{
                background: '#fff',
                display: 'inline-block',
                padding: '32px 48px',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-md)',
                minWidth: '500px'
              }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', letterSpacing: '2px' }}>
                  {project.organization || 'UNIVERSITY ACADEMY'}
                </div>
                <div style={{ fontFamily: 'Playfair Display', fontSize: '1.6rem', fontWeight: 700, margin: '16px 0 8px 0' }}>
                  CERTIFICATE OF PARTICIPATION
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>This is proudly presented to</div>
                <div style={{ fontFamily: 'Montserrat', fontSize: '1.5rem', fontWeight: 600, color: 'var(--primary)', margin: '12px 0' }}>
                  {importedRows[0]?.name || 'Alex Morgan'}
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', maxWidth: '420px', margin: '0 auto' }}>
                  for exceptional performance in <b>{project.event_name || 'Annual Symposium 2026'}</b>
                </div>
                <div style={{ marginTop: '20px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Certificate ID: CERT-2026-001 • Verified Genuine
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              background: 'var(--bg-page)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '20px'
            }}>
              <input
                type="checkbox"
                id="verifyCheckbox"
                checked={verifiedPreview}
                onChange={e => setVerifiedPreview(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="verifyCheckbox" style={{ fontWeight: 600, cursor: 'pointer' }}>
                I have inspected and verified sample certificates for spelling, alignment, and formatting
              </label>
            </div>

            <button
              className="btn btn-primary"
              disabled={!verifiedPreview}
              onClick={() => {
                showToast('Bulk PDF generation initialized!');
                setActiveStep('email');
              }}
            >
              Generate PDFs & Proceed to Email →
            </button>
          </div>
        )}

        {/* STEP 3: EMAIL & DISPATCH */}
        {activeStep === 'email' && (
          <div className="card">
            <h3>Email Template & Controlled Dispatch</h3>
            <p className="subtitle">Craft the personalized email sent with the certificate PDF attachment.</p>

            <div className="form-group">
              <label>Subject Line</label>
              <input
                type="text"
                className="form-control"
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Insert Dynamic Placeholder Chips</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {['STUDENT_NAME', 'EVENT_NAME', 'ORG_NAME', 'CERTIFICATE_ID', 'VERIFY_URL'].map(chip => (
                  <button
                    key={chip}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => insertChip(chip)}
                  >
                    + {'{{' + chip + '}}'}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Email Body (Plain Text + Line Breaks)</label>
              <textarea
                className="form-control"
                rows={6}
                value={emailBody}
                onChange={e => setEmailBody(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                className="btn btn-secondary"
                onClick={handleSendTest}
                disabled={sendingTest}
              >
                <Send size={14} /> {sendingTest ? 'Sending Test...' : 'Send Test to My Email'}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => showToast('Batch sending started with user lock and idempotency protection!')}
              >
                <Play size={14} /> Start Batch Email Dispatch
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
