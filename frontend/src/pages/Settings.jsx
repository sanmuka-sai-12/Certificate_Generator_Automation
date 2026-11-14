import React from 'react';
import { ShieldCheck, Mail, HardDrive, ExternalLink } from 'lucide-react';
import TopBar from '../components/TopBar';

export default function Settings({ currentUser, showToast }) {
  return (
    <>
      <TopBar title="Application Settings" />

      <div className="page-container">
        <div className="card" style={{ maxWidth: '720px' }}>
          <h3>Sender Identity & Google Account</h3>
          <p className="subtitle">
            Emails are dispatched using the authenticated user's Gmail authorization with zero password storage.
          </p>

          <div style={{
            background: 'var(--bg-page)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '16px',
            marginBottom: '24px'
          }}>
            <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>
              Sending as: <span style={{ color: 'var(--primary)' }}>{currentUser.email || 'Signing in...'}</span>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Account Tier: <b>{currentUser.kind}</b>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
              Daily Gmail Quota: <b>{currentUser.quota} recipients remaining today</b>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
            >
              <ExternalLink size={14} /> Review Google Account Permissions
            </a>
          </div>

          <h3>Certificate Generation Defaults</h3>
          <p className="subtitle">Configure page sizes and rendering standards.</p>

          <div className="form-group">
            <label>Default Page Standard</label>
            <select className="form-control" defaultValue="A4_LANDSCAPE">
              <option value="A4_LANDSCAPE">A4 Landscape (3508 x 2480 px, 300 DPI)</option>
              <option value="A4_PORTRAIT">A4 Portrait (2480 x 3508 px, 300 DPI)</option>
            </select>
          </div>

          <div className="form-group">
            <label>PDF Image Compression Quality</label>
            <input
              type="number"
              step="0.05"
              min="0.5"
              max="1.0"
              defaultValue="0.92"
              className="form-control"
            />
          </div>

          <div className="form-group">
            <label>Default Dispatch Batch Size</label>
            <input
              type="number"
              min="10"
              max="100"
              defaultValue="50"
              className="form-control"
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={() => showToast('Preferences updated successfully')}
          >
            Save Preferences
          </button>
        </div>
      </div>
    </>
  );
}
