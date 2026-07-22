import asyncio, json
from app.services import get_backend

TARGET_NAMES = ["MV Vessel", "MV Fighter"]

async def main():
    be = get_backend()
    vessels = await be.list_vessels()
    name_to_id = {v["name"]: v["id"] for v in vessels}
    result = {"done": [], "errors": []}
    for name in TARGET_NAMES:
        vid = name_to_id.get(name)
        if not vid:
            result["errors"].append({"name": name, "error": "not found in vessels table"})
            continue
        try:
            r = await be.reprovision_vessel(vid)
            result["done"].append({"name": name, "id": vid, "ok": r.get("ok", False)})
        except Exception as e:
            result["errors"].append({"name": name, "id": vid, "error": str(e)})
    print(json.dumps(result, indent=2))

asyncio.run(main())
