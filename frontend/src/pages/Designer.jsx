import React, { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { 
  Type, 
  Sparkles, 
  Image as ImageIcon, 
  Save, 
  Undo, 
  Redo, 
  AlignCenter, 
  Trash2, 
  Upload, 
  QrCode,
  FolderOpen
} from 'lucide-react';
import TopBar from '../components/TopBar';
import { api } from '../services/api';

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
  const [templateName, setTemplateName] = useState('Official Certificate Template');
  const [templates, setTemplates] = useState([]);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const isHistoryLocked = useRef(false);

  useEffect(() => {
    loadSavedTemplates();
  }, []);

  async function loadSavedTemplates() {
    try {
      const list = await api.listTemplates();
      setTemplates(list || []);
    } catch {}
  }

  useEffect(() => {
    if (!canvasRef.current) return;

    const fc = new fabric.Canvas(canvasRef.current, {
      width: LOGICAL_WIDTH,
      height: LOGICAL_HEIGHT,
      preserveObjectStacking: true,
      backgroundColor: '#ffffff'
    });

    setCanvas(fc);

    // Initial default design elements
    const border = new fabric.Rect({
      left: 60,
      top: 60,
      width: LOGICAL_WIDTH - 120,
      height: LOGICAL_HEIGHT - 120,
      fill: 'transparent',
      stroke: '#0f2744',
      strokeWidth: 8,
      selectable: false,
      evented: false
    });
    const innerBorder = new fabric.Rect({
      left: 80,
      top: 80,
      width: LOGICAL_WIDTH - 160,
      height: LOGICAL_HEIGHT - 160,
      fill: 'transparent',
      stroke: '#b8964e',
      strokeWidth: 3,
      selectable: false,
      evented: false
    });
    fc.add(border);
    fc.add(innerBorder);

    // Default title
    const title = new fabric.Textbox('CERTIFICATE OF PARTICIPATION', {
      left: LOGICAL_WIDTH / 2,
      top: 480,
      originX: 'center',
      width: 2600,
      textAlign: 'center',
      fontFamily: 'Playfair Display',
      fontSize: 130,
      fontWeight: 'bold',
      fill: '#0f2744'
    });
    fc.add(title);

    // Default subtitle
    const sub = new fabric.Textbox('PROUDLY PRESENTED TO', {
      left: LOGICAL_WIDTH / 2,
      top: 850,
      originX: 'center',
      width: 2000,
      textAlign: 'center',
      fontFamily: 'Montserrat',
      fontSize: 55,
      fill: '#64748b'
    });
    fc.add(sub);

    // Default student name placeholder
    const namePlaceholder = new fabric.Textbox('{{STUDENT_NAME}}', {
      left: LOGICAL_WIDTH / 2,
      top: 1100,
      originX: 'center',
      width: 2400,
      textAlign: 'center',
      fontFamily: 'Montserrat',
      fontWeight: 'bold',
      fontSize: 160,
      fill: '#1d4ed8',
      data: {
        dynamic: true,
        autoShrink: true,
        maxWidth: 2400,
        minSize: 60
      }
    });
    fc.add(namePlaceholder);

    // Description text
    const desc = new fabric.Textbox('for outstanding participation in {{EVENT_NAME}} organized by {{ORG_NAME}}', {
      left: LOGICAL_WIDTH / 2,
      top: 1450,
      originX: 'center',
      width: 2400,
      textAlign: 'center',
      fontFamily: 'Montserrat',
      fontSize: 60,
      fill: '#334155'
    });
    fc.add(desc);

    fc.renderAll();

    fc.on('selection:created', e => updateSelection(e.selected[0]));
    fc.on('selection:updated', e => updateSelection(e.selected[0]));
    fc.on('selection:cleared', () => setSelectedObj(null));

    fc.on('object:modified', recordHistory);
    fc.on('object:added', recordHistory);

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

  function recordHistory() {
    if (!canvas || isHistoryLocked.current) return;
    const json = JSON.stringify(canvas.toJSON(['data']));
    setHistory(prev => [...prev.slice(-30), json]);
    setRedoStack([]);
  }

  function handleUndo() {
    if (history.length < 2 || !canvas) return;
    isHistoryLocked.current = true;
    const current = history[history.length - 1];
    const prev = history[history.length - 2];
    setRedoStack(r => [current, ...r]);
    setHistory(h => h.slice(0, -1));

    canvas.loadFromJSON(prev, () => {
      canvas.renderAll();
      isHistoryLocked.current = false;
    });
  }

  function handleRedo() {
    if (redoStack.length === 0 || !canvas) return;
    isHistoryLocked.current = true;
    const next = redoStack[0];
    setRedoStack(r => r.slice(1));
    setHistory(h => [...h, next]);

    canvas.loadFromJSON(next, () => {
      canvas.renderAll();
      isHistoryLocked.current = false;
    });
  }

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
      fill: '#0f2744'
    });
    canvas.add(t);
    canvas.setActiveObject(t);
    canvas.renderAll();
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
      fontSize: 140,
      fill: '#1d4ed8',
      data: {
        dynamic: true,
        autoShrink: true,
        maxWidth: 2400,
        minSize: 50
      }
    });
    canvas.add(t);
    canvas.setActiveObject(t);
    canvas.renderAll();
    showToast(`Added {{${field}}}`);
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file || !canvas) return;

    const reader = new FileReader();
    reader.onload = evt => {
      fabric.Image.fromURL(evt.target.result, img => {
        img.scaleToWidth(400);
        img.set({
          left: LOGICAL_WIDTH / 2,
          top: 300,
          originX: 'center'
        });
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
        showToast('Logo/Signature image added');
      });
    };
    reader.readAsDataURL(file);
  }

  function handleBackgroundUpload(e) {
    const file = e.target.files[0];
    if (!file || !canvas) return;

    const reader = new FileReader();
    reader.onload = evt => {
      fabric.Image.fromURL(evt.target.result, img => {
        img.set({
          scaleX: LOGICAL_WIDTH / img.width,
          scaleY: LOGICAL_HEIGHT / img.height,
          selectable: false,
          evented: false
        });
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
        showToast('Background image applied');
      });
    };
    reader.readAsDataURL(file);
  }

  function centerObjectHorizontally() {
    if (!canvas || !selectedObj) return;
    selectedObj.centerH();
    canvas.renderAll();
  }

  function deleteSelectedObject() {
    if (!canvas || !selectedObj) return;
    canvas.remove(selectedObj);
    setSelectedObj(null);
    canvas.renderAll();
    showToast('Object deleted');
  }

  function updateProperty(prop, val) {
    if (!canvas || !selectedObj) return;
    selectedObj.set(prop, val);
    canvas.renderAll();
  }

  async function handleSaveTemplate() {
    if (!canvas) return;
    const json = canvas.toJSON(['data']);
    json.page = { width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT, orientation: 'landscape' };
    const thumb = canvas.toDataURL({ format: 'jpeg', quality: 0.5, multiplier: 0.1 });

    try {
      await api.saveTemplate({
        name: templateName,
        width: LOGICAL_WIDTH,
        height: LOGICAL_HEIGHT,
        orientation: 'landscape',
        template_json: json,
        thumbnail_data_url: thumb
      });
      showToast('Template saved successfully to library!');
      loadSavedTemplates();
    } catch (err) {
      showToast(err.message || 'Failed to save template', true);
    }
  }

  function handleLoadTemplate(tpl) {
    if (!canvas || !tpl.template_json) return;
    canvas.loadFromJSON(tpl.template_json, () => {
      canvas.renderAll();
      setTemplateName(tpl.name);
      showToast(`Loaded template: ${tpl.name}`);
    });
  }

  return (
    <>
      <TopBar 
        title="Certificate Designer & Template Studio"
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              className="form-control"
              style={{ width: '220px', padding: '6px 12px' }}
              title="Template Name"
            />
            <button className="btn btn-secondary btn-sm" onClick={handleUndo} title="Undo">
              <Undo size={14} />
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleRedo} title="Redo">
              <Redo size={14} />
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSaveTemplate}>
              <Save size={16} /> Save Template
            </button>
          </div>
        }
      />

      <div className="page-container" style={{ display: 'flex', gap: '20px', height: 'calc(100vh - 84px)' }}>
        {/* Left Toolbar */}
        <div style={{ width: '290px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          <div className="card">
            <h4>Insert Field Chips</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('STUDENT_NAME')}>
                <Sparkles size={14} /> {'{{STUDENT_NAME}}'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('EVENT_NAME')}>
                <Sparkles size={14} /> {'{{EVENT_NAME}}'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('CERTIFICATE_ID')}>
                <Sparkles size={14} /> {'{{CERTIFICATE_ID}}'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('POSITION')}>
                <Sparkles size={14} /> {'{{POSITION}}'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('COLLEGE')}>
                <Sparkles size={14} /> {'{{COLLEGE}}'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('VERIFY_URL')}>
                <QrCode size={14} /> {'{{VERIFY_URL}}'}
              </button>
            </div>
          </div>

          <div className="card">
            <h4>Upload Graphics</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                <ImageIcon size={14} /> Insert Logo / Signature
                <input type="file" accept="image/png,image/jpeg" onChange={handleImageUpload} style={{ display: 'none' }} />
              </label>

              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                <Upload size={14} /> Upload Background Image
                <input type="file" accept="image/png,image/jpeg" onChange={handleBackgroundUpload} style={{ display: 'none' }} />
              </label>
            </div>
          </div>

          {selectedObj && (
            <div className="card">
              <h4>Object Properties</h4>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', marginBottom: '12px' }}>
                <button className="btn btn-secondary btn-sm" onClick={centerObjectHorizontally} title="Center on Canvas">
                  <AlignCenter size={14} /> Center
                </button>
                <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={deleteSelectedObject} title="Delete">
                  <Trash2 size={14} /> Delete
                </button>
              </div>

              <div className="form-group">
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
                  <option value="Montserrat">Montserrat (Clean Sans)</option>
                  <option value="Great Vibes">Great Vibes (Calligraphy)</option>
                  <option value="Poppins">Poppins (Geometric)</option>
                  <option value="Noto Sans Telugu">Noto Sans Telugu</option>
                  <option value="Noto Sans Devanagari">Noto Sans Devanagari (Hindi)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Font Size ({fontSize}px)</label>
                <input
                  type="range"
                  min="24"
                  max="220"
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
                <label>Color</label>
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

          {templates.length > 0 && (
            <div className="card">
              <h4>Saved Templates</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                {templates.map(t => (
                  <button
                    key={t.id}
                    className="btn btn-secondary btn-sm"
                    style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                    onClick={() => handleLoadTemplate(t)}
                  >
                    <FolderOpen size={13} /> {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Canvas Workspace Viewport */}
        <div 
          ref={containerRef}
          className="card" 
          style={{ 
            flex: 1, 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            background: '#94a3b8',
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
