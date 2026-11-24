"""
Core Networking Engine for Chanakya Commons.

Decoupled completely from HTTP/React and CLI interfaces. All business logic,
Outlook OTP verification, IT admin governance, Spicy News university announcements,
graph traversals, prefix search, feed merging, trending scores, profile portfolio
storage, notification queues, and undo stacks run on in-memory Python structures.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from email.message import EmailMessage
import hashlib
import heapq
import hmac
import os
import re
import secrets
import smtplib
import threading
import time
import uuid
from typing import Any, Optional

from backend.data_structures import (
    CommentNode,
    CommunityMembershipGraph,
    HashTable,
    Queue,
    SocialGraph,
    Stack,
    Trie,
    merge_feeds_with_heap,
    rank_trending_with_heap,
)
from backend.storage import SQLiteStorage

CHANAKYA_SCHOOLS = [
    "School of Engineering",
    "School of Arts, Humanities and Social Sciences",
    "School of Management Sciences",
    "School of Mathematics and Natural Sciences",
    "School of Law, Governance and Public Policy",
    "School of Biosciences",
]

COMMUNITY_CATEGORIES = [*CHANAKYA_SCHOOLS, "Cross-School / University-Wide"]


@dataclass
class UserRecord:
    username: str
    university_id: str
    role: str  # 'student' | 'faculty' | 'admin'
    is_suspended: bool
    password_hash: str
    password_salt: str
    name: str
    school: str
    programme: str
    year: str
    bio: str
    skills: list[str]
    avatar_url: Optional[str]
    created_at: float

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "username": self.username,
            "university_id": self.university_id,
            "outlook_email": self.university_id,
            "role": self.role,
            "is_suspended": self.is_suspended,
            "name": self.name,
            "school": self.school,
            "programme": self.programme,
            "year": self.year,
            "bio": self.bio,
            "skills": list(self.skills),
            "avatar_url": self.avatar_url,
            "created_at": self.created_at,
        }


@dataclass
class PendingRegistration:
    university_id: str
    username: str
    role: str
    password_hash: str
    password_salt: str
    name: str
    school: str
    programme: str
    year: str
    bio: str
    skills: list[str]
    otp_hash: str
    otp_salt: str
    expires_at: float
    created_at: float

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "university_id": self.university_id,
            "username": self.username,
            "role": self.role,
            "name": self.name,
            "school": self.school,
            "programme": self.programme,
            "year": self.year,
            "bio": self.bio,
            "skills": list(self.skills),
            "created_at": self.created_at,
        }


@dataclass
class PortfolioItem:
    id: str
    owner: str
    category: str  # 'certificate' | 'achievement'
    title: str
    issuer: str
    issue_date: str
    credential_id: str
    credential_url: str
    description: str
    file_url: Optional[str]
    created_at: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "owner": self.owner,
            "category": self.category,
            "title": self.title,
            "issuer": self.issuer,
            "issue_date": self.issue_date,
            "credential_id": self.credential_id,
            "credential_url": self.credential_url,
            "description": self.description,
            "file_url": self.file_url,
            "created_at": self.created_at,
        }


@dataclass
class AnnouncementItem:
    id: str
    author: str
    title: str
    content: str
    priority: str  # 'urgent' | 'important' | 'general'
    category: str
    created_at: float

    def to_dict(self, users_table: HashTable[str, UserRecord]) -> dict[str, Any]:
        author_obj = users_table.get(self.author)
        return {
            "id": self.id,
            "author": self.author,
            "author_name": author_obj.name if author_obj else "IT Department",
            "title": self.title,
            "content": self.content,
            "priority": self.priority,
            "category": self.category,
            "created_at": self.created_at,
        }


@dataclass
class PostRecord:
    id: str
    author: str
    title: str
    content: str
    tags: list[str]
    image_url: Optional[str]
    created_at: float
    likes: set[str] = field(default_factory=set)
    root_comments: list[CommentNode] = field(default_factory=list)
    comments_by_id: dict[str, CommentNode] = field(default_factory=dict)

    def to_dict(
        self,
        users_table: HashTable[str, UserRecord],
        viewer: Optional[str] = None,
        trend_score: Optional[float] = None,
    ) -> dict[str, Any]:
        author_obj = users_table.get(self.author)
        total_comments = sum(c.count_subtree() for c in self.root_comments)
        return {
            "id": self.id,
            "author": self.author,
            "author_name": author_obj.name if author_obj else self.author,
            "author_role": author_obj.role if author_obj else "student",
            "author_programme": author_obj.programme if author_obj else "",
            "author_year": author_obj.year if author_obj else "",
            "author_avatar": author_obj.avatar_url if author_obj else None,
            "title": self.title,
            "content": self.content,
            "tags": list(self.tags),
            "image_url": self.image_url,
            "created_at": self.created_at,
            "like_count": len(self.likes),
            "liked_by_me": bool(viewer and viewer in self.likes),
            "comment_count": total_comments,
            "comments": [c.to_dict(users_table) for c in self.root_comments],
            "trend_score": trend_score,
        }


@dataclass
class NotificationItem:
    id: str
    recipient: str
    actor: str
    ntype: str
    message: str
    ref_id: Optional[str]
    is_read: bool
    created_at: float

    def to_dict(self, users_table: HashTable[str, UserRecord]) -> dict[str, Any]:
        actor_obj = users_table.get(self.actor)
        return {
            "id": self.id,
            "recipient": self.recipient,
            "actor": self.actor,
            "actor_name": actor_obj.name if actor_obj else self.actor,
            "actor_avatar": actor_obj.avatar_url if actor_obj else None,
            "ntype": self.ntype,
            "message": self.message,
            "ref_id": self.ref_id,
            "is_read": self.is_read,
            "created_at": self.created_at,
        }


@dataclass
class CommunityProposalRecord:
    id: str
    name: str
    category: str
    description: str
    charter: str
    tags: list[str]
    proposer: str
    created_at: float
    school_restricted: bool = False
    allowed_school: str = ""

    def to_dict(self, users_table: HashTable[str, UserRecord]) -> dict[str, Any]:
        proposer_obj = users_table.get(self.proposer)
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "description": self.description,
            "charter": self.charter,
            "tags": list(self.tags),
            "proposer": self.proposer,
            "proposer_name": proposer_obj.name if proposer_obj else self.proposer,
            "proposer_role": proposer_obj.role if proposer_obj else "student",
            "proposer_school": proposer_obj.school if proposer_obj else "",
            "proposer_programme": proposer_obj.programme if proposer_obj else "",
            "proposer_university_id": proposer_obj.university_id if proposer_obj else "",
            "proposer_avatar": proposer_obj.avatar_url if proposer_obj else None,
            "school_restricted": self.school_restricted,
            "allowed_school": self.allowed_school,
            "created_at": self.created_at,
        }


@dataclass
class CommunityJoinRequest:
    community_id: str
    username: str
    interest: str
    created_at: float

    def to_dict(self, users_table: HashTable[str, UserRecord]) -> dict[str, Any]:
        u = users_table.get(self.username)
        return {
            "community_id": self.community_id,
            "username": self.username,
            "name": u.name if u else self.username,
            "role": u.role if u else "student",
            "school": u.school if u else "",
            "programme": u.programme if u else "",
            "year": u.year if u else "",
            "skills": list(u.skills) if u else [],
            "avatar_url": u.avatar_url if u else None,
            "interest": self.interest,
            "created_at": self.created_at,
        }


@dataclass
class CommunityMessageRecord:
    id: str
    community_id: str
    author: str
    content: str
    is_admin_notice: bool
    created_at: float

    def to_dict(self, users_table: HashTable[str, UserRecord]) -> dict[str, Any]:
        u = users_table.get(self.author)
        return {
            "id": self.id,
            "community_id": self.community_id,
            "author": self.author,
            "author_name": u.name if u else self.author,
            "author_role": u.role if u else "student",
            "author_avatar": u.avatar_url if u else None,
            "content": self.content,
            "is_admin_notice": self.is_admin_notice,
            "created_at": self.created_at,
        }


@dataclass
class CommunityRecord:
    id: str
    name: str
    category: str
    description: str
    charter: str
    tags: list[str]
    leader: str
    approved_by: str
    is_suspended: bool
    created_at: float
    school_restricted: bool = False
    allowed_school: str = ""
    join_requests: Queue[CommunityJoinRequest] = field(default_factory=Queue)
    join_requests_by_user: dict[str, CommunityJoinRequest] = field(default_factory=dict)
    messages: list[CommunityMessageRecord] = field(default_factory=list)


@dataclass
class PasswordResetRequest:
    id: str
    username: str
    university_id: str
    new_password_hash: str
    new_password_salt: str
    reason: str
    status: str  # 'pending' | 'approved' | 'rejected'
    reviewed_by: str
    reviewed_at: Optional[float]
    created_at: float

    def to_public_dict(self, users_table: HashTable[str, UserRecord]) -> dict[str, Any]:
        u = users_table.get(self.username)
        return {
            "id": self.id,
            "username": self.username,
            "university_id": self.university_id,
            "name": u.name if u else self.username,
            "role": u.role if u else "student",
            "school": u.school if u else "",
            "programme": u.programme if u else "",
            "reason": self.reason,
            "status": self.status,
            "created_at": self.created_at,
        }


class EngineError(Exception):
    """Domain validation or state error."""

    def __init__(
        self,
        message: str,
        status_code: int = 400,
        code: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


def _hash_secret(secret_text: str, salt_hex: Optional[str] = None) -> tuple[str, str]:
    if salt_hex is None:
        salt_hex = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        secret_text.encode("utf-8"),
        bytes.fromhex(salt_hex),
        120_000,
    )
    return dk.hex(), salt_hex


def _verify_secret(secret_text: str, stored_hash: str, salt_hex: str) -> bool:
    computed_hash, _ = _hash_secret(secret_text, salt_hex)
    return hmac.compare_digest(computed_hash, stored_hash)


def _send_university_otp(university_id: str, full_name: str, code: str) -> str:
    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    smtp_user = os.environ.get("SMTP_USER", "").strip()
    smtp_pass = os.environ.get("SMTP_PASS", "").strip()
    smtp_port = int(os.environ.get("SMTP_PORT", "587") or "587")

    if smtp_host and smtp_user and smtp_pass and "@" in university_id:
        msg = EmailMessage()
        msg["Subject"] = "Chanakya Commons — Registration Verification Code"
        msg["From"] = smtp_user
        msg["To"] = university_id
        msg.set_content(
            f"Hello {full_name},\n\n"
            f"Your Chanakya Commons verification code for University ID {university_id} is: {code}\n\n"
            "This code expires in 10 minutes. Enter it to complete your campus registration "
            "and proceed to sign in.\n"
        )
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        return "smtp"

    print(f"[campus-relay] Verification code for {university_id}: {code}", flush=True)
    return "sandbox"


class NetworkEngine:
    """
    Core Python engine owning all in-memory data structures and algorithms.
    """

    def __init__(self, storage: Optional[SQLiteStorage] = None) -> None:
        self.storage = storage or SQLiteStorage()
        self._lock = threading.RLock()

        # In-memory data structures
        self.users: HashTable[str, UserRecord] = HashTable(64)
        self.users_by_email: HashTable[str, str] = HashTable(64)
        self.pending_registrations: HashTable[str, PendingRegistration] = HashTable(32)
        self.posts_by_id: HashTable[str, PostRecord] = HashTable(128)
        self.portfolio_by_id: HashTable[str, PortfolioItem] = HashTable(128)
        self.announcements_by_id: HashTable[str, AnnouncementItem] = HashTable(64)
        self.announcements: list[AnnouncementItem] = []
        self.sessions: HashTable[str, str] = HashTable(64)
        self.trie = Trie()
        self.graph = SocialGraph()
        self.user_posts: dict[str, list[PostRecord]] = {}
        self.user_portfolio: dict[str, list[PortfolioItem]] = {}
        self.notifications: dict[str, Queue[NotificationItem]] = {}
        self.undo_stacks: dict[str, Stack[dict[str, Any]]] = {}

        # Managed Communities DSA structures (HashTable + FIFO Queues + Bipartite Graph)
        self.community_proposals_by_id: HashTable[str, CommunityProposalRecord] = HashTable(32)
        self.community_proposal_queue: Queue[CommunityProposalRecord] = Queue()
        self.communities_by_id: HashTable[str, CommunityRecord] = HashTable(64)
        self.community_by_name: HashTable[str, str] = HashTable(64)
        self.community_graph = CommunityMembershipGraph()

        # Password Reset Request DSA structures (FIFO Queue + O(1) HashTables)
        self.password_reset_queue: Queue[PasswordResetRequest] = Queue()
        self.password_reset_by_id: HashTable[str, PasswordResetRequest] = HashTable(32)
        self.pending_password_reset_by_user: HashTable[str, PasswordResetRequest] = HashTable(32)
        self.latest_password_reset_by_user: HashTable[str, PasswordResetRequest] = HashTable(32)

        self._hydrate_from_storage()

    def _hydrate_from_storage(self) -> None:
        """Load raw persisted rows into in-memory structures at startup."""
        data = self.storage.load_all()

        for u in data["users"]:
            uid = (u.get("university_id") or u.get("outlook_email") or "").strip()
            rec = UserRecord(
                username=u["username"],
                university_id=uid,
                role=u.get("role", "student"),
                is_suspended=bool(u.get("is_suspended", False)),
                password_hash=u["password_hash"],
                password_salt=u["password_salt"],
                name=u["name"],
                school=u.get("school", ""),
                programme=u["programme"],
                year=u["year"],
                bio=u["bio"],
                skills=u["skills"],
                avatar_url=u["avatar_url"],
                created_at=u["created_at"],
            )
            self.users.put(rec.username, rec)
            if rec.university_id:
                self.users_by_email.put(rec.university_id.lower(), rec.username)
            self.trie.insert_user(rec.username, rec.name, rec.university_id)
            self.graph.ensure_user(rec.username)
            self.user_posts.setdefault(rec.username, [])
            self.user_portfolio.setdefault(rec.username, [])
            self.notifications.setdefault(rec.username, Queue())
            self.undo_stacks.setdefault(rec.username, Stack())

        for pr in data.get("pending_registrations", []):
            p_uid = (pr.get("university_id") or pr.get("outlook_email") or "").strip()
            pending = PendingRegistration(
                university_id=p_uid,
                username=pr["username"],
                role=pr.get("role", "student"),
                password_hash=pr["password_hash"],
                password_salt=pr["password_salt"],
                name=pr["name"],
                school=pr.get("school", ""),
                programme=pr["programme"],
                year=pr["year"],
                bio=pr["bio"],
                skills=pr["skills"],
                otp_hash=pr["otp_hash"],
                otp_salt=pr["otp_salt"],
                expires_at=pr["expires_at"],
                created_at=pr["created_at"],
            )
            self.pending_registrations.put(p_uid.lower(), pending)

        for pf in data.get("portfolio_items", []):
            item = PortfolioItem(
                id=pf["id"],
                owner=pf["owner"],
                category=pf["category"],
                title=pf["title"],
                issuer=pf["issuer"],
                issue_date=pf["issue_date"],
                credential_id=pf["credential_id"],
                credential_url=pf["credential_url"],
                description=pf["description"],
                file_url=pf["file_url"],
                created_at=pf["created_at"],
            )
            self.portfolio_by_id.put(item.id, item)
            self.user_portfolio.setdefault(item.owner, []).append(item)

        for plist in self.user_portfolio.values():
            plist.sort(key=lambda item: (-item.created_at, item.id))

        for ann in data.get("announcements", []):
            a = AnnouncementItem(
                id=ann["id"],
                author=ann["author"],
                title=ann["title"],
                content=ann["content"],
                priority=ann["priority"],
                category=ann["category"],
                created_at=ann["created_at"],
            )
            self.announcements_by_id.put(a.id, a)
            self.announcements.append(a)
        self.announcements.sort(key=lambda item: (-item.created_at, item.id))

        for edge in data["connections"]:
            self.graph.add_connection(edge["user_a"], edge["user_b"])

        sorted_reqs = sorted(data["connection_requests"], key=lambda r: r["created_at"])
        for req in sorted_reqs:
            self.graph.add_pending_request(
                req["from_user"], req["to_user"], req["created_at"]
            )

        for p in data["posts"]:
            post = PostRecord(
                id=p["id"],
                author=p["author"],
                title=p["title"],
                content=p["content"],
                tags=p["tags"],
                image_url=p["image_url"],
                created_at=p["created_at"],
            )
            self.posts_by_id.put(post.id, post)
            self.user_posts.setdefault(post.author, []).append(post)

        for plist in self.user_posts.values():
            plist.sort(key=lambda item: (-item.created_at, item.id))

        for lk in data["post_likes"]:
            post = self.posts_by_id.get(lk["post_id"])
            if post:
                post.likes.add(lk["username"])

        sorted_comments = sorted(data["comments"], key=lambda c: c["created_at"])
        pending_orphans: list[dict[str, Any]] = []
        for c in sorted_comments:
            post = self.posts_by_id.get(c["post_id"])
            if not post:
                continue
            node = CommentNode(
                id=c["id"],
                post_id=c["post_id"],
                author=c["author"],
                content=c["content"],
                created_at=c["created_at"],
                parent_id=c["parent_id"],
            )
            post.comments_by_id[node.id] = node
            if node.parent_id is None:
                post.root_comments.append(node)
            elif node.parent_id in post.comments_by_id:
                post.comments_by_id[node.parent_id].replies.append(node)
            else:
                pending_orphans.append(c)

        for orphan in pending_orphans:
            post = self.posts_by_id.get(orphan["post_id"])
            if post and orphan["id"] in post.comments_by_id:
                node = post.comments_by_id[orphan["id"]]
                parent = post.comments_by_id.get(orphan["parent_id"])
                if parent:
                    parent.replies.append(node)
                else:
                    post.root_comments.append(node)

        sorted_notifs = sorted(data["notifications"], key=lambda n: n["created_at"])
        for n in sorted_notifs:
            q = self.notifications.setdefault(n["recipient"], Queue())
            q.enqueue(
                NotificationItem(
                    id=n["id"],
                    recipient=n["recipient"],
                    actor=n["actor"],
                    ntype=n["ntype"],
                    message=n["message"],
                    ref_id=n["ref_id"],
                    is_read=bool(n["is_read"]),
                    created_at=n["created_at"],
                )
            )

        for s in data["sessions"]:
            user_obj = self.users.get(s["username"])
            if user_obj and not user_obj.is_suspended:
                self.sessions.put(s["token"], s["username"])

        sorted_props = sorted(
            data.get("community_proposals", []), key=lambda p: (p["created_at"], p["id"])
        )
        for cp in sorted_props:
            prop = CommunityProposalRecord(
                id=cp["id"],
                name=cp["name"],
                category=cp.get("category", "School of Engineering"),
                description=cp["description"],
                charter=cp.get("charter", ""),
                tags=cp.get("tags", []),
                proposer=cp["proposer"],
                created_at=cp["created_at"],
                school_restricted=bool(cp.get("school_restricted", False)),
                allowed_school=str(cp.get("allowed_school", "") or ""),
            )
            self.community_proposals_by_id.put(prop.id, prop)
            self.community_proposal_queue.enqueue(prop)
            self.community_by_name.put(prop.name.strip().lower(), prop.id)

        for cm in data.get("communities", []):
            comm = CommunityRecord(
                id=cm["id"],
                name=cm["name"],
                category=cm.get("category", "School of Engineering"),
                description=cm["description"],
                charter=cm.get("charter", ""),
                tags=cm.get("tags", []),
                leader=cm["leader"],
                approved_by=cm.get("approved_by", ""),
                is_suspended=bool(cm.get("is_suspended", False)),
                created_at=cm["created_at"],
                school_restricted=bool(cm.get("school_restricted", False)),
                allowed_school=str(cm.get("allowed_school", "") or ""),
            )
            self.communities_by_id.put(comm.id, comm)
            self.community_by_name.put(comm.name.strip().lower(), comm.id)
            self.community_graph.ensure_community(comm.id)
            self.community_graph.add_member(comm.id, comm.leader)

        for mem in data.get("community_members", []):
            cid = mem["community_id"]
            if self.communities_by_id.contains(cid):
                self.community_graph.add_member(cid, mem["username"])

        sorted_join_reqs = sorted(
            data.get("community_join_requests", []),
            key=lambda r: (r["created_at"], r["username"]),
        )
        for jr in sorted_join_reqs:
            comm = self.communities_by_id.get(jr["community_id"])
            if comm and not self.community_graph.is_member(comm.id, jr["username"]):
                req_obj = CommunityJoinRequest(
                    community_id=jr["community_id"],
                    username=jr["username"],
                    interest=jr["interest"],
                    created_at=jr["created_at"],
                )
                comm.join_requests.enqueue(req_obj)
                comm.join_requests_by_user[req_obj.username] = req_obj

        sorted_cmsgs = sorted(
            data.get("community_messages", []),
            key=lambda m: (-m["created_at"], m["id"]),
        )
        for msg in sorted_cmsgs:
            comm = self.communities_by_id.get(msg["community_id"])
            if comm:
                comm.messages.append(
                    CommunityMessageRecord(
                        id=msg["id"],
                        community_id=msg["community_id"],
                        author=msg["author"],
                        content=msg["content"],
                        is_admin_notice=bool(msg.get("is_admin_notice", False)),
                        created_at=msg["created_at"],
                    )
                )

        sorted_resets = sorted(
            data.get("password_reset_requests", []),
            key=lambda r: (r["created_at"], r["id"]),
        )
        for pr_req in sorted_resets:
            req_obj = PasswordResetRequest(
                id=pr_req["id"],
                username=pr_req["username"],
                university_id=pr_req["university_id"],
                new_password_hash=pr_req["new_password_hash"],
                new_password_salt=pr_req["new_password_salt"],
                reason=pr_req.get("reason", ""),
                status=pr_req.get("status", "pending"),
                reviewed_by=pr_req.get("reviewed_by", ""),
                reviewed_at=pr_req.get("reviewed_at"),
                created_at=pr_req["created_at"],
            )
            self.password_reset_by_id.put(req_obj.id, req_obj)
            self.latest_password_reset_by_user.put(req_obj.username, req_obj)
            if req_obj.status == "pending":
                self.password_reset_queue.enqueue(req_obj)
                self.pending_password_reset_by_user.put(req_obj.username, req_obj)

    def _normalize_username(self, raw: str) -> str:
        uname = raw.strip().lower()
        if len(uname) < 3 or len(uname) > 32:
            raise EngineError("Username must be between 3 and 32 characters.")
        for ch in uname:
            if not (ch.isalnum() or ch in "._-"):
                raise EngineError("Username may only contain letters, numbers, '.', '_', or '-'.")
        return uname

    def _normalize_university_id(self, raw: str) -> tuple[str, str]:
        uid = raw.strip()
        if len(uid) < 3 or len(uid) > 48:
            raise EngineError("University ID must be between 3 and 48 characters.")
        if not re.match(r"^[A-Za-z0-9._@/-]+$", uid):
            raise EngineError(
                "University ID may only contain letters, numbers, '-', '_', '.', '/', or '@'."
            )
        return uid, uid.lower()

    def _normalize_role(self, raw: str, allow_admin: bool = False) -> str:
        role = (raw or "student").strip().lower()
        allowed = ("student", "faculty", "admin") if allow_admin else ("student", "faculty")
        if role not in allowed:
            raise EngineError("Role must be 'student' or 'faculty'.")
        return role

    def _require_user(self, username: str) -> UserRecord:
        user = self.users.get(username)
        if not user:
            raise EngineError(f"User '{username}' not found.", status_code=404)
        return user

    def _require_admin(self, username: str) -> UserRecord:
        user = self._require_user(username)
        if user.role != "admin":
            raise EngineError("IT Department Administrator privileges required.", status_code=403)
        return user

    def _push_notification(
        self,
        recipient: str,
        actor: str,
        ntype: str,
        message: str,
        ref_id: Optional[str] = None,
    ) -> None:
        if recipient == actor:
            return
        now = time.time()
        item = NotificationItem(
            id=f"ntf_{uuid.uuid4().hex[:12]}",
            recipient=recipient,
            actor=actor,
            ntype=ntype,
            message=message,
            ref_id=ref_id,
            is_read=False,
            created_at=now,
        )
        self.notifications.setdefault(recipient, Queue()).enqueue(item)
        self.storage.save_notification(
            item.id, recipient, actor, ntype, message, ref_id, now
        )

    # ------------------------------------------------------------------
    # Part 1: Admin-Verified University ID Registration + Accounts & Profiles
    # ------------------------------------------------------------------

    def _find_pending_by_identifier(self, identifier: str) -> Optional[PendingRegistration]:
        key = identifier.strip().lower()
        if not key:
            return None
        direct = self.pending_registrations.get(key)
        if direct:
            return direct
        for pending in self.pending_registrations.values():
            if pending.username == key or pending.university_id.lower() == key:
                return pending
        return None

    def submit_registration_request(
        self,
        university_id: str,
        username: str,
        password: str,
        name: str,
        role: str = "student",
        school: str = "",
        programme: str = "",
        year: str = "",
        bio: str = "",
        skills: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        with self._lock:
            clean_uid, uid_key = self._normalize_university_id(university_id)
            if self.users_by_email.contains(uid_key):
                raise EngineError(
                    f"An account with University ID '{clean_uid}' is already registered.",
                    status_code=409,
                )
            if self.pending_registrations.contains(uid_key):
                raise EngineError(
                    f"A registration request for University ID '{clean_uid}' has already been sent and is awaiting verification by the university admin.",
                    status_code=409,
                )

            uname = self._normalize_username(username)
            if self.users.contains(uname):
                raise EngineError(f"Username '@{uname}' is already taken.", status_code=409)

            for existing_pending in self.pending_registrations.values():
                if existing_pending.username == uname:
                    raise EngineError(
                        f"Username '@{uname}' is currently reserved by a pending registration request awaiting university admin verification.",
                        status_code=409,
                    )

            clean_role = self._normalize_role(role, allow_admin=False)
            if len(password) < 6:
                raise EngineError("Password must be at least 6 characters.")
            clean_name = name.strip()
            if not clean_name:
                raise EngineError("Full name is required.")
            clean_school = school.strip()
            if not clean_school:
                raise EngineError("School selection is required.")
            clean_programme = programme.strip()
            if not clean_programme:
                raise EngineError("Programme selection is required.")
            clean_year = year.strip()
            if not clean_year:
                raise EngineError(
                    "Designation is required." if clean_role == "faculty" else "Year is required."
                )
            clean_bio = bio.strip()
            if not clean_bio:
                raise EngineError("Short bio is required.")

            clean_skills = [s.strip() for s in (skills or []) if s.strip()][:16]
            pw_hash, pw_salt = _hash_secret(password)
            now = time.time()

            pending = PendingRegistration(
                university_id=clean_uid,
                username=uname,
                role=clean_role,
                password_hash=pw_hash,
                password_salt=pw_salt,
                name=clean_name,
                school=clean_school,
                programme=clean_programme,
                year=clean_year,
                bio=clean_bio,
                skills=clean_skills,
                otp_hash="",
                otp_salt="",
                expires_at=0.0,
                created_at=now,
            )

            self.pending_registrations.put(uid_key, pending)
            self.storage.save_pending_registration(
                pending.university_id,
                pending.username,
                pending.role,
                pending.password_hash,
                pending.password_salt,
                pending.name,
                pending.school,
                pending.programme,
                pending.year,
                pending.bio,
                pending.skills,
                pending.otp_hash,
                pending.otp_salt,
                pending.expires_at,
                pending.created_at,
            )

            for member in self.users.values():
                if member.role == "admin":
                    item = NotificationItem(
                        id=f"ntf_{uuid.uuid4().hex[:12]}",
                        recipient=member.username,
                        actor=uname,
                        ntype="registration_request",
                        message=f"New registration request from {clean_name} (ID: {clean_uid}, @{uname}) awaiting verification.",
                        ref_id=clean_uid,
                        is_read=False,
                        created_at=now,
                    )
                    self.notifications.setdefault(member.username, Queue()).enqueue(item)
                    self.storage.save_notification(
                        item.id, member.username, uname, item.ntype, item.message, clean_uid, now
                    )

            return {
                "submitted": True,
                "status": "pending",
                "university_id": clean_uid,
                "username": uname,
                "name": clean_name,
                "role": clean_role,
                "message": "Your request has been sent and will be verified by the university admin.",
            }

    def check_registration_status(self, identifier: str) -> dict[str, Any]:
        with self._lock:
            key = identifier.strip().lower()
            if not key:
                raise EngineError("Enter your University ID or username to check registration status.")

            active_user = self.users.get(key)
            if not active_user:
                mapped = self.users_by_email.get(key)
                if mapped:
                    active_user = self.users.get(mapped)
            if active_user:
                if active_user.is_suspended:
                    return {
                        "status": "suspended",
                        "university_id": active_user.university_id,
                        "username": active_user.username,
                        "message": f"Account @{active_user.username} ({active_user.university_id}) is currently suspended by IT Administration.",
                    }
                return {
                    "status": "approved",
                    "university_id": active_user.university_id,
                    "username": active_user.username,
                    "message": f"Your account (@{active_user.username}, University ID {active_user.university_id}) is approved and active. You can sign in now.",
                }

            pending = self._find_pending_by_identifier(key)
            if pending:
                return {
                    "status": "pending",
                    "university_id": pending.university_id,
                    "username": pending.username,
                    "submitted_at": pending.created_at,
                    "message": f"Your request for University ID {pending.university_id} (@{pending.username}) has been sent and is waiting to be verified by the university admin.",
                }

            return {
                "status": "not_found",
                "message": f"No active account or pending registration request was found for '{identifier.strip()}'. If your request was rejected due to a wrong University ID, you may register again with corrected details.",
            }

    def submit_password_reset_request(
        self,
        identifier: str,
        new_password: str,
        reason: str = "",
    ) -> dict[str, Any]:
        with self._lock:
            key = identifier.strip().lower()
            if not key:
                raise EngineError("Enter your username or Chanakya University ID.")

            user = self.users.get(key)
            if not user:
                mapped_uname = self.users_by_email.get(key)
                if mapped_uname:
                    user = self.users.get(mapped_uname)

            if not user:
                pending_reg = self._find_pending_by_identifier(key)
                if pending_reg:
                    raise EngineError(
                        "Your account registration is still pending IT Admin approval. Once approved, sign in with the password you registered with.",
                        status_code=400,
                    )
                raise EngineError(
                    "No active student or faculty account matches that username or University ID.",
                    status_code=404,
                )

            if user.role == "admin":
                raise EngineError(
                    "IT Administrator passwords cannot be reset through the self-service request queue.",
                    status_code=403,
                )

            if user.is_suspended:
                raise EngineError(
                    "This account has been suspended by the IT Department Administration.",
                    status_code=403,
                )

            if len(new_password) < 6:
                raise EngineError("New password must be at least 6 characters.")

            if self.pending_password_reset_by_user.contains(user.username):
                raise EngineError(
                    f"A password change request for @{user.username} ({user.university_id}) has already been sent and is waiting for IT Admin approval.",
                    status_code=409,
                )

            pw_hash, pw_salt = _hash_secret(new_password)
            now = time.time()
            clean_reason = reason.strip()[:300]
            req_obj = PasswordResetRequest(
                id=f"pwr_{uuid.uuid4().hex[:12]}",
                username=user.username,
                university_id=user.university_id,
                new_password_hash=pw_hash,
                new_password_salt=pw_salt,
                reason=clean_reason,
                status="pending",
                reviewed_by="",
                reviewed_at=None,
                created_at=now,
            )

            self.password_reset_queue.enqueue(req_obj)
            self.password_reset_by_id.put(req_obj.id, req_obj)
            self.pending_password_reset_by_user.put(user.username, req_obj)
            self.latest_password_reset_by_user.put(user.username, req_obj)
            self.storage.save_password_reset_request(
                req_obj.id,
                req_obj.username,
                req_obj.university_id,
                req_obj.new_password_hash,
                req_obj.new_password_salt,
                req_obj.reason,
                req_obj.status,
                req_obj.created_at,
            )

            for member in self.users.values():
                if member.role == "admin":
                    item = NotificationItem(
                        id=f"ntf_{uuid.uuid4().hex[:12]}",
                        recipient=member.username,
                        actor=user.username,
                        ntype="password_reset_request",
                        message=f"Password change request from {user.name} (@{user.username}, ID: {user.university_id}) awaiting acceptance.",
                        ref_id=req_obj.id,
                        is_read=False,
                        created_at=now,
                    )
                    self.notifications.setdefault(member.username, Queue()).enqueue(item)
                    self.storage.save_notification(
                        item.id,
                        member.username,
                        user.username,
                        item.ntype,
                        item.message,
                        req_obj.id,
                        now,
                    )

            return {
                "submitted": True,
                "status": "pending",
                "request_id": req_obj.id,
                "username": user.username,
                "university_id": user.university_id,
                "message": "Your password change request has been sent to the University IT Admin. Once accepted, your password will be updated.",
            }

    def check_password_reset_status(self, identifier: str) -> dict[str, Any]:
        with self._lock:
            key = identifier.strip().lower()
            if not key:
                raise EngineError("Enter your username or University ID to check password reset status.")

            user = self.users.get(key)
            if not user:
                mapped_uname = self.users_by_email.get(key)
                if mapped_uname:
                    user = self.users.get(mapped_uname)

            if not user or user.role == "admin":
                return {
                    "status": "not_found",
                    "message": f"No password change request was found for '{identifier.strip()}'.",
                }

            latest = self.latest_password_reset_by_user.get(user.username)
            if not latest:
                return {
                    "status": "not_found",
                    "username": user.username,
                    "university_id": user.university_id,
                    "message": f"No password change request has been submitted for @{user.username} ({user.university_id}).",
                }

            if latest.status == "pending":
                return {
                    "status": "pending",
                    "request_id": latest.id,
                    "username": user.username,
                    "university_id": user.university_id,
                    "submitted_at": latest.created_at,
                    "message": f"Your password change request for @{user.username} ({user.university_id}) is waiting for IT Admin acceptance.",
                }

            if latest.status == "approved":
                return {
                    "status": "approved",
                    "request_id": latest.id,
                    "username": user.username,
                    "university_id": user.university_id,
                    "reviewed_at": latest.reviewed_at,
                    "message": f"Your password change request for @{user.username} was accepted by the University IT Admin. You can sign in now with your new password.",
                }

            return {
                "status": "rejected",
                "request_id": latest.id,
                "username": user.username,
                "university_id": user.university_id,
                "reviewed_at": latest.reviewed_at,
                "message": f"Your recent password change request for @{user.username} was declined by the University IT Admin. Your previous password was not changed.",
            }

    def signup(
        self,
        username: str,
        password: str,
        name: str,
        programme: str = "",
        year: str = "",
        bio: str = "",
        skills: Optional[list[str]] = None,
        avatar_url: Optional[str] = None,
        issue_session: bool = True,
        university_id: Optional[str] = None,
        outlook_email: Optional[str] = None,
        role: str = "student",
        school: str = "",
    ) -> dict[str, Any]:
        with self._lock:
            uname = self._normalize_username(username)
            if self.users.contains(uname):
                raise EngineError(f"Username '@{uname}' is already taken.", status_code=409)
            if len(password) < 6:
                raise EngineError("Password must be at least 6 characters.")
            clean_name = name.strip()
            if not clean_name:
                raise EngineError("Full name is required.")

            raw_uid = (university_id or outlook_email or f"CU-{uname.upper()}").strip()
            clean_uid, uid_key = self._normalize_university_id(raw_uid)
            if self.users_by_email.contains(uid_key):
                raise EngineError(f"University ID '{clean_uid}' is already registered.", status_code=409)

            clean_role = self._normalize_role(role, allow_admin=True)
            clean_skills = [s.strip() for s in (skills or []) if s.strip()][:16]
            pw_hash, pw_salt = _hash_secret(password)
            now = time.time()

            rec = UserRecord(
                username=uname,
                university_id=clean_uid,
                role=clean_role,
                is_suspended=False,
                password_hash=pw_hash,
                password_salt=pw_salt,
                name=clean_name,
                school=school.strip() or "School of Engineering",
                programme=programme.strip() or "B.Tech. in Computer Science & Artificial Intelligence",
                year=year.strip() or "2nd Year",
                bio=bio.strip(),
                skills=clean_skills,
                avatar_url=avatar_url,
                created_at=now,
            )

            self.users.put(uname, rec)
            self.users_by_email.put(uid_key, uname)
            self.trie.insert_user(uname, rec.name, rec.university_id)
            self.graph.ensure_user(uname)
            self.user_posts.setdefault(uname, [])
            self.user_portfolio.setdefault(uname, [])
            self.notifications.setdefault(uname, Queue())
            self.undo_stacks.setdefault(uname, Stack())

            self.storage.save_user(
                uname,
                clean_uid,
                clean_role,
                pw_hash,
                pw_salt,
                rec.name,
                rec.school,
                rec.programme,
                rec.year,
                rec.bio,
                rec.skills,
                rec.avatar_url,
                now,
            )

            token = None
            if issue_session:
                token = self._create_session(uname)
            return {"user": rec.to_public_dict(), "token": token}

    def _create_session(self, username: str) -> str:
        token = secrets.token_urlsafe(32)
        self.sessions.put(token, username)
        self.storage.save_session(token, username, time.time())
        return token

    def login(self, identifier: str, password: str) -> dict[str, Any]:
        with self._lock:
            key = identifier.strip().lower()
            user = self.users.get(key)
            if not user:
                mapped_uname = self.users_by_email.get(key)
                if mapped_uname:
                    user = self.users.get(mapped_uname)
            if not user:
                pending = self._find_pending_by_identifier(key)
                if pending and _verify_secret(password, pending.password_hash, pending.password_salt):
                    raise EngineError(
                        "Your request has been sent and will be verified by the university admin. Please sign in once your account is approved.",
                        status_code=403,
                        code="pending_approval",
                    )
                raise EngineError("Invalid username/University ID or password.", status_code=401)
            if not _verify_secret(password, user.password_hash, user.password_salt):
                raise EngineError("Invalid username/University ID or password.", status_code=401)
            if user.is_suspended:
                raise EngineError(
                    "This account has been suspended by the IT Department Administration.",
                    status_code=403,
                )
            token = self._create_session(user.username)
            return {"user": user.to_public_dict(), "token": token}

    def logout(self, token: str) -> None:
        with self._lock:
            if token:
                self.sessions.delete(token)
                self.storage.delete_session(token)

    def authenticate_token(self, token: Optional[str]) -> Optional[str]:
        if not token:
            return None
        with self._lock:
            uname = self.sessions.get(token)
            if not uname:
                return None
            user = self.users.get(uname)
            if not user or user.is_suspended:
                return None
            return uname

    def get_profile(self, target_username: str, viewer: Optional[str] = None) -> dict[str, Any]:
        with self._lock:
            uname = target_username.strip().lower()
            user = self._require_user(uname)
            data = user.to_public_dict()
            connections = self.graph.get_neighbors(uname)
            data["connection_count"] = len(connections)
            data["post_count"] = len(self.user_posts.get(uname, []))
            data["portfolio_count"] = len(self.user_portfolio.get(uname, []))

            if viewer and viewer in self.users:
                if viewer == uname:
                    data["relationship"] = "self"
                    data["degree"] = 0
                    data["shortest_path"] = [uname]
                    data["mutual_connections"] = []
                else:
                    if self.graph.is_connected(viewer, uname):
                        rel = "connected"
                    elif self.graph.has_pending_request(viewer, uname):
                        rel = "outgoing_pending"
                    elif self.graph.has_pending_request(uname, viewer):
                        rel = "incoming_pending"
                    else:
                        rel = "none"
                    degree, path = self.graph.degree_and_shortest_path(viewer, uname)
                    mutuals = self.graph.mutual_connections(viewer, uname)
                    data["relationship"] = rel
                    data["degree"] = degree
                    data["shortest_path"] = path
                    data["mutual_connections"] = [
                        self.users.get(m).to_public_dict()
                        for m in mutuals
                        if self.users.get(m)
                    ]
            return data

    def update_profile(
        self,
        username: str,
        name: str,
        programme: str,
        year: str,
        bio: str,
        skills: list[str],
        avatar_url: Optional[str] = None,
        school: Optional[str] = None,
    ) -> dict[str, Any]:
        with self._lock:
            user = self._require_user(username)
            clean_name = name.strip() or user.name
            clean_skills = [s.strip() for s in skills if s.strip()][:16]
            if clean_name != user.name:
                self.trie.remove_user(user.username, user.name, user.university_id)
                user.name = clean_name
                self.trie.insert_user(user.username, user.name, user.university_id)

            if school is not None:
                user.school = school.strip()
            user.programme = programme.strip()
            user.year = year.strip()
            user.bio = bio.strip()
            user.skills = clean_skills
            if avatar_url is not None:
                user.avatar_url = avatar_url or None

            self.storage.update_user_profile(
                user.username,
                user.name,
                user.school,
                user.programme,
                user.year,
                user.bio,
                user.skills,
                user.avatar_url,
            )
            return self.get_profile(user.username, viewer=user.username)

    # ------------------------------------------------------------------
    # Profile Portfolio: Certificates & Achievements (Separate from Posts)
    # ------------------------------------------------------------------

    def get_portfolio(self, target_username: str) -> list[dict[str, Any]]:
        with self._lock:
            uname = target_username.strip().lower()
            self._require_user(uname)
            return [item.to_dict() for item in self.user_portfolio.get(uname, [])]

    def add_portfolio_item(
        self,
        owner: str,
        category: str,
        title: str,
        issuer: str,
        issue_date: str = "",
        credential_id: str = "",
        credential_url: str = "",
        description: str = "",
        file_url: Optional[str] = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._require_user(owner)
            cat = (category or "certificate").strip().lower()
            if cat not in ("certificate", "achievement"):
                raise EngineError("Portfolio category must be 'certificate' or 'achievement'.")
            clean_title = title.strip()
            if not clean_title:
                raise EngineError("Title is required for a certificate or achievement.")
            clean_issuer = issuer.strip()
            if not clean_issuer:
                raise EngineError("Issuing organization or event name is required.")

            now = time.time()
            item = PortfolioItem(
                id=f"pf_{uuid.uuid4().hex[:12]}",
                owner=owner,
                category=cat,
                title=clean_title,
                issuer=clean_issuer,
                issue_date=issue_date.strip(),
                credential_id=credential_id.strip(),
                credential_url=credential_url.strip(),
                description=description.strip(),
                file_url=file_url or None,
                created_at=now,
            )

            self.portfolio_by_id.put(item.id, item)
            plist = self.user_portfolio.setdefault(owner, [])
            plist.insert(0, item)

            self.storage.save_portfolio_item(
                item.id,
                item.owner,
                item.category,
                item.title,
                item.issuer,
                item.issue_date,
                item.credential_id,
                item.credential_url,
                item.description,
                item.file_url,
                item.created_at,
            )
            return item.to_dict()

    def delete_portfolio_item(self, username: str, item_id: str) -> dict[str, Any]:
        with self._lock:
            item = self.portfolio_by_id.get(item_id)
            if not item:
                raise EngineError("Portfolio item not found.", status_code=404)
            if item.owner != username:
                raise EngineError("You can only remove items from your own portfolio.", status_code=403)

            self.undo_stacks.setdefault(username, Stack()).push(
                {
                    "type": "delete_portfolio",
                    "item": item.to_dict(),
                }
            )

            self.portfolio_by_id.delete(item_id)
            plist = self.user_portfolio.get(username, [])
            self.user_portfolio[username] = [x for x in plist if x.id != item_id]
            self.storage.delete_portfolio_item(item_id)
            return {"deleted": item_id}

    # ------------------------------------------------------------------
    # Spicy News & IT Department Governance (Admin Supervision)
    # ------------------------------------------------------------------

    def get_announcements(self) -> list[dict[str, Any]]:
        """
        Return university announcements ordered by urgency priority via heapq
        ('urgent' Spicy News first, then 'important', then 'general', newest first).
        """
        with self._lock:
            rank_map = {"urgent": 0, "important": 1, "general": 2}
            heap: list[tuple[int, float, str, AnnouncementItem]] = []
            for ann in self.announcements:
                heapq.heappush(
                    heap,
                    (rank_map.get(ann.priority, 2), -ann.created_at, ann.id, ann),
                )
            ordered: list[dict[str, Any]] = []
            while heap:
                _, _, _, item = heapq.heappop(heap)
                ordered.append(item.to_dict(self.users))
            return ordered

    def publish_announcement(
        self,
        admin_username: str,
        title: str,
        content: str,
        priority: str = "urgent",
        category: str = "Campus Notice",
    ) -> dict[str, Any]:
        with self._lock:
            admin = self._require_admin(admin_username)
            clean_title = title.strip()
            clean_content = content.strip()
            if not clean_title:
                raise EngineError("Announcement headline is required.")
            if not clean_content:
                raise EngineError("Announcement message cannot be empty.")

            clean_priority = (priority or "urgent").strip().lower()
            if clean_priority not in ("urgent", "important", "general"):
                raise EngineError("Priority must be 'urgent', 'important', or 'general'.")
            clean_category = category.strip() or "University Notice"

            now = time.time()
            ann = AnnouncementItem(
                id=f"ann_{uuid.uuid4().hex[:12]}",
                author=admin.username,
                title=clean_title,
                content=clean_content,
                priority=clean_priority,
                category=clean_category,
                created_at=now,
            )
            self.announcements_by_id.put(ann.id, ann)
            self.announcements.insert(0, ann)
            self.storage.save_announcement(
                ann.id,
                ann.author,
                ann.title,
                ann.content,
                ann.priority,
                ann.category,
                ann.created_at,
            )

            # Broadcast to every active student and faculty member's Notification Queue
            prefix = "SPICY NEWS (URGENT)" if clean_priority == "urgent" else "University Announcement"
            for member in self.users.values():
                if member.username != admin.username and not member.is_suspended:
                    self._push_notification(
                        recipient=member.username,
                        actor=admin.username,
                        ntype="spicy_news",
                        message=f"{prefix}: {clean_title}",
                        ref_id=ann.id,
                    )

            return ann.to_dict(self.users)

    def delete_announcement(self, admin_username: str, ann_id: str) -> dict[str, Any]:
        with self._lock:
            self._require_admin(admin_username)
            ann = self.announcements_by_id.get(ann_id)
            if not ann:
                raise EngineError("Announcement not found.", status_code=404)
            self.announcements_by_id.delete(ann_id)
            self.announcements = [a for a in self.announcements if a.id != ann_id]
            self.storage.delete_announcement(ann_id)
            return {"deleted": ann_id}

    def admin_get_governance_overview(self, admin_username: str) -> dict[str, Any]:
        with self._lock:
            self._require_admin(admin_username)
            members = []
            student_count = 0
            faculty_count = 0
            admin_count = 0
            suspended_count = 0

            for u in sorted(self.users.values(), key=lambda x: (-x.created_at, x.username)):
                if u.role == "student":
                    student_count += 1
                elif u.role == "faculty":
                    faculty_count += 1
                elif u.role == "admin":
                    admin_count += 1
                if u.is_suspended:
                    suspended_count += 1

                d = u.to_public_dict()
                d["connection_count"] = len(self.graph.get_neighbors(u.username))
                d["post_count"] = len(self.user_posts.get(u.username, []))
                d["portfolio_count"] = len(self.user_portfolio.get(u.username, []))
                members.append(d)

            edge_count = sum(len(nbrs) for nbrs in self.graph.adj.values()) // 2
            pending_count = sum(
                len(q) for q in self.graph.incoming_requests.values()
            )
            all_posts = [
                p.to_dict(self.users, viewer=admin_username)
                for p in sorted(
                    self.posts_by_id.values(),
                    key=lambda x: (-x.created_at, x.id),
                )
            ]

            pending_regs = [
                p.to_public_dict()
                for p in sorted(
                    self.pending_registrations.values(),
                    key=lambda x: (x.created_at, x.username),
                )
            ]

            community_proposals = [
                p.to_dict(self.users) for p in self.community_proposal_queue.to_list()
            ]
            password_reset_requests = [
                r.to_public_dict(self.users)
                for r in self.password_reset_queue.to_list()
                if r.status == "pending"
            ]
            managed_communities = [
                self._serialize_managed_community(c, viewer=admin_username)
                for c in sorted(
                    self.communities_by_id.values(),
                    key=lambda x: (-x.created_at, x.name.lower()),
                )
            ]

            return {
                "metrics": {
                    "total_members": len(self.users),
                    "students": student_count,
                    "faculty": faculty_count,
                    "admins": admin_count,
                    "suspended": suspended_count,
                    "connections": edge_count,
                    "pending_requests": pending_count,
                    "pending_registrations": len(pending_regs),
                    "pending_password_resets": len(password_reset_requests),
                    "pending_community_proposals": len(community_proposals),
                    "managed_communities": len(managed_communities),
                    "posts": len(self.posts_by_id),
                    "portfolio_items": len(self.portfolio_by_id),
                    "announcements": len(self.announcements),
                },
                "pending_registrations": pending_regs,
                "password_reset_requests": password_reset_requests,
                "community_proposals": community_proposals,
                "managed_communities": managed_communities,
                "members": members,
                "recent_posts": all_posts,
            }

    def admin_approve_registration(
        self, admin_username: str, university_id: str
    ) -> dict[str, Any]:
        with self._lock:
            self._require_admin(admin_username)
            pending = self._find_pending_by_identifier(university_id)
            if not pending:
                raise EngineError("Pending registration request not found.", status_code=404)
            uid_key = pending.university_id.lower()
            if self.users.contains(pending.username):
                raise EngineError(f"Username '@{pending.username}' is already taken.", status_code=409)
            if self.users_by_email.contains(uid_key):
                raise EngineError(
                    f"University ID '{pending.university_id}' is already registered.",
                    status_code=409,
                )

            now = time.time()
            rec = UserRecord(
                username=pending.username,
                university_id=pending.university_id,
                role=pending.role,
                is_suspended=False,
                password_hash=pending.password_hash,
                password_salt=pending.password_salt,
                name=pending.name,
                school=pending.school,
                programme=pending.programme,
                year=pending.year,
                bio=pending.bio,
                skills=list(pending.skills),
                avatar_url=None,
                created_at=now,
            )

            self.users.put(rec.username, rec)
            self.users_by_email.put(uid_key, rec.username)
            self.trie.insert_user(rec.username, rec.name, rec.university_id)
            self.graph.ensure_user(rec.username)
            self.user_posts.setdefault(rec.username, [])
            self.user_portfolio.setdefault(rec.username, [])
            self.notifications.setdefault(rec.username, Queue())
            self.undo_stacks.setdefault(rec.username, Stack())

            self.storage.save_user(
                rec.username,
                rec.university_id,
                rec.role,
                rec.password_hash,
                rec.password_salt,
                rec.name,
                rec.school,
                rec.programme,
                rec.year,
                rec.bio,
                rec.skills,
                rec.avatar_url,
                rec.created_at,
            )
            self.pending_registrations.delete(uid_key)
            self.storage.delete_pending_registration(uid_key)

            self._push_notification(
                recipient=rec.username,
                actor=admin_username,
                ntype="registration_approved",
                message="Your Chanakya Commons registration was verified and approved by the University IT Admin.",
                ref_id=rec.university_id,
            )

            return {
                "approved": True,
                "user": rec.to_public_dict(),
                "message": f"Approved and registered {rec.name} ({rec.university_id}).",
            }

    def admin_reject_registration(
        self, admin_username: str, university_id: str
    ) -> dict[str, Any]:
        with self._lock:
            self._require_admin(admin_username)
            pending = self._find_pending_by_identifier(university_id)
            if not pending:
                raise EngineError("Pending registration request not found.", status_code=404)
            uid_key = pending.university_id.lower()
            self.pending_registrations.delete(uid_key)
            self.storage.delete_pending_registration(uid_key)
            return {
                "rejected": True,
                "university_id": pending.university_id,
                "username": pending.username,
                "message": f"Rejected and removed registration request for {pending.university_id}.",
            }

    def admin_approve_password_reset(
        self, admin_username: str, request_id: str
    ) -> dict[str, Any]:
        with self._lock:
            self._require_admin(admin_username)
            req_obj = self.password_reset_by_id.get(request_id)
            if not req_obj or req_obj.status != "pending":
                raise EngineError("Pending password change request not found.", status_code=404)

            target = self._require_user(req_obj.username)
            if target.role == "admin":
                raise EngineError("Administrator passwords cannot be modified here.", status_code=403)

            now = time.time()
            target.password_hash = req_obj.new_password_hash
            target.password_salt = req_obj.new_password_salt
            self.storage.update_user_password(
                target.username, target.password_hash, target.password_salt
            )

            # Invalidate existing sessions for the user after a password change
            for tok, uname in list(self.sessions.items()):
                if uname == target.username:
                    self.sessions.delete(tok)
            self.storage.delete_user_sessions(target.username)

            req_obj.status = "approved"
            req_obj.reviewed_by = admin_username
            req_obj.reviewed_at = now
            self.password_reset_queue.remove_where(lambda item: item.id == request_id)
            self.pending_password_reset_by_user.delete(target.username)
            self.latest_password_reset_by_user.put(target.username, req_obj)
            self.storage.update_password_reset_status(
                req_obj.id, "approved", admin_username, now
            )

            self._push_notification(
                recipient=target.username,
                actor=admin_username,
                ntype="password_reset_approved",
                message="Your password change request was accepted by the University IT Admin.",
                ref_id=req_obj.id,
            )

            return {
                "approved": True,
                "request_id": req_obj.id,
                "username": target.username,
                "university_id": target.university_id,
                "message": f"Accepted password change for {target.name} (@{target.username}).",
            }

    def admin_reject_password_reset(
        self, admin_username: str, request_id: str
    ) -> dict[str, Any]:
        with self._lock:
            self._require_admin(admin_username)
            req_obj = self.password_reset_by_id.get(request_id)
            if not req_obj or req_obj.status != "pending":
                raise EngineError("Pending password change request not found.", status_code=404)

            now = time.time()
            req_obj.status = "rejected"
            req_obj.reviewed_by = admin_username
            req_obj.reviewed_at = now
            self.password_reset_queue.remove_where(lambda item: item.id == request_id)
            self.pending_password_reset_by_user.delete(req_obj.username)
            self.latest_password_reset_by_user.put(req_obj.username, req_obj)
            self.storage.update_password_reset_status(
                req_obj.id, "rejected", admin_username, now
            )

            if self.users.contains(req_obj.username):
                self._push_notification(
                    recipient=req_obj.username,
                    actor=admin_username,
                    ntype="password_reset_rejected",
                    message="Your password change request was declined by the University IT Admin.",
                    ref_id=req_obj.id,
                )

            return {
                "rejected": True,
                "request_id": req_obj.id,
                "username": req_obj.username,
                "university_id": req_obj.university_id,
                "message": f"Declined password change request for @{req_obj.username}.",
            }

    def admin_set_user_suspended(
        self, admin_username: str, target_username: str, suspended: bool
    ) -> dict[str, Any]:
        with self._lock:
            self._require_admin(admin_username)
            t = target_username.strip().lower()
            target = self._require_user(t)
            if target.role == "admin":
                raise EngineError("Administrator accounts cannot be suspended.")
            target.is_suspended = bool(suspended)
            self.storage.set_user_suspended(t, target.is_suspended)
            if target.is_suspended:
                for tok, uname in list(self.sessions.items()):
                    if uname == t:
                        self.sessions.delete(tok)
                self.storage.delete_user_sessions(t)
            return {"username": t, "is_suspended": target.is_suspended}

    def admin_moderate_delete_post(self, admin_username: str, post_id: str) -> dict[str, Any]:
        with self._lock:
            self._require_admin(admin_username)
            post = self.posts_by_id.get(post_id)
            if not post:
                raise EngineError("Post not found.", status_code=404)
            self.posts_by_id.delete(post_id)
            plist = self.user_posts.get(post.author, [])
            self.user_posts[post.author] = [p for p in plist if p.id != post_id]
            self.storage.delete_post(post_id)
            return {"deleted": post_id}

    # ------------------------------------------------------------------
    # Part 2: Connections, BFS, Mutuals & Recommendations
    # ------------------------------------------------------------------

    def send_connection_request(self, sender: str, receiver: str) -> dict[str, Any]:
        with self._lock:
            self._require_user(sender)
            target = receiver.strip().lower()
            self._require_user(target)
            if sender == target:
                raise EngineError("You cannot connect with yourself.")
            if self.graph.is_connected(sender, target):
                raise EngineError("You are already connected with this user.")
            if self.graph.has_pending_request(sender, target):
                raise EngineError("Connection request already sent.")
            if self.graph.has_pending_request(target, sender):
                return self.accept_connection_request(sender, target)

            now = time.time()
            self.graph.add_pending_request(sender, target, now)
            self.storage.save_request(sender, target, now)
            sender_obj = self.users.get(sender)
            self._push_notification(
                recipient=target,
                actor=sender,
                ntype="connection_request",
                message=f"{sender_obj.name if sender_obj else sender} sent you a connection request.",
                ref_id=sender,
            )
            return {"status": "outgoing_pending", "to_user": target}

    def accept_connection_request(self, receiver: str, sender: str) -> dict[str, Any]:
        with self._lock:
            self._require_user(receiver)
            from_u = sender.strip().lower()
            self._require_user(from_u)
            removed = self.graph.remove_pending_request(from_u, receiver)
            if not removed:
                raise EngineError("No pending connection request from this user.", status_code=404)
            self.storage.delete_request(from_u, receiver)

            now = time.time()
            self.graph.add_connection(receiver, from_u)
            self.storage.save_connection(receiver, from_u, now)

            rec_obj = self.users.get(receiver)
            self._push_notification(
                recipient=from_u,
                actor=receiver,
                ntype="connection_accepted",
                message=f"{rec_obj.name if rec_obj else receiver} accepted your connection request.",
                ref_id=receiver,
            )
            return {"status": "connected", "username": from_u}

    def reject_connection_request(self, receiver: str, sender: str) -> dict[str, Any]:
        with self._lock:
            self._require_user(receiver)
            from_u = sender.strip().lower()
            removed = self.graph.remove_pending_request(from_u, receiver)
            if not removed:
                raise EngineError("No pending connection request to reject.", status_code=404)
            self.storage.delete_request(from_u, receiver)
            return {"status": "rejected", "username": from_u}

    def cancel_connection_request(self, sender: str, receiver: str) -> dict[str, Any]:
        with self._lock:
            self._require_user(sender)
            to_u = receiver.strip().lower()
            removed = self.graph.remove_pending_request(sender, to_u)
            if not removed:
                raise EngineError("No outgoing connection request to cancel.", status_code=404)
            self.storage.delete_request(sender, to_u)
            self.undo_stacks.setdefault(sender, Stack()).push(
                {"type": "cancel_request", "to_user": to_u}
            )
            return {"status": "cancelled", "username": to_u}

    def remove_connection(self, username: str, other_username: str) -> dict[str, Any]:
        with self._lock:
            self._require_user(username)
            other = other_username.strip().lower()
            if not self.graph.remove_connection(username, other):
                raise EngineError("You are not connected with this user.", status_code=404)
            self.storage.delete_connection(username, other)
            self.undo_stacks.setdefault(username, Stack()).push(
                {"type": "remove_connection", "other": other}
            )
            return {"status": "removed", "username": other}

    def get_network_overview(self, username: str) -> dict[str, Any]:
        with self._lock:
            self._require_user(username)
            connections = []
            for nbr in self.graph.get_neighbors(username):
                u = self.users.get(nbr)
                if u:
                    d = u.to_public_dict()
                    d["connection_count"] = len(self.graph.get_neighbors(nbr))
                    connections.append(d)

            incoming = []
            for req in self.graph.get_incoming_requests(username):
                u = self.users.get(req["from_user"])
                if u:
                    incoming.append(
                        {
                            "user": u.to_public_dict(),
                            "created_at": req["created_at"],
                            "mutual_count": len(
                                self.graph.mutual_connections(username, u.username)
                            ),
                        }
                    )

            outgoing = []
            for req in self.graph.get_outgoing_requests(username):
                u = self.users.get(req["to_user"])
                if u:
                    outgoing.append(
                        {
                            "user": u.to_public_dict(),
                            "created_at": req["created_at"],
                        }
                    )

            return {
                "connections": connections,
                "incoming_requests": incoming,
                "outgoing_requests": outgoing,
            }

    def get_people_you_may_know(self, username: str, limit: int = 12) -> list[dict[str, Any]]:
        with self._lock:
            self._require_user(username)
            raw = self.graph.people_you_may_know(username, self.users, limit=limit)
            enriched = []
            for item in raw:
                u = self.users.get(item["username"])
                if not u or u.is_suspended:
                    continue
                if self.graph.has_pending_request(username, u.username):
                    rel = "outgoing_pending"
                elif self.graph.has_pending_request(u.username, username):
                    rel = "incoming_pending"
                else:
                    rel = "none"

                path_profiles = []
                for step_uname in item["shortest_path"]:
                    step_user = self.users.get(step_uname)
                    path_profiles.append(
                        {
                            "username": step_uname,
                            "name": step_user.name if step_user else step_uname,
                        }
                    )

                enriched.append(
                    {
                        "user": u.to_public_dict(),
                        "score": item["score"],
                        "mutual_count": item["mutual_count"],
                        "mutual_names": [
                            self.users.get(m).name
                            for m in item["mutual_usernames"]
                            if self.users.get(m)
                        ],
                        "shared_skills": item["shared_skills"],
                        "same_programme": item["same_programme"],
                        "degree": item["degree"],
                        "shortest_path": path_profiles,
                        "relationship": rel,
                    }
                )
            return enriched

    def get_degree_and_path(self, source: str, target: str) -> dict[str, Any]:
        with self._lock:
            self._require_user(source)
            t = target.strip().lower()
            self._require_user(t)
            deg, path = self.graph.degree_and_shortest_path(source, t)
            mutuals = self.graph.mutual_connections(source, t) if source != t else []
            return {
                "source": source,
                "target": t,
                "degree": deg,
                "shortest_path": [
                    {
                        "username": uname,
                        "name": self.users.get(uname).name if self.users.get(uname) else uname,
                        "programme": self.users.get(uname).programme if self.users.get(uname) else "",
                        "avatar_url": self.users.get(uname).avatar_url if self.users.get(uname) else None,
                    }
                    for uname in path
                ],
                "mutual_connections": [
                    self.users.get(m).to_public_dict()
                    for m in mutuals
                    if self.users.get(m)
                ],
            }

    def get_communities(self, viewer: Optional[str] = None) -> list[dict[str, Any]]:
        with self._lock:
            raw_communities = self.graph.detect_communities(self.users)
            out = []
            for comm in raw_communities:
                members = [
                    self.users.get(uname).to_public_dict()
                    for uname in comm["member_usernames"]
                    if self.users.get(uname)
                ]
                out.append(
                    {
                        **comm,
                        "members": members,
                        "includes_me": bool(viewer and viewer in comm["member_usernames"]),
                    }
                )
            return out

    # ------------------------------------------------------------------
    # Managed Communities: Proposals, Join Queues, Leader & Admin Supervision
    # ------------------------------------------------------------------

    def _serialize_managed_community(
        self, comm: CommunityRecord, viewer: Optional[str] = None
    ) -> dict[str, Any]:
        leader_obj = self.users.get(comm.leader)
        member_usernames = self.community_graph.get_members(comm.id)
        members = [
            self.users.get(uname).to_public_dict()
            for uname in member_usernames
            if self.users.get(uname)
        ]
        internal_edges = self.community_graph.internal_social_edges(comm.id, self.graph)

        viewer_obj = self.users.get(viewer) if viewer else None
        is_admin = bool(viewer_obj and viewer_obj.role == "admin")
        is_leader = bool(viewer and viewer == comm.leader)
        is_member = bool(viewer and self.community_graph.is_member(comm.id, viewer))
        my_pending = comm.join_requests_by_user.get(viewer) if viewer else None

        if is_leader:
            my_status = "leader"
        elif is_member:
            my_status = "member"
        elif my_pending:
            my_status = "pending"
        else:
            my_status = "none"

        effective_school = (comm.allowed_school or comm.category).strip()
        can_request_join = True
        join_restriction_reason: Optional[str] = None
        if comm.school_restricted and effective_school:
            if viewer_obj and not is_admin and my_status == "none":
                viewer_school = (viewer_obj.school or "").strip().lower()
                if viewer_school != effective_school.lower():
                    can_request_join = False
                    join_restriction_reason = (
                        f"Restricted by Community Leader or IT Admin to {effective_school} members only."
                    )

        can_review_queue = is_leader or is_admin
        pending_reqs = (
            [req.to_dict(self.users) for req in comm.join_requests.to_list()]
            if can_review_queue
            else []
        )

        return {
            "id": comm.id,
            "name": comm.name,
            "category": comm.category,
            "description": comm.description,
            "charter": comm.charter,
            "tags": list(comm.tags),
            "leader": comm.leader,
            "leader_name": leader_obj.name if leader_obj else comm.leader,
            "leader_role": leader_obj.role if leader_obj else "student",
            "leader_programme": leader_obj.programme if leader_obj else "",
            "leader_avatar": leader_obj.avatar_url if leader_obj else None,
            "approved_by": comm.approved_by,
            "school_restricted": comm.school_restricted,
            "allowed_school": comm.allowed_school,
            "can_request_join": can_request_join,
            "join_restriction_reason": join_restriction_reason,
            "is_suspended": comm.is_suspended,
            "created_at": comm.created_at,
            "member_usernames": member_usernames,
            "member_count": len(member_usernames),
            "members": members,
            "internal_edges": internal_edges,
            "my_status": my_status,
            "my_pending_interest": my_pending.interest if my_pending else None,
            "pending_join_count": len(comm.join_requests),
            "pending_join_requests": pending_reqs,
            "messages": [m.to_dict(self.users) for m in comm.messages[:30]],
        }

    def get_communities_overview(self, viewer: Optional[str] = None) -> dict[str, Any]:
        with self._lock:
            viewer_obj = self.users.get(viewer) if viewer else None
            is_admin = bool(viewer_obj and viewer_obj.role == "admin")

            managed = []
            for comm in sorted(
                self.communities_by_id.values(),
                key=lambda c: (-c.created_at, c.name.lower()),
            ):
                if comm.is_suspended and not (
                    is_admin
                    or viewer == comm.leader
                    or (viewer and self.community_graph.is_member(comm.id, viewer))
                ):
                    continue
                managed.append(self._serialize_managed_community(comm, viewer=viewer))

            my_proposals = []
            if viewer:
                my_proposals = [
                    p.to_dict(self.users)
                    for p in self.community_proposal_queue.to_list()
                    if p.proposer == viewer
                ]

            return {
                "communities": self.get_communities(viewer=viewer),
                "managed_communities": managed,
                "my_proposals": my_proposals,
                "school_categories": list(COMMUNITY_CATEGORIES),
            }

    def _resolve_school_restriction(
        self, school_restricted: bool, allowed_school: str, category: str
    ) -> tuple[bool, str]:
        if not school_restricted:
            return False, ""
        target = allowed_school.strip()
        if not target and category in CHANAKYA_SCHOOLS:
            target = category
        if target not in CHANAKYA_SCHOOLS:
            raise EngineError(
                "Please choose one of the Chanakya University Schools when restricting community access."
            )
        return True, target

    def propose_community(
        self,
        proposer: str,
        name: str,
        category: str,
        description: str,
        charter: str = "",
        tags: Optional[list[str]] = None,
        school_restricted: bool = False,
        allowed_school: str = "",
    ) -> dict[str, Any]:
        with self._lock:
            proposer_user = self._require_user(proposer)
            clean_name = re.sub(r"\s+", " ", name.strip())
            if len(clean_name) < 3 or len(clean_name) > 80:
                raise EngineError("Community name must be between 3 and 80 characters.")
            name_key = clean_name.lower()
            if self.community_by_name.contains(name_key):
                raise EngineError(
                    f"A community or pending request named '{clean_name}' already exists.",
                    status_code=409,
                )

            clean_cat = category.strip() or "School of Engineering"
            clean_desc = description.strip()
            if not clean_desc:
                raise EngineError("Community description is required.")
            clean_charter = charter.strip() or clean_desc
            clean_tags = [t.strip().lstrip("#") for t in (tags or []) if t.strip()][:8]
            restricted, target_school = self._resolve_school_restriction(
                bool(school_restricted), allowed_school, clean_cat
            )

            now = time.time()
            prop = CommunityProposalRecord(
                id=f"cprop_{uuid.uuid4().hex[:12]}",
                name=clean_name,
                category=clean_cat,
                description=clean_desc,
                charter=clean_charter,
                tags=clean_tags,
                proposer=proposer_user.username,
                created_at=now,
                school_restricted=restricted,
                allowed_school=target_school,
            )

            self.community_proposals_by_id.put(prop.id, prop)
            self.community_proposal_queue.enqueue(prop)
            self.community_by_name.put(name_key, prop.id)
            self.storage.save_community_proposal(
                prop.id,
                prop.name,
                prop.category,
                prop.description,
                prop.charter,
                prop.tags,
                prop.proposer,
                prop.created_at,
                school_restricted=prop.school_restricted,
                allowed_school=prop.allowed_school,
            )

            for member in self.users.values():
                if member.role == "admin":
                    self._push_notification(
                        recipient=member.username,
                        actor=proposer_user.username,
                        ntype="community_proposal",
                        message=f"{proposer_user.name} requested permission to start community \"{clean_name}\" ({clean_cat}).",
                        ref_id=prop.id,
                    )

            return {
                "proposal": prop.to_dict(self.users),
                "message": "Your community creation request has been sent to the University IT Admin for approval.",
            }

    def admin_approve_community_proposal(
        self,
        admin_username: str,
        proposal_id: str,
        school_restricted: Optional[bool] = None,
        allowed_school: Optional[str] = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._require_admin(admin_username)
            prop = self.community_proposals_by_id.get(proposal_id)
            if not prop:
                raise EngineError("Pending community proposal not found.", status_code=404)

            use_restricted = (
                bool(school_restricted)
                if school_restricted is not None
                else prop.school_restricted
            )
            raw_allowed = (
                allowed_school
                if allowed_school is not None
                else (prop.allowed_school or (prop.category if use_restricted else ""))
            )
            final_restricted, final_allowed_school = self._resolve_school_restriction(
                use_restricted, raw_allowed, prop.category
            )

            self.community_proposals_by_id.delete(proposal_id)
            self.community_proposal_queue.remove_where(lambda p: p.id == proposal_id)
            self.storage.delete_community_proposal(proposal_id)

            now = time.time()
            comm = CommunityRecord(
                id=f"comm_{uuid.uuid4().hex[:12]}",
                name=prop.name,
                category=prop.category,
                description=prop.description,
                charter=prop.charter,
                tags=list(prop.tags),
                leader=prop.proposer,
                approved_by=admin_username,
                is_suspended=False,
                created_at=now,
                school_restricted=final_restricted,
                allowed_school=final_allowed_school,
            )
            self.communities_by_id.put(comm.id, comm)
            self.community_by_name.put(comm.name.strip().lower(), comm.id)
            self.community_graph.ensure_community(comm.id)
            self.community_graph.add_member(comm.id, comm.leader)

            self.storage.save_community(
                comm.id,
                comm.name,
                comm.category,
                comm.description,
                comm.charter,
                comm.tags,
                comm.leader,
                comm.approved_by,
                comm.is_suspended,
                comm.created_at,
                school_restricted=comm.school_restricted,
                allowed_school=comm.allowed_school,
            )
            self.storage.save_community_member(comm.id, comm.leader, now)

            self._push_notification(
                recipient=comm.leader,
                actor=admin_username,
                ntype="community_approved",
                message=f"IT Admin approved your community \"{comm.name}\"! You are now the Community Leader.",
                ref_id=comm.id,
            )

            return {
                "approved": True,
                "community": self._serialize_managed_community(comm, viewer=admin_username),
                "message": f"Approved \"{comm.name}\" with @{comm.leader} as Community Leader.",
            }

    def set_community_access_policy(
        self,
        actor: str,
        community_id: str,
        school_restricted: bool,
        allowed_school: str = "",
    ) -> dict[str, Any]:
        with self._lock:
            actor_obj = self._require_user(actor)
            comm = self.communities_by_id.get(community_id)
            if not comm:
                raise EngineError("Community not found.", status_code=404)
            if actor != comm.leader and actor_obj.role != "admin":
                raise EngineError(
                    "Only the Community Leader (Host) or IT Admin can change school access settings.",
                    status_code=403,
                )

            restricted, target_school = self._resolve_school_restriction(
                bool(school_restricted), allowed_school, comm.category
            )
            comm.school_restricted = restricted
            comm.allowed_school = target_school
            self.storage.set_community_access_policy(
                comm.id, comm.school_restricted, comm.allowed_school
            )

            policy_text = (
                f"restricted to {comm.allowed_school} members only"
                if comm.school_restricted
                else "open to students from all Chanakya University Schools"
            )
            if actor_obj.role == "admin" and comm.leader != actor:
                self._push_notification(
                    recipient=comm.leader,
                    actor=actor,
                    ntype="community_notice",
                    message=f"IT Admin updated \"{comm.name}\" access policy: now {policy_text}.",
                    ref_id=comm.id,
                )

            return {
                "community": self._serialize_managed_community(comm, viewer=actor),
                "school_restricted": comm.school_restricted,
                "allowed_school": comm.allowed_school,
                "message": f"\"{comm.name}\" is now {policy_text}.",
            }

    def admin_reject_community_proposal(
        self, admin_username: str, proposal_id: str, reason: str = ""
    ) -> dict[str, Any]:
        with self._lock:
            self._require_admin(admin_username)
            prop = self.community_proposals_by_id.get(proposal_id)
            if not prop:
                raise EngineError("Pending community proposal not found.", status_code=404)

            self.community_proposals_by_id.delete(proposal_id)
            self.community_proposal_queue.remove_where(lambda p: p.id == proposal_id)
            self.community_by_name.delete(prop.name.strip().lower())
            self.storage.delete_community_proposal(proposal_id)

            clean_reason = reason.strip()
            msg = f"Your request to start community \"{prop.name}\" was declined by IT Admin."
            if clean_reason:
                msg += f" Note: {clean_reason}"
            self._push_notification(
                recipient=prop.proposer,
                actor=admin_username,
                ntype="community_rejected",
                message=msg,
                ref_id=proposal_id,
            )

            return {
                "rejected": True,
                "proposal_id": proposal_id,
                "message": f"Declined community proposal \"{prop.name}\".",
            }

    def request_join_community(
        self, username: str, community_id: str, interest: str
    ) -> dict[str, Any]:
        with self._lock:
            actor = self._require_user(username)
            comm = self.communities_by_id.get(community_id)
            if not comm:
                raise EngineError("Community not found.", status_code=404)
            if comm.is_suspended:
                raise EngineError("This community is currently suspended by IT Administration.", status_code=403)
            if username == comm.leader or self.community_graph.is_member(comm.id, username):
                raise EngineError("You are already a member of this community.")
            if username in comm.join_requests_by_user:
                raise EngineError("You already have a pending join request for this community.")

            if comm.school_restricted and actor.role != "admin":
                target_school = (comm.allowed_school or comm.category).strip()
                if (actor.school or "").strip().lower() != target_school.lower():
                    raise EngineError(
                        f"This community is restricted to {target_school} members only by the Community Leader or IT Admin.",
                        status_code=403,
                    )

            clean_interest = interest.strip()
            if len(clean_interest) < 5:
                raise EngineError("Please mention your interest in joining (at least 5 characters).")

            now = time.time()
            req = CommunityJoinRequest(
                community_id=comm.id,
                username=username,
                interest=clean_interest,
                created_at=now,
            )
            comm.join_requests.enqueue(req)
            comm.join_requests_by_user[username] = req
            self.storage.save_community_join_request(comm.id, username, clean_interest, now)

            self._push_notification(
                recipient=comm.leader,
                actor=username,
                ntype="community_join_request",
                message=f"{actor.name} requested to join \"{comm.name}\" — Interest: \"{clean_interest[:70]}\"",
                ref_id=comm.id,
            )

            return {
                "status": "pending",
                "community": self._serialize_managed_community(comm, viewer=username),
                "message": f"Join request with your interest sent to Community Leader @{comm.leader}.",
            }

    def cancel_join_community(self, username: str, community_id: str) -> dict[str, Any]:
        with self._lock:
            self._require_user(username)
            comm = self.communities_by_id.get(community_id)
            if not comm:
                raise EngineError("Community not found.", status_code=404)
            if username not in comm.join_requests_by_user:
                raise EngineError("No pending join request found.", status_code=404)
            comm.join_requests_by_user.pop(username, None)
            comm.join_requests.remove_where(lambda r: r.username == username)
            self.storage.delete_community_join_request(comm.id, username)
            return {
                "status": "cancelled",
                "community": self._serialize_managed_community(comm, viewer=username),
                "message": f"Cancelled join request for \"{comm.name}\".",
            }

    def review_community_join_request(
        self, reviewer: str, community_id: str, applicant_username: str, accept: bool
    ) -> dict[str, Any]:
        with self._lock:
            reviewer_obj = self._require_user(reviewer)
            comm = self.communities_by_id.get(community_id)
            if not comm:
                raise EngineError("Community not found.", status_code=404)
            if reviewer != comm.leader and reviewer_obj.role != "admin":
                raise EngineError(
                    "Only the Community Leader or IT Admin can review join requests.",
                    status_code=403,
                )

            target = applicant_username.strip().lower()
            req = comm.join_requests_by_user.pop(target, None)
            if not req:
                raise EngineError("Pending join request from this member not found.", status_code=404)
            comm.join_requests.remove_where(lambda r: r.username == target)
            self.storage.delete_community_join_request(comm.id, target)

            if accept:
                now = time.time()
                self.community_graph.add_member(comm.id, target)
                self.storage.save_community_member(comm.id, target, now)
                self._push_notification(
                    recipient=target,
                    actor=reviewer,
                    ntype="community_join_approved",
                    message=f"You were accepted into \"{comm.name}\" by {reviewer_obj.name}!",
                    ref_id=comm.id,
                )
                msg = f"Accepted @{target} into \"{comm.name}\"."
            else:
                self._push_notification(
                    recipient=target,
                    actor=reviewer,
                    ntype="community_join_rejected",
                    message=f"Your request to join \"{comm.name}\" was declined by {reviewer_obj.name}.",
                    ref_id=comm.id,
                )
                msg = f"Declined @{target}'s request to join \"{comm.name}\"."

            return {
                "accepted": accept,
                "community": self._serialize_managed_community(comm, viewer=reviewer),
                "message": msg,
            }

    def leave_community(self, username: str, community_id: str) -> dict[str, Any]:
        with self._lock:
            self._require_user(username)
            comm = self.communities_by_id.get(community_id)
            if not comm:
                raise EngineError("Community not found.", status_code=404)
            if username == comm.leader:
                raise EngineError("Community Leaders cannot leave their own community.")
            if not self.community_graph.remove_member(comm.id, username):
                raise EngineError("You are not a member of this community.", status_code=404)
            self.storage.delete_community_member(comm.id, username)
            return {
                "left": True,
                "community": self._serialize_managed_community(comm, viewer=username),
                "message": f"Left \"{comm.name}\".",
            }

    def remove_community_member(
        self, actor: str, community_id: str, target_username: str
    ) -> dict[str, Any]:
        with self._lock:
            actor_obj = self._require_user(actor)
            comm = self.communities_by_id.get(community_id)
            if not comm:
                raise EngineError("Community not found.", status_code=404)
            if actor != comm.leader and actor_obj.role != "admin":
                raise EngineError("Only the Community Leader or IT Admin can remove members.", status_code=403)
            target = target_username.strip().lower()
            if target == comm.leader:
                raise EngineError("The Community Leader cannot be removed from membership.")
            if not self.community_graph.remove_member(comm.id, target):
                raise EngineError("Member not found in this community.", status_code=404)
            self.storage.delete_community_member(comm.id, target)
            return {
                "removed": target,
                "community": self._serialize_managed_community(comm, viewer=actor),
                "message": f"Removed @{target} from \"{comm.name}\".",
            }

    def post_community_message(
        self, author: str, community_id: str, content: str
    ) -> dict[str, Any]:
        with self._lock:
            author_obj = self._require_user(author)
            comm = self.communities_by_id.get(community_id)
            if not comm:
                raise EngineError("Community not found.", status_code=404)
            is_admin = author_obj.role == "admin"
            if comm.is_suspended and not is_admin:
                raise EngineError("This community is suspended and read-only.", status_code=403)
            if not (is_admin or self.community_graph.is_member(comm.id, author)):
                raise EngineError("Join this community before posting community messages.", status_code=403)
            clean_text = content.strip()
            if not clean_text:
                raise EngineError("Message cannot be empty.")

            now = time.time()
            msg = CommunityMessageRecord(
                id=f"cmsg_{uuid.uuid4().hex[:12]}",
                community_id=comm.id,
                author=author,
                content=clean_text,
                is_admin_notice=is_admin,
                created_at=now,
            )
            comm.messages.insert(0, msg)
            self.storage.save_community_message(
                msg.id, comm.id, author, clean_text, is_admin, now
            )

            if is_admin or author == comm.leader:
                label = "IT Admin Supervision Notice" if is_admin else "Community Leader Update"
                for member_uname in self.community_graph.get_members(comm.id):
                    if member_uname != author:
                        self._push_notification(
                            recipient=member_uname,
                            actor=author,
                            ntype="community_notice",
                            message=f"[{comm.name}] {label}: {clean_text[:70]}",
                            ref_id=comm.id,
                        )

            return {
                "community": self._serialize_managed_community(comm, viewer=author),
                "message": "Supervision directive sent." if is_admin else "Community message posted.",
            }

    def admin_set_community_suspended(
        self, admin_username: str, community_id: str, suspended: bool
    ) -> dict[str, Any]:
        with self._lock:
            self._require_admin(admin_username)
            comm = self.communities_by_id.get(community_id)
            if not comm:
                raise EngineError("Community not found.", status_code=404)
            comm.is_suspended = bool(suspended)
            self.storage.set_community_suspended(comm.id, comm.is_suspended)
            self._push_notification(
                recipient=comm.leader,
                actor=admin_username,
                ntype="community_notice",
                message=(
                    f"IT Admin suspended community \"{comm.name}\" pending supervision review."
                    if comm.is_suspended
                    else f"IT Admin reactivated community \"{comm.name}\"."
                ),
                ref_id=comm.id,
            )
            return {
                "community": self._serialize_managed_community(comm, viewer=admin_username),
                "is_suspended": comm.is_suspended,
            }

    def admin_delete_community(self, admin_username: str, community_id: str) -> dict[str, Any]:
        with self._lock:
            self._require_admin(admin_username)
            comm = self.communities_by_id.get(community_id)
            if not comm:
                raise EngineError("Community not found.", status_code=404)
            self.communities_by_id.delete(comm.id)
            self.community_by_name.delete(comm.name.strip().lower())
            self.community_graph.remove_community(comm.id)
            self.storage.delete_community(comm.id)
            self._push_notification(
                recipient=comm.leader,
                actor=admin_username,
                ntype="community_notice",
                message=f"IT Admin dissolved community \"{comm.name}\".",
                ref_id=comm.id,
            )
            return {"deleted": community_id, "message": f"Deleted community \"{comm.name}\"."}

    # ------------------------------------------------------------------
    # Part 3: Posts, Heap-Merged Home Feed, Likes, Comment Trees, Trending
    # ------------------------------------------------------------------

    def create_post(
        self,
        author: str,
        title: str,
        content: str,
        tags: Optional[list[str]] = None,
        image_url: Optional[str] = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._require_user(author)
            clean_content = content.strip()
            if not clean_content:
                raise EngineError("Post content cannot be empty.")
            clean_title = title.strip()
            clean_tags = [t.strip().lstrip("#") for t in (tags or []) if t.strip()][:8]
            now = time.time()
            post_id = f"post_{uuid.uuid4().hex[:12]}"

            post = PostRecord(
                id=post_id,
                author=author,
                title=clean_title,
                content=clean_content,
                tags=clean_tags,
                image_url=image_url or None,
                created_at=now,
            )
            self.posts_by_id.put(post.id, post)
            plist = self.user_posts.setdefault(author, [])
            plist.insert(0, post)

            self.storage.save_post(
                post.id,
                post.author,
                post.title,
                post.content,
                post.tags,
                post.image_url,
                post.created_at,
            )
            return post.to_dict(self.users, viewer=author)

    def delete_post(self, username: str, post_id: str) -> dict[str, Any]:
        with self._lock:
            post = self.posts_by_id.get(post_id)
            if not post:
                raise EngineError("Post not found.", status_code=404)
            if post.author != username:
                raise EngineError("You can only delete your own posts.", status_code=403)

            flat_comments: list[dict[str, Any]] = []

            def _collect_comments(nodes: list[CommentNode]) -> None:
                for n in nodes:
                    flat_comments.append(
                        {
                            "id": n.id,
                            "post_id": n.post_id,
                            "author": n.author,
                            "content": n.content,
                            "parent_id": n.parent_id,
                            "created_at": n.created_at,
                        }
                    )
                    _collect_comments(n.replies)

            _collect_comments(post.root_comments)
            self.undo_stacks.setdefault(username, Stack()).push(
                {
                    "type": "delete_post",
                    "post": {
                        "id": post.id,
                        "author": post.author,
                        "title": post.title,
                        "content": post.content,
                        "tags": list(post.tags),
                        "image_url": post.image_url,
                        "created_at": post.created_at,
                        "likes": list(post.likes),
                        "comments": flat_comments,
                    },
                }
            )

            self.posts_by_id.delete(post_id)
            plist = self.user_posts.get(username, [])
            self.user_posts[username] = [p for p in plist if p.id != post_id]
            self.storage.delete_post(post_id)
            return {"deleted": post_id}

    def get_home_feed(
        self,
        username: str,
        include_self: bool = True,
        limit: int = 40,
        offset: int = 0,
        scope: str = "campus",
    ) -> list[dict[str, Any]]:
        with self._lock:
            self._require_user(username)
            clean_scope = (scope or "campus").strip().lower()
            if clean_scope == "connections":
                authors = list(self.graph.get_neighbors(username))
                if include_self:
                    authors.append(username)
            else:
                # Common Campus-Wide Feed open to every logged-in Chanakya University member
                authors = [
                    u.username
                    for u in self.users.values()
                    if not u.is_suspended
                ]

            post_lists = [self.user_posts.get(a, []) for a in authors if self.user_posts.get(a)]
            merged = merge_feeds_with_heap(post_lists, limit=limit, offset=offset)
            return [p.to_dict(self.users, viewer=username) for p in merged]

    def get_trending_posts(
        self, username: str, limit: int = 6, scope: str = "campus"
    ) -> list[dict[str, Any]]:
        with self._lock:
            self._require_user(username)
            clean_scope = (scope or "campus").strip().lower()
            if clean_scope == "connections":
                authors = set(self.graph.get_neighbors(username))
                authors.add(username)
            else:
                authors = {
                    u.username
                    for u in self.users.values()
                    if not u.is_suspended
                }
            candidate_posts: list[PostRecord] = []
            for a in authors:
                candidate_posts.extend(self.user_posts.get(a, []))

            ranked = rank_trending_with_heap(candidate_posts, time.time(), limit=limit)
            return [
                post.to_dict(self.users, viewer=username, trend_score=score)
                for score, post in ranked
            ]

    def get_user_posts(self, target_username: str, viewer: Optional[str] = None) -> list[dict[str, Any]]:
        with self._lock:
            t = target_username.strip().lower()
            self._require_user(t)
            return [
                p.to_dict(self.users, viewer=viewer)
                for p in self.user_posts.get(t, [])
            ]

    def toggle_like(self, username: str, post_id: str) -> dict[str, Any]:
        with self._lock:
            self._require_user(username)
            post = self.posts_by_id.get(post_id)
            if not post:
                raise EngineError("Post not found.", status_code=404)

            if username in post.likes:
                post.likes.discard(username)
                self.storage.delete_like(post_id, username)
                liked = False
            else:
                post.likes.add(username)
                self.storage.save_like(post_id, username, time.time())
                liked = True
                actor_obj = self.users.get(username)
                snippet = post.title or post.content[:48]
                self._push_notification(
                    recipient=post.author,
                    actor=username,
                    ntype="like",
                    message=f"{actor_obj.name if actor_obj else username} liked your post \"{snippet}\".",
                    ref_id=post.id,
                )

            return {
                "post_id": post.id,
                "liked_by_me": liked,
                "like_count": len(post.likes),
            }

    def add_comment(
        self,
        username: str,
        post_id: str,
        content: str,
        parent_id: Optional[str] = None,
    ) -> dict[str, Any]:
        with self._lock:
            actor_obj = self._require_user(username)
            post = self.posts_by_id.get(post_id)
            if not post:
                raise EngineError("Post not found.", status_code=404)
            clean_text = content.strip()
            if not clean_text:
                raise EngineError("Comment cannot be empty.")

            parent_node: Optional[CommentNode] = None
            if parent_id:
                parent_node = post.comments_by_id.get(parent_id)
                if not parent_node:
                    raise EngineError("Parent comment not found.", status_code=404)

            now = time.time()
            node = CommentNode(
                id=f"cmt_{uuid.uuid4().hex[:12]}",
                post_id=post.id,
                author=username,
                content=clean_text,
                created_at=now,
                parent_id=parent_id,
            )
            post.comments_by_id[node.id] = node
            if parent_node:
                parent_node.replies.append(node)
                self._push_notification(
                    recipient=parent_node.author,
                    actor=username,
                    ntype="reply",
                    message=f"{actor_obj.name} replied to your comment: \"{clean_text[:50]}\"",
                    ref_id=post.id,
                )
            else:
                post.root_comments.append(node)

            if not parent_node or parent_node.author != post.author:
                self._push_notification(
                    recipient=post.author,
                    actor=username,
                    ntype="comment",
                    message=f"{actor_obj.name} commented on your post: \"{clean_text[:50]}\"",
                    ref_id=post.id,
                )

            self.storage.save_comment(
                node.id, post.id, username, clean_text, parent_id, now
            )
            return post.to_dict(self.users, viewer=username)

    # ------------------------------------------------------------------
    # Part 4: Trie Prefix Search
    # ------------------------------------------------------------------

    def search_users(
        self, query: str, viewer: Optional[str] = None, limit: int = 10
    ) -> list[dict[str, Any]]:
        with self._lock:
            q = query.strip()
            if not q:
                all_users = sorted(
                    (
                        u
                        for u in self.users.values()
                        if u.role != "admin" and not u.is_suspended
                    ),
                    key=lambda u: u.name.lower(),
                )[:limit]
                matched_usernames = [u.username for u in all_users]
            else:
                matched_usernames = self.trie.search_prefix(q, limit=limit * 2)

            degrees = (
                self.graph.bfs_all_degrees(viewer)
                if viewer and viewer in self.users
                else {}
            )
            results = []
            for uname in matched_usernames:
                u = self.users.get(uname)
                if not u or u.role == "admin" or u.is_suspended:
                    continue
                item = u.to_public_dict()
                if viewer:
                    if viewer == uname:
                        item["relationship"] = "self"
                    elif self.graph.is_connected(viewer, uname):
                        item["relationship"] = "connected"
                    elif self.graph.has_pending_request(viewer, uname):
                        item["relationship"] = "outgoing_pending"
                    elif self.graph.has_pending_request(uname, viewer):
                        item["relationship"] = "incoming_pending"
                    else:
                        item["relationship"] = "none"
                    item["degree"] = degrees.get(uname)
                    item["mutual_count"] = (
                        len(self.graph.mutual_connections(viewer, uname))
                        if viewer != uname
                        else 0
                    )
                results.append(item)
                if len(results) >= limit:
                    break
            return results

    # ------------------------------------------------------------------
    # Notifications & Undo Stack
    # ------------------------------------------------------------------

    def get_notifications(self, username: str) -> dict[str, Any]:
        with self._lock:
            self._require_user(username)
            q = self.notifications.get(username, Queue())
            items = list(reversed(q.to_list()))
            unread = sum(1 for item in items if not item.is_read)
            return {
                "unread_count": unread,
                "items": [item.to_dict(self.users) for item in items[:40]],
            }

    def mark_notifications_read(self, username: str) -> dict[str, Any]:
        with self._lock:
            self._require_user(username)
            q = self.notifications.get(username, Queue())
            for item in q:
                item.is_read = True
            self.storage.mark_notifications_read(username)
            return {"unread_count": 0}

    def get_undo_status(self, username: str) -> dict[str, Any]:
        with self._lock:
            stack = self.undo_stacks.get(username)
            top = stack.peek() if stack else None
            label = None
            if top:
                if top["type"] == "delete_post":
                    label = "Undo delete post"
                elif top["type"] == "delete_portfolio":
                    label = "Undo remove certificate"
                elif top["type"] == "remove_connection":
                    label = f"Undo remove @{top['other']}"
                elif top["type"] == "cancel_request":
                    label = f"Undo cancel request to @{top['to_user']}"
            return {
                "can_undo": bool(top),
                "depth": len(stack) if stack else 0,
                "label": label,
            }

    def undo_last_action(self, username: str) -> dict[str, Any]:
        with self._lock:
            self._require_user(username)
            stack = self.undo_stacks.get(username)
            action = stack.pop() if stack else None
            if not action:
                raise EngineError("Nothing to undo.", status_code=400)

            atype = action["type"]
            if atype == "delete_post":
                snap = action["post"]
                post = PostRecord(
                    id=snap["id"],
                    author=snap["author"],
                    title=snap["title"],
                    content=snap["content"],
                    tags=list(snap["tags"]),
                    image_url=snap["image_url"],
                    created_at=snap["created_at"],
                    likes=set(snap["likes"]),
                )
                self.posts_by_id.put(post.id, post)
                plist = self.user_posts.setdefault(post.author, [])
                plist.append(post)
                plist.sort(key=lambda item: (-item.created_at, item.id))

                self.storage.save_post(
                    post.id,
                    post.author,
                    post.title,
                    post.content,
                    post.tags,
                    post.image_url,
                    post.created_at,
                )
                for lk_user in post.likes:
                    self.storage.save_like(post.id, lk_user, time.time())

                for c in sorted(snap["comments"], key=lambda x: x["created_at"]):
                    node = CommentNode(
                        id=c["id"],
                        post_id=c["post_id"],
                        author=c["author"],
                        content=c["content"],
                        created_at=c["created_at"],
                        parent_id=c["parent_id"],
                    )
                    post.comments_by_id[node.id] = node
                    if node.parent_id and node.parent_id in post.comments_by_id:
                        post.comments_by_id[node.parent_id].replies.append(node)
                    else:
                        post.root_comments.append(node)
                    self.storage.save_comment(
                        node.id,
                        post.id,
                        node.author,
                        node.content,
                        node.parent_id,
                        node.created_at,
                    )

                return {"restored": "post", "message": "Restored deleted post."}

            if atype == "delete_portfolio":
                snap = action["item"]
                item = PortfolioItem(
                    id=snap["id"],
                    owner=snap["owner"],
                    category=snap["category"],
                    title=snap["title"],
                    issuer=snap["issuer"],
                    issue_date=snap["issue_date"],
                    credential_id=snap["credential_id"],
                    credential_url=snap["credential_url"],
                    description=snap["description"],
                    file_url=snap["file_url"],
                    created_at=snap["created_at"],
                )
                self.portfolio_by_id.put(item.id, item)
                plist = self.user_portfolio.setdefault(item.owner, [])
                plist.append(item)
                plist.sort(key=lambda x: (-x.created_at, x.id))
                self.storage.save_portfolio_item(
                    item.id,
                    item.owner,
                    item.category,
                    item.title,
                    item.issuer,
                    item.issue_date,
                    item.credential_id,
                    item.credential_url,
                    item.description,
                    item.file_url,
                    item.created_at,
                )
                return {"restored": "portfolio", "message": f"Restored \"{item.title}\" to portfolio."}

            if atype == "remove_connection":
                other = action["other"]
                if self.users.contains(other) and not self.graph.is_connected(username, other):
                    now = time.time()
                    self.graph.add_connection(username, other)
                    self.storage.save_connection(username, other, now)
                return {"restored": "connection", "message": f"Reconnected with @{other}."}

            if atype == "cancel_request":
                to_user = action["to_user"]
                if self.users.contains(to_user) and not self.graph.is_connected(username, to_user):
                    now = time.time()
                    self.graph.add_pending_request(username, to_user, now)
                    self.storage.save_request(username, to_user, now)
                return {"restored": "request", "message": f"Re-sent request to @{to_user}."}

            raise EngineError("Unsupported undo action.")

    def get_graph_snapshot(self, viewer: Optional[str] = None) -> dict[str, Any]:
        with self._lock:
            degrees = (
                self.graph.bfs_all_degrees(viewer)
                if viewer and viewer in self.users
                else {}
            )
            nodes = []
            for u in sorted(self.users.values(), key=lambda x: x.username):
                nodes.append(
                    {
                        "username": u.username,
                        "name": u.name,
                        "role": u.role,
                        "programme": u.programme,
                        "year": u.year,
                        "degree": degrees.get(u.username),
                        "connection_count": len(self.graph.get_neighbors(u.username)),
                        "avatar_url": u.avatar_url,
                    }
                )
            edges = []
            for u, nbrs in self.graph.adj.items():
                for v in nbrs:
                    if u < v:
                        edges.append({"source": u, "target": v})
            return {
                "nodes": nodes,
                "edges": edges,
                "stats": {
                    "vertices": len(self.users),
                    "edges": len(edges),
                    "total_posts": len(self.posts_by_id),
                    "active_sessions": len(self.sessions),
                },
            }
