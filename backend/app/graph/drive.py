"""Drive-level helpers for a SharePoint Embedded container.

A container exposes a `drive`; folders and files are `driveItem`s addressed by id.
All folder creation is idempotent (`ensure_folder`) so provisioning and the
month-folder scheduler can run repeatedly without creating duplicates.
"""
from urllib.parse import quote

import httpx

from ..config import settings
from .client import GraphError, graph
from .http import verify

# Graph: files <= 4 MiB can use a simple PUT; larger needs an upload session.
SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024
CHUNK = 10 * 320 * 1024  # 3.2 MiB, multiple of 320 KiB as Graph requires


async def get_container_drive_id(container_id: str) -> str:
    data = await graph().get(f"/storage/fileStorage/containers/{container_id}/drive")
    return data["id"]


async def get_root_item_id(drive_id: str) -> str:
    data = await graph().get(f"/drives/{drive_id}/root")
    return data["id"]


async def list_children(drive_id: str, item_id: str) -> list[dict]:
    items, url = [], f"/drives/{drive_id}/items/{item_id}/children?$top=200"
    while url:
        data = await graph().get(url)
        items.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
    return items


async def find_child(drive_id: str, parent_id: str, name: str) -> dict | None:
    for child in await list_children(drive_id, parent_id):
        if child.get("name", "").lower() == name.lower():
            return child
    return None


async def ensure_folder(drive_id: str, parent_id: str, name: str) -> dict:
    """Return the child folder named `name` under `parent_id`, creating it if absent.

    Create-first: one API call when the folder is new (the common case during
    provisioning); only falls back to a lookup if it already exists (409)."""
    try:
        return await graph().post(
            f"/drives/{drive_id}/items/{parent_id}/children",
            json={
                "name": name,
                "folder": {},
                "@microsoft.graph.conflictBehavior": "fail",
            },
        )
    except GraphError as e:
        if e.status == 409:
            existing = await find_child(drive_id, parent_id, name)
            if existing and "folder" in existing:
                return existing
        raise


async def upload_file(
    drive_id: str, parent_id: str, name: str, content: bytes, content_type: str = ""
) -> dict:
    if len(content) <= SIMPLE_UPLOAD_LIMIT:
        return await _upload_small(drive_id, parent_id, name, content, content_type)
    return await _upload_large(drive_id, parent_id, name, content)


async def _upload_small(drive_id, parent_id, name, content, content_type) -> dict:
    path = f"/drives/{drive_id}/items/{parent_id}:/{quote(name)}:/content"
    headers = {"Content-Type": content_type or "application/octet-stream"}
    return (await graph().request("PUT", path, content=content, headers=headers)).json()


async def _upload_large(drive_id, parent_id, name, content) -> dict:
    path = f"/drives/{drive_id}/items/{parent_id}:/{quote(name)}:/createUploadSession"
    session = await graph().post(
        path, json={"item": {"@microsoft.graph.conflictBehavior": "replace"}}
    )
    upload_url = session["uploadUrl"]
    size = len(content)
    result: dict = {}
    # uploadUrl is pre-authenticated — must NOT carry the bearer header.
    async with httpx.AsyncClient(timeout=120, verify=verify()) as client:
        for start in range(0, size, CHUNK):
            end = min(start + CHUNK, size)
            chunk = content[start:end]
            resp = await client.put(
                upload_url,
                content=chunk,
                headers={
                    "Content-Length": str(len(chunk)),
                    "Content-Range": f"bytes {start}-{end - 1}/{size}",
                },
            )
            if resp.status_code >= 400:
                raise GraphError(resp.status_code, resp.text)
            if resp.content:
                result = resp.json()
    return result


async def get_item(drive_id: str, item_id: str) -> dict:
    return await graph().get(f"/drives/{drive_id}/items/{item_id}")


async def download_file(drive_id: str, item_id: str) -> tuple[bytes, str, str]:
    """Return (content, content_type, name) for a file driveItem.

    Fetch full item metadata (no $select — otherwise the pre-authed
    @microsoft.graph.downloadUrl is omitted) and download the bytes from it.
    Falls back to the /content endpoint *following redirects*."""
    meta = await graph().get(f"/drives/{drive_id}/items/{item_id}")
    name = meta.get("name", "download")
    ctype = (meta.get("file") or {}).get("mimeType", "application/octet-stream")
    url = meta.get("@microsoft.graph.downloadUrl")
    if url:
        async with httpx.AsyncClient(timeout=120, follow_redirects=True, verify=verify()) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.content, ctype, name
    # Fallback: authenticated content endpoint (302 -> storage host; httpx
    # strips the auth header on the cross-host redirect, which is correct).
    from .client import graph as _graph

    token = _graph()._token()
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(
            f"{settings.graph_base_url}/drives/{drive_id}/items/{item_id}/content",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.content, ctype, name


async def search_items(drive_id: str, query: str) -> list[dict]:
    q = query.replace("'", "''")
    data = await graph().get(
        f"/drives/{drive_id}/root/search(q='{q}')"
        "?$select=id,name,file,folder,parentReference&$top=50"
    )
    return data.get("value", [])


async def delete_item(drive_id: str, item_id: str) -> None:
    await graph().delete(f"/drives/{drive_id}/items/{item_id}")


async def get_preview_url(drive_id: str, item_id: str) -> str:
    """Short-lived web URL to view the document."""
    data = await graph().post(f"/drives/{drive_id}/items/{item_id}/preview", json={})
    return data.get("getUrl") or data.get("postUrl", "")
