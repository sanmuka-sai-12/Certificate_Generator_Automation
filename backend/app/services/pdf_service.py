import pymupdf as fitz
import io
import re
from PIL import Image
from app.services.qr_service import generate_qr_bytes
from app.core.config import settings

def replace_placeholders(text: str, variables: dict) -> str:
    def replacer(match):
        key = match.group(1)
        return str(variables.get(key, ""))
    return re.sub(r"\{\{([A-Za-z0-9_:]+)\}\}", replacer, text)

def render_certificate_pdf(
    template_json: dict,
    participant_data: dict,
    event_data: dict
) -> bytes:
    """
    Renders a high-resolution certificate PDF according to template schema
    A4 Landscape: 3508 x 2480 (logical) mapped to points or direct fitz page
    """
    width = template_json.get("page", {}).get("width", 3508)
    height = template_json.get("page", {}).get("height", 2480)
    
    # Create empty PDF
    doc = fitz.open()
    # 72 points per inch; A4 landscape is 842 x 595.3 points
    page = doc.new_page(width=842, height=595.3)
    
    scale_x = 842 / width
    scale_y = 595.3 / height
    
    verify_url = f"{settings.VERIFICATION_BASE_URL}?id={participant_data.get('cert_id')}&t={participant_data.get('verify_token')}"
    
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
        "VERIFY_URL": verify_url
    }
    
    # 1. Background fill
    page.draw_rect(fitz.Rect(0, 0, 842, 595.3), color=None, fill=(1, 1, 1))
    
    # 2. Render Objects from Fabric JSON
    objects = template_json.get("objects", [])
    for obj in objects:
        obj_type = obj.get("type", "")
        left = obj.get("left", 0) * scale_x
        top = obj.get("top", 0) * scale_y
        
        if obj_type in ["textbox", "text"]:
            raw_text = obj.get("text", "")
            rendered_text = replace_placeholders(raw_text, variables)
            font_size = (obj.get("fontSize", 40)) * scale_y * 0.75
            
            # Auto-shrink logic
            max_width = (obj.get("data", {}).get("maxWidth", 2400)) * scale_x
            min_size = (obj.get("data", {}).get("minSize", 20)) * scale_y * 0.75
            
            # Simple length-based font shrink
            while len(rendered_text) * (font_size * 0.5) > max_width and font_size > min_size:
                font_size -= 1
                
            origin_x = obj.get("originX", "left")
            text_align = obj.get("textAlign", "center")
            
            rect = fitz.Rect(left - 300, top, left + 300, top + font_size * 2)
            if origin_x == "center":
                page.insert_textbox(
                    rect,
                    rendered_text,
                    fontsize=font_size,
                    align=fitz.TEXT_ALIGN_CENTER
                )
            else:
                page.insert_text(
                    fitz.Point(left, top),
                    rendered_text,
                    fontsize=font_size
                )
                
        elif obj_type == "qr" or "{{VERIFY_URL}}" in str(obj.get("value", "")):
            qr_bytes = generate_qr_bytes(verify_url, size=200)
            qr_rect = fitz.Rect(left, top, left + 60, top + 60)
            page.insert_image(qr_rect, stream=qr_bytes)

    # If no QR code object was defined, draw default QR code at bottom-right corner
    default_qr_bytes = generate_qr_bytes(verify_url, size=150)
    page.insert_image(fitz.Rect(740, 500, 810, 570), stream=default_qr_bytes)
    
    # Watermark / Verification notice
    page.insert_text(
        fitz.Point(740, 580),
        f"ID: {participant_data.get('cert_id')}",
        fontsize=7,
        color=(0.4, 0.4, 0.4)
    )

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes
