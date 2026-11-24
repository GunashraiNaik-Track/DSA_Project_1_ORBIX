"""
SQLite Persistence Layer for Chanakya Commons.

IMPORTANT ARCHITECTURAL CONTRACT:
Storage only keeps durable raw records so data survives restarts.
All graph computations, suggestions, degrees, shortest paths, prefix searches,
feed merges, trending ranks, portfolio lists, announcement queues, and notification
queues execute strictly in Python on in-memory data structures.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from typing import Any, Optional


DEFAULT_DB_PATH = os.environ.get(
    "CHANAKYA_DB_PATH",
    os.path.join(os.path.dirname(__file__), "chanakya_commons.db"),
)


class SQLiteStorage:
    """Thin durability layer persisting raw entities to SQLite."""

    def __init__(self, db_path: str = DEFAULT_DB_PATH) -> None:
        self.db_path = db_path
        self._lock = threading.RLock()
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._lock, self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    username TEXT PRIMARY KEY,
                    university_id TEXT NOT NULL DEFAULT '',
                    outlook_email TEXT NOT NULL DEFAULT '',
                    role TEXT NOT NULL DEFAULT 'student',
                    is_suspended INTEGER NOT NULL DEFAULT 0,
                    password_hash TEXT NOT NULL,
                    password_salt TEXT NOT NULL,
                    name TEXT NOT NULL,
                    school TEXT NOT NULL DEFAULT '',
                    programme TEXT NOT NULL DEFAULT '',
                    year TEXT NOT NULL DEFAULT '',
                    bio TEXT NOT NULL DEFAULT '',
                    skills_json TEXT NOT NULL DEFAULT '[]',
                    avatar_url TEXT,
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS pending_registrations (
                    outlook_email TEXT PRIMARY KEY,
                    university_id TEXT NOT NULL DEFAULT '',
                    username TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'student',
                    password_hash TEXT NOT NULL,
                    password_salt TEXT NOT NULL,
                    name TEXT NOT NULL,
                    school TEXT NOT NULL DEFAULT '',
                    programme TEXT NOT NULL DEFAULT '',
                    year TEXT NOT NULL DEFAULT '',
                    bio TEXT NOT NULL DEFAULT '',
                    skills_json TEXT NOT NULL DEFAULT '[]',
                    otp_hash TEXT NOT NULL,
                    otp_salt TEXT NOT NULL,
                    expires_at REAL NOT NULL,
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS portfolio_items (
                    id TEXT PRIMARY KEY,
                    owner TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'certificate',
                    title TEXT NOT NULL,
                    issuer TEXT NOT NULL DEFAULT '',
                    issue_date TEXT NOT NULL DEFAULT '',
                    credential_id TEXT NOT NULL DEFAULT '',
                    credential_url TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    file_url TEXT,
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS announcements (
                    id TEXT PRIMARY KEY,
                    author TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    priority TEXT NOT NULL DEFAULT 'urgent',
                    category TEXT NOT NULL DEFAULT 'University Notice',
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS connections (
                    user_a TEXT NOT NULL,
                    user_b TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    PRIMARY KEY (user_a, user_b)
                );

                CREATE TABLE IF NOT EXISTS connection_requests (
                    from_user TEXT NOT NULL,
                    to_user TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    PRIMARY KEY (from_user, to_user)
                );

                CREATE TABLE IF NOT EXISTS posts (
                    id TEXT PRIMARY KEY,
                    author TEXT NOT NULL,
                    title TEXT NOT NULL DEFAULT '',
                    content TEXT NOT NULL,
                    tags_json TEXT NOT NULL DEFAULT '[]',
                    image_url TEXT,
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS post_likes (
                    post_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    PRIMARY KEY (post_id, username)
                );

                CREATE TABLE IF NOT EXISTS comments (
                    id TEXT PRIMARY KEY,
                    post_id TEXT NOT NULL,
                    author TEXT NOT NULL,
                    content TEXT NOT NULL,
                    parent_id TEXT,
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS notifications (
                    id TEXT PRIMARY KEY,
                    recipient TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    ntype TEXT NOT NULL,
                    message TEXT NOT NULL,
                    ref_id TEXT,
                    is_read INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS community_proposals (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'School of Engineering',
                    description TEXT NOT NULL,
                    charter TEXT NOT NULL DEFAULT '',
                    tags_json TEXT NOT NULL DEFAULT '[]',
                    proposer TEXT NOT NULL,
                    school_restricted INTEGER NOT NULL DEFAULT 0,
                    allowed_school TEXT NOT NULL DEFAULT '',
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS communities (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'School of Engineering',
                    description TEXT NOT NULL,
                    charter TEXT NOT NULL DEFAULT '',
                    tags_json TEXT NOT NULL DEFAULT '[]',
                    leader TEXT NOT NULL,
                    approved_by TEXT NOT NULL DEFAULT '',
                    school_restricted INTEGER NOT NULL DEFAULT 0,
                    allowed_school TEXT NOT NULL DEFAULT '',
                    is_suspended INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS community_members (
                    community_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    joined_at REAL NOT NULL,
                    PRIMARY KEY (community_id, username)
                );

                CREATE TABLE IF NOT EXISTS community_join_requests (
                    community_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    interest TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    PRIMARY KEY (community_id, username)
                );

                CREATE TABLE IF NOT EXISTS community_messages (
                    id TEXT PRIMARY KEY,
                    community_id TEXT NOT NULL,
                    author TEXT NOT NULL,
                    content TEXT NOT NULL,
                    is_admin_notice INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS password_reset_requests (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    university_id TEXT NOT NULL,
                    new_password_hash TEXT NOT NULL,
                    new_password_salt TEXT NOT NULL,
                    reason TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'pending',
                    reviewed_by TEXT NOT NULL DEFAULT '',
                    reviewed_at REAL,
                    created_at REAL NOT NULL
                );
                """
            )

            cols = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(users)").fetchall()
            }
            if "university_id" not in cols:
                conn.execute(
                    "ALTER TABLE users ADD COLUMN university_id TEXT NOT NULL DEFAULT ''"
                )
            if "outlook_email" not in cols:
                conn.execute(
                    "ALTER TABLE users ADD COLUMN outlook_email TEXT NOT NULL DEFAULT ''"
                )
            if "role" not in cols:
                conn.execute(
                    "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'"
                )
            if "is_suspended" not in cols:
                conn.execute(
                    "ALTER TABLE users ADD COLUMN is_suspended INTEGER NOT NULL DEFAULT 0"
                )
            if "school" not in cols:
                conn.execute(
                    "ALTER TABLE users ADD COLUMN school TEXT NOT NULL DEFAULT ''"
                )

            pcols = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(pending_registrations)").fetchall()
            }
            if "university_id" not in pcols:
                conn.execute(
                    "ALTER TABLE pending_registrations ADD COLUMN university_id TEXT NOT NULL DEFAULT ''"
                )
            if "school" not in pcols:
                conn.execute(
                    "ALTER TABLE pending_registrations ADD COLUMN school TEXT NOT NULL DEFAULT ''"
                )

            cp_cols = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(community_proposals)").fetchall()
            }
            if "school_restricted" not in cp_cols:
                conn.execute(
                    "ALTER TABLE community_proposals ADD COLUMN school_restricted INTEGER NOT NULL DEFAULT 0"
                )
            if "allowed_school" not in cp_cols:
                conn.execute(
                    "ALTER TABLE community_proposals ADD COLUMN allowed_school TEXT NOT NULL DEFAULT ''"
                )

            c_cols = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(communities)").fetchall()
            }
            if "school_restricted" not in c_cols:
                conn.execute(
                    "ALTER TABLE communities ADD COLUMN school_restricted INTEGER NOT NULL DEFAULT 0"
                )
            if "allowed_school" not in c_cols:
                conn.execute(
                    "ALTER TABLE communities ADD COLUMN allowed_school TEXT NOT NULL DEFAULT ''"
                )
            conn.execute(
                "UPDATE communities SET category = 'School of Biosciences' WHERE name = 'Biosignal & Embedded Hardware Lab' AND category = 'Interdisciplinary Lab'"
            )

    def load_all(self) -> dict[str, list[dict[str, Any]]]:
        """Load raw tables on boot to hydrate in-memory data structures."""
        with self._lock, self._connect() as conn:
            users = []
            for row in conn.execute("SELECT * FROM users"):
                item = dict(row)
                item["skills"] = json.loads(item.pop("skills_json") or "[]")
                item["is_suspended"] = bool(item.get("is_suspended", 0))
                if not item.get("university_id"):
                    fallback_id = (
                        item.get("outlook_email")
                        or f"CU-{item['username'].upper()}"
                    )
                    item["university_id"] = fallback_id
                    conn.execute(
                        "UPDATE users SET university_id = ? WHERE username = ?",
                        (fallback_id, item["username"]),
                    )
                if not item.get("outlook_email"):
                    item["outlook_email"] = item["university_id"]
                if not item.get("school"):
                    item["school"] = ""
                if not item.get("role"):
                    item["role"] = "student"
                users.append(item)

            pending_registrations = []
            for row in conn.execute("SELECT * FROM pending_registrations"):
                item = dict(row)
                item["skills"] = json.loads(item.pop("skills_json") or "[]")
                if not item.get("university_id"):
                    item["university_id"] = item.get("outlook_email", "")
                if not item.get("school"):
                    item["school"] = ""
                pending_registrations.append(item)

            portfolio_items = [
                dict(r) for r in conn.execute("SELECT * FROM portfolio_items")
            ]
            announcements = [
                dict(r) for r in conn.execute("SELECT * FROM announcements")
            ]
            connections = [dict(r) for r in conn.execute("SELECT * FROM connections")]
            requests = [dict(r) for r in conn.execute("SELECT * FROM connection_requests")]

            posts = []
            for row in conn.execute("SELECT * FROM posts"):
                item = dict(row)
                item["tags"] = json.loads(item.pop("tags_json") or "[]")
                posts.append(item)

            likes = [dict(r) for r in conn.execute("SELECT * FROM post_likes")]
            comments = [dict(r) for r in conn.execute("SELECT * FROM comments")]
            notifications = [dict(r) for r in conn.execute("SELECT * FROM notifications")]
            sessions = [dict(r) for r in conn.execute("SELECT * FROM sessions")]

            community_proposals = []
            for row in conn.execute("SELECT * FROM community_proposals"):
                item = dict(row)
                item["tags"] = json.loads(item.pop("tags_json") or "[]")
                item["school_restricted"] = bool(item.get("school_restricted", 0))
                item["allowed_school"] = str(item.get("allowed_school") or "")
                community_proposals.append(item)

            communities = []
            for row in conn.execute("SELECT * FROM communities"):
                item = dict(row)
                item["tags"] = json.loads(item.pop("tags_json") or "[]")
                item["is_suspended"] = bool(item.get("is_suspended", 0))
                item["school_restricted"] = bool(item.get("school_restricted", 0))
                item["allowed_school"] = str(item.get("allowed_school") or "")
                communities.append(item)

            community_members = [
                dict(r) for r in conn.execute("SELECT * FROM community_members")
            ]
            community_join_requests = [
                dict(r) for r in conn.execute("SELECT * FROM community_join_requests")
            ]
            community_messages = [
                dict(r) for r in conn.execute("SELECT * FROM community_messages")
            ]
            password_reset_requests = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM password_reset_requests ORDER BY created_at ASC, id ASC"
                )
            ]

        return {
            "users": users,
            "pending_registrations": pending_registrations,
            "portfolio_items": portfolio_items,
            "announcements": announcements,
            "connections": connections,
            "connection_requests": requests,
            "posts": posts,
            "post_likes": likes,
            "comments": comments,
            "notifications": notifications,
            "sessions": sessions,
            "community_proposals": community_proposals,
            "communities": communities,
            "community_members": community_members,
            "community_join_requests": community_join_requests,
            "community_messages": community_messages,
            "password_reset_requests": password_reset_requests,
        }

    def save_user(
        self,
        username: str,
        university_id: str,
        role: str,
        password_hash: str,
        password_salt: str,
        name: str,
        school: str,
        programme: str,
        year: str,
        bio: str,
        skills: list[str],
        avatar_url: Optional[str],
        created_at: float,
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO users (
                    username, university_id, outlook_email, role, is_suspended,
                    password_hash, password_salt, name, school, programme, year,
                    bio, skills_json, avatar_url, created_at
                )
                VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    username,
                    university_id,
                    university_id,
                    role,
                    password_hash,
                    password_salt,
                    name,
                    school,
                    programme,
                    year,
                    bio,
                    json.dumps(skills),
                    avatar_url,
                    created_at,
                ),
            )

    def update_user_profile(
        self,
        username: str,
        name: str,
        school: str,
        programme: str,
        year: str,
        bio: str,
        skills: list[str],
        avatar_url: Optional[str],
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                UPDATE users
                SET name = ?, school = ?, programme = ?, year = ?, bio = ?, skills_json = ?, avatar_url = ?
                WHERE username = ?
                """,
                (name, school, programme, year, bio, json.dumps(skills), avatar_url, username),
            )

    def set_user_suspended(self, username: str, suspended: bool) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE users SET is_suspended = ? WHERE username = ?",
                (1 if suspended else 0, username),
            )

    def delete_user_sessions(self, username: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM sessions WHERE username = ?", (username,))

    def update_user_password(
        self, username: str, password_hash: str, password_salt: str
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE users SET password_hash = ?, password_salt = ? WHERE username = ?",
                (password_hash, password_salt, username),
            )
            conn.execute("DELETE FROM sessions WHERE username = ?", (username,))

    def save_password_reset_request(
        self,
        req_id: str,
        username: str,
        university_id: str,
        new_password_hash: str,
        new_password_salt: str,
        reason: str,
        status: str,
        created_at: float,
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO password_reset_requests (
                    id, username, university_id, new_password_hash, new_password_salt,
                    reason, status, reviewed_by, reviewed_at, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, '', NULL, ?)
                """,
                (
                    req_id,
                    username,
                    university_id,
                    new_password_hash,
                    new_password_salt,
                    reason,
                    status,
                    created_at,
                ),
            )

    def update_password_reset_status(
        self,
        req_id: str,
        status: str,
        reviewed_by: str,
        reviewed_at: float,
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                UPDATE password_reset_requests
                SET status = ?, reviewed_by = ?, reviewed_at = ?
                WHERE id = ?
                """,
                (status, reviewed_by, reviewed_at, req_id),
            )

    def delete_user_account(self, username: str, reassign_announcements_to: Optional[str] = None) -> None:
        with self._lock, self._connect() as conn:
            if reassign_announcements_to:
                conn.execute(
                    "UPDATE announcements SET author = ? WHERE author = ?",
                    (reassign_announcements_to, username),
                )
            conn.execute("DELETE FROM sessions WHERE username = ?", (username,))
            conn.execute("DELETE FROM users WHERE username = ?", (username,))

    def save_pending_registration(
        self,
        university_id: str,
        username: str,
        role: str,
        password_hash: str,
        password_salt: str,
        name: str,
        school: str,
        programme: str,
        year: str,
        bio: str,
        skills: list[str],
        otp_hash: str,
        otp_salt: str,
        expires_at: float,
        created_at: float,
    ) -> None:
        key = university_id.strip().lower()
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO pending_registrations (
                    outlook_email, university_id, username, role, password_hash, password_salt,
                    name, school, programme, year, bio, skills_json,
                    otp_hash, otp_salt, expires_at, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    key,
                    university_id,
                    username,
                    role,
                    password_hash,
                    password_salt,
                    name,
                    school,
                    programme,
                    year,
                    bio,
                    json.dumps(skills),
                    otp_hash,
                    otp_salt,
                    expires_at,
                    created_at,
                ),
            )

    def delete_pending_registration(self, university_id: str) -> None:
        key = university_id.strip().lower()
        with self._lock, self._connect() as conn:
            conn.execute(
                "DELETE FROM pending_registrations WHERE outlook_email = ? OR lower(university_id) = ?",
                (key, key),
            )

    def save_portfolio_item(
        self,
        item_id: str,
        owner: str,
        category: str,
        title: str,
        issuer: str,
        issue_date: str,
        credential_id: str,
        credential_url: str,
        description: str,
        file_url: Optional[str],
        created_at: float,
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO portfolio_items (
                    id, owner, category, title, issuer, issue_date,
                    credential_id, credential_url, description, file_url, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item_id,
                    owner,
                    category,
                    title,
                    issuer,
                    issue_date,
                    credential_id,
                    credential_url,
                    description,
                    file_url,
                    created_at,
                ),
            )

    def delete_portfolio_item(self, item_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM portfolio_items WHERE id = ?", (item_id,))

    def save_announcement(
        self,
        ann_id: str,
        author: str,
        title: str,
        content: str,
        priority: str,
        category: str,
        created_at: float,
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO announcements (id, author, title, content, priority, category, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (ann_id, author, title, content, priority, category, created_at),
            )

    def delete_announcement(self, ann_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM announcements WHERE id = ?", (ann_id,))

    def save_connection(self, user_a: str, user_b: str, created_at: float) -> None:
        a, b = (user_a, user_b) if user_a < user_b else (user_b, user_a)
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO connections (user_a, user_b, created_at) VALUES (?, ?, ?)",
                (a, b, created_at),
            )

    def delete_connection(self, user_a: str, user_b: str) -> None:
        a, b = (user_a, user_b) if user_a < user_b else (user_b, user_a)
        with self._lock, self._connect() as conn:
            conn.execute(
                "DELETE FROM connections WHERE user_a = ? AND user_b = ?",
                (a, b),
            )

    def save_request(self, from_user: str, to_user: str, created_at: float) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO connection_requests (from_user, to_user, created_at) VALUES (?, ?, ?)",
                (from_user, to_user, created_at),
            )

    def delete_request(self, from_user: str, to_user: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "DELETE FROM connection_requests WHERE from_user = ? AND to_user = ?",
                (from_user, to_user),
            )

    def save_post(
        self,
        post_id: str,
        author: str,
        title: str,
        content: str,
        tags: list[str],
        image_url: Optional[str],
        created_at: float,
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO posts (id, author, title, content, tags_json, image_url, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (post_id, author, title, content, json.dumps(tags), image_url, created_at),
            )

    def delete_post(self, post_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM posts WHERE id = ?", (post_id,))
            conn.execute("DELETE FROM post_likes WHERE post_id = ?", (post_id,))
            conn.execute("DELETE FROM comments WHERE post_id = ?", (post_id,))

    def save_like(self, post_id: str, username: str, created_at: float) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO post_likes (post_id, username, created_at) VALUES (?, ?, ?)",
                (post_id, username, created_at),
            )

    def delete_like(self, post_id: str, username: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "DELETE FROM post_likes WHERE post_id = ? AND username = ?",
                (post_id, username),
            )

    def save_comment(
        self,
        comment_id: str,
        post_id: str,
        author: str,
        content: str,
        parent_id: Optional[str],
        created_at: float,
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO comments (id, post_id, author, content, parent_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (comment_id, post_id, author, content, parent_id, created_at),
            )

    def save_notification(
        self,
        notif_id: str,
        recipient: str,
        actor: str,
        ntype: str,
        message: str,
        ref_id: Optional[str],
        created_at: float,
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO notifications (id, recipient, actor, ntype, message, ref_id, is_read, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?)
                """,
                (notif_id, recipient, actor, ntype, message, ref_id, created_at),
            )

    def mark_notifications_read(self, recipient: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE notifications SET is_read = 1 WHERE recipient = ?",
                (recipient,),
            )

    def save_session(self, token: str, username: str, created_at: float) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO sessions (token, username, created_at) VALUES (?, ?, ?)",
                (token, username, created_at),
            )

    def delete_session(self, token: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))

    def save_community_proposal(
        self,
        proposal_id: str,
        name: str,
        category: str,
        description: str,
        charter: str,
        tags: list[str],
        proposer: str,
        created_at: float,
        school_restricted: bool = False,
        allowed_school: str = "",
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO community_proposals (
                    id, name, category, description, charter, tags_json, proposer,
                    school_restricted, allowed_school, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    proposal_id,
                    name,
                    category,
                    description,
                    charter,
                    json.dumps(tags),
                    proposer,
                    1 if school_restricted else 0,
                    allowed_school,
                    created_at,
                ),
            )

    def delete_community_proposal(self, proposal_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM community_proposals WHERE id = ?", (proposal_id,))

    def save_community(
        self,
        community_id: str,
        name: str,
        category: str,
        description: str,
        charter: str,
        tags: list[str],
        leader: str,
        approved_by: str,
        is_suspended: bool,
        created_at: float,
        school_restricted: bool = False,
        allowed_school: str = "",
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO communities (
                    id, name, category, description, charter, tags_json,
                    leader, approved_by, school_restricted, allowed_school, is_suspended, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    community_id,
                    name,
                    category,
                    description,
                    charter,
                    json.dumps(tags),
                    leader,
                    approved_by,
                    1 if school_restricted else 0,
                    allowed_school,
                    1 if is_suspended else 0,
                    created_at,
                ),
            )

    def set_community_access_policy(
        self, community_id: str, school_restricted: bool, allowed_school: str
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE communities SET school_restricted = ?, allowed_school = ? WHERE id = ?",
                (1 if school_restricted else 0, allowed_school, community_id),
            )

    def set_community_suspended(self, community_id: str, suspended: bool) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE communities SET is_suspended = ? WHERE id = ?",
                (1 if suspended else 0, community_id),
            )

    def delete_community(self, community_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM communities WHERE id = ?", (community_id,))
            conn.execute("DELETE FROM community_members WHERE community_id = ?", (community_id,))
            conn.execute("DELETE FROM community_join_requests WHERE community_id = ?", (community_id,))
            conn.execute("DELETE FROM community_messages WHERE community_id = ?", (community_id,))

    def save_community_member(self, community_id: str, username: str, joined_at: float) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO community_members (community_id, username, joined_at) VALUES (?, ?, ?)",
                (community_id, username, joined_at),
            )

    def delete_community_member(self, community_id: str, username: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "DELETE FROM community_members WHERE community_id = ? AND username = ?",
                (community_id, username),
            )

    def save_community_join_request(
        self, community_id: str, username: str, interest: str, created_at: float
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO community_join_requests (community_id, username, interest, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (community_id, username, interest, created_at),
            )

    def delete_community_join_request(self, community_id: str, username: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "DELETE FROM community_join_requests WHERE community_id = ? AND username = ?",
                (community_id, username),
            )

    def save_community_message(
        self,
        message_id: str,
        community_id: str,
        author: str,
        content: str,
        is_admin_notice: bool,
        created_at: float,
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO community_messages (id, community_id, author, content, is_admin_notice, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (message_id, community_id, author, content, 1 if is_admin_notice else 0, created_at),
            )

