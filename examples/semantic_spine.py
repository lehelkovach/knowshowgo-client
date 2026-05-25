from python.client import KnowShowGoClient


ksg = KnowShowGoClient(base_url="http://localhost:3000")

category = ksg.create_category({
    "name": "ProcedureExample",
    "properties": [{"name": "purpose", "type": "string"}],
})

obj = ksg.upsert_object({
    "categoryPrototypeUuid": category["categoryPrototypeUuid"],
    "title": "Invoice submission helper",
    "tags": ["#[invoice submission helper]"],
    "knowledgeKind": "fact",
    "properties": [{"name": "purpose", "type": "string", "value": "Submit invoices"}],
})

procedure = ksg.create_procedure({
    "title": "Submit invoice",
    "steps": [
        {"title": "Open portal", "tool": "browser.open", "payload": {"url": "https://portal.example"}},
        {"title": "Click submit", "tool": "browser.click", "payload": {"selector": "#submit"}},
    ],
    "dependencies": [[0, 1]],
})

print({
    "objectUuid": obj["objectUuid"],
    "procedureUuid": procedure["procedure_uuid"],
})

