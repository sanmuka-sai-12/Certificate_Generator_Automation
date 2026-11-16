/**
 * =====================================================================================
 * Smart Certificate Generator - Designer & Template Studio (Phase 2)
 * =====================================================================================
 * 
 * This module provides an interactive visual canvas editor built on Fabric.js (v5.3).
 * 
 * Key Architectural Decisions:
 * 1. Fixed Logical Dimensions:
 *    - Logical Canvas is pinned to 3508 x 2480 pixels (A4 Landscape at 300 DPI).
 *    - All positioning, font sizes, line widths, and coordinates are strictly stored in
 *      logical pixel units, independent of viewport scaling or device pixel ratios.
 * 2. Responsive Viewport Scaling:
 *    - The canvas is visually scaled via Fabric's `setZoom()` to fit any screen or window
 *      size without changing the underlying logical coordinates.
 * 3. Dynamic Field Auto-Shrinking:
 *    - Dynamic placeholders (e.g. `{{STUDENT_NAME}}`) carry custom metadata (`autoShrink`,
 *      `maxWidth`, `minSize`) enabling automatic font scaling when long names are rendered.
 * 4. Tamper-Proof QR Integration:
 *    - Supports embedding a verification QR code placeholder linking to the public validation URL.
 * 5. Undo/Redo & State History:
 *    - Implements an immutable snapshot history stack (up to 50 operations) with lock guards.
 * =====================================================================================
 */

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
  AlignJustify,
  AlignLeft,
  AlignRight,
  Trash2, 
  Upload, 
  QrCode,
  FolderOpen,
  Layers,
  Copy,
  Lock,
  Unlock,
  Download,
  FileCode,
  FileUp,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Square,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Bold,
  Italic
} from 'lucide-react';
import TopBar from '../components/TopBar';
import { api } from '../services/api';

/** Standard A4 Landscape at 300 DPI */
const LOGICAL_WIDTH = 3508;
const LOGICAL_HEIGHT = 2480;

export default function Designer({ showToast }) {
  // -----------------------------------------------------------------------------------
  // DOM & Fabric Canvas References
  // -----------------------------------------------------------------------------------
  const canvasRef = useRef(null);       // Reference to HTML5 <canvas> element
  const containerRef = useRef(null);    // Reference to parent viewport container
  const [canvas, setCanvas] = useState(null); // Active Fabric.js Canvas instance
  const [selectedObj, setSelectedObj] = useState(null); // Currently focused canvas object

  // -----------------------------------------------------------------------------------
  // Object Properties State (Synchronized with selected canvas item)
  // -----------------------------------------------------------------------------------
  const [fontSize, setFontSize] = useState(120);
  const [fontFamily, setFontFamily] = useState('Playfair Display');
  const [fillColor, setFillColor] = useState('#0f2744');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [textAlign, setTextAlign] = useState('center');
  const [opacity, setOpacity] = useState(1);
  const [isLocked, setIsLocked] = useState(false);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);

  // Dynamic Placeholder Properties
  const [isDynamic, setIsDynamic] = useState(false);
  const [autoShrink, setAutoShrink] = useState(true);
  const [maxWidth, setMaxWidth] = useState(2400);

  // -----------------------------------------------------------------------------------
  // Template & History State
  // -----------------------------------------------------------------------------------
  const [templateName, setTemplateName] = useState('Official Certificate Template');
  const [templateType, setTemplateType] = useState('Participation');
  const [templates, setTemplates] = useState([]); // Saved templates loaded from database
  const [history, setHistory] = useState([]);     // Undo command stack (JSON snapshots)
  const [redoStack, setRedoStack] = useState([]); // Redo command stack
  const isHistoryLocked = useRef(false);          // Guard flag preventing feedback loops during undo/redo

  // -----------------------------------------------------------------------------------
  // Viewport & UI Drawer State
  // -----------------------------------------------------------------------------------
  const [zoomLevel, setZoomLevel] = useState(1);
  const [activeTab, setActiveTab] = useState('fields'); // Active tool tab: 'fields' | 'text' | 'shapes' | 'uploads' | 'presets'

  // Fetch saved templates from PostgreSQL on mount
  useEffect(() => {
    loadSavedTemplates();
  }, []);

  /**
   * Loads existing saved templates from the backend API into local state.
   */
  async function loadSavedTemplates() {
    try {
      const list = await api.listTemplates();
      setTemplates(list || []);
    } catch (err) {
      console.warn('Could not load saved templates from API:', err.message);
    }
  }

  // -----------------------------------------------------------------------------------
  // Canvas Initialization & Lifecycle
  // -----------------------------------------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize Fabric Canvas with fixed 3508x2480 logical dimensions
    const fc = new fabric.Canvas(canvasRef.current, {
      width: LOGICAL_WIDTH,
      height: LOGICAL_HEIGHT,
      preserveObjectStacking: true, // Maintain z-index layers during selection
      backgroundColor: '#ffffff'
    });

    setCanvas(fc);

    // Apply the "Classic Formal" default certificate design preset
    applyClassicPreset(fc);

    // Canvas Selection Event Listeners
    fc.on('selection:created', e => updateSelection(e.selected[0]));
    fc.on('selection:updated', e => updateSelection(e.selected[0]));
    fc.on('selection:cleared', () => {
      setSelectedObj(null);
      setIsDynamic(false);
    });

    // History Tracking Event Listeners
    fc.on('object:modified', () => {
      recordHistory(fc);
      if (fc.getActiveObject()) updateSelection(fc.getActiveObject());
    });
    fc.on('object:added', () => recordHistory(fc));
    fc.on('object:removed', () => recordHistory(fc));

    /**
     * Dynamically calculates zoom factor so the 3508x2480 canvas fits cleanly inside
     * the user's viewport without clipping or distortion.
     */
    function fitToScreen() {
      if (!containerRef.current) return;
      const wrap = containerRef.current;
      const padding = 40;
      const zoom = Math.min((wrap.clientWidth - padding) / LOGICAL_WIDTH, (wrap.clientHeight - padding) / LOGICAL_HEIGHT);
      if (zoom > 0) {
        fc.setZoom(zoom);
        fc.setWidth(LOGICAL_WIDTH * zoom);
        fc.setHeight(LOGICAL_HEIGHT * zoom);
        setZoomLevel(zoom);
      }
    }

    fitToScreen();
    window.addEventListener('resize', fitToScreen);

    // Cleanup canvas resources on unmount
    return () => {
      window.removeEventListener('resize', fitToScreen);
      fc.dispose();
    };
  }, []);

  // -----------------------------------------------------------------------------------
  // Keyboard Shortcuts (Delete, Undo, Redo, Precision Nudge)
  // -----------------------------------------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e) {
      // Do not intercept keystrokes if the user is typing in a form input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      // Delete / Backspace: Remove selected canvas element
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelectedObject();
      } 
      // Ctrl+Z / Cmd+Z: Undo previous action
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } 
      // Ctrl+Y or Ctrl+Shift+Z: Redo previously undone action
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        handleRedo();
      } 
      // Arrow keys: Nudge selected object by 2px (or 10px if Shift key is held)
      else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedObj) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 2;
        if (e.key === 'ArrowUp') selectedObj.top -= step;
        if (e.key === 'ArrowDown') selectedObj.top += step;
        if (e.key === 'ArrowLeft') selectedObj.left -= step;
        if (e.key === 'ArrowRight') selectedObj.left += step;
        selectedObj.setCoords();
        canvas.renderAll();
        setPosX(Math.round(selectedObj.left));
        setPosY(Math.round(selectedObj.top));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canvas, selectedObj, history, redoStack]);

  // -----------------------------------------------------------------------------------
  // History & Snapshot Management (Undo / Redo)
  // -----------------------------------------------------------------------------------

  /**
   * Records a snapshot of the current canvas state into the history stack.
   * Capped at 50 snapshots to prevent memory leaks while supporting extensive edits.
   */
  function recordHistory(fcInstance) {
    const c = fcInstance || canvas;
    if (!c || isHistoryLocked.current) return;
    const json = JSON.stringify(c.toJSON(['data']));
    setHistory(prev => [...prev.slice(-49), json]);
    setRedoStack([]); // Clear redo stack on any new user modification
  }

  /**
   * Reverts canvas state to the previous snapshot in the history stack.
   */
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
      showToast('Undo action');
    });
  }

  /**
   * Advances canvas state to the next snapshot in the redo stack.
   */
  function handleRedo() {
    if (redoStack.length === 0 || !canvas) return;
    isHistoryLocked.current = true;
    const next = redoStack[0];
    setRedoStack(r => r.slice(1));
    setHistory(h => [...h, next]);

    canvas.loadFromJSON(next, () => {
      canvas.renderAll();
      isHistoryLocked.current = false;
      showToast('Redo action');
    });
  }

  // -----------------------------------------------------------------------------------
  // Object Selection & Property Synchronization
  // -----------------------------------------------------------------------------------

  /**
   * Syncs UI property controls with the currently selected Fabric.js object.
   */
  function updateSelection(obj) {
    if (!obj) return;
    setSelectedObj(obj);
    if (obj.fontSize) setFontSize(obj.fontSize);
    if (obj.fontFamily) setFontFamily(obj.fontFamily);
    if (obj.fill && typeof obj.fill === 'string') setFillColor(obj.fill);
    setIsBold(obj.fontWeight === 'bold');
    setIsItalic(obj.fontStyle === 'italic');
    setTextAlign(obj.textAlign || 'center');
    setOpacity(obj.opacity !== undefined ? obj.opacity : 1);
    setIsLocked(Boolean(obj.lockMovementX));
    setPosX(Math.round(obj.left || 0));
    setPosY(Math.round(obj.top || 0));

    // Inspect custom metadata for dynamic recipient placeholder settings
    const isDyn = Boolean(obj.data && obj.data.dynamic);
    setIsDynamic(isDyn);
    if (isDyn) {
      setAutoShrink(obj.data.autoShrink !== false);
      setMaxWidth(obj.data.maxWidth || 2400);
    }
  }

  /**
   * Updates a specific property on the currently selected object and triggers re-render.
   */
  function updateProperty(prop, val) {
    if (!canvas || !selectedObj) return;
    selectedObj.set(prop, val);
    canvas.renderAll();
    recordHistory();
  }

  // -----------------------------------------------------------------------------------
  // Preset Certificate Templates
  // -----------------------------------------------------------------------------------

  /**
   * Preset 1: Classic Academic & Diploma
   * Double borders in Navy and Gold with Playfair Display serif typography.
   */
  function applyClassicPreset(fc = canvas) {
    if (!fc) return;
    fc.clear();
    fc.backgroundColor = '#ffffff';

    // Outer Navy Border
    fc.add(new fabric.Rect({
      left: 60, top: 60, width: LOGICAL_WIDTH - 120, height: LOGICAL_HEIGHT - 120,
      fill: 'transparent', stroke: '#0f2744', strokeWidth: 8, selectable: false, evented: false
    }));

    // Inner Warm Gold Border
    fc.add(new fabric.Rect({
      left: 80, top: 80, width: LOGICAL_WIDTH - 160, height: LOGICAL_HEIGHT - 160,
      fill: 'transparent', stroke: '#b8964e', strokeWidth: 3, selectable: false, evented: false
    }));

    // Certificate Title
    fc.add(new fabric.Textbox('CERTIFICATE OF PARTICIPATION', {
      left: LOGICAL_WIDTH / 2, top: 460, originX: 'center', width: 2600, textAlign: 'center',
      fontFamily: 'Playfair Display', fontSize: 130, fontWeight: 'bold', fill: '#0f2744'
    }));

    // Presentation Subtitle
    fc.add(new fabric.Textbox('PROUDLY PRESENTED TO', {
      left: LOGICAL_WIDTH / 2, top: 820, originX: 'center', width: 2000, textAlign: 'center',
      fontFamily: 'Montserrat', fontSize: 50, fill: '#64748b'
    }));

    // Dynamic Recipient Name (with Auto-Shrink protection)
    fc.add(new fabric.Textbox('{{STUDENT_NAME}}', {
      left: LOGICAL_WIDTH / 2, top: 1060, originX: 'center', width: 2500, textAlign: 'center',
      fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 160, fill: '#0f2744',
      data: { dynamic: true, autoShrink: true, maxWidth: 2500, minSize: 60 }
    }));

    // Event & Organization Description
    fc.add(new fabric.Textbox('for outstanding and active participation in {{EVENT_NAME}} organized by {{ORG_NAME}} on {{EVENT_DATE}}', {
      left: LOGICAL_WIDTH / 2, top: 1420, originX: 'center', width: 2400, textAlign: 'center',
      fontFamily: 'Montserrat', fontSize: 55, fill: '#334155'
    }));

    // Left Signatory Underline & Title
    fc.add(new fabric.Line([450, 2100, 1150, 2100], { stroke: '#0f2744', strokeWidth: 3 }));
    fc.add(new fabric.Textbox('PROGRAM CONVENER', {
      left: 800, top: 2130, originX: 'center', width: 700, textAlign: 'center',
      fontFamily: 'Montserrat', fontSize: 40, fill: '#64748b'
    }));

    // Right Signatory Underline & Title
    fc.add(new fabric.Line([2358, 2100, 3058, 2100], { stroke: '#0f2744', strokeWidth: 3 }));
    fc.add(new fabric.Textbox('HEAD OF INSTITUTION', {
      left: 2708, top: 2130, originX: 'center', width: 700, textAlign: 'center',
      fontFamily: 'Montserrat', fontSize: 40, fill: '#64748b'
    }));

    // Tamper-Proof QR Code Verification Stamp Placeholder
    fc.add(new fabric.Textbox('{{VERIFY_URL}}', {
      left: LOGICAL_WIDTH / 2, top: 2080, originX: 'center', width: 600, textAlign: 'center',
      fontFamily: 'Montserrat', fontSize: 32, fill: '#94a3b8',
      data: { dynamic: true, isQrPlaceholder: true }
    }));

    fc.renderAll();
    recordHistory(fc);
  }

  /**
   * Preset 2: Tech Hackathon & AI Award
   * Modern dark slate palette (#0b132b) with vibrant cyan and indigo neon accents.
   */
  function applyHackathonPreset() {
    if (!canvas) return;
    canvas.clear();
    canvas.backgroundColor = '#0b132b';

    // Cyan Neon Outer Frame
    canvas.add(new fabric.Rect({
      left: 60, top: 60, width: LOGICAL_WIDTH - 120, height: LOGICAL_HEIGHT - 120,
      fill: 'transparent', stroke: '#06b6d4', strokeWidth: 6, selectable: false, evented: false
    }));

    // Indigo Inner Frame
    canvas.add(new fabric.Rect({
      left: 80, top: 80, width: LOGICAL_WIDTH - 160, height: LOGICAL_HEIGHT - 160,
      fill: 'transparent', stroke: '#818cf8', strokeWidth: 2, selectable: false, evented: false
    }));

    canvas.add(new fabric.Textbox('HACKATHON EXCELLENCE AWARD', {
      left: LOGICAL_WIDTH / 2, top: 450, originX: 'center', width: 2800, textAlign: 'center',
      fontFamily: 'Poppins', fontSize: 130, fontWeight: 'bold', fill: '#38bdf8'
    }));

    canvas.add(new fabric.Textbox('HONORING THE TECHNICAL INNOVATION OF', {
      left: LOGICAL_WIDTH / 2, top: 820, originX: 'center', width: 2000, textAlign: 'center',
      fontFamily: 'Poppins', fontSize: 48, fill: '#94a3b8'
    }));

    canvas.add(new fabric.Textbox('{{STUDENT_NAME}}', {
      left: LOGICAL_WIDTH / 2, top: 1040, originX: 'center', width: 2500, textAlign: 'center',
      fontFamily: 'Poppins', fontWeight: 'bold', fontSize: 160, fill: '#ffffff',
      data: { dynamic: true, autoShrink: true, maxWidth: 2500, minSize: 60 }
    }));

    canvas.add(new fabric.Textbox('for achieving {{POSITION}} in {{EVENT_NAME}} representing {{COLLEGE}}', {
      left: LOGICAL_WIDTH / 2, top: 1420, originX: 'center', width: 2500, textAlign: 'center',
      fontFamily: 'Poppins', fontSize: 58, fill: '#cbd5e1'
    }));

    canvas.add(new fabric.Line([450, 2100, 1150, 2100], { stroke: '#06b6d4', strokeWidth: 3 }));
    canvas.add(new fabric.Textbox('LEAD JURY / MENTOR', {
      left: 800, top: 2130, originX: 'center', width: 700, textAlign: 'center',
      fontFamily: 'Poppins', fontSize: 38, fill: '#94a3b8'
    }));

    canvas.add(new fabric.Line([2358, 2100, 3058, 2100], { stroke: '#818cf8', strokeWidth: 3 }));
    canvas.add(new fabric.Textbox('CHIEF ORGANIZER', {
      left: 2708, top: 2130, originX: 'center', width: 700, textAlign: 'center',
      fontFamily: 'Poppins', fontSize: 38, fill: '#94a3b8'
    }));

    canvas.add(new fabric.Textbox('{{VERIFY_URL}}', {
      left: LOGICAL_WIDTH / 2, top: 2080, originX: 'center', width: 600, textAlign: 'center',
      fontFamily: 'Poppins', fontSize: 32, fill: '#64748b',
      data: { dynamic: true, isQrPlaceholder: true }
    }));

    canvas.renderAll();
    recordHistory();
    setTemplateName('Tech Hackathon Award');
    showToast('Loaded Tech Hackathon Preset');
  }

  /**
   * Preset 3: Golden Excellence & Distinction
   * Antique gold borders (#b45309) with Great Vibes calligraphy typography.
   */
  function applyExcellencePreset() {
    if (!canvas) return;
    canvas.clear();
    canvas.backgroundColor = '#fffdfa';

    // Rich Antique Gold Frame
    canvas.add(new fabric.Rect({
      left: 70, top: 70, width: LOGICAL_WIDTH - 140, height: LOGICAL_HEIGHT - 140,
      fill: 'transparent', stroke: '#b45309', strokeWidth: 8, selectable: false, evented: false
    }));
    canvas.add(new fabric.Rect({
      left: 95, top: 95, width: LOGICAL_WIDTH - 190, height: LOGICAL_HEIGHT - 190,
      fill: 'transparent', stroke: '#f59e0b', strokeWidth: 2, selectable: false, evented: false
    }));

    canvas.add(new fabric.Textbox('Certificate of Excellence', {
      left: LOGICAL_WIDTH / 2, top: 450, originX: 'center', width: 2600, textAlign: 'center',
      fontFamily: 'Playfair Display', fontStyle: 'italic', fontSize: 140, fontWeight: 'bold', fill: '#92400e'
    }));

    canvas.add(new fabric.Textbox('THIS SPECIAL COMMENDATION IS BESTOWED UPON', {
      left: LOGICAL_WIDTH / 2, top: 820, originX: 'center', width: 2000, textAlign: 'center',
      fontFamily: 'Montserrat', fontSize: 46, fill: '#78350f'
    }));

    canvas.add(new fabric.Textbox('{{STUDENT_NAME}}', {
      left: LOGICAL_WIDTH / 2, top: 1020, originX: 'center', width: 2500, textAlign: 'center',
      fontFamily: 'Great Vibes', fontSize: 180, fill: '#1a1a1a',
      data: { dynamic: true, autoShrink: true, maxWidth: 2500, minSize: 60 }
    }));

    canvas.add(new fabric.Textbox('in recognition of exemplary leadership and outstanding contributions to {{EVENT_NAME}}', {
      left: LOGICAL_WIDTH / 2, top: 1420, originX: 'center', width: 2400, textAlign: 'center',
      fontFamily: 'Montserrat', fontSize: 52, fill: '#451a03'
    }));

    canvas.add(new fabric.Line([450, 2100, 1150, 2100], { stroke: '#b45309', strokeWidth: 3 }));
    canvas.add(new fabric.Textbox('ACADEMIC DEAN', {
      left: 800, top: 2130, originX: 'center', width: 700, textAlign: 'center',
      fontFamily: 'Montserrat', fontSize: 38, fill: '#78350f'
    }));

    canvas.add(new fabric.Line([2358, 2100, 3058, 2100], { stroke: '#b45309', strokeWidth: 3 }));
    canvas.add(new fabric.Textbox('MANAGING DIRECTOR', {
      left: 2708, top: 2130, originX: 'center', width: 700, textAlign: 'center',
      fontFamily: 'Montserrat', fontSize: 38, fill: '#78350f'
    }));

    canvas.add(new fabric.Textbox('{{VERIFY_URL}}', {
      left: LOGICAL_WIDTH / 2, top: 2080, originX: 'center', width: 600, textAlign: 'center',
      fontFamily: 'Montserrat', fontSize: 32, fill: '#b45309',
      data: { dynamic: true, isQrPlaceholder: true }
    }));

    canvas.renderAll();
    recordHistory();
    setTemplateName('Golden Excellence Award');
    showToast('Loaded Golden Excellence Preset');
  }

  // -----------------------------------------------------------------------------------
  // Dynamic Field & Element Injectors
  // -----------------------------------------------------------------------------------

  /**
   * Adds a dynamic placeholder text chip (e.g. {{STUDENT_NAME}}, {{EVENT_NAME}})
   * with auto-shrink parameters configured.
   */
  function addPlaceholder(field) {
    if (!canvas) return;
    const t = new fabric.Textbox(`{{${field}}}`, {
      left: LOGICAL_WIDTH / 2,
      top: 1100,
      originX: 'center',
      width: 2400,
      textAlign: 'center',
      fontFamily: fontFamily || 'Montserrat',
      fontSize: 140,
      fill: fillColor || '#0f2744',
      fontWeight: 'bold',
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
    recordHistory();
    showToast(`Added field: {{${field}}}`);
  }

  /** Adds a standard bold title header block */
  function addHeadingText(text = 'CERTIFICATE OF ACHIEVEMENT') {
    if (!canvas) return;
    const t = new fabric.Textbox(text, {
      left: LOGICAL_WIDTH / 2,
      top: 500,
      originX: 'center',
      width: 2600,
      textAlign: 'center',
      fontFamily: 'Playfair Display',
      fontSize: 120,
      fontWeight: 'bold',
      fill: '#0f2744'
    });
    canvas.add(t);
    canvas.setActiveObject(t);
    canvas.renderAll();
    recordHistory();
  }

  /** Adds a standard presentation paragraph text block */
  function addBodyText(text = 'This certificate is presented in recognition of participation.') {
    if (!canvas) return;
    const t = new fabric.Textbox(text, {
      left: LOGICAL_WIDTH / 2,
      top: 1400,
      originX: 'center',
      width: 2200,
      textAlign: 'center',
      fontFamily: 'Montserrat',
      fontSize: 55,
      fill: '#334155'
    });
    canvas.add(t);
    canvas.setActiveObject(t);
    canvas.renderAll();
    recordHistory();
  }

  /** Adds a dual ornamental outer/inner border frame */
  function addDoubleBorder() {
    if (!canvas) return;
    const b1 = new fabric.Rect({
      left: 60, top: 60, width: LOGICAL_WIDTH - 120, height: LOGICAL_HEIGHT - 120,
      fill: 'transparent', stroke: '#0f2744', strokeWidth: 8
    });
    const b2 = new fabric.Rect({
      left: 80, top: 80, width: LOGICAL_WIDTH - 160, height: LOGICAL_HEIGHT - 160,
      fill: 'transparent', stroke: '#b8964e', strokeWidth: 3
    });
    canvas.add(b1);
    canvas.add(b2);
    canvas.sendToBack(b2);
    canvas.sendToBack(b1);
    canvas.renderAll();
    recordHistory();
    showToast('Added decorative double border');
  }

  /** Adds a horizontal divider line suitable for signatures or section breaks */
  function addDividerLine() {
    if (!canvas) return;
    const line = new fabric.Line([LOGICAL_WIDTH / 2 - 350, 1600, LOGICAL_WIDTH / 2 + 350, 1600], {
      stroke: '#b8964e',
      strokeWidth: 4
    });
    canvas.add(line);
    canvas.setActiveObject(line);
    canvas.renderAll();
    recordHistory();
    showToast('Added divider rule');
  }

  /** Adds a rounded decorative accent banner box */
  function addDecorativeBox() {
    if (!canvas) return;
    const rect = new fabric.Rect({
      left: LOGICAL_WIDTH / 2 - 500,
      top: 1050,
      width: 1000,
      height: 180,
      fill: '#f8fafc',
      stroke: '#cbd5e1',
      strokeWidth: 3,
      rx: 12,
      ry: 12
    });
    canvas.add(rect);
    canvas.sendToBack(rect);
    canvas.setActiveObject(rect);
    canvas.renderAll();
    recordHistory();
    showToast('Added decorative banner box');
  }

  /** Adds a verification QR code placeholder */
  function addQrPlaceholder() {
    if (!canvas) return;
    const qrText = new fabric.Textbox('{{VERIFY_URL}}', {
      left: 3100,
      top: 2150,
      originX: 'center',
      width: 500,
      textAlign: 'center',
      fontFamily: 'Montserrat',
      fontSize: 32,
      fill: '#64748b',
      data: { dynamic: true, isQrPlaceholder: true }
    });
    canvas.add(qrText);
    canvas.setActiveObject(qrText);
    canvas.renderAll();
    recordHistory();
    showToast('Added QR Code stamp placeholder');
  }

  // -----------------------------------------------------------------------------------
  // Image Uploads & Print Quality DPI Resolution Checker
  // -----------------------------------------------------------------------------------

  /**
   * Uploads an institution logo or official signature (transparent PNG).
   */
  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file || !canvas) return;

    const reader = new FileReader();
    reader.onload = evt => {
      fabric.Image.fromURL(evt.target.result, img => {
        img.scaleToWidth(450);
        img.set({
          left: LOGICAL_WIDTH / 2,
          top: 300,
          originX: 'center'
        });
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
        recordHistory();
        showToast('Logo / Signature added');
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  /**
   * Uploads and scales a custom background graphic.
   * Performs DPI resolution verification: warns if below 150 DPI (~1800x1200 px).
   */
  function handleBackgroundUpload(e) {
    const file = e.target.files[0];
    if (!file || !canvas) return;

    const reader = new FileReader();
    reader.onload = evt => {
      const dataUrl = evt.target.result;
      const probe = new Image();
      probe.onload = () => {
        const w = probe.naturalWidth;
        const h = probe.naturalHeight;
        
        // DPI Validation check against 150 DPI threshold
        if (w < 1800 || h < 1200) {
          showToast(`⚠️ Low resolution image (${w}x${h}px). Recommended: 3508x2480px (300 DPI) for high-res printing.`);
        }
        
        fabric.Image.fromURL(dataUrl, img => {
          img.set({
            scaleX: LOGICAL_WIDTH / img.width,
            scaleY: LOGICAL_HEIGHT / img.height,
            selectable: false,
            evented: false
          });
          canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
          recordHistory();
          showToast('Background image applied successfully');
        });
      };
      probe.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  // -----------------------------------------------------------------------------------
  // Object Alignment, Geometry & Layer Ordering
  // -----------------------------------------------------------------------------------

  /** Center selected object horizontally along the X axis */
  function centerObjectHorizontally() {
    if (!canvas || !selectedObj) return;
    selectedObj.centerH();
    selectedObj.setCoords();
    canvas.renderAll();
    setPosX(Math.round(selectedObj.left));
    recordHistory();
  }

  /** Center selected object vertically along the Y axis */
  function centerObjectVertically() {
    if (!canvas || !selectedObj) return;
    selectedObj.centerV();
    selectedObj.setCoords();
    canvas.renderAll();
    setPosY(Math.round(selectedObj.top));
    recordHistory();
  }

  /** Move selected object one layer forward */
  function bringForward() {
    if (!canvas || !selectedObj) return;
    canvas.bringForward(selectedObj);
    canvas.renderAll();
    recordHistory();
  }

  /** Move selected object one layer backward */
  function sendBackward() {
    if (!canvas || !selectedObj) return;
    canvas.sendBackwards(selectedObj);
    canvas.renderAll();
    recordHistory();
  }

  /** Move selected object to the very front */
  function bringToFront() {
    if (!canvas || !selectedObj) return;
    canvas.bringToFront(selectedObj);
    canvas.renderAll();
    recordHistory();
  }

  /** Move selected object to the very back */
  function sendToBack() {
    if (!canvas || !selectedObj) return;
    canvas.sendToBack(selectedObj);
    canvas.renderAll();
    recordHistory();
  }

  /** Creates a duplicate clone of the selected object offset by 50px */
  function duplicateSelectedObject() {
    if (!canvas || !selectedObj) return;
    selectedObj.clone(cloned => {
      cloned.set({
        left: selectedObj.left + 50,
        top: selectedObj.top + 50,
        evented: true
      });
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.renderAll();
      recordHistory();
      showToast('Object duplicated');
    }, ['data']);
  }

  /** Toggles movement and transformation locking on the selected object */
  function toggleLock() {
    if (!canvas || !selectedObj) return;
    const lockState = !isLocked;
    selectedObj.set({
      lockMovementX: lockState,
      lockMovementY: lockState,
      lockRotation: lockState,
      lockScalingX: lockState,
      lockScalingY: lockState,
      hasControls: !lockState
    });
    setIsLocked(lockState);
    canvas.renderAll();
    recordHistory();
    showToast(lockState ? 'Object locked' : 'Object unlocked');
  }

  /** Removes the selected object from the canvas */
  function deleteSelectedObject() {
    if (!canvas || !selectedObj) return;
    canvas.remove(selectedObj);
    setSelectedObj(null);
    setIsDynamic(false);
    canvas.renderAll();
    recordHistory();
    showToast('Object deleted');
  }

  // -----------------------------------------------------------------------------------
  // Template Storage, Import/Export & PNG Rendering
  // -----------------------------------------------------------------------------------

  /**
   * Serializes canvas to JSON schema and stores it in PostgreSQL via the REST API.
   */
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

  /**
   * Loads a saved template from PostgreSQL into the active Fabric canvas.
   */
  function handleLoadTemplate(tpl) {
    if (!canvas || !tpl.template_json) return;
    canvas.loadFromJSON(tpl.template_json, () => {
      canvas.renderAll();
      setTemplateName(tpl.name);
      recordHistory();
      showToast(`Loaded template: ${tpl.name}`);
    });
  }

  /**
   * Deletes a template from the database library with user confirmation.
   */
  async function handleDeleteSavedTemplate(id, name, e) {
    e.stopPropagation();
    if (!window.confirm(`Delete template "${name}" from library?`)) return;
    try {
      await api.deleteTemplate(id);
      showToast(`Deleted template: ${name}`);
      loadSavedTemplates();
    } catch (err) {
      showToast(err.message || 'Failed to delete template', true);
    }
  }

  /**
   * Exports the canvas as a downloadable `.json` template definition file.
   */
  function exportTemplateJSON() {
    if (!canvas) return;
    const json = canvas.toJSON(['data']);
    json.page = { width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT, orientation: 'landscape' };
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${templateName.replace(/\s+/g, '_')}_template.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Exported template JSON');
  }

  /**
   * Reads a `.json` file from disk and loads it onto the canvas.
   */
  function handleImportJSON(e) {
    const file = e.target.files[0];
    if (!file || !canvas) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const parsed = JSON.parse(evt.target.result);
        canvas.loadFromJSON(parsed, () => {
          canvas.renderAll();
          recordHistory();
          showToast('Imported template successfully');
        });
      } catch {
        showToast('Invalid template JSON file', true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  /**
   * Renders the canvas at full 3508x2480 resolution (1:1 logical pixels) and downloads
   * a high-resolution PNG for instant visual inspection.
   */
  function exportSamplePNG() {
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({
      format: 'png',
      multiplier: 1.0 // Full 3508 x 2480 300 DPI resolution
    });
    const link = document.createElement('a');
    link.download = `${templateName.replace(/\s+/g, '_')}_300DPI_preview.png`;
    link.href = dataUrl;
    link.click();
    showToast('Downloaded full-resolution preview PNG (3508x2480)');
  }

  /** Resets canvas viewport zoom so the certificate fits perfectly in view */
  function resetFitZoom() {
    if (!containerRef.current || !canvas) return;
    const wrap = containerRef.current;
    const padding = 40;
    const zoom = Math.min((wrap.clientWidth - padding) / LOGICAL_WIDTH, (wrap.clientHeight - padding) / LOGICAL_HEIGHT);
    if (zoom > 0) {
      canvas.setZoom(zoom);
      canvas.setWidth(LOGICAL_WIDTH * zoom);
      canvas.setHeight(LOGICAL_HEIGHT * zoom);
      setZoomLevel(zoom);
    }
  }

  /** Manually adjusts viewport zoom level by a multiplying factor */
  function adjustZoom(factor) {
    if (!canvas) return;
    const newZoom = Math.max(0.08, Math.min(0.8, canvas.getZoom() * factor));
    canvas.setZoom(newZoom);
    canvas.setWidth(LOGICAL_WIDTH * newZoom);
    canvas.setHeight(LOGICAL_HEIGHT * newZoom);
    setZoomLevel(newZoom);
  }

  // -----------------------------------------------------------------------------------
  // View Rendering
  // -----------------------------------------------------------------------------------
  return (
    <>
      {/* Top Application Header Bar */}
      <TopBar 
        title="Certificate Designer & Template Studio"
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Template Title Input */}
            <input
              type="text"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              className="form-control"
              style={{ width: '220px', padding: '6px 12px' }}
              title="Template Name"
            />
            
            {/* Undo / Redo Navigation */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={handleUndo} 
                disabled={history.length < 2}
                title="Undo (Ctrl+Z)"
              >
                <Undo size={14} />
              </button>
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={handleRedo} 
                disabled={redoStack.length === 0}
                title="Redo (Ctrl+Y)"
              >
                <Redo size={14} />
              </button>
            </div>

            {/* Quick 300 DPI Export */}
            <button className="btn btn-secondary btn-sm" onClick={exportSamplePNG} title="Download 300 DPI Sample PNG">
              <Download size={14} /> Sample PNG
            </button>

            {/* Save to PostgreSQL */}
            <button className="btn btn-primary btn-sm" onClick={handleSaveTemplate} title="Save to Database">
              <Save size={16} /> Save Template
            </button>
          </div>
        }
      />

      <div className="page-container" style={{ display: 'flex', gap: '16px', height: 'calc(100vh - 84px)' }}>
        
        {/* ========================================================================= */}
        {/* LEFT TOOLBAR DRAWER (Tabs: Fields, Text, Shapes, Upload, Presets)         */}
        {/* ========================================================================= */}
        <div style={{ width: '310px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          
          {/* Category Selector Tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', background: 'var(--surface-sunken)', padding: '4px', borderRadius: '8px' }}>
            <button 
              className={`btn btn-sm ${activeTab === 'fields' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 2px', fontSize: '11px' }}
              onClick={() => setActiveTab('fields')}
              title="Dynamic Recipient Fields"
            >
              Fields
            </button>
            <button 
              className={`btn btn-sm ${activeTab === 'text' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 2px', fontSize: '11px' }}
              onClick={() => setActiveTab('text')}
              title="Typography Headers"
            >
              Text
            </button>
            <button 
              className={`btn btn-sm ${activeTab === 'shapes' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 2px', fontSize: '11px' }}
              onClick={() => setActiveTab('shapes')}
              title="Shapes & Frames"
            >
              Shapes
            </button>
            <button 
              className={`btn btn-sm ${activeTab === 'uploads' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 2px', fontSize: '11px' }}
              onClick={() => setActiveTab('uploads')}
              title="Logos & Backgrounds"
            >
              Upload
            </button>
            <button 
              className={`btn btn-sm ${activeTab === 'presets' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 2px', fontSize: '11px' }}
              onClick={() => setActiveTab('presets')}
              title="Design Presets"
            >
              Presets
            </button>
          </div>

          {/* TAB 1: DYNAMIC PLACEHOLDER FIELDS */}
          {activeTab === 'fields' && (
            <div className="card">
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} color="var(--primary)" /> Dynamic Recipient Fields
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 10px' }}>
                These placeholders dynamically substitute student data with built-in auto-shrink boundaries.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('STUDENT_NAME')}>
                  <Sparkles size={14} color="#2563eb" /> {'{{STUDENT_NAME}}'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('EVENT_NAME')}>
                  <Sparkles size={14} color="#2563eb" /> {'{{EVENT_NAME}}'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('CERTIFICATE_ID')}>
                  <Sparkles size={14} color="#2563eb" /> {'{{CERTIFICATE_ID}}'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('POSITION')}>
                  <Sparkles size={14} color="#2563eb" /> {'{{POSITION}}'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('COLLEGE')}>
                  <Sparkles size={14} color="#2563eb" /> {'{{COLLEGE}}'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('DEPARTMENT')}>
                  <Sparkles size={14} color="#2563eb" /> {'{{DEPARTMENT}}'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => addPlaceholder('EVENT_DATE')}>
                  <Sparkles size={14} color="#2563eb" /> {'{{EVENT_DATE}}'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => addQrPlaceholder()}>
                  <QrCode size={14} color="#2563eb" /> {'{{VERIFY_URL}} (QR Stamp)'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: TEXT ELEMENTS */}
          {activeTab === 'text' && (
            <div className="card">
              <h4>Standard Text Headers</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => addHeadingText('CERTIFICATE OF PARTICIPATION')}>
                  <Type size={14} /> Certificate Title
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => addHeadingText('CERTIFICATE OF ACHIEVEMENT')}>
                  <Type size={14} /> Achievement Title
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => addBodyText('PROUDLY PRESENTED TO')}>
                  <Type size={14} /> Subtitle / Prefix
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => addBodyText('for outstanding participation in the event.')}>
                  <Type size={14} /> Body Paragraph
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: SHAPES & BORDERS */}
          {activeTab === 'shapes' && (
            <div className="card">
              <h4>Frames & Decorative Shapes</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                <button className="btn btn-secondary btn-sm" onClick={addDoubleBorder}>
                  <Square size={14} /> Add Double Border Frame
                </button>
                <button className="btn btn-secondary btn-sm" onClick={addDividerLine}>
                  <Minus size={14} /> Add Signature Divider Line
                </button>
                <button className="btn btn-secondary btn-sm" onClick={addDecorativeBox}>
                  <Square size={14} /> Add Decorative Banner Box
                </button>
                <button className="btn btn-secondary btn-sm" onClick={addQrPlaceholder}>
                  <QrCode size={14} /> Insert QR Code Stamp
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: UPLOADS & GRAPHICS */}
          {activeTab === 'uploads' && (
            <div className="card">
              <h4>Logos & Backgrounds</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 10px' }}>
                Supports transparent PNGs for official signatures & institution seals.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  <ImageIcon size={14} /> Insert Logo / Signature (PNG)
                  <input type="file" accept="image/png,image/jpeg" onChange={handleImageUpload} style={{ display: 'none' }} />
                </label>

                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  <Upload size={14} /> Upload Canvas Background
                  <input type="file" accept="image/png,image/jpeg" onChange={handleBackgroundUpload} style={{ display: 'none' }} />
                </label>
              </div>

              {/* JSON Template Import / Export */}
              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: '11px' }} onClick={exportTemplateJSON}>
                    <FileCode size={13} /> Export JSON
                  </button>
                  <label className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: '11px', cursor: 'pointer' }}>
                    <FileUp size={13} /> Import JSON
                    <input type="file" accept=".json" onChange={handleImportJSON} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PRESETS */}
          {activeTab === 'presets' && (
            <div className="card">
              <h4>Ready-to-Use Presets</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 10px' }}>
                Load pre-formatted, production-ready certificate layouts:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => applyClassicPreset()}>
                  📜 Classic Academic Diploma
                </button>
                <button className="btn btn-secondary btn-sm" onClick={applyHackathonPreset}>
                  ⚡ Tech Hackathon & AI Award
                </button>
                <button className="btn btn-secondary btn-sm" onClick={applyExcellencePreset}>
                  🏆 Golden Excellence Award
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* OBJECT PROPERTIES INSPECTOR (Displayed when an item is selected)          */}
          {/* ========================================================================= */}
          {selectedObj && (
            <div className="card" style={{ borderLeft: '3px solid var(--primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '13px', margin: 0 }}>Object Inspector</h4>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn btn-secondary btn-sm" onClick={toggleLock} title={isLocked ? "Unlock" : "Lock"}>
                    {isLocked ? <Lock size={13} color="var(--danger)" /> : <Unlock size={13} />}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={duplicateSelectedObject} title="Duplicate">
                    <Copy size={13} />
                  </button>
                  <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={deleteSelectedObject} title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Dynamic Placeholder Indicator */}
              {isDynamic && (
                <div style={{ 
                  background: '#eff6ff', 
                  border: '1px solid #bfdbfe', 
                  color: '#1d4ed8', 
                  padding: '4px 8px', 
                  borderRadius: '4px', 
                  fontSize: '11px',
                  fontWeight: '600',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <Sparkles size={12} /> Dynamic Recipient Field
                </div>
              )}

              {/* Centering Actions */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: '11px' }} onClick={centerObjectHorizontally}>
                  <AlignCenter size={13} /> Center H
                </button>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: '11px' }} onClick={centerObjectVertically}>
                  Center V
                </button>
              </div>

              {/* Typography Controls (For text objects) */}
              {selectedObj.type && selectedObj.type.includes('text') && (
                <>
                  <div className="form-group" style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: '11px' }}>Font Family</label>
                    <select
                      className="form-control"
                      value={fontFamily}
                      onChange={e => {
                        setFontFamily(e.target.value);
                        updateProperty('fontFamily', e.target.value);
                      }}
                      style={{ fontSize: '12px', padding: '4px 8px' }}
                    >
                      <option value="Playfair Display">Playfair Display (Serif)</option>
                      <option value="Montserrat">Montserrat (Clean Sans)</option>
                      <option value="Great Vibes">Great Vibes (Calligraphy)</option>
                      <option value="Poppins">Poppins (Geometric)</option>
                      <option value="Noto Sans Telugu">Noto Sans Telugu</option>
                      <option value="Noto Sans Devanagari">Noto Sans Devanagari (Hindi)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px' }}>Size ({fontSize}px)</label>
                      <input
                        type="range"
                        min="24"
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
                    <div style={{ width: '40px' }}>
                      <label style={{ fontSize: '11px' }}>Color</label>
                      <input
                        type="color"
                        value={fillColor}
                        onChange={e => {
                          setFillColor(e.target.value);
                          updateProperty('fill', e.target.value);
                        }}
                        style={{ width: '100%', height: '30px', padding: 0, border: 'none', cursor: 'pointer' }}
                      />
                    </div>
                  </div>

                  {/* Formatting Buttons (Bold, Italic, Alignments) */}
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                    <button 
                      className={`btn btn-sm ${isBold ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '4px 8px' }}
                      onClick={() => {
                        const next = !isBold;
                        setIsBold(next);
                        updateProperty('fontWeight', next ? 'bold' : 'normal');
                      }}
                    >
                      <Bold size={13} />
                    </button>
                    <button 
                      className={`btn btn-sm ${isItalic ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '4px 8px' }}
                      onClick={() => {
                        const next = !isItalic;
                        setIsItalic(next);
                        updateProperty('fontStyle', next ? 'italic' : 'normal');
                      }}
                    >
                      <Italic size={13} />
                    </button>
                    <button 
                      className={`btn btn-sm ${textAlign === 'left' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '4px 8px' }}
                      onClick={() => {
                        setTextAlign('left');
                        updateProperty('textAlign', 'left');
                      }}
                    >
                      <AlignLeft size={13} />
                    </button>
                    <button 
                      className={`btn btn-sm ${textAlign === 'center' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '4px 8px' }}
                      onClick={() => {
                        setTextAlign('center');
                        updateProperty('textAlign', 'center');
                      }}
                    >
                      <AlignCenter size={13} />
                    </button>
                    <button 
                      className={`btn btn-sm ${textAlign === 'right' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '4px 8px' }}
                      onClick={() => {
                        setTextAlign('right');
                        updateProperty('textAlign', 'right');
                      }}
                    >
                      <AlignRight size={13} />
                    </button>
                  </div>

                  {/* Dynamic Auto-Shrink & MaxWidth Settings */}
                  {isDynamic && (
                    <div style={{ padding: '8px', background: 'var(--surface-sunken)', borderRadius: '6px', marginBottom: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={autoShrink}
                          onChange={e => {
                            const val = e.target.checked;
                            setAutoShrink(val);
                            if (!selectedObj.data) selectedObj.data = {};
                            selectedObj.data.autoShrink = val;
                            recordHistory();
                          }}
                        />
                        Enable Auto-Shrink for Long Names
                      </label>
                      <div style={{ marginTop: '6px' }}>
                        <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Max Width Boundary ({maxWidth}px)</label>
                        <input
                          type="number"
                          className="form-control"
                          value={maxWidth}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setMaxWidth(val);
                            if (!selectedObj.data) selectedObj.data = {};
                            selectedObj.data.maxWidth = val;
                            recordHistory();
                          }}
                          style={{ fontSize: '11px', padding: '3px 6px' }}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Layer Arrangement */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                  Layer Arrangement
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                  <button className="btn btn-secondary btn-sm" style={{ fontSize: '10px', padding: '4px' }} onClick={bringForward}>
                    Bring Forward
                  </button>
                  <button className="btn btn-secondary btn-sm" style={{ fontSize: '10px', padding: '4px' }} onClick={sendBackward}>
                    Send Backward
                  </button>
                  <button className="btn btn-secondary btn-sm" style={{ fontSize: '10px', padding: '4px' }} onClick={bringToFront}>
                    Bring to Front
                  </button>
                  <button className="btn btn-secondary btn-sm" style={{ fontSize: '10px', padding: '4px' }} onClick={sendToBack}>
                    Send to Back
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* DATABASE SAVED TEMPLATES (PostgreSQL Library)                             */}
          {/* ========================================================================= */}
          {templates.length > 0 && (
            <div className="card">
              <h4>Database Templates ({templates.length})</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {templates.map(t => (
                  <div 
                    key={t.id}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: 'var(--surface-sunken)',
                      fontSize: '12px'
                    }}
                  >
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ border: 'none', background: 'transparent', padding: 0, textAlign: 'left', flex: 1, textOverflow: 'ellipsis', overflow: 'hidden' }}
                      onClick={() => handleLoadTemplate(t)}
                    >
                      <FolderOpen size={12} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> 
                      {t.name}
                    </button>
                    <button
                      onClick={e => handleDeleteSavedTemplate(t.id, t.name, e)}
                      style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', padding: '2px 4px' }}
                      title="Delete Template"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* CENTER CANVAS VIEWPORT (Scaled Logical 3508x2480 A4 Frame)                */}
        {/* ========================================================================= */}
        <div 
          ref={containerRef}
          className="card" 
          style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column',
            justifyContent: 'center', 
            alignItems: 'center',
            background: '#64748b',
            overflow: 'auto',
            position: 'relative',
            padding: '20px'
          }}
        >
          {/* Floating Canvas Zoom & Viewport Overlay */}
          <div style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            padding: '6px 12px',
            borderRadius: '24px',
            color: '#ffffff',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 10
          }}>
            <button 
              onClick={() => adjustZoom(0.85)} 
              style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '2px 4px' }}
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', minWidth: '42px', textAlign: 'center' }}>
              {Math.round(zoomLevel * 100)}%
            </span>
            <button 
              onClick={() => adjustZoom(1.15)} 
              style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '2px 4px' }}
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
            <button 
              onClick={resetFitZoom} 
              style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '2px 4px', borderLeft: '1px solid rgba(255,255,255,0.2)', marginLeft: '4px' }}
              title="Fit to Screen"
            >
              <Maximize2 size={15} />
            </button>
          </div>

          {/* Fixed A4 Canvas with Elevation Drop Shadow */}
          <div style={{ 
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)', 
            borderRadius: '2px', 
            overflow: 'hidden',
            backgroundColor: '#ffffff'
          }}>
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>
    </>
  );
}
