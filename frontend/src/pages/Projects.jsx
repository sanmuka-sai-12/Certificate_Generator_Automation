import React from 'react';
import { Plus, Copy, Trash2, ExternalLink } from 'lucide-react';
import TopBar from '../components/TopBar';

export default function Projects({ 
  projects, 
  loading, 
  onOpenNewProject, 
  onSelectProject, 
  onDuplicateProject, 
  onDeleteProject 
}) {
  return (
    <>
      <TopBar 
        title="All Certificate Projects"
        actions={
          <button className="btn btn-primary" onClick={onOpenNewProject}>
            <Plus size={16} /> New Project
          </button>
        }
      />

      <div className="page-container">
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th>Event Date</th>
                  <th>Organization</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                      Loading projects...
                    </td>
                  </tr>
                ) : projects.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                      No projects found.
                    </td>
                  </tr>
                ) : (
                  projects.map(p => (
                    <tr key={p.project_id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.event_date || '-'}</td>
                      <td>{p.organization || '-'}</td>
                      <td>
                        <span className="badge badge-draft">{p.status || 'draft'}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            className="btn btn-secondary btn-sm"
                            onClick={() => onSelectProject(p)}
                            title="Open project workspace"
                          >
                            <ExternalLink size={14} /> Manage
                          </button>
                          <button 
                            className="btn btn-secondary btn-sm"
                            onClick={() => onDuplicateProject(p.project_id)}
                            title="Duplicate project structure"
                          >
                            <Copy size={14} />
                          </button>
                          <button 
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => onDeleteProject(p.project_id, p.name)}
                            title="Delete project"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
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
