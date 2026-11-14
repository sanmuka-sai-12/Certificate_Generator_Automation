import qrcode
import io
from PIL import Image

def generate_qr_image(data_url: str, size: int = 300) -> Image.Image:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=1,
    )
    qr.add_data(data_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")
    return img.resize((size, size))

def generate_qr_bytes(data_url: str, size: int = 300) -> bytes:
    img = generate_qr_image(data_url, size)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
