import React, { useState } from 'react';

export default function NewProjectModal({ isOpen, onClose, onProjectCreated, showToast }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    organization: '',
    event_name: '',
    event_date: '',
    cert_type: 'Participation'
  });

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setLoading(true);
    try {
      await onProjectCreated(formData);
      showToast('Project created successfully!');
      setFormData({
        name: '',
        organization: '',
        event_name: '',
        event_date: '',
        cert_type: 'Participation'
      });
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to create project', true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: '16px' }}>Create New Certificate Project</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Project Name *</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Annual Tech Symposium 2026"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>College / Organization</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. University Department of CS"
              value={formData.organization}
              onChange={e => setFormData({ ...formData, organization: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Event Name</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. National Hackathon"
              value={formData.event_name}
              onChange={e => setFormData({ ...formData, event_name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Event Date</label>
            <input
              type="date"
              className="form-control"
              value={formData.event_date}
              onChange={e => setFormData({ ...formData, event_date: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Certificate Category</label>
            <select
              className="form-control"
              value={formData.cert_type}
              onChange={e => setFormData({ ...formData, cert_type: e.target.value })}
            >
              <option value="Participation">Certificate of Participation</option>
              <option value="Achievement">Certificate of Achievement</option>
              <option value="Appreciation">Certificate of Appreciation</option>
              <option value="Excellence">Certificate of Excellence</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
