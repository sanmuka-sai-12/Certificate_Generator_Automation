"""
=====================================================================================
Smart Certificate Generator - PDF Rendering Engine (PyMuPDF / fitz)
=====================================================================================

This module translates visual Fabric.js canvas template JSON definitions into
standard, print-ready, high-resolution A4 landscape PDF documents (842 x 595.3 points).

Key Capabilities:
1. Coordinate Scaling:
   - Maps 3508 x 2480 logical canvas pixels into A4 landscape PDF points.
2. Auto-Shrink Algorithm:
   - Dynamically calculates recipient text width; shrinks font size iteratively
     down to a configurable `minSize` if a long student name exceeds `maxWidth`.
3. Multi-Format Shape & Vector Support:
   - Renders background images, solid color fills, and decorative border rectangles.
   - Renders custom shapes (`rect`, `line`) for frames, signatory underlines, and banners.
4. Tamper-Proof Verification Stamp:
   - Embeds a cryptographically bound QR code pointing to the public verification portal
     with the recipient's unique certificate ID and verification token.
=====================================================================================
"""

import pymupdf as fitz
import io
import re
import base64
from typing import Optional, Tuple, Dict, Any
from PIL import Image
from app.services.qr_service import generate_qr_bytes
from app.core.config import settings


def parse_color(color_str: Optional[str]) -> Optional[Tuple[float, float, float]]:
    """
    Parses a hex color string (e.g. '#0f2744' or '#fff') into PyMuPDF RGB float tuples (0.0 to 1.0).
    Returns None if the color is empty or 'transparent'.
    """
    if not color_str or color_str == "transparent":
        return None
    if color_str.startswith("#"):
        c = color_str.lstrip("#")
        # Handle 3-character hex abbreviations (#fff -> #ffffff)
        if len(c) == 3:
            c = "".join([ch * 2 for ch in c])
        if len(c) == 6:
            r = int(c[0:2], 16) / 255.0
            g = int(c[2:4], 16) / 255.0
            b = int(c[4:6], 16) / 255.0
            return (r, g, b)
    # Default fallback dark color
    return (0.1, 0.1, 0.1)


def decode_data_url(data_url: str) -> bytes:
    """
    Extracts and decodes raw binary bytes from a base64 Data URL
    (e.g. 'data:image/png;base64,iVBORw0KGgo...').
    """
    try:
        if "," in data_url:
            data_url = data_url.split(",", 1)[1]
        return base64.b64decode(data_url)
    except Exception:
        return b""


def replace_placeholders(text: str, variables: Dict[str, Any]) -> str:
    """
    Replaces template placeholder tokens like {{STUDENT_NAME}} or {{EVENT_NAME}}
    with sanitized recipient values.
    """
    def replacer(match):
        key = match.group(1)
        return str(variables.get(key, ""))
    return re.sub(r"\{\{([A-Za-z0-9_:]+)\}\}", replacer, str(text or ""))


def render_certificate_pdf(
    template_json: Dict[str, Any],
    participant_data: Dict[str, Any],
    event_data: Dict[str, Any]
) -> bytes:
    """
    Renders a high-resolution certificate PDF from Fabric.js template JSON.

    Args:
        template_json: Fabric.js schema containing canvas objects, page dimensions, and background.
        participant_data: Recipient dictionary containing name, email, cert_id, and verify_token.
        event_data: Project/Event metadata containing event_name, event_date, organization.

    Returns:
        Raw bytes of the rendered PDF document.
    """
    page_cfg = template_json.get("page", {})
    width = page_cfg.get("width", 3508)
    height = page_cfg.get("height", 2480)
    
    # Create empty PDF page with standard A4 landscape dimensions (842 x 595.3 points)
    doc = fitz.open()
    page = doc.new_page(width=842, height=595.3)
    
    # Coordinate scaling ratios from logical pixels to PDF points
    scale_x = 842 / width
    scale_y = 595.3 / height
    
    # Construct public verification URL
    verify_url = f"{settings.VERIFICATION_BASE_URL}?id={participant_data.get('cert_id')}&t={participant_data.get('verify_token')}"
    
    # Build placeholder dictionary for dynamic token substitution
    variables = {
        "STUDENT_NAME": participant_data.get("name", ""),
        "EVENT_NAME": event_data.get("event_name", ""),
        "EVENT_DATE": event_data.get("event_date", ""),
        "ORG_NAME": event_data.get("organization", ""),
        "CERTIFICATE_ID": participant_data.get("cert_id", ""),
        "CERT_TYPE": participant_data.get("cert_type", "Participation"),
        "COLLEGE": participant_data.get("college", ""),
        "DEPARTMENT": participant_data.get("department", ""),
        "POSITION": participant_data.get("position", ""),
        "REG_NO": participant_data.get("reg_no", ""),
        "VERIFY_URL": verify_url
    }
    
    # Support custom columns mapped as {{CUSTOM:<column>}}
    if participant_data.get("custom_fields"):
        for k, v in participant_data["custom_fields"].items():
            variables[f"CUSTOM:{k}"] = str(v)
            variables[k] = str(v)

    # -----------------------------------------------------------------------------------
    # 1. Background Fill & Graphic Image
    # -----------------------------------------------------------------------------------
    bg_color = parse_color(template_json.get("background", {}).get("color", "#ffffff")) or (1, 1, 1)
    page.draw_rect(fitz.Rect(0, 0, 842, 595.3), color=None, fill=bg_color)
    
    bg_img_data = template_json.get("background", {}).get("dataUrl") or template_json.get("backgroundImage")
    if bg_img_data and isinstance(bg_img_data, str) and bg_img_data.startswith("data:"):
        bg_bytes = decode_data_url(bg_img_data)
        if bg_bytes:
            page.insert_image(fitz.Rect(0, 0, 842, 595.3), stream=bg_bytes)
            
    # Draw default navy/gold border frame only if no custom background image is uploaded
    show_default_border = template_json.get("showDefaultBorder", True) and not bg_img_data
    if show_default_border:
        page.draw_rect(fitz.Rect(20, 20, 822, 575.3), color=(0.15, 0.25, 0.45), width=2)
        page.draw_rect(fitz.Rect(24, 24, 818, 571.3), color=(0.75, 0.65, 0.35), width=0.8)

    has_qr_object = False
    
    # -----------------------------------------------------------------------------------
    # 2. Render Canvas Objects (Text, Shapes, Images, QR codes)
    # -----------------------------------------------------------------------------------
    objects = template_json.get("objects", [])
    for obj in objects:
        obj_type = obj.get("type", "")
        left = obj.get("left", 0) * scale_x
        top = obj.get("top", 0) * scale_y
        
        # --- A. Typography & Dynamic Text with Auto-Shrink ---
        if obj_type in ["textbox", "text", "i-text"]:
            raw_text = obj.get("text", "")
            rendered_text = replace_placeholders(raw_text, variables)
            font_size = (obj.get("fontSize", 40)) * scale_y * 0.75
            
            # Auto-shrink logic: reduce font size iteratively if rendered text exceeds maxWidth
            max_width = (obj.get("data", {}).get("maxWidth") or obj.get("width", 2400)) * scale_x
            min_size = (obj.get("data", {}).get("minSize", 20)) * scale_y * 0.75
            
            while len(rendered_text) * (font_size * 0.48) > max_width and font_size > min_size:
                font_size -= 0.8
                
            origin_x = obj.get("originX", "left")
            text_color = parse_color(obj.get("fill", "#1a1a1a"))
            
            text_rect = fitz.Rect(
                left - (max_width / 2 if origin_x == "center" else 0),
                top,
                left + (max_width / 2 if origin_x == "center" else max_width),
                top + font_size * 2.5
            )
            
            page.insert_textbox(
                text_rect,
                rendered_text,
                fontsize=font_size,
                color=text_color,
                align=fitz.TEXT_ALIGN_CENTER if origin_x == "center" else fitz.TEXT_ALIGN_LEFT
            )
            
        # --- B. Rectangles, Frames & Banner Boxes ---
        elif obj_type == "rect":
            w = (obj.get("width", 100) * obj.get("scaleX", 1)) * scale_x
            h = (obj.get("height", 100) * obj.get("scaleY", 1)) * scale_y
            fill_c = parse_color(obj.get("fill"))
            stroke_c = parse_color(obj.get("stroke"))
            stroke_w = (obj.get("strokeWidth") or 0) * scale_x
            if fill_c or stroke_c:
                page.draw_rect(
                    fitz.Rect(left, top, left + w, top + h),
                    color=stroke_c,
                    fill=fill_c,
                    width=stroke_w if stroke_c else 0
                )
                
        # --- C. Divider & Signature Lines ---
        elif obj_type == "line":
            x1 = obj.get("x1", 0) * scale_x
            y1 = obj.get("y1", 0) * scale_y
            x2 = obj.get("x2", 0) * scale_x
            y2 = obj.get("y2", 0) * scale_y
            stroke_c = parse_color(obj.get("stroke", "#000000")) or (0, 0, 0)
            stroke_w = (obj.get("strokeWidth") or 1) * scale_x
            page.draw_line(fitz.Point(x1, y1), fitz.Point(x2, y2), color=stroke_c, width=stroke_w)

        # --- D. Logos & Signatures (Images) ---
        elif obj_type == "image":
            src = obj.get("src", "")
            if src.startswith("data:"):
                img_bytes = decode_data_url(src)
                if img_bytes:
                    w = (obj.get("width", 200) * obj.get("scaleX", 1)) * scale_x
                    h = (obj.get("height", 200) * obj.get("scaleY", 1)) * scale_y
                    page.insert_image(fitz.Rect(left, top, left + w, top + h), stream=img_bytes)
                    
        # --- E. QR Code Placeholder Object ---
        elif obj_type == "qr" or "{{VERIFY_URL}}" in str(obj.get("value", "")) or "{{VERIFY_URL}}" in str(obj.get("text", "")):
            has_qr_object = True
            qr_bytes = generate_qr_bytes(verify_url, size=240)
            size = (obj.get("size", 200)) * scale_x
            page.insert_image(fitz.Rect(left, top, left + size, top + size), stream=qr_bytes)

    # -----------------------------------------------------------------------------------
    # 3. Fallback Verification QR Stamp
    # -----------------------------------------------------------------------------------
    # If the organizer did not explicitly position a QR object on the canvas,
    # embed a clean verification QR stamp in the bottom-right corner automatically.
    if not has_qr_object:
        default_qr_bytes = generate_qr_bytes(verify_url, size=150)
        page.insert_image(fitz.Rect(735, 485, 805, 555), stream=default_qr_bytes)
        page.insert_text(
            fitz.Point(735, 565),
            f"ID: {participant_data.get('cert_id')}",
            fontsize=7,
            color=(0.3, 0.3, 0.3)
        )

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes
