"""
REST API Adapter for Chanakya Commons.

Exposes the pure-Python NetworkEngine over HTTP using Python's standard library
ThreadingHTTPServer so zero external pip dependencies are required.
"""

from __future__ import annotations

import argparse
import base64
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
import sys
import time
from typing import Any, Optional
from urllib.parse import parse_qs, unquote, urlparse
import uuid

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.engine import EngineError, NetworkEngine
from backend.seed import seed_if_empty

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


class ChanakyaHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True

    def __init__(self, server_address: tuple[str, int], engine: NetworkEngine) -> None:
        self.engine = engine
        super().__init__(server_address, APIRequestHandler)


class APIRequestHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:
        return

    @property
    def engine(self) -> NetworkEngine:
        return self.server.engine  # type: ignore[attr-defined]

    def _send_json(
        self,
        status: int,
        payload: Any,
        extra_headers: Optional[list[tuple[str, str]]] = None,
    ) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if extra_headers:
            for k, v in extra_headers:
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        if length > 12 * 1024 * 1024:
            raise EngineError("Payload too large (max 12 MB).", status_code=413)
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception as exc:
            raise EngineError(f"Invalid JSON payload: {exc}", status_code=400) from exc
        if not isinstance(data, dict):
            raise EngineError("JSON body must be an object.", status_code=400)
        return data

    def _extract_token(self) -> Optional[str]:
        auth_header = self.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            tok = auth_header[7:].strip()
            if tok:
                return tok
        cookie_hdr = self.headers.get("Cookie", "")
        if cookie_hdr:
            c = cookies.SimpleCookie()
            try:
                c.load(cookie_hdr)
                if "cc_session" in c:
                    return c["cc_session"].value
            except Exception:
                pass
        return None

    def _require_auth(self) -> tuple[str, str]:
        token = self._extract_token()
        username = self.engine.authenticate_token(token)
        if not username or not token:
            raise EngineError("Authentication required.", status_code=401)
        return username, token

    def _optional_auth(self) -> Optional[str]:
        return self.engine.authenticate_token(self._extract_token())

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        try:
            if path == "/api/health":
                return self._send_json(200, {"ok": True, "engine": "NetworkEngine"})

            if path.startswith("/api/uploads/"):
                fname = os.path.basename(unquote(path[len("/api/uploads/") :]))
                fpath = os.path.join(UPLOAD_DIR, fname)
                if not fname or not os.path.isfile(fpath):
                    return self._send_json(404, {"error": "File not found."})
                ctype, _ = mimetypes.guess_type(fpath)
                with open(fpath, "rb") as fh:
                    data = fh.read()
                self.send_response(200)
                self.send_header("Content-Type", ctype or "application/octet-stream")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()
                self.wfile.write(data)
                return

            if path == "/api/auth/me":
                viewer = self._optional_auth()
                if not viewer:
                    return self._send_json(200, {"user": None})
                return self._send_json(
                    200,
                    {
                        "user": self.engine.get_profile(viewer, viewer=viewer),
                        "undo": self.engine.get_undo_status(viewer),
                    },
                )

            if path == "/api/auth/register/status":
                identifier = qs.get("identifier", [""])[0]
                return self._send_json(
                    200, self.engine.check_registration_status(identifier)
                )

            if path == "/api/auth/password-reset/status":
                identifier = qs.get("identifier", [""])[0]
                return self._send_json(
                    200, self.engine.check_password_reset_status(identifier)
                )

            if path == "/api/announcements":
                self._require_auth()
                return self._send_json(
                    200, {"announcements": self.engine.get_announcements()}
                )

            if path == "/api/admin/overview":
                username, _ = self._require_auth()
                return self._send_json(
                    200, self.engine.admin_get_governance_overview(username)
                )

            if path == "/api/users/search":
                viewer = self._optional_auth()
                q = qs.get("q", [""])[0]
                limit = min(50, max(1, int(qs.get("limit", ["12"])[0])))
                results = self.engine.search_users(q, viewer=viewer, limit=limit)
                return self._send_json(200, {"results": results})

            if path.startswith("/api/users/") and path.endswith("/posts"):
                target = unquote(path[len("/api/users/") : -len("/posts")])
                viewer = self._optional_auth()
                posts = self.engine.get_user_posts(target, viewer=viewer)
                return self._send_json(200, {"posts": posts})

            if path.startswith("/api/users/") and path.endswith("/portfolio"):
                target = unquote(path[len("/api/users/") : -len("/portfolio")])
                items = self.engine.get_portfolio(target)
                return self._send_json(200, {"items": items})

            if path.startswith("/api/users/"):
                target = unquote(path[len("/api/users/") :])
                viewer = self._optional_auth()
                profile = self.engine.get_profile(target, viewer=viewer)
                return self._send_json(200, {"profile": profile})

            if path == "/api/connections":
                username, _ = self._require_auth()
                return self._send_json(200, self.engine.get_network_overview(username))

            if path == "/api/connections/suggestions":
                username, _ = self._require_auth()
                limit = min(30, max(1, int(qs.get("limit", ["12"])[0])))
                return self._send_json(
                    200,
                    {"suggestions": self.engine.get_people_you_may_know(username, limit=limit)},
                )

            if path == "/api/connections/path":
                username, _ = self._require_auth()
                target = qs.get("target", [""])[0]
                if not target:
                    raise EngineError("Target username is required.")
                return self._send_json(200, self.engine.get_degree_and_path(username, target))

            if path == "/api/communities":
                viewer = self._optional_auth()
                return self._send_json(
                    200, self.engine.get_communities_overview(viewer=viewer)
                )

            if path == "/api/graph":
                viewer = self._optional_auth()
                return self._send_json(200, self.engine.get_graph_snapshot(viewer=viewer))

            if path == "/api/feed":
                username, _ = self._require_auth()
                include_self = qs.get("include_self", ["true"])[0].lower() != "false"
                scope = qs.get("scope", ["campus"])[0]
                limit = min(60, max(1, int(qs.get("limit", ["30"])[0])))
                posts = self.engine.get_home_feed(
                    username, include_self=include_self, limit=limit, scope=scope
                )
                return self._send_json(200, {"posts": posts})

            if path == "/api/feed/trending":
                username, _ = self._require_auth()
                limit = min(20, max(1, int(qs.get("limit", ["6"])[0])))
                scope = qs.get("scope", ["campus"])[0]
                posts = self.engine.get_trending_posts(username, limit=limit, scope=scope)
                return self._send_json(200, {"posts": posts})

            if path == "/api/notifications":
                username, _ = self._require_auth()
                return self._send_json(200, self.engine.get_notifications(username))

            if path == "/api/undo/status":
                username, _ = self._require_auth()
                return self._send_json(200, self.engine.get_undo_status(username))

            return self._send_json(404, {"error": f"Unknown endpoint: {path}"})
        except EngineError as exc:
            err_payload: dict[str, Any] = {"error": exc.message}
            if exc.code:
                err_payload["code"] = exc.code
            return self._send_json(exc.status_code, err_payload)
        except Exception as exc:
            return self._send_json(500, {"error": f"Internal error: {exc}"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json()

            if path == "/api/auth/register/request":
                uid = str(body.get("university_id") or body.get("outlook_email") or "")
                res = self.engine.submit_registration_request(
                    university_id=uid,
                    username=str(body.get("username", "")),
                    password=str(body.get("password", "")),
                    name=str(body.get("name", "")),
                    role=str(body.get("role", "student")),
                    school=str(body.get("school", "")),
                    programme=str(body.get("programme", "")),
                    year=str(body.get("year", "")),
                    bio=str(body.get("bio", "")),
                    skills=list(body.get("skills", []) or []),
                )
                return self._send_json(201, res)

            if path == "/api/auth/password-reset/request":
                res = self.engine.submit_password_reset_request(
                    identifier=str(body.get("identifier", "")),
                    new_password=str(body.get("new_password", "")),
                    reason=str(body.get("reason", "")),
                )
                return self._send_json(201, res)

            if path == "/api/auth/login":
                res = self.engine.login(
                    identifier=str(body.get("username", "")),
                    password=str(body.get("password", "")),
                )
                headers = [
                    (
                        "Set-Cookie",
                        f"cc_session={res['token']}; Path=/; HttpOnly; SameSite=Lax",
                    )
                ]
                return self._send_json(200, res, extra_headers=headers)

            if path == "/api/auth/logout":
                tok = self._extract_token()
                if tok:
                    self.engine.logout(tok)
                headers = [("Set-Cookie", "cc_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")]
                return self._send_json(200, {"ok": True}, extra_headers=headers)

            if path == "/api/uploads":
                self._require_auth()
                data_url = str(body.get("data_url", ""))
                if not (
                    data_url.startswith("data:image/")
                    or data_url.startswith("data:application/pdf")
                ):
                    raise EngineError(
                        "Expected a valid image (PNG, JPG, WEBP, GIF) or PDF data URL."
                    )
                header, b64 = data_url.split(",", 1)
                mime = header.split(";")[0].split(":")[1]
                ext_map = {
                    "image/jpeg": ".jpg",
                    "image/jpg": ".jpg",
                    "image/png": ".png",
                    "image/webp": ".webp",
                    "image/gif": ".gif",
                    "application/pdf": ".pdf",
                }
                ext = ext_map.get(mime)
                if not ext:
                    raise EngineError(
                        "Unsupported file format. Use PNG, JPG, WEBP, GIF, or PDF."
                    )
                raw_bytes = base64.b64decode(b64)
                if len(raw_bytes) > 6 * 1024 * 1024:
                    raise EngineError("File exceeds 6 MB limit.")
                fname = f"file_{int(time.time())}_{uuid.uuid4().hex[:8]}{ext}"
                fpath = os.path.join(UPLOAD_DIR, fname)
                with open(fpath, "wb") as fh:
                    fh.write(raw_bytes)
                return self._send_json(201, {"url": f"/api/uploads/{fname}"})

            if path == "/api/announcements":
                username, _ = self._require_auth()
                ann = self.engine.publish_announcement(
                    admin_username=username,
                    title=str(body.get("title", "")),
                    content=str(body.get("content", "")),
                    priority=str(body.get("priority", "urgent")),
                    category=str(body.get("category", "University Notice")),
                )
                return self._send_json(201, {"announcement": ann})

            if path.startswith("/api/admin/users/") and path.endswith("/status"):
                username, _ = self._require_auth()
                target = unquote(path[len("/api/admin/users/") : -len("/status")])
                res = self.engine.admin_set_user_suspended(
                    admin_username=username,
                    target_username=target,
                    suspended=bool(body.get("suspended", False)),
                )
                return self._send_json(200, res)

            if path.startswith("/api/admin/registrations/") and path.endswith("/approve"):
                username, _ = self._require_auth()
                uid = unquote(path[len("/api/admin/registrations/") : -len("/approve")])
                return self._send_json(
                    200, self.engine.admin_approve_registration(username, uid)
                )

            if path.startswith("/api/admin/registrations/") and path.endswith("/reject"):
                username, _ = self._require_auth()
                uid = unquote(path[len("/api/admin/registrations/") : -len("/reject")])
                return self._send_json(
                    200, self.engine.admin_reject_registration(username, uid)
                )

            if path.startswith("/api/admin/password-resets/") and path.endswith("/approve"):
                username, _ = self._require_auth()
                req_id = unquote(path[len("/api/admin/password-resets/") : -len("/approve")])
                return self._send_json(
                    200, self.engine.admin_approve_password_reset(username, req_id)
                )

            if path.startswith("/api/admin/password-resets/") and path.endswith("/reject"):
                username, _ = self._require_auth()
                req_id = unquote(path[len("/api/admin/password-resets/") : -len("/reject")])
                return self._send_json(
                    200, self.engine.admin_reject_password_reset(username, req_id)
                )

            if path.startswith("/api/admin/communities/proposals/") and path.endswith("/approve"):
                username, _ = self._require_auth()
                prop_id = unquote(path[len("/api/admin/communities/proposals/") : -len("/approve")])
                sr = body.get("school_restricted") if "school_restricted" in body else None
                aschool = str(body["allowed_school"]) if "allowed_school" in body else None
                return self._send_json(
                    200,
                    self.engine.admin_approve_community_proposal(
                        username,
                        prop_id,
                        school_restricted=bool(sr) if sr is not None else None,
                        allowed_school=aschool,
                    ),
                )

            if path.startswith("/api/admin/communities/proposals/") and path.endswith("/reject"):
                username, _ = self._require_auth()
                prop_id = unquote(path[len("/api/admin/communities/proposals/") : -len("/reject")])
                return self._send_json(
                    200,
                    self.engine.admin_reject_community_proposal(
                        username, prop_id, reason=str(body.get("reason", ""))
                    ),
                )

            if path.startswith("/api/admin/communities/") and path.endswith("/status"):
                username, _ = self._require_auth()
                comm_id = unquote(path[len("/api/admin/communities/") : -len("/status")])
                return self._send_json(
                    200,
                    self.engine.admin_set_community_suspended(
                        username, comm_id, suspended=bool(body.get("suspended", False))
                    ),
                )

            if path == "/api/portfolio":
                username, _ = self._require_auth()
                item = self.engine.add_portfolio_item(
                    owner=username,
                    category=str(body.get("category", "certificate")),
                    title=str(body.get("title", "")),
                    issuer=str(body.get("issuer", "")),
                    issue_date=str(body.get("issue_date", "")),
                    credential_id=str(body.get("credential_id", "")),
                    credential_url=str(body.get("credential_url", "")),
                    description=str(body.get("description", "")),
                    file_url=body.get("file_url"),
                )
                return self._send_json(201, {"item": item})

            if path == "/api/connections/request":
                username, _ = self._require_auth()
                target = str(body.get("target", ""))
                return self._send_json(
                    200, self.engine.send_connection_request(username, target)
                )

            if path == "/api/connections/accept":
                username, _ = self._require_auth()
                sender = str(body.get("sender", ""))
                return self._send_json(
                    200, self.engine.accept_connection_request(username, sender)
                )

            if path == "/api/connections/reject":
                username, _ = self._require_auth()
                sender = str(body.get("sender", ""))
                return self._send_json(
                    200, self.engine.reject_connection_request(username, sender)
                )

            if path == "/api/connections/cancel":
                username, _ = self._require_auth()
                target = str(body.get("target", ""))
                return self._send_json(
                    200, self.engine.cancel_connection_request(username, target)
                )

            if path == "/api/posts":
                username, _ = self._require_auth()
                post = self.engine.create_post(
                    author=username,
                    title=str(body.get("title", "")),
                    content=str(body.get("content", "")),
                    tags=list(body.get("tags", []) or []),
                    image_url=body.get("image_url"),
                )
                return self._send_json(201, {"post": post})

            if path.startswith("/api/posts/") and path.endswith("/like"):
                username, _ = self._require_auth()
                post_id = unquote(path[len("/api/posts/") : -len("/like")])
                return self._send_json(200, self.engine.toggle_like(username, post_id))

            if path.startswith("/api/posts/") and path.endswith("/comments"):
                username, _ = self._require_auth()
                post_id = unquote(path[len("/api/posts/") : -len("/comments")])
                updated_post = self.engine.add_comment(
                    username=username,
                    post_id=post_id,
                    content=str(body.get("content", "")),
                    parent_id=body.get("parent_id"),
                )
                return self._send_json(201, {"post": updated_post})

            if path == "/api/communities/proposals":
                username, _ = self._require_auth()
                res = self.engine.propose_community(
                    proposer=username,
                    name=str(body.get("name", "")),
                    category=str(body.get("category", "School of Engineering")),
                    description=str(body.get("description", "")),
                    charter=str(body.get("charter", "")),
                    tags=list(body.get("tags", []) or []),
                    school_restricted=bool(body.get("school_restricted", False)),
                    allowed_school=str(body.get("allowed_school", "")),
                )
                return self._send_json(201, res)

            if path.startswith("/api/communities/") and path.endswith("/access-policy"):
                username, _ = self._require_auth()
                comm_id = unquote(path[len("/api/communities/") : -len("/access-policy")])
                return self._send_json(
                    200,
                    self.engine.set_community_access_policy(
                        username,
                        comm_id,
                        school_restricted=bool(body.get("school_restricted", False)),
                        allowed_school=str(body.get("allowed_school", "")),
                    ),
                )

            if path.startswith("/api/communities/") and path.endswith("/join/cancel"):
                username, _ = self._require_auth()
                comm_id = unquote(path[len("/api/communities/") : -len("/join/cancel")])
                return self._send_json(200, self.engine.cancel_join_community(username, comm_id))

            if path.startswith("/api/communities/") and path.endswith("/join"):
                username, _ = self._require_auth()
                comm_id = unquote(path[len("/api/communities/") : -len("/join")])
                return self._send_json(
                    201,
                    self.engine.request_join_community(
                        username, comm_id, interest=str(body.get("interest", ""))
                    ),
                )

            if path.startswith("/api/communities/") and "/join-requests/" in path:
                username, _ = self._require_auth()
                rest = path[len("/api/communities/") :]
                comm_id_part, jr_part = rest.split("/join-requests/", 1)
                comm_id = unquote(comm_id_part)
                if jr_part.endswith("/accept"):
                    applicant = unquote(jr_part[: -len("/accept")])
                    return self._send_json(
                        200,
                        self.engine.review_community_join_request(
                            username, comm_id, applicant, accept=True
                        ),
                    )
                if jr_part.endswith("/reject"):
                    applicant = unquote(jr_part[: -len("/reject")])
                    return self._send_json(
                        200,
                        self.engine.review_community_join_request(
                            username, comm_id, applicant, accept=False
                        ),
                    )

            if path.startswith("/api/communities/") and path.endswith("/leave"):
                username, _ = self._require_auth()
                comm_id = unquote(path[len("/api/communities/") : -len("/leave")])
                return self._send_json(200, self.engine.leave_community(username, comm_id))

            if path.startswith("/api/communities/") and path.endswith("/messages"):
                username, _ = self._require_auth()
                comm_id = unquote(path[len("/api/communities/") : -len("/messages")])
                return self._send_json(
                    201,
                    self.engine.post_community_message(
                        username, comm_id, content=str(body.get("content", ""))
                    ),
                )

            if path == "/api/notifications/read":
                username, _ = self._require_auth()
                return self._send_json(200, self.engine.mark_notifications_read(username))

            if path == "/api/undo":
                username, _ = self._require_auth()
                return self._send_json(200, self.engine.undo_last_action(username))

            return self._send_json(404, {"error": f"Unknown endpoint: {path}"})
        except EngineError as exc:
            err_payload = {"error": exc.message}
            if exc.code:
                err_payload["code"] = exc.code
            return self._send_json(exc.status_code, err_payload)
        except Exception as exc:
            return self._send_json(500, {"error": f"Internal error: {exc}"})

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json()
            if path == "/api/profile":
                username, _ = self._require_auth()
                profile = self.engine.update_profile(
                    username=username,
                    name=str(body.get("name", "")),
                    school=body.get("school"),
                    programme=str(body.get("programme", "")),
                    year=str(body.get("year", "")),
                    bio=str(body.get("bio", "")),
                    skills=list(body.get("skills", []) or []),
                    avatar_url=body.get("avatar_url"),
                )
                return self._send_json(200, {"profile": profile})

            return self._send_json(404, {"error": f"Unknown endpoint: {path}"})
        except EngineError as exc:
            return self._send_json(exc.status_code, {"error": exc.message})
        except Exception as exc:
            return self._send_json(500, {"error": f"Internal error: {exc}"})

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            if path.startswith("/api/connections/"):
                username, _ = self._require_auth()
                other = unquote(path[len("/api/connections/") :])
                return self._send_json(
                    200, self.engine.remove_connection(username, other)
                )

            if path.startswith("/api/posts/"):
                username, _ = self._require_auth()
                post_id = unquote(path[len("/api/posts/") :])
                return self._send_json(200, self.engine.delete_post(username, post_id))

            if path.startswith("/api/portfolio/"):
                username, _ = self._require_auth()
                item_id = unquote(path[len("/api/portfolio/") :])
                return self._send_json(
                    200, self.engine.delete_portfolio_item(username, item_id)
                )

            if path.startswith("/api/announcements/"):
                username, _ = self._require_auth()
                ann_id = unquote(path[len("/api/announcements/") :])
                return self._send_json(
                    200, self.engine.delete_announcement(username, ann_id)
                )

            if path.startswith("/api/admin/posts/"):
                username, _ = self._require_auth()
                post_id = unquote(path[len("/api/admin/posts/") :])
                return self._send_json(
                    200, self.engine.admin_moderate_delete_post(username, post_id)
                )

            if path.startswith("/api/admin/communities/"):
                username, _ = self._require_auth()
                comm_id = unquote(path[len("/api/admin/communities/") :])
                return self._send_json(
                    200, self.engine.admin_delete_community(username, comm_id)
                )

            if path.startswith("/api/communities/") and "/members/" in path:
                username, _ = self._require_auth()
                rest = path[len("/api/communities/") :]
                comm_id_part, target_part = rest.split("/members/", 1)
                return self._send_json(
                    200,
                    self.engine.remove_community_member(
                        username, unquote(comm_id_part), unquote(target_part)
                    ),
                )

            return self._send_json(404, {"error": f"Unknown endpoint: {path}"})
        except EngineError as exc:
            return self._send_json(exc.status_code, {"error": exc.message})
        except Exception as exc:
            return self._send_json(500, {"error": f"Internal error: {exc}"})


def main() -> None:
    parser = argparse.ArgumentParser(description="Chanakya Commons Python REST API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()

    engine = NetworkEngine()
    seed_if_empty(engine)

    server = ChanakyaHTTPServer((args.host, args.port), engine)
    print(f"[python-api] Chanakya Commons engine ready on http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
