import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  Send, 
  Play, 
  Pause, 
  RotateCw, 
  Eye, 
  FileText, 
  FileArchive, 
  ChevronLeft, 
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import TopBar from '../components/TopBar';
import { api } from '../services/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SYNONYMS = {
  name: ['student name', 'name', 'full name', 'participant', 'candidate'],
  email: ['email', 'e-mail', 'email id', 'mail', 'mail id'],
  college: ['college', 'university', 'institution', 'school'],
  department: ['department', 'dept', 'branch', 'stream'],
  position: ['position', 'rank', 'prize', 'award'],
  reg_no: ['registration number', 'reg no', 'roll no', 'roll number']
};

export default function ProjectWorkspace({ project, onBack, showToast }) {
  const [activeStep, setActiveStep] = useState('import'); // 'import' | 'preview' | 'email'
  
  // Import state
  const [fileHeaders, setFileHeaders] = useState([]);
  const [columnMap, setColumnMap] = useState({
    name: '',
    email: '',
    college: '',
    department: '',
    position: '',
    reg_no: ''
  });
  const [rawRows, setRawRows] = useState([]);
  const [importedRows, setImportedRows] = useState([]);
  const [validCount, setValidCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);
  const [savingParticipants, setSavingParticipants] = useState(false);

  // Preview state
  const [previewIdx, setPreviewIdx] = useState(0);
  const [verifiedPreview, setVerifiedPreview] = useState(false);

  // Email & Dispatch state
  const [emailSubject, setEmailSubject] = useState(project.email_subject || 'Your Certificate for {{EVENT_NAME}}');
  const [emailBody, setEmailBody] = useState(project.email_body || 'Dear {{STUDENT_NAME}},\n\nCongratulations on participating in {{EVENT_NAME}}!\n\nPlease find your official certificate attached as a PDF.\n\nBest regards,\n{{ORG_NAME}}');
  const [batchSize, setBatchSize] = useState(Number(project.batch_size) || 50);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendProgress, setSendProgress] = useState(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [senderInfo, setSenderInfo] = useState({ email: 'organizer@gmail.com', quota: 100, kind: 'Personal Gmail' });

  // Load existing participants & sender info
  useEffect(() => {
    loadParticipantsAndProgress();
    api.senderInfo().then(info => setSenderInfo(info)).catch(() => {});
  }, [project.id]);

  async function loadParticipantsAndProgress() {
    try {
      const list = await api.getParticipants(project.id);
      if (list && list.length > 0) {
        setImportedRows(list);
        setValidCount(list.filter(p => p.validity === 'valid').length);
        setInvalidCount(list.filter(p => p.validity !== 'valid').length);
      }
      const prog = await api.getSendingProgress(project.id);
      setSendProgress(prog);
    } catch {}
  }

  // Poll progress if sending is active
  useEffect(() => {
    let interval = null;
    if (isDispatching || sendProgress?.state === 'sending') {
      interval = setInterval(async () => {
        try {
          const prog = await api.getSendingProgress(project.id);
          setSendProgress(prog);
          if (prog.state === 'finished' || prog.state === 'idle') {
            setIsDispatching(false);
          }
        } catch {}
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isDispatching, sendProgress?.state, project.id]);

  function autoDetectHeaders(headers) {
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const map = { name: '', email: '', college: '', department: '', position: '', reg_no: '' };
    
    Object.keys(SYNONYMS).forEach(k => {
      const hit = headers.find(h => SYNONYMS[k].includes(norm(h)));
      if (hit) map[k] = hit;
    });

    if (!map.name && headers.length > 0) map.name = headers[0];
    if (!map.email && headers.length > 1) map.email = headers[1];
    return map;
  }

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const isCsv = /\.csv$/i.test(file.name);
    const reader = new FileReader();

    if (isCsv) {
      reader.onload = evt => {
        const parsed = Papa.parse(evt.target.result, { header: true, skipEmptyLines: true });
        if (parsed.data.length > 0) {
          const headers = Object.keys(parsed.data[0]);
          setFileHeaders(headers);
          const detected = autoDetectHeaders(headers);
          setColumnMap(detected);
          setRawRows(parsed.data);
          validateMappedData(parsed.data, detected);
        }
      };
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.onload = evt => {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (data.length > 0) {
          const headers = Object.keys(data[0]);
          setFileHeaders(headers);
          const detected = autoDetectHeaders(headers);
          setColumnMap(detected);
          setRawRows(data);
          validateMappedData(data, detected);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }

  function validateMappedData(data, map) {
    let valid = 0;
    let invalid = 0;
    const seenEmails = new Set();

    const processed = data.map((row, idx) => {
      const name = String(row[map.name] || '').trim();
      const email = String(row[map.email] || '').trim().toLowerCase();

      let status = 'valid';
      let reason = '';

      if (!name) {
        status = 'invalid';
        reason = 'Missing participant name';
        invalid++;
      } else if (!EMAIL_RE.test(email)) {
        status = 'invalid';
        reason = 'Invalid email syntax';
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
        college: row[map.college] || '',
        department: row[map.department] || '',
        position: row[map.position] || '',
        reg_no: row[map.reg_no] || '',
        cert_type: project.cert_type || 'Participation',
        status,
        reason,
        raw: row
      };
    });

    setImportedRows(processed);
    setValidCount(valid);
    setInvalidCount(invalid);
    showToast(`Processed ${processed.length} records: ${valid} valid, ${invalid} flagged`);
  }

  function handleMapChange(field, val) {
    const updated = { ...columnMap, [field]: val };
    setColumnMap(updated);
    if (rawRows.length > 0) {
      validateMappedData(rawRows, updated);
    }
  }

  function handleDownloadErrorsCsv() {
    const invalidRows = importedRows.filter(r => r.status !== 'valid');
    if (invalidRows.length === 0) return;
    const csvContent = Papa.unparse(invalidRows.map(r => ({
      Row: r.rowNum,
      Name: r.name,
      Email: r.email,
      Status: r.status,
      Reason: r.reason
    })));
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error_rows_${project.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSaveParticipants() {
    if (!importedRows.length) return;
    setSavingParticipants(true);
    try {
      const validParticipants = importedRows.filter(r => r.status === 'valid');
      await api.saveParticipants(project.id, validParticipants);
      showToast(`Saved ${validParticipants.length} participants to database!`);
      const refreshed = await api.getParticipants(project.id);
      setImportedRows(refreshed);
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
      await api.sendTest(project.id, senderInfo.email);
      showToast(`Test email with certificate sent to ${senderInfo.email}`);
    } catch (err) {
      showToast(err.message || 'Failed to send test email', true);
    } finally {
      setSendingTest(false);
    }
  }

  async function handleStartBatchSending() {
    if (!verifiedPreview) {
      showToast('Please inspect and verify the sample certificates first', true);
      return;
    }
    try {
      setIsDispatching(true);
      await api.startBatchSending(project.id, batchSize);
      showToast('Batch email dispatch started in background worker!');
      const prog = await api.getSendingProgress(project.id);
      setSendProgress(prog);
    } catch (err) {
      setIsDispatching(false);
      showToast(err.message || 'Failed to start batch sending', true);
    }
  }

  async function handlePauseSending() {
    try {
      await api.pauseSending(project.id);
      setIsDispatching(false);
      showToast('Dispatch paused');
      const prog = await api.getSendingProgress(project.id);
      setSendProgress(prog);
    } catch (err) {
      showToast(err.message || 'Failed to pause dispatch', true);
    }
  }

  async function handleResumeSending() {
    try {
      setIsDispatching(true);
      await api.resumeSending(project.id);
      showToast('Dispatch resumed');
      const prog = await api.getSendingProgress(project.id);
      setSendProgress(prog);
    } catch (err) {
      showToast(err.message || 'Failed to resume dispatch', true);
    }
  }

  async function handleRetryFailed() {
    try {
      await api.retryFailed(project.id);
      showToast('Reset failed participants for retry');
      loadParticipantsAndProgress();
    } catch (err) {
      showToast(err.message || 'Failed to retry failed participants', true);
    }
  }

  function insertChip(chip) {
    setEmailBody(prev => prev + ` {{${chip}}}`);
  }

  const currentPreviewParticipant = importedRows[previewIdx] || {
    name: 'Alex Morgan',
    cert_id: 'CERT-001',
    college: 'Stanford University',
    department: 'Computer Science',
    position: '1st Place Winner'
  };

  return (
    <>
      <TopBar 
        title={`Project: ${project.name}`}
        actions={
          <button className="btn btn-secondary btn-sm" onClick={onBack}>
            <ArrowLeft size={14} /> Back to Projects
          </button>
        }
      />

      <div className="page-container">
        {/* Step Navigation Pill Tabs */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
          <button 
            className={`btn btn-sm ${activeStep === 'import' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveStep('import')}
          >
            1. Import & Map Data
          </button>
          <button 
            className={`btn btn-sm ${activeStep === 'preview' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveStep('preview')}
          >
            2. Preview & Verification
          </button>
          <button 
            className={`btn btn-sm ${activeStep === 'email' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveStep('email')}
          >
            3. Bulk Email & Tracking
          </button>
        </div>

        {/* ================= STEP 1: IMPORT & MAP ================= */}
        {activeStep === 'import' && (
          <div className="card">
            <h3>Import Participants (Excel or CSV)</h3>
            <p className="subtitle">Upload your participant file, map spreadsheet columns, and validate records.</p>

            <div style={{
              border: '2px dashed var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '32px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-page)',
              marginBottom: '24px'
            }}>
              <Upload size={32} style={{ color: 'var(--primary)', marginBottom: '10px' }} />
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>Choose Excel (.xlsx, .xls) or CSV file</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
                UTF-8 encoded files with column headers
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                id="workspaceUploadInput"
              />
              <label htmlFor="workspaceUploadInput" className="btn btn-primary btn-sm">
                Browse Files
              </label>
            </div>

            {fileHeaders.length > 0 && (
              <div style={{
                background: 'var(--bg-page)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '20px',
                marginBottom: '24px'
              }}>
                <h4 style={{ marginBottom: '12px' }}>Column Header Auto-Mapping</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Full Name *</label>
                    <select
                      className="form-control"
                      value={columnMap.name}
                      onChange={e => handleMapChange('name', e.target.value)}
                    >
                      <option value="">-- Select Column --</option>
                      {fileHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Email Address *</label>
                    <select
                      className="form-control"
                      value={columnMap.email}
                      onChange={e => handleMapChange('email', e.target.value)}
                    >
                      <option value="">-- Select Column --</option>
                      {fileHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>College / Institution</label>
                    <select
                      className="form-control"
                      value={columnMap.college}
                      onChange={e => handleMapChange('college', e.target.value)}
                    >
                      <option value="">-- (Optional) --</option>
                      {fileHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Position / Award</label>
                    <select
                      className="form-control"
                      value={columnMap.position}
                      onChange={e => handleMapChange('position', e.target.value)}
                    >
                      <option value="">-- (Optional) --</option>
                      {fileHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {importedRows.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div><b>Total:</b> {importedRows.length}</div>
                  <div style={{ color: 'var(--success)' }}><b>Valid:</b> {validCount}</div>
                  <div style={{ color: 'var(--danger)' }}><b>Flagged:</b> {invalidCount}</div>
                  {invalidCount > 0 && (
                    <button className="btn btn-secondary btn-sm" onClick={handleDownloadErrorsCsv}>
                      <Download size={13} /> Export Errors CSV
                    </button>
                  )}
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

                <div className="table-wrap" style={{ maxHeight: '340px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>College</th>
                        <th>Status</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importedRows.slice(0, 100).map((r, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{r.name || '—'}</td>
                          <td>{r.email || '—'}</td>
                          <td>{r.college || '—'}</td>
                          <td>
                            <span className={`badge badge-${r.status || r.validity}`}>
                              {r.status || r.validity}
                            </span>
                          </td>
                          <td style={{ color: r.reason ? 'var(--danger)' : 'var(--text-muted)' }}>
                            {r.reason || 'Valid for certificate generation'}
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

        {/* ================= STEP 2: PREVIEW & VERIFY ================= */}
        {activeStep === 'preview' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3>Side-by-Side Certificate Preview</h3>
                <p className="subtitle" style={{ marginBottom: 0 }}>
                  Inspect how personalized participant data will render on the official certificate layout.
                </p>
              </div>

              {importedRows.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    onClick={() => setPreviewIdx(p => Math.max(0, p - 1))}
                    disabled={previewIdx === 0}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {previewIdx + 1} of {importedRows.length}
                  </span>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    onClick={() => setPreviewIdx(p => Math.min(importedRows.length - 1, p + 1))}
                    disabled={previewIdx >= importedRows.length - 1}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
              {/* Participant Details Card */}
              <div style={{
                width: '320px',
                background: 'var(--bg-page)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '20px'
              }}>
                <h4 style={{ marginBottom: '12px' }}>Participant Record</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.9rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Name</div>
                    <div style={{ fontWeight: 600 }}>{currentPreviewParticipant.name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Email</div>
                    <div>{currentPreviewParticipant.email || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>College</div>
                    <div>{currentPreviewParticipant.college || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Certificate ID</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                      {currentPreviewParticipant.cert_id || 'CERT-001'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Verification QR</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600 }}>
                      <ShieldCheck size={14} /> Ready with anti-tamper token
                    </div>
                  </div>
                </div>
              </div>

              {/* Rendered Certificate Preview Frame */}
              <div style={{
                flex: 1,
                background: '#475569',
                borderRadius: 'var(--radius-sm)',
                padding: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  background: '#ffffff',
                  width: '100%',
                  maxWidth: '560px',
                  aspectRatio: '1.414',
                  boxShadow: 'var(--shadow-lg)',
                  borderRadius: '4px',
                  padding: '32px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  border: '8px solid #0f2744',
                  outline: '2px solid #b8964e',
                  outlineOffset: '-6px'
                }}>
                  <div style={{ fontSize: '0.75rem', letterSpacing: '2px', color: '#64748b', textTransform: 'uppercase' }}>
                    {project.organization || 'UNIVERSITY OF ACADEMIC EXCELLENCE'}
                  </div>
                  <div style={{ fontFamily: 'Playfair Display', fontSize: '1.4rem', fontWeight: 700, color: '#0f2744', margin: '12px 0 6px 0' }}>
                    CERTIFICATE OF PARTICIPATION
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Proudly presented to</div>
                  <div style={{ fontFamily: 'Montserrat', fontSize: '1.35rem', fontWeight: 700, color: '#1d4ed8', margin: '8px 0' }}>
                    {currentPreviewParticipant.name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#334155', maxWidth: '380px', margin: '0 auto' }}>
                    for exceptional contribution in <b>{project.event_name || 'Annual Tech Symposium 2026'}</b>
                  </div>
                  <div style={{ marginTop: '16px', fontSize: '0.7rem', color: '#64748b' }}>
                    ID: <b>{currentPreviewParticipant.cert_id || 'CERT-001'}</b> • Official QR Verified
                  </div>
                </div>
              </div>
            </div>

            {/* Mandatory Checkbox */}
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
                id="verifyBox"
                checked={verifiedPreview}
                onChange={e => setVerifiedPreview(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="verifyBox" style={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                I have inspected and confirmed the sample certificate formatting, spelling, and alignment.
              </label>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <a
                href={api.getZipUrl(project.id)}
                className="btn btn-secondary"
                target="_blank"
                rel="noreferrer"
              >
                <FileArchive size={16} /> Download All as ZIP
              </a>
              <button
                className="btn btn-primary"
                disabled={!verifiedPreview}
                onClick={() => {
                  showToast('Verification confirmed! Proceeding to Email Dispatch.');
                  setActiveStep('email');
                }}
              >
                Proceed to Bulk Email Dispatch →
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 3: BULK EMAIL & TRACKING ================= */}
        {activeStep === 'email' && (
          <div className="card">
            <h3>Bulk Email Automation & Sender Controls</h3>
            <p className="subtitle">
              Configure your email template, sender account, and monitor dispatch in quota-aware batches.
            </p>

            {/* Sender & Quota banner */}
            <div style={{
              background: 'var(--bg-page)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px'
            }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Authorized Sender Account</div>
                <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--primary)' }}>
                  {senderInfo.email}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {senderInfo.kind}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Daily Gmail Quota</div>
                <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--success)' }}>
                  {senderInfo.quota} recipients remaining
                </div>
              </div>
            </div>

            {/* Email Form */}
            <div className="form-group">
              <label>Email Subject</label>
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

            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0, width: '180px' }}>
                <label>Batch Size</label>
                <select
                  className="form-control"
                  value={batchSize}
                  onChange={e => setBatchSize(Number(e.target.value))}
                >
                  <option value={25}>25 per batch</option>
                  <option value={50}>50 per batch</option>
                  <option value={100}>100 per batch</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleSendTest}
                  disabled={sendingTest}
                >
                  <Send size={14} /> {sendingTest ? 'Sending Test...' : 'Send Test to My Email'}
                </button>

                {!isDispatching ? (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleStartBatchSending}
                  >
                    <Play size={14} /> Start Batch Dispatch
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handlePauseSending}
                  >
                    <Pause size={14} /> Pause Dispatch
                  </button>
                )}

                {sendProgress?.counts?.Failed > 0 && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleRetryFailed}
                  >
                    <RotateCw size={14} /> Retry Failed ({sendProgress.counts.Failed})
                  </button>
                )}
              </div>
            </div>

            {/* Live Progress Bar & Stats */}
            {sendProgress && (
              <div style={{
                background: 'var(--bg-page)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '20px',
                marginBottom: '24px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontWeight: 600 }}>
                    Dispatch Run State: <span className={`badge badge-${sendProgress.state}`}>{sendProgress.state}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Total: {sendProgress.total} participants
                  </div>
                </div>

                {/* Visual Progress Bar */}
                <div style={{
                  height: '10px',
                  background: '#e2e8f0',
                  borderRadius: '9999px',
                  overflow: 'hidden',
                  display: 'flex',
                  marginBottom: '16px'
                }}>
                  <div style={{
                    width: `${sendProgress.total ? (sendProgress.counts.Sent / sendProgress.total) * 100 : 0}%`,
                    background: 'var(--success)'
                  }} />
                  <div style={{
                    width: `${sendProgress.total ? (sendProgress.counts.Processing / sendProgress.total) * 100 : 0}%`,
                    background: 'var(--primary)'
                  }} />
                  <div style={{
                    width: `${sendProgress.total ? (sendProgress.counts.Failed / sendProgress.total) * 100 : 0}%`,
                    background: 'var(--danger)'
                  }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px', textAlign: 'center' }}>
                  <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pending</div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{sendProgress.counts.Pending}</div>
                  </div>
                  <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>Processing</div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--primary)' }}>{sendProgress.counts.Processing}</div>
                  </div>
                  <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--success)' }}>Sent</div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--success)' }}>{sendProgress.counts.Sent}</div>
                  </div>
                  <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>Failed</div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--danger)' }}>{sendProgress.counts.Failed}</div>
                  </div>
                  <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Skipped</div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{sendProgress.counts.Skipped}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Tracking Table */}
            <h4>Participant Dispatch Logs</h4>
            <div className="table-wrap" style={{ maxHeight: '360px', marginTop: '12px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Email</th>
                    <th>Cert ID</th>
                    <th>Status</th>
                    <th>Sent At</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {importedRows.map((p, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.email}</td>
                      <td style={{ fontFamily: 'monospace' }}>{p.cert_id}</td>
                      <td>
                        <span className={`badge badge-${p.email_status ? p.email_status.toLowerCase() : 'pending'}`}>
                          {p.email_status || 'Pending'}
                        </span>
                      </td>
                      <td>{p.sent_at ? new Date(p.sent_at).toLocaleTimeString() : '—'}</td>
                      <td style={{ color: p.last_error ? 'var(--danger)' : 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {p.last_error || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
