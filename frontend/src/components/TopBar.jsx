import React from 'react';

export default function TopBar({ title, actions }) {
  return (
    <div className="topbar">
      <div>
        <h2>{title}</h2>
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: '8px' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
