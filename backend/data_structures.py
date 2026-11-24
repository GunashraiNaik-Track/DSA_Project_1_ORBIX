"""
Core Data Structures & Algorithms for Chanakya Commons.

All graph, search, feed merging, ranking, queue, and undo-stack operations
run exclusively in memory on explicit Python data structures without SQL queries.
"""

from __future__ import annotations

from collections import Counter, deque
from dataclasses import dataclass, field
import heapq
import math
from typing import Any, Callable, Generic, Iterator, Optional, TypeVar

K = TypeVar("K")
V = TypeVar("V")
T = TypeVar("T")


class HashTable(Generic[K, V]):
    """
    Separate-chaining hash table with dynamic resizing.
    Provides O(1) average-case lookup, insertion, and deletion for users and posts.
    """

    def __init__(self, initial_capacity: int = 32) -> None:
        self._capacity = max(8, initial_capacity)
        self._buckets: list[list[tuple[K, V]]] = [[] for _ in range(self._capacity)]
        self._size = 0

    def _hash(self, key: K) -> int:
        if isinstance(key, str):
            h = 2166136261
            for ch in key:
                h ^= ord(ch)
                h = (h * 16777619) & 0xFFFFFFFF
            return h % self._capacity
        return hash(key) % self._capacity

    def _rehash(self, new_capacity: int) -> None:
        old_buckets = self._buckets
        self._capacity = new_capacity
        self._buckets = [[] for _ in range(new_capacity)]
        self._size = 0
        for bucket in old_buckets:
            for k, v in bucket:
                self.put(k, v)

    def put(self, key: K, value: V) -> None:
        if (self._size + 1) / self._capacity > 0.72:
            self._rehash(self._capacity * 2)
        idx = self._hash(key)
        bucket = self._buckets[idx]
        for i, (existing_k, _) in enumerate(bucket):
            if existing_k == key:
                bucket[i] = (key, value)
                return
        bucket.append((key, value))
        self._size += 1

    def get(self, key: K, default: Optional[V] = None) -> Optional[V]:
        idx = self._hash(key)
        for existing_k, existing_v in self._buckets[idx]:
            if existing_k == key:
                return existing_v
        return default

    def delete(self, key: K) -> bool:
        idx = self._hash(key)
        bucket = self._buckets[idx]
        for i, (existing_k, _) in enumerate(bucket):
            if existing_k == key:
                bucket.pop(i)
                self._size -= 1
                return True
        return False

    def contains(self, key: K) -> bool:
        return self.get(key) is not None

    def values(self) -> list[V]:
        out: list[V] = []
        for bucket in self._buckets:
            for _, v in bucket:
                out.append(v)
        return out

    def keys(self) -> list[K]:
        out: list[K] = []
        for bucket in self._buckets:
            for k, _ in bucket:
                out.append(k)
        return out

    def items(self) -> list[tuple[K, V]]:
        out: list[tuple[K, V]] = []
        for bucket in self._buckets:
            out.extend(bucket)
        return out

    def __len__(self) -> int:
        return self._size

    def __contains__(self, key: K) -> bool:
        return self.contains(key)


class TrieNode:
    """Node in the prefix Trie mapping normalized character prefixes to usernames."""

    def __init__(self) -> None:
        self.children: dict[str, TrieNode] = {}
        self.usernames: set[str] = set()


class Trie:
    """
    Prefix Tree (Trie) for instant typeahead student search by username or name tokens.
    Supports O(L + M) prefix lookup where L is prefix length and M is matched subtree size.
    """

    def __init__(self) -> None:
        self.root = TrieNode()

    def _insert_token(self, token: str, username: str) -> None:
        clean = token.strip().lower()
        if not clean:
            return
        node = self.root
        for ch in clean:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        node.usernames.add(username)

    def _remove_token(self, token: str, username: str) -> None:
        clean = token.strip().lower()
        if not clean:
            return
        node = self.root
        path: list[tuple[TrieNode, str]] = []
        for ch in clean:
            if ch not in node.children:
                return
            path.append((node, ch))
            node = node.children[ch]
        node.usernames.discard(username)
        for parent, ch in reversed(path):
            child = parent.children[ch]
            if not child.usernames and not child.children:
                del parent.children[ch]
            else:
                break

    def insert_user(
        self, username: str, full_name: str, university_id: str = ""
    ) -> None:
        self._insert_token(username, username)
        self._insert_token(full_name, username)
        for part in full_name.split():
            self._insert_token(part, username)
        if university_id.strip():
            self._insert_token(university_id, username)

    def remove_user(
        self, username: str, full_name: str, university_id: str = ""
    ) -> None:
        self._remove_token(username, username)
        self._remove_token(full_name, username)
        for part in full_name.split():
            self._remove_token(part, username)
        if university_id.strip():
            self._remove_token(university_id, username)

    def search_prefix(self, prefix: str, limit: int = 10) -> list[str]:
        clean = prefix.strip().lower()
        if not clean:
            return []
        node = self.root
        for ch in clean:
            if ch not in node.children:
                return []
            node = node.children[ch]

        collected: set[str] = set()
        queue: deque[TrieNode] = deque([node])
        while queue:
            curr = queue.popleft()
            collected.update(curr.usernames)
            for child in curr.children.values():
                queue.append(child)

        # Prioritize direct username prefix matches, then alphabetical
        ranked = sorted(
            collected,
            key=lambda uname: (0 if uname.lower().startswith(clean) else 1, uname.lower()),
        )
        return ranked[:limit]


class Stack(Generic[T]):
    """LIFO Stack used for undo history and navigation back-stack."""

    def __init__(self, max_size: int = 50) -> None:
        self._items: list[T] = []
        self._max_size = max_size

    def push(self, item: T) -> None:
        if len(self._items) >= self._max_size:
            self._items.pop(0)
        self._items.append(item)

    def pop(self) -> Optional[T]:
        if not self._items:
            return None
        return self._items.pop()

    def peek(self) -> Optional[T]:
        if not self._items:
            return None
        return self._items[-1]

    def is_empty(self) -> bool:
        return len(self._items) == 0

    def to_list(self) -> list[T]:
        return list(self._items)

    def __len__(self) -> int:
        return len(self._items)


class Queue(Generic[T]):
    """FIFO Queue backed by collections.deque for requests and notifications."""

    def __init__(self) -> None:
        self._dq: deque[T] = deque()

    def enqueue(self, item: T) -> None:
        self._dq.append(item)

    def dequeue(self) -> Optional[T]:
        if not self._dq:
            return None
        return self._dq.popleft()

    def peek(self) -> Optional[T]:
        if not self._dq:
            return None
        return self._dq[0]

    def remove_where(self, predicate: Callable[[T], bool]) -> Optional[T]:
        removed: Optional[T] = None
        kept: deque[T] = deque()
        for item in self._dq:
            if removed is None and predicate(item):
                removed = item
            else:
                kept.append(item)
        self._dq = kept
        return removed

    def to_list(self) -> list[T]:
        return list(self._dq)

    def __iter__(self) -> Iterator[T]:
        return iter(self._dq)

    def __len__(self) -> int:
        return len(self._dq)


@dataclass
class CommentNode:
    """Tree node supporting nested comments and replies on posts."""

    id: str
    post_id: str
    author: str
    content: str
    created_at: float
    parent_id: Optional[str] = None
    replies: list[CommentNode] = field(default_factory=list)

    def count_subtree(self) -> int:
        return 1 + sum(child.count_subtree() for child in self.replies)

    def to_dict(self, users_table: HashTable[str, Any]) -> dict[str, Any]:
        author_user = users_table.get(self.author)
        return {
            "id": self.id,
            "post_id": self.post_id,
            "author": self.author,
            "author_name": author_user.name if author_user else self.author,
            "author_avatar": author_user.avatar_url if author_user else None,
            "author_programme": author_user.programme if author_user else "",
            "content": self.content,
            "created_at": self.created_at,
            "parent_id": self.parent_id,
            "replies": [child.to_dict(users_table) for child in self.replies],
        }


class SocialGraph:
    """
    Undirected Campus Network Graph G(V, E) stored via Adjacency Lists.
    - Accepted connections are undirected edges in self.adj (no self-edges or duplicates).
    - Pending requests are directed edges stored in FIFO incoming queues & outgoing sets.
    - Shortest chains, connection degrees, mutuals, recommendations, and communities
      are computed in memory via BFS and graph algorithms.
    """

    def __init__(self) -> None:
        self.adj: dict[str, set[str]] = {}
        self.incoming_requests: dict[str, Queue[dict[str, Any]]] = {}
        self.outgoing_requests: dict[str, dict[str, dict[str, Any]]] = {}

    def ensure_user(self, username: str) -> None:
        if username not in self.adj:
            self.adj[username] = set()
        if username not in self.incoming_requests:
            self.incoming_requests[username] = Queue()
        if username not in self.outgoing_requests:
            self.outgoing_requests[username] = {}

    def is_connected(self, u: str, v: str) -> bool:
        return u in self.adj and v in self.adj[u]

    def has_pending_request(self, sender: str, receiver: str) -> bool:
        return sender in self.outgoing_requests and receiver in self.outgoing_requests[sender]

    def add_connection(self, u: str, v: str) -> bool:
        if u == v:
            return False
        self.ensure_user(u)
        self.ensure_user(v)
        if v in self.adj[u]:
            return False
        self.adj[u].add(v)
        self.adj[v].add(u)
        return True

    def remove_connection(self, u: str, v: str) -> bool:
        if u not in self.adj or v not in self.adj[u]:
            return False
        self.adj[u].discard(v)
        self.adj[v].discard(u)
        return True

    def add_pending_request(self, sender: str, receiver: str, created_at: float) -> bool:
        if sender == receiver or self.is_connected(sender, receiver):
            return False
        self.ensure_user(sender)
        self.ensure_user(receiver)
        if self.has_pending_request(sender, receiver):
            return False
        payload = {"from_user": sender, "to_user": receiver, "created_at": created_at}
        self.incoming_requests[receiver].enqueue(payload)
        self.outgoing_requests[sender][receiver] = payload
        return True

    def remove_pending_request(self, sender: str, receiver: str) -> Optional[dict[str, Any]]:
        if sender not in self.outgoing_requests or receiver not in self.outgoing_requests[sender]:
            return None
        payload = self.outgoing_requests[sender].pop(receiver)
        if receiver in self.incoming_requests:
            self.incoming_requests[receiver].remove_where(
                lambda item: item["from_user"] == sender
            )
        return payload

    def get_neighbors(self, username: str) -> list[str]:
        if username not in self.adj:
            return []
        return sorted(self.adj[username])

    def get_incoming_requests(self, username: str) -> list[dict[str, Any]]:
        if username not in self.incoming_requests:
            return []
        return self.incoming_requests[username].to_list()

    def get_outgoing_requests(self, username: str) -> list[dict[str, Any]]:
        if username not in self.outgoing_requests:
            return []
        return sorted(
            self.outgoing_requests[username].values(),
            key=lambda item: item["created_at"],
        )

    def mutual_connections(self, u: str, v: str) -> list[str]:
        if u not in self.adj or v not in self.adj:
            return []
        return sorted(self.adj[u].intersection(self.adj[v]))

    def degree_and_shortest_path(
        self, source: str, target: str
    ) -> tuple[Optional[int], list[str]]:
        """
        Compute the exact degree of connection and one shortest connection chain
        between source and target using Breadth-First Search (BFS).
        """
        if source not in self.adj or target not in self.adj:
            return None, []
        if source == target:
            return 0, [source]

        visited: set[str] = {source}
        parent: dict[str, Optional[str]] = {source: None}
        q: deque[tuple[str, int]] = deque([(source, 0)])

        while q:
            curr, dist = q.popleft()
            for nbr in sorted(self.adj[curr]):
                if nbr in visited:
                    continue
                visited.add(nbr)
                parent[nbr] = curr
                if nbr == target:
                    path: list[str] = []
                    step: Optional[str] = target
                    while step is not None:
                        path.append(step)
                        step = parent[step]
                    path.reverse()
                    return dist + 1, path
                q.append((nbr, dist + 1))

        return None, []

    def bfs_all_degrees(self, source: str) -> dict[str, int]:
        """Single BFS pass computing exact degree from source to all reachable nodes."""
        if source not in self.adj:
            return {}
        degrees: dict[str, int] = {source: 0}
        q: deque[str] = deque([source])
        while q:
            curr = q.popleft()
            for nbr in self.adj[curr]:
                if nbr not in degrees:
                    degrees[nbr] = degrees[curr] + 1
                    q.append(nbr)
        return degrees

    def people_you_may_know(
        self,
        username: str,
        users_table: HashTable[str, Any],
        limit: int = 12,
    ) -> list[dict[str, Any]]:
        """
        Rank non-connected students using multi-hop BFS (up to 3 hops) combined with:
        1. Adamic-Adar weighted mutual connections: sum(1 / log(1 + deg(w)))
        2. Shared technical skills overlap
        3. Same academic programme / cohort bonus
        """
        if username not in self.adj:
            return []

        me = users_table.get(username)
        my_skills = {s.strip().lower() for s in (me.skills if me else []) if s.strip()}
        my_prog = (me.programme or "").strip().lower() if me else ""

        degrees = self.bfs_all_degrees(username)
        my_neighbors = self.adj[username]

        candidates: list[dict[str, Any]] = []
        for other_uname in users_table.keys():
            if other_uname == username or other_uname in my_neighbors:
                continue

            other = users_table.get(other_uname)
            if (
                not other
                or getattr(other, "role", "student") == "admin"
                or getattr(other, "is_suspended", False)
            ):
                continue

            mutuals = sorted(my_neighbors.intersection(self.adj.get(other_uname, set())))
            adamic_adar = sum(
                1.0 / math.log(1.0 + max(1, len(self.adj.get(m, set()))))
                for m in mutuals
            )

            other_skills = {s.strip().lower() for s in other.skills if s.strip()}
            shared_skills = sorted(my_skills.intersection(other_skills))
            same_programme = bool(
                my_prog and other.programme and other.programme.strip().lower() == my_prog
            )

            deg = degrees.get(other_uname)
            hop_bonus = 0.0
            if deg == 2:
                hop_bonus = 1.2
            elif deg == 3:
                hop_bonus = 0.45

            score = round(
                adamic_adar * 2.5
                + hop_bonus
                + len(shared_skills) * 0.55
                + (0.4 if same_programme else 0.0),
                3,
            )

            _, path = self.degree_and_shortest_path(username, other_uname)
            candidates.append(
                {
                    "username": other_uname,
                    "score": score,
                    "mutual_count": len(mutuals),
                    "mutual_usernames": mutuals,
                    "shared_skills": shared_skills,
                    "same_programme": same_programme,
                    "degree": deg,
                    "shortest_path": path,
                }
            )

        candidates.sort(
            key=lambda c: (-c["score"], -c["mutual_count"], c["degree"] or 999, c["username"])
        )
        return candidates[:limit]

    def detect_communities(self, users_table: HashTable[str, Any]) -> list[dict[str, Any]]:
        """
        Detect tightly-knit student communities on the in-memory adjacency list using
        iterative Label Propagation (LPA) with deterministic tie-breaking.
        """
        nodes = sorted(self.adj.keys())
        if not nodes:
            return []

        labels: dict[str, str] = {u: u for u in nodes}
        for _ in range(12):
            changed = False
            for u in nodes:
                nbrs = self.adj[u]
                if not nbrs:
                    continue
                counts = Counter(labels[v] for v in nbrs)
                # Deterministic tie-breaking by highest frequency then lexicographically smallest label
                best_label = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
                if labels[u] != best_label:
                    labels[u] = best_label
                    changed = True
            if not changed:
                break

        groups: dict[str, list[str]] = {}
        for u, lbl in labels.items():
            groups.setdefault(lbl, []).append(u)

        communities: list[dict[str, Any]] = []
        idx = 1
        for _, members in sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0])):
            if len(members) < 2:
                continue
            member_set = set(members)
            internal_edges = 0
            skill_counts: Counter[str] = Counter()
            prog_counts: Counter[str] = Counter()
            for u in members:
                for v in self.adj[u]:
                    if v in member_set and u < v:
                        internal_edges += 1
                user_obj = users_table.get(u)
                if user_obj:
                    if user_obj.programme:
                        prog_counts[user_obj.programme] += 1
                    for sk in user_obj.skills:
                        if sk.strip():
                            skill_counts[sk.strip()] += 1

            possible_edges = len(members) * (len(members) - 1) / 2
            density = round(internal_edges / possible_edges, 2) if possible_edges else 0.0
            top_skills = [s for s, _ in skill_counts.most_common(4)]
            top_prog = prog_counts.most_common(1)[0][0] if prog_counts else "Interdisciplinary"
            label_title = f"{top_skills[0]} & {top_prog} Circle" if top_skills else f"{top_prog} Circle"

            communities.append(
                {
                    "id": f"community-{idx}",
                    "name": label_title,
                    "dominant_programme": top_prog,
                    "top_skills": top_skills,
                    "member_usernames": sorted(members),
                    "member_count": len(members),
                    "internal_edges": internal_edges,
                    "density": density,
                }
            )
            idx += 1

        return communities


def merge_feeds_with_heap(
    post_lists: list[list[Any]], limit: int = 50, offset: int = 0
) -> list[Any]:
    """
    K-way merge of time-ordered per-user post lists (each sorted newest-first)
    using a binary heap (heapq). Complexity: O((offset + limit) log k).
    """
    heap: list[tuple[float, str, int, int]] = []
    for list_idx, plist in enumerate(post_lists):
        if plist:
            first = plist[0]
            heapq.heappush(heap, (-first.created_at, first.id, list_idx, 0))

    merged: list[Any] = []
    needed = offset + limit
    while heap and len(merged) < needed:
        _, _, list_idx, item_idx = heapq.heappop(heap)
        plist = post_lists[list_idx]
        merged.append(plist[item_idx])
        next_idx = item_idx + 1
        if next_idx < len(plist):
            nxt = plist[next_idx]
            heapq.heappush(heap, (-nxt.created_at, nxt.id, list_idx, next_idx))

    return merged[offset : offset + limit]


def rank_trending_with_heap(
    posts: list[Any], now_ts: float, limit: int = 8
) -> list[tuple[float, Any]]:
    """
    Rank posts among a student's network using a max-heap (negated score in heapq)
    combining likes, comment subtree size, and recency decay.
    """
    heap: list[tuple[float, float, str, Any]] = []
    for post in posts:
        age_hours = max(0.0, (now_ts - post.created_at) / 3600.0)
        total_comments = sum(c.count_subtree() for c in post.root_comments)
        raw_engagement = len(post.likes) * 2.0 + total_comments * 3.0 + 0.5
        score = raw_engagement / ((age_hours + 2.0) ** 0.85)
        heapq.heappush(heap, (-score, -post.created_at, post.id, post))

    results: list[tuple[float, Any]] = []
    while heap and len(results) < limit:
        neg_score, _, _, post = heapq.heappop(heap)
        results.append((round(-neg_score, 3), post))
    return results


class CommunityMembershipGraph:
    """
    Bipartite Adjacency Graph G_B = (U, C, E_M) mapping members U to managed
    communities C. Supports O(1) membership queries, O(1) add/remove edge,
    and internal SocialGraph edge density calculation.
    """

    def __init__(self) -> None:
        self.community_to_members: dict[str, set[str]] = {}
        self.user_to_communities: dict[str, set[str]] = {}

    def ensure_community(self, community_id: str) -> None:
        if community_id not in self.community_to_members:
            self.community_to_members[community_id] = set()

    def add_member(self, community_id: str, username: str) -> bool:
        self.ensure_community(community_id)
        u_set = self.user_to_communities.setdefault(username, set())
        if username in self.community_to_members[community_id]:
            return False
        self.community_to_members[community_id].add(username)
        u_set.add(community_id)
        return True

    def remove_member(self, community_id: str, username: str) -> bool:
        members = self.community_to_members.get(community_id)
        if not members or username not in members:
            return False
        members.discard(username)
        if username in self.user_to_communities:
            self.user_to_communities[username].discard(community_id)
        return True

    def remove_community(self, community_id: str) -> None:
        members = self.community_to_members.pop(community_id, set())
        for uname in members:
            if uname in self.user_to_communities:
                self.user_to_communities[uname].discard(community_id)

    def is_member(self, community_id: str, username: str) -> bool:
        return username in self.community_to_members.get(community_id, ())

    def get_members(self, community_id: str) -> list[str]:
        return sorted(self.community_to_members.get(community_id, ()))

    def get_user_communities(self, username: str) -> list[str]:
        return sorted(self.user_to_communities.get(username, ()))

    def internal_social_edges(self, community_id: str, social_graph: SocialGraph) -> int:
        members = self.community_to_members.get(community_id, set())
        if len(members) < 2:
            return 0
        count = 0
        for u in members:
            for v in social_graph.adj.get(u, ()):
                if v in members and u < v:
                    count += 1
        return count

