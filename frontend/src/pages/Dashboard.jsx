import React from 'react';
import { Plus, FolderKanban, Users, FileCheck, Send } from 'lucide-react';
import TopBar from '../components/TopBar';

export default function Dashboard({ 
  projects, 
  loading, 
  onOpenNewProject, 
  onSelectProject 
}) {
  return (
    <>
      <TopBar 
        title="Dashboard Overview"
        actions={
          <button className="btn btn-primary" onClick={onOpenNewProject}>
            <Plus size={16} /> New Project
          </button>
        }
      />

      <div className="page-container">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="label">Total Projects</div>
            <div className="value">{loading ? '...' : projects.length}</div>
          </div>
          <div className="stat-card">
            <div className="label">Total Participants</div>
            <div className="value">{loading ? '...' : '0'}</div>
          </div>
          <div className="stat-card">
            <div className="label">PDFs Generated</div>
            <div className="value">{loading ? '...' : '0'}</div>
          </div>
          <div className="stat-card">
            <div className="label">Emails Dispatched</div>
            <div className="value">{loading ? '...' : '0'}</div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3>Recent Projects</h3>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th>Event Name</th>
                  <th>Organization</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                      Loading projects...
                    </td>
                  </tr>
                ) : projects.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                      No projects created yet. Click "+ New Project" to get started!
                    </td>
                  </tr>
                ) : (
                  projects.slice(0, 5).map(p => (
                    <tr key={p.project_id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.event_name || '-'}</td>
                      <td>{p.organization || '-'}</td>
                      <td>
                        <span className="badge badge-draft">{p.status || 'draft'}</span>
                      </td>
                      <td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '-'}</td>
                      <td>
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => onSelectProject(p)}
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
