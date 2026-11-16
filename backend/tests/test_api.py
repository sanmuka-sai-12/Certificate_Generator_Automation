import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.pdf_service import render_certificate_pdf

client = TestClient(app)

def test_health_check():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"

def test_project_crud():
    # 1. Create project
    create_payload = {
        "name": "Integration Test Symposium",
        "organization": "Test University",
        "event_name": "Hackathon 2026",
        "event_date": "2026-11-20",
        "cert_type": "Participation"
    }
    res = client.post("/api/v1/projects", json=create_payload)
    assert res.status_code == 200
    project = res.json()
    project_id = project["id"]
    assert project["name"] == "Integration Test Symposium"

    # 2. Get project
    res = client.get(f"/api/v1/projects/{project_id}")
    assert res.status_code == 200
    assert res.json()["id"] == project_id

    # 3. Import participants
    import_payload = {
        "prefix": "TEST",
        "participants": [
            {
                "name": "Ravi Kumar",
                "email": "ravi.kumar@example.com",
                "college": "Test College",
                "department": "CSE"
            },
            {
                "name": "Dr. Bartholomew Montgomery-Worthington III of South Gloucestershire",
                "email": "bmw3@example.org",
                "college": "Oxford University",
                "position": "Keynote Speaker"
            },
            {
                "name": "Priya Sharma",
                "email": "priya.sharma@example.edu",
                "college": "Delhi University"
            }
        ]
    }
    res = client.post(f"/api/v1/participants/{project_id}/import", json=import_payload)
    assert res.status_code == 200
    assert res.json()["saved"] == 3

    # 4. List participants
    res = client.get(f"/api/v1/participants/{project_id}")
    assert res.status_code == 200
    participants = res.json()
    assert len(participants) == 3
    
    first_p = participants[0]
    assert first_p["cert_id"].startswith("TEST-")
    assert len(first_p["verify_token"]) == 12

    # 5. Get Stats
    res = client.get(f"/api/v1/participants/{project_id}/stats")
    assert res.status_code == 200
    stats = res.json()
    assert stats["total"] == 3
    assert stats["pending"] == 3

    # 6. Verify Certificate Public Endpoint
    res = client.get(f"/api/v1/verify?id={first_p['cert_id']}&t={first_p['verify_token']}")
    assert res.status_code == 200
    ver_data = res.json()
    assert ver_data["status"] == "valid"
    assert ver_data["recipient_name"] == "Ravi Kumar"
    # Ensure privacy: email is NOT exposed
    assert "email" not in ver_data

    # 7. Verify with wrong token fails
    res = client.get(f"/api/v1/verify?id={first_p['cert_id']}&t=wrongtoken123")
    assert res.status_code == 200
    assert res.json()["status"] == "not_found"

def test_pdf_rendering():
    tpl_json = {
        "page": {"width": 3508, "height": 2480},
        "objects": [
            {"type": "text", "text": "CERTIFICATE OF PARTICIPATION", "left": 1754, "top": 500, "originX": "center", "fontSize": 120},
            {"type": "text", "text": "{{STUDENT_NAME}}", "left": 1754, "top": 1100, "originX": "center", "fontSize": 160}
        ]
    }
    p_data = {
        "name": "Dr. Bartholomew Montgomery-Worthington III of South Gloucestershire",
        "cert_id": "TEST-002",
        "verify_token": "abc123xyz789",
        "cert_type": "Keynote"
    }
    evt_data = {
        "event_name": "International Tech Summit 2026",
        "organization": "ACM Student Chapter"
    }
    pdf_bytes = render_certificate_pdf(tpl_json, p_data, evt_data)
    assert pdf_bytes is not None
    assert len(pdf_bytes) > 1000
    assert pdf_bytes.startswith(b"%PDF")

def test_template_crud():
    # 1. Create a template
    payload = {
        "name": "Unit Test Template",
        "width": 3508,
        "height": 2480,
        "orientation": "landscape",
        "template_json": {
            "page": {"width": 3508, "height": 2480},
            "objects": [
                {"type": "rect", "left": 60, "top": 60, "width": 3388, "height": 2360, "stroke": "#0f2744", "strokeWidth": 6},
                {"type": "line", "x1": 500, "y1": 2100, "x2": 1100, "y2": 2100, "stroke": "#0f2744", "strokeWidth": 3},
                {"type": "text", "text": "{{STUDENT_NAME}}", "left": 1754, "top": 1100, "originX": "center", "fontSize": 150}
            ]
        },
        "thumbnail_data_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    }
    res = client.post("/api/v1/templates", json=payload)
    assert res.status_code == 200
    tpl = res.json()
    tpl_id = tpl["id"]
    assert tpl["name"] == "Unit Test Template"

    # 2. List templates
    res = client.get("/api/v1/templates")
    assert res.status_code == 200
    templates = res.json()
    assert any(t["id"] == tpl_id for t in templates)

    # 3. Get single template
    res = client.get(f"/api/v1/templates/{tpl_id}")
    assert res.status_code == 200
    assert res.json()["id"] == tpl_id

    # 4. Render PDF with custom shapes (rect and line)
    p_data = {
        "name": "Jane Doe",
        "cert_id": "TEST-SHAPE-001",
        "verify_token": "token1234567"
    }
    evt_data = {
        "event_name": "Shape Test Con",
        "organization": "Test Org"
    }
    pdf_bytes = render_certificate_pdf(tpl["template_json"], p_data, evt_data)
    assert pdf_bytes.startswith(b"%PDF")

    # 5. Delete template
    res = client.delete(f"/api/v1/templates/{tpl_id}")
    assert res.status_code == 200
    assert res.json()["ok"] is True

    # 6. Verify 404 after deletion
    res = client.get(f"/api/v1/templates/{tpl_id}")
    assert res.status_code == 404
