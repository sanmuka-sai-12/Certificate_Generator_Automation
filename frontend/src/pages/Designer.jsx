import React, { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { Type, Sparkles, Image, Save, Undo, Redo, ZoomIn, ZoomOut } from 'lucide-react';
import TopBar from '../components/TopBar';

const LOGICAL_WIDTH = 3508;
const LOGICAL_HEIGHT = 2480;

export default function Designer({ showToast }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [canvas, setCanvas] = useState(null);
  const [selectedObj, setSelectedObj] = useState(null);
  const [fontSize, setFontSize] = useState(120);
  const [fontFamily, setFontFamily] = useState('Playfair Display');
  const [fillColor, setFillColor] = useState('#1a1a1a');

  useEffect(() => {
    if (!canvasRef.current) return;

    const fc = new fabric.Canvas(canvasRef.current, {
      width: LOGICAL_WIDTH,
      height: LOGICAL_HEIGHT,
      preserveObjectStacking: true,
      backgroundColor: '#ffffff'
    });

    setCanvas(fc);

    fc.on('selection:created', e => updateSelection(e.selected[0]));
    fc.on('selection:updated', e => updateSelection(e.selected[0]));
    fc.on('selection:cleared', () => setSelectedObj(null));

    function fitToScreen() {
      if (!containerRef.current) return;
      const wrap = containerRef.current;
      const zoom = Math.min((wrap.clientWidth - 48) / LOGICAL_WIDTH, (wrap.clientHeight - 48) / LOGICAL_HEIGHT);
      if (zoom > 0) {
        fc.setZoom(zoom);
        fc.setWidth(LOGICAL_WIDTH * zoom);
        fc.setHeight(LOGICAL_HEIGHT * zoom);
      }
    }

    fitToScreen();
    window.addEventListener('resize', fitToScreen);

    return () => {
      window.removeEventListener('resize', fitToScreen);
      fc.dispose();
    };
  }, []);

  function updateSelection(obj) {
    if (!obj) return;
    setSelectedObj(obj);
    if (obj.fontSize) setFontSize(obj.fontSize);
    if (obj.fontFamily) setFontFamily(obj.fontFamily);
    if (obj.fill) setFillColor(obj.fill);
  }

  function addHeading(text = 'CERTIFICATE OF ACHIEVEMENT') {
    if (!canvas) return;
    const t = new fabric.Textbox(text, {
      left: LOGICAL_WIDTH / 2,
      top: 500,
      originX: 'center',
      width: 2400,
      textAlign: 'center',
      fontFamily: 'Playfair Display',
      fontSize: 120,
      fill: '#1a1a1a'
    });
    canvas.add(t);
    canvas.setActiveObject(t);
  }

  function addPlaceholder(field) {
    if (!canvas) return;
    const t = new fabric.Textbox(`{{${field}}}`, {
      left: LOGICAL_WIDTH / 2,
      top: 1100,
      originX: 'center',
      width: 2400,
      textAlign: 'center',
      fontFamily: 'Montserrat',
      fontSize: 160,
      fill: '#1d4ed8',
      data: {
        dynamic: true,
        autoShrink: true,
        maxWidth: 2400,
        minSize: 60
      }
    });
    canvas.add(t);
    canvas.setActiveObject(t);
    showToast(`Added {{${field}}} placeholder`);
  }

  function updateProperty(prop, val) {
    if (!canvas || !selectedObj) return;
    selectedObj.set(prop, val);
    canvas.renderAll();
  }

  function handleSaveTemplate() {
    if (!canvas) return;
    const json = canvas.toJSON(['data']);
    json.page = { width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT, orientation: 'landscape' };
    console.log('Template JSON:', json);
    showToast('Template JSON saved successfully!');
  }

  return (
    <>
      <TopBar 
        title="Certificate Template Designer"
        actions={
          <button className="btn btn-primary btn-sm" onClick={handleSaveTemplate}>
            <Save size={16} /> Save Template
          </button>
        }
      />

      <div className="page-container" style={{ display: 'flex', gap: '24px', height: 'calc(100vh - 80px)' }}>
        {/* Toolset sidebar */}
        <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card">
            <h4>Insert Elements</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => addHeading('CERTIFICATE OF RECOGNITION')}>
                <Type size={14} /> Add Title
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('STUDENT_NAME')}>
                <Sparkles size={14} /> Add {'{{STUDENT_NAME}}'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('EVENT_NAME')}>
                <Sparkles size={14} /> Add {'{{EVENT_NAME}}'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('CERTIFICATE_ID')}>
                <Sparkles size={14} /> Add {'{{CERTIFICATE_ID}}'}
              </button>
            </div>
          </div>

          {selectedObj && (
            <div className="card">
              <h4>Object Properties</h4>
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label>Font Family</label>
                <select
                  className="form-control"
                  value={fontFamily}
                  onChange={e => {
                    setFontFamily(e.target.value);
                    updateProperty('fontFamily', e.target.value);
                  }}
                >
                  <option value="Playfair Display">Playfair Display (Serif)</option>
                  <option value="Montserrat">Montserrat (Modern Sans)</option>
                  <option value="Great Vibes">Great Vibes (Cursive/Calligraphy)</option>
                  <option value="Poppins">Poppins (Geometric Sans)</option>
                  <option value="Noto Sans Telugu">Noto Sans Telugu</option>
                  <option value="Noto Sans Devanagari">Noto Sans Devanagari (Hindi)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Font Size ({fontSize}px)</label>
                <input
                  type="range"
                  min="30"
                  max="240"
                  value={fontSize}
                  onChange={e => {
                    const sz = Number(e.target.value);
                    setFontSize(sz);
                    updateProperty('fontSize', sz);
                  }}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-group">
                <label>Text Color</label>
                <input
                  type="color"
                  value={fillColor}
                  onChange={e => {
                    setFillColor(e.target.value);
                    updateProperty('fill', e.target.value);
                  }}
                  style={{ width: '100%', height: '36px', border: '1px solid var(--border)', borderRadius: '4px' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Canvas viewport container */}
        <div 
          ref={containerRef}
          className="card" 
          style={{ 
            flex: 1, 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            background: '#cbd5e1',
            overflow: 'hidden'
          }}
        >
          <div style={{ boxShadow: 'var(--shadow-lg)', borderRadius: '2px', overflow: 'hidden' }}>
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>
    </>
  );
}
