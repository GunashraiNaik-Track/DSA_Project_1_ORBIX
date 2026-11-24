import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response, type Router } from 'express';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EngineError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const CHANAKYA_SCHOOLS = [
  'School of Engineering',
  'School of Arts, Humanities and Social Sciences',
  'School of Management Sciences',
  'School of Mathematics and Natural Sciences',
  'School of Law, Governance and Public Policy',
  'School of Biosciences',
] as const;

const COMMUNITY_CATEGORIES = [...CHANAKYA_SCHOOLS, 'Cross-School / University-Wide'];

/* -------------------------------------------------------------------------- */
/* Core In-Memory Data Structures (Mirror of backend/data_structures.py)      */
/* -------------------------------------------------------------------------- */

class HashTable<K extends string, V> {
  private capacity: number;
  private buckets: Array<Array<[K, V]>>;
  private size = 0;

  constructor(initialCapacity = 32) {
    this.capacity = Math.max(8, initialCapacity);
    this.buckets = Array.from({ length: this.capacity }, () => []);
  }

  private hash(key: K): number {
    let h = 2166136261;
    for (let i = 0; i < key.length; i += 1) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h % this.capacity;
  }

  private rehash(newCapacity: number): void {
    const oldBuckets = this.buckets;
    this.capacity = newCapacity;
    this.buckets = Array.from({ length: newCapacity }, () => []);
    this.size = 0;
    for (const bucket of oldBuckets) {
      for (const [k, v] of bucket) {
        this.put(k, v);
      }
    }
  }

  put(key: K, value: V): void {
    if ((this.size + 1) / this.capacity > 0.72) {
      this.rehash(this.capacity * 2);
    }
    const idx = this.hash(key);
    const bucket = this.buckets[idx];
    for (let i = 0; i < bucket.length; i += 1) {
      if (bucket[i][0] === key) {
        bucket[i] = [key, value];
        return;
      }
    }
    bucket.push([key, value]);
    this.size += 1;
  }

  get(key: K): V | undefined {
    const idx = this.hash(key);
    for (const [k, v] of this.buckets[idx]) {
      if (k === key) return v;
    }
    return undefined;
  }

  delete(key: K): boolean {
    const idx = this.hash(key);
    const bucket = this.buckets[idx];
    for (let i = 0; i < bucket.length; i += 1) {
      if (bucket[i][0] === key) {
        bucket.splice(i, 1);
        this.size -= 1;
        return true;
      }
    }
    return false;
  }

  contains(key: K): boolean {
    return this.get(key) !== undefined;
  }

  values(): V[] {
    const out: V[] = [];
    for (const bucket of this.buckets) {
      for (const [, v] of bucket) out.push(v);
    }
    return out;
  }

  keys(): K[] {
    const out: K[] = [];
    for (const bucket of this.buckets) {
      for (const [k] of bucket) out.push(k);
    }
    return out;
  }

  entries(): Array<[K, V]> {
    const out: Array<[K, V]> = [];
    for (const bucket of this.buckets) {
      for (const entry of bucket) out.push(entry);
    }
    return out;
  }

  get length(): number {
    return this.size;
  }
}

class TrieNode {
  children = new Map<string, TrieNode>();
  usernames = new Set<string>();
}

class Trie {
  root = new TrieNode();

  private insertToken(token: string, username: string): void {
    const clean = token.trim().toLowerCase();
    if (!clean) return;
    let node = this.root;
    for (const ch of clean) {
      let next = node.children.get(ch);
      if (!next) {
        next = new TrieNode();
        node.children.set(ch, next);
      }
      node = next;
    }
    node.usernames.add(username);
  }

  private removeToken(token: string, username: string): void {
    const clean = token.trim().toLowerCase();
    if (!clean) return;
    let node = this.root;
    const pathNodes: Array<[TrieNode, string]> = [];
    for (const ch of clean) {
      const next = node.children.get(ch);
      if (!next) return;
      pathNodes.push([node, ch]);
      node = next;
    }
    node.usernames.delete(username);
    for (let i = pathNodes.length - 1; i >= 0; i -= 1) {
      const [parent, ch] = pathNodes[i];
      const child = parent.children.get(ch);
      if (child && child.usernames.size === 0 && child.children.size === 0) {
        parent.children.delete(ch);
      } else {
        break;
      }
    }
  }

  insertUser(username: string, fullName: string, universityId = ''): void {
    this.insertToken(username, username);
    this.insertToken(fullName, username);
    for (const part of fullName.split(/\s+/)) {
      this.insertToken(part, username);
    }
    if (universityId.trim()) {
      this.insertToken(universityId, username);
    }
  }

  removeUser(username: string, fullName: string, universityId = ''): void {
    this.removeToken(username, username);
    this.removeToken(fullName, username);
    for (const part of fullName.split(/\s+/)) {
      this.removeToken(part, username);
    }
    if (universityId.trim()) {
      this.removeToken(universityId, username);
    }
  }

  searchPrefix(prefix: string, limit = 10): string[] {
    const clean = prefix.trim().toLowerCase();
    if (!clean) return [];
    let node: TrieNode | undefined = this.root;
    for (const ch of clean) {
      node = node.children.get(ch);
      if (!node) return [];
    }
    const collected = new Set<string>();
    const queue: TrieNode[] = [node];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const uname of curr.usernames) collected.add(uname);
      for (const child of curr.children.values()) queue.push(child);
    }
    return Array.from(collected)
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(clean) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(clean) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.toLowerCase().localeCompare(b.toLowerCase());
      })
      .slice(0, limit);
  }
}

class Stack<T> {
  private items: T[] = [];
  private maxSize: number;

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  push(item: T): void {
    if (this.items.length >= this.maxSize) this.items.shift();
    this.items.push(item);
  }

  pop(): T | undefined {
    return this.items.pop();
  }

  peek(): T | undefined {
    return this.items.length > 0 ? this.items[this.items.length - 1] : undefined;
  }

  get length(): number {
    return this.items.length;
  }
}

class Queue<T> {
  private items: T[] = [];

  enqueue(item: T): void {
    this.items.push(item);
  }

  removeWhere(predicate: (item: T) => boolean): T | undefined {
    const idx = this.items.findIndex(predicate);
    if (idx === -1) return undefined;
    const [removed] = this.items.splice(idx, 1);
    return removed;
  }

  toList(): T[] {
    return [...this.items];
  }

  get length(): number {
    return this.items.length;
  }
}

class MinHeap<T> {
  private heap: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  push(item: T): void {
    this.heap.push(item);
    let idx = this.heap.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.compare(this.heap[idx], this.heap[parent]) < 0) {
        [this.heap[idx], this.heap[parent]] = [this.heap[parent], this.heap[idx]];
        idx = parent;
      } else {
        break;
      }
    }
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      let idx = 0;
      const n = this.heap.length;
      while (true) {
        let smallest = idx;
        const left = 2 * idx + 1;
        const right = 2 * idx + 2;
        if (left < n && this.compare(this.heap[left], this.heap[smallest]) < 0) smallest = left;
        if (right < n && this.compare(this.heap[right], this.heap[smallest]) < 0) smallest = right;
        if (smallest === idx) break;
        [this.heap[idx], this.heap[smallest]] = [this.heap[smallest], this.heap[idx]];
        idx = smallest;
      }
    }
    return top;
  }

  get length(): number {
    return this.heap.length;
  }
}

/* -------------------------------------------------------------------------- */
/* Domain Records                                                             */
/* -------------------------------------------------------------------------- */

interface UserRecord {
  username: string;
  university_id: string;
  role: string;
  is_suspended: boolean;
  password_hash: string;
  password_salt: string;
  name: string;
  school: string;
  programme: string;
  year: string;
  bio: string;
  skills: string[];
  avatar_url: string | null;
  created_at: number;
}

interface PendingRegistration {
  university_id: string;
  username: string;
  role: string;
  password_hash: string;
  password_salt: string;
  name: string;
  school: string;
  programme: string;
  year: string;
  bio: string;
  skills: string[];
  otp_hash: string;
  otp_salt: string;
  expires_at: number;
  created_at: number;
}

interface PortfolioRecord {
  id: string;
  owner: string;
  category: string;
  title: string;
  issuer: string;
  issue_date: string;
  credential_id: string;
  credential_url: string;
  description: string;
  file_url: string | null;
  created_at: number;
}

interface AnnouncementRecord {
  id: string;
  author: string;
  title: string;
  content: string;
  priority: string;
  category: string;
  created_at: number;
}

interface CommentNode {
  id: string;
  post_id: string;
  author: string;
  content: string;
  created_at: number;
  parent_id: string | null;
  replies: CommentNode[];
}

interface PostRecord {
  id: string;
  author: string;
  title: string;
  content: string;
  tags: string[];
  image_url: string | null;
  created_at: number;
  likes: Set<string>;
  root_comments: CommentNode[];
  comments_by_id: Map<string, CommentNode>;
}

interface NotificationRecord {
  id: string;
  recipient: string;
  actor: string;
  ntype: string;
  message: string;
  ref_id: string | null;
  is_read: boolean;
  created_at: number;
}

interface CommunityProposalRecord {
  id: string;
  name: string;
  category: string;
  description: string;
  charter: string;
  tags: string[];
  proposer: string;
  created_at: number;
  school_restricted: boolean;
  allowed_school: string;
}

interface CommunityJoinRequestRecord {
  community_id: string;
  username: string;
  interest: string;
  created_at: number;
}

interface CommunityMessageRecord {
  id: string;
  community_id: string;
  author: string;
  content: string;
  is_admin_notice: boolean;
  created_at: number;
}

interface CommunityRecord {
  id: string;
  name: string;
  category: string;
  description: string;
  charter: string;
  tags: string[];
  leader: string;
  approved_by: string;
  is_suspended: boolean;
  created_at: number;
  school_restricted: boolean;
  allowed_school: string;
  join_requests: Queue<CommunityJoinRequestRecord>;
  join_requests_by_user: Map<string, CommunityJoinRequestRecord>;
  messages: CommunityMessageRecord[];
}

interface PendingReqItem {
  from_user: string;
  to_user: string;
  created_at: number;
}

interface PasswordResetRequestRecord {
  id: string;
  username: string;
  university_id: string;
  new_password_hash: string;
  new_password_salt: string;
  reason: string;
  status: string;
  reviewed_by: string;
  reviewed_at: number | null;
  created_at: number;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function hashSecret(secretText: string, saltHex?: string): { hash: string; salt: string } {
  const salt = saltHex ?? crypto.randomBytes(16).toString('hex');
  const dk = crypto.pbkdf2Sync(secretText, Buffer.from(salt, 'hex'), 120_000, 32, 'sha256');
  return { hash: dk.toString('hex'), salt };
}

function verifySecret(secretText: string, storedHash: string, saltHex: string): boolean {
  const { hash } = hashSecret(secretText, saltHex);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function nowSec(): number {
  return Date.now() / 1000;
}

function countSubtree(node: CommentNode): number {
  let total = 1;
  for (const r of node.replies) total += countSubtree(r);
  return total;
}

/* -------------------------------------------------------------------------- */
/* Undirected Social Graph (Adjacency Lists + BFS + Recommendations + LPA)    */
/* -------------------------------------------------------------------------- */

class SocialGraph {
  adj = new Map<string, Set<string>>();
  incomingRequests = new Map<string, Queue<PendingReqItem>>();
  outgoingRequests = new Map<string, Map<string, PendingReqItem>>();

  ensureUser(username: string): void {
    if (!this.adj.has(username)) this.adj.set(username, new Set());
    if (!this.incomingRequests.has(username)) this.incomingRequests.set(username, new Queue());
    if (!this.outgoingRequests.has(username)) this.outgoingRequests.set(username, new Map());
  }

  isConnected(u: string, v: string): boolean {
    return this.adj.get(u)?.has(v) ?? false;
  }

  hasPendingRequest(sender: string, receiver: string): boolean {
    return this.outgoingRequests.get(sender)?.has(receiver) ?? false;
  }

  addConnection(u: string, v: string): boolean {
    if (u === v) return false;
    this.ensureUser(u);
    this.ensureUser(v);
    if (this.adj.get(u)!.has(v)) return false;
    this.adj.get(u)!.add(v);
    this.adj.get(v)!.add(u);
    return true;
  }

  removeConnection(u: string, v: string): boolean {
    if (!this.adj.get(u)?.has(v)) return false;
    this.adj.get(u)!.delete(v);
    this.adj.get(v)!.delete(u);
    return true;
  }

  addPendingRequest(sender: string, receiver: string, createdAt: number): boolean {
    if (sender === receiver || this.isConnected(sender, receiver)) return false;
    this.ensureUser(sender);
    this.ensureUser(receiver);
    if (this.hasPendingRequest(sender, receiver)) return false;
    const payload: PendingReqItem = { from_user: sender, to_user: receiver, created_at: createdAt };
    this.incomingRequests.get(receiver)!.enqueue(payload);
    this.outgoingRequests.get(sender)!.set(receiver, payload);
    return true;
  }

  removePendingRequest(sender: string, receiver: string): PendingReqItem | undefined {
    const outMap = this.outgoingRequests.get(sender);
    if (!outMap || !outMap.has(receiver)) return undefined;
    const payload = outMap.get(receiver)!;
    outMap.delete(receiver);
    this.incomingRequests.get(receiver)?.removeWhere((item) => item.from_user === sender);
    return payload;
  }

  getNeighbors(username: string): string[] {
    const nbrs = this.adj.get(username);
    return nbrs ? Array.from(nbrs).sort() : [];
  }

  getIncomingRequests(username: string): PendingReqItem[] {
    return this.incomingRequests.get(username)?.toList() ?? [];
  }

  getOutgoingRequests(username: string): PendingReqItem[] {
    const map = this.outgoingRequests.get(username);
    if (!map) return [];
    return Array.from(map.values()).sort((a, b) => a.created_at - b.created_at);
  }

  mutualConnections(u: string, v: string): string[] {
    const su = this.adj.get(u);
    const sv = this.adj.get(v);
    if (!su || !sv) return [];
    const out: string[] = [];
    for (const x of su) {
      if (sv.has(x)) out.push(x);
    }
    return out.sort();
  }

  degreeAndShortestPath(source: string, target: string): { degree: number | null; path: string[] } {
    if (!this.adj.has(source) || !this.adj.has(target)) return { degree: null, path: [] };
    if (source === target) return { degree: 0, path: [source] };

    const visited = new Set<string>([source]);
    const parent = new Map<string, string | null>([[source, null]]);
    const queue: Array<[string, number]> = [[source, 0]];

    while (queue.length > 0) {
      const [curr, dist] = queue.shift()!;
      const nbrs = Array.from(this.adj.get(curr) ?? []).sort();
      for (const nbr of nbrs) {
        if (visited.has(nbr)) continue;
        visited.add(nbr);
        parent.set(nbr, curr);
        if (nbr === target) {
          const path: string[] = [];
          let step: string | null | undefined = target;
          while (step) {
            path.push(step);
            step = parent.get(step) ?? null;
          }
          path.reverse();
          return { degree: dist + 1, path };
        }
        queue.push([nbr, dist + 1]);
      }
    }
    return { degree: null, path: [] };
  }

  bfsAllDegrees(source: string): Map<string, number> {
    const degrees = new Map<string, number>();
    if (!this.adj.has(source)) return degrees;
    degrees.set(source, 0);
    const queue: string[] = [source];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currDeg = degrees.get(curr)!;
      for (const nbr of this.adj.get(curr) ?? []) {
        if (!degrees.has(nbr)) {
          degrees.set(nbr, currDeg + 1);
          queue.push(nbr);
        }
      }
    }
    return degrees;
  }

  peopleYouMayKnow(username: string, users: HashTable<string, UserRecord>, limit = 12) {
    if (!this.adj.has(username)) return [];
    const me = users.get(username);
    const mySkills = new Set((me?.skills ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean));
    const myProg = (me?.programme ?? '').trim().toLowerCase();
    const degrees = this.bfsAllDegrees(username);
    const myNeighbors = this.adj.get(username)!;

    const candidates: Array<{
      username: string;
      score: number;
      mutual_count: number;
      mutual_usernames: string[];
      shared_skills: string[];
      same_programme: boolean;
      degree: number | null;
      shortest_path: string[];
    }> = [];

    for (const otherUname of users.keys()) {
      if (otherUname === username || myNeighbors.has(otherUname)) continue;
      const other = users.get(otherUname);
      if (!other || other.is_suspended || other.role === 'admin') continue;

      const otherNbrs = this.adj.get(otherUname) ?? new Set<string>();
      const mutuals = Array.from(myNeighbors).filter((m) => otherNbrs.has(m)).sort();
      let adamicAdar = 0;
      for (const m of mutuals) {
        adamicAdar += 1 / Math.log(1 + Math.max(1, this.adj.get(m)?.size ?? 0));
      }

      const otherSkills = new Set(other.skills.map((s) => s.trim().toLowerCase()).filter(Boolean));
      const sharedSkills = Array.from(mySkills).filter((s) => otherSkills.has(s)).sort();
      const sameProgramme = Boolean(myProg && other.programme.trim().toLowerCase() === myProg);

      const deg = degrees.get(otherUname) ?? null;
      const hopBonus = deg === 2 ? 1.2 : deg === 3 ? 0.45 : 0;
      const score = Number(
        (adamicAdar * 2.5 + hopBonus + sharedSkills.length * 0.55 + (sameProgramme ? 0.4 : 0)).toFixed(3),
      );
      const { path } = this.degreeAndShortestPath(username, otherUname);

      candidates.push({
        username: otherUname,
        score,
        mutual_count: mutuals.length,
        mutual_usernames: mutuals,
        shared_skills: sharedSkills,
        same_programme: sameProgramme,
        degree: deg,
        shortest_path: path,
      });
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.mutual_count !== a.mutual_count) return b.mutual_count - a.mutual_count;
      const da = a.degree ?? 999;
      const db = b.degree ?? 999;
      if (da !== db) return da - db;
      return a.username.localeCompare(b.username);
    });

    return candidates.slice(0, limit);
  }

  detectCommunities(users: HashTable<string, UserRecord>) {
    const nodes = Array.from(this.adj.keys()).sort();
    if (nodes.length === 0) return [];
    const labels = new Map<string, string>(nodes.map((u) => [u, u]));

    for (let iter = 0; iter < 12; iter += 1) {
      let changed = false;
      for (const u of nodes) {
        const nbrs = this.adj.get(u);
        if (!nbrs || nbrs.size === 0) continue;
        const counts = new Map<string, number>();
        for (const v of nbrs) {
          const lbl = labels.get(v)!;
          counts.set(lbl, (counts.get(lbl) ?? 0) + 1);
        }
        const bestLabel = Array.from(counts.entries()).sort((a, b) => {
          if (b[1] !== a[1]) return b[1] - a[1];
          return a[0].localeCompare(b[0]);
        })[0][0];
        if (labels.get(u) !== bestLabel) {
          labels.set(u, bestLabel);
          changed = true;
        }
      }
      if (!changed) break;
    }

    const groups = new Map<string, string[]>();
    for (const [u, lbl] of labels.entries()) {
      const list = groups.get(lbl) ?? [];
      list.push(u);
      groups.set(lbl, list);
    }

    const communities: Array<{
      id: string;
      name: string;
      dominant_programme: string;
      top_skills: string[];
      member_usernames: string[];
      member_count: number;
      internal_edges: number;
      density: number;
    }> = [];

    let idx = 1;
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
      if (b[1].length !== a[1].length) return b[1].length - a[1].length;
      return a[0].localeCompare(b[0]);
    });

    for (const [, members] of sortedGroups) {
      if (members.length < 2) continue;
      const memberSet = new Set(members);
      let internalEdges = 0;
      const skillCounts = new Map<string, number>();
      const progCounts = new Map<string, number>();

      for (const u of members) {
        for (const v of this.adj.get(u) ?? []) {
          if (memberSet.has(v) && u < v) internalEdges += 1;
        }
        const uObj = users.get(u);
        if (uObj) {
          if (uObj.programme) progCounts.set(uObj.programme, (progCounts.get(uObj.programme) ?? 0) + 1);
          for (const sk of uObj.skills) {
            const clean = sk.trim();
            if (clean) skillCounts.set(clean, (skillCounts.get(clean) ?? 0) + 1);
          }
        }
      }

      const possible = (members.length * (members.length - 1)) / 2;
      const density = possible > 0 ? Number((internalEdges / possible).toFixed(2)) : 0;
      const topSkills = Array.from(skillCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 4)
        .map(([s]) => s);
      const topProg =
        Array.from(progCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Interdisciplinary';

      communities.push({
        id: `community-${idx}`,
        name: topSkills.length > 0 ? `${topSkills[0]} & ${topProg} Circle` : `${topProg} Circle`,
        dominant_programme: topProg,
        top_skills: topSkills,
        member_usernames: [...members].sort(),
        member_count: members.length,
        internal_edges: internalEdges,
        density,
      });
      idx += 1;
    }

    return communities;
  }
}

class CommunityMembershipGraph {
  communityToMembers = new Map<string, Set<string>>();
  userToCommunities = new Map<string, Set<string>>();

  ensureCommunity(communityId: string): void {
    if (!this.communityToMembers.has(communityId)) {
      this.communityToMembers.set(communityId, new Set());
    }
  }

  addMember(communityId: string, username: string): boolean {
    this.ensureCommunity(communityId);
    const members = this.communityToMembers.get(communityId)!;
    if (members.has(username)) return false;
    members.add(username);
    if (!this.userToCommunities.has(username)) {
      this.userToCommunities.set(username, new Set());
    }
    this.userToCommunities.get(username)!.add(communityId);
    return true;
  }

  removeMember(communityId: string, username: string): boolean {
    const members = this.communityToMembers.get(communityId);
    if (!members || !members.has(username)) return false;
    members.delete(username);
    this.userToCommunities.get(username)?.delete(communityId);
    return true;
  }

  removeCommunity(communityId: string): void {
    const members = this.communityToMembers.get(communityId);
    if (members) {
      for (const uname of members) {
        this.userToCommunities.get(uname)?.delete(communityId);
      }
      this.communityToMembers.delete(communityId);
    }
  }

  isMember(communityId: string, username: string): boolean {
    return this.communityToMembers.get(communityId)?.has(username) ?? false;
  }

  getMembers(communityId: string): string[] {
    return Array.from(this.communityToMembers.get(communityId) ?? []).sort();
  }

  internalSocialEdges(communityId: string, socialGraph: SocialGraph): number {
    const members = this.communityToMembers.get(communityId);
    if (!members || members.size < 2) return 0;
    let count = 0;
    for (const u of members) {
      for (const v of socialGraph.adj.get(u) ?? []) {
        if (members.has(v) && u < v) count += 1;
      }
    }
    return count;
  }
}

/* -------------------------------------------------------------------------- */
/* Node SQLite Engine + Fallback Express Router                               */
/* -------------------------------------------------------------------------- */

function resolveWritablePath(preferred: string, fallbackName: string): string {
  try {
    const dir = path.dirname(preferred);
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return preferred;
  } catch {
    const tmpDir = path.join(os.tmpdir(), 'chanakya_commons');
    fs.mkdirSync(tmpDir, { recursive: true });
    return path.join(tmpDir, fallbackName);
  }
}

export function createFallbackApiRouter(): Router {
  const dbPath = resolveWritablePath(
    process.env.CHANAKYA_DB_PATH || path.join(__dirname, 'backend', 'chanakya_commons.db'),
    'chanakya_commons.db',
  );
  const uploadDir = resolveWritablePath(
    path.join(__dirname, 'backend', 'uploads', '.keep'),
    path.join('uploads', '.keep'),
  );
  const actualUploadDir = path.dirname(uploadDir);
  fs.mkdirSync(actualUploadDir, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      outlook_email TEXT NOT NULL DEFAULT '',
      university_id TEXT NOT NULL DEFAULT '',
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
      is_suspended INTEGER NOT NULL DEFAULT 0,
      school_restricted INTEGER NOT NULL DEFAULT 0,
      allowed_school TEXT NOT NULL DEFAULT '',
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
  `);

  const userCols = new Set(
    (db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name),
  );
  if (!userCols.has('university_id')) {
    db.exec("ALTER TABLE users ADD COLUMN university_id TEXT NOT NULL DEFAULT ''");
  }
  if (!userCols.has('school')) {
    db.exec("ALTER TABLE users ADD COLUMN school TEXT NOT NULL DEFAULT ''");
  }
  const pendingCols = new Set(
    (db.prepare('PRAGMA table_info(pending_registrations)').all() as Array<{ name: string }>).map((c) => c.name),
  );
  if (!pendingCols.has('university_id')) {
    db.exec("ALTER TABLE pending_registrations ADD COLUMN university_id TEXT NOT NULL DEFAULT ''");
  }
  if (!pendingCols.has('school')) {
    db.exec("ALTER TABLE pending_registrations ADD COLUMN school TEXT NOT NULL DEFAULT ''");
  }
  const propCols = new Set(
    (db.prepare('PRAGMA table_info(community_proposals)').all() as Array<{ name: string }>).map((c) => c.name),
  );
  if (!propCols.has('school_restricted')) {
    db.exec('ALTER TABLE community_proposals ADD COLUMN school_restricted INTEGER NOT NULL DEFAULT 0');
  }
  if (!propCols.has('allowed_school')) {
    db.exec("ALTER TABLE community_proposals ADD COLUMN allowed_school TEXT NOT NULL DEFAULT ''");
  }
  const commCols = new Set(
    (db.prepare('PRAGMA table_info(communities)').all() as Array<{ name: string }>).map((c) => c.name),
  );
  if (!commCols.has('school_restricted')) {
    db.exec('ALTER TABLE communities ADD COLUMN school_restricted INTEGER NOT NULL DEFAULT 0');
  }
  if (!commCols.has('allowed_school')) {
    db.exec("ALTER TABLE communities ADD COLUMN allowed_school TEXT NOT NULL DEFAULT ''");
  }
  db.exec(
    "UPDATE communities SET category = 'School of Biosciences' WHERE name = 'Biosignal & Embedded Hardware Lab' AND category = 'Interdisciplinary Lab'",
  );

  const users = new HashTable<string, UserRecord>(64);
  const usersByEmail = new HashTable<string, string>(64);
  const pendingRegs = new HashTable<string, PendingRegistration>(32);
  const postsById = new HashTable<string, PostRecord>(128);
  const portfolioById = new HashTable<string, PortfolioRecord>(128);
  const announcementsById = new HashTable<string, AnnouncementRecord>(64);
  let announcements: AnnouncementRecord[] = [];
  const sessions = new HashTable<string, string>(64);
  const trie = new Trie();
  const graph = new SocialGraph();
  const userPosts = new Map<string, PostRecord[]>();
  const userPortfolio = new Map<string, PortfolioRecord[]>();
  const notifications = new Map<string, Queue<NotificationRecord>>();
  const undoStacks = new Map<string, Stack<Record<string, unknown>>>();

  const communityProposalsById = new HashTable<string, CommunityProposalRecord>(32);
  const communityProposalQueue = new Queue<CommunityProposalRecord>();
  const communitiesById = new HashTable<string, CommunityRecord>(64);
  const communityByName = new HashTable<string, string>(64);
  const communityGraph = new CommunityMembershipGraph();
  const passwordResetQueue = new Queue<PasswordResetRequestRecord>();
  const passwordResetById = new HashTable<string, PasswordResetRequestRecord>(32);
  const pendingPasswordResetByUser = new HashTable<string, PasswordResetRequestRecord>(32);
  const latestPasswordResetByUser = new HashTable<string, PasswordResetRequestRecord>(32);

  // Hydrate from SQLite
  for (const r of db.prepare('SELECT * FROM users').all() as Array<Record<string, unknown>>) {
    const uid = String(r.university_id || r.outlook_email || '').trim();
    const rec: UserRecord = {
      username: String(r.username),
      university_id: uid,
      role: String(r.role || 'student'),
      is_suspended: Boolean(r.is_suspended),
      password_hash: String(r.password_hash),
      password_salt: String(r.password_salt),
      name: String(r.name),
      school: String(r.school || ''),
      programme: String(r.programme || ''),
      year: String(r.year || ''),
      bio: String(r.bio || ''),
      skills: JSON.parse(String(r.skills_json || '[]')) as string[],
      avatar_url: r.avatar_url ? String(r.avatar_url) : null,
      created_at: Number(r.created_at),
    };
    users.put(rec.username, rec);
    if (rec.university_id) usersByEmail.put(rec.university_id.toLowerCase(), rec.username);
    trie.insertUser(rec.username, rec.name, rec.university_id);
    graph.ensureUser(rec.username);
    userPosts.set(rec.username, []);
    userPortfolio.set(rec.username, []);
    notifications.set(rec.username, new Queue());
    undoStacks.set(rec.username, new Stack());
  }

  for (const r of db.prepare('SELECT * FROM pending_registrations').all() as Array<Record<string, unknown>>) {
    const uid = String(r.university_id || r.outlook_email || '').trim();
    const p: PendingRegistration = {
      university_id: uid,
      username: String(r.username),
      role: String(r.role || 'student'),
      password_hash: String(r.password_hash),
      password_salt: String(r.password_salt),
      name: String(r.name),
      school: String(r.school || ''),
      programme: String(r.programme || ''),
      year: String(r.year || ''),
      bio: String(r.bio || ''),
      skills: JSON.parse(String(r.skills_json || '[]')) as string[],
      otp_hash: String(r.otp_hash),
      otp_salt: String(r.otp_salt),
      expires_at: Number(r.expires_at),
      created_at: Number(r.created_at),
    };
    pendingRegs.put(p.university_id.toLowerCase(), p);
  }

  for (const r of db.prepare('SELECT * FROM portfolio_items').all() as Array<Record<string, unknown>>) {
    const item: PortfolioRecord = {
      id: String(r.id),
      owner: String(r.owner),
      category: String(r.category || 'certificate'),
      title: String(r.title),
      issuer: String(r.issuer || ''),
      issue_date: String(r.issue_date || ''),
      credential_id: String(r.credential_id || ''),
      credential_url: String(r.credential_url || ''),
      description: String(r.description || ''),
      file_url: r.file_url ? String(r.file_url) : null,
      created_at: Number(r.created_at),
    };
    portfolioById.put(item.id, item);
    const list = userPortfolio.get(item.owner) ?? [];
    list.push(item);
    userPortfolio.set(item.owner, list);
  }
  for (const list of userPortfolio.values()) {
    list.sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
  }

  for (const r of db.prepare('SELECT * FROM announcements').all() as Array<Record<string, unknown>>) {
    const ann: AnnouncementRecord = {
      id: String(r.id),
      author: String(r.author),
      title: String(r.title),
      content: String(r.content),
      priority: String(r.priority || 'urgent'),
      category: String(r.category || 'University Notice'),
      created_at: Number(r.created_at),
    };
    announcementsById.put(ann.id, ann);
    announcements.push(ann);
  }
  announcements.sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));

  for (const r of db.prepare('SELECT * FROM connections').all() as Array<Record<string, unknown>>) {
    graph.addConnection(String(r.user_a), String(r.user_b));
  }

  for (const r of db
    .prepare('SELECT * FROM connection_requests ORDER BY created_at ASC')
    .all() as Array<Record<string, unknown>>) {
    graph.addPendingRequest(String(r.from_user), String(r.to_user), Number(r.created_at));
  }

  for (const r of db.prepare('SELECT * FROM posts').all() as Array<Record<string, unknown>>) {
    const post: PostRecord = {
      id: String(r.id),
      author: String(r.author),
      title: String(r.title || ''),
      content: String(r.content),
      tags: JSON.parse(String(r.tags_json || '[]')) as string[],
      image_url: r.image_url ? String(r.image_url) : null,
      created_at: Number(r.created_at),
      likes: new Set(),
      root_comments: [],
      comments_by_id: new Map(),
    };
    postsById.put(post.id, post);
    const list = userPosts.get(post.author) ?? [];
    list.push(post);
    userPosts.set(post.author, list);
  }
  for (const list of userPosts.values()) {
    list.sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
  }

  for (const r of db.prepare('SELECT * FROM post_likes').all() as Array<Record<string, unknown>>) {
    postsById.get(String(r.post_id))?.likes.add(String(r.username));
  }

  for (const r of db
    .prepare('SELECT * FROM comments ORDER BY created_at ASC')
    .all() as Array<Record<string, unknown>>) {
    const post = postsById.get(String(r.post_id));
    if (!post) continue;
    const node: CommentNode = {
      id: String(r.id),
      post_id: String(r.post_id),
      author: String(r.author),
      content: String(r.content),
      created_at: Number(r.created_at),
      parent_id: r.parent_id ? String(r.parent_id) : null,
      replies: [],
    };
    post.comments_by_id.set(node.id, node);
    if (node.parent_id && post.comments_by_id.has(node.parent_id)) {
      post.comments_by_id.get(node.parent_id)!.replies.push(node);
    } else {
      post.root_comments.push(node);
    }
  }

  for (const r of db
    .prepare('SELECT * FROM notifications ORDER BY created_at ASC')
    .all() as Array<Record<string, unknown>>) {
    const recipient = String(r.recipient);
    if (!notifications.has(recipient)) notifications.set(recipient, new Queue());
    notifications.get(recipient)!.enqueue({
      id: String(r.id),
      recipient,
      actor: String(r.actor),
      ntype: String(r.ntype),
      message: String(r.message),
      ref_id: r.ref_id ? String(r.ref_id) : null,
      is_read: Boolean(r.is_read),
      created_at: Number(r.created_at),
    });
  }

  for (const r of db.prepare('SELECT * FROM sessions').all() as Array<Record<string, unknown>>) {
    const uname = String(r.username);
    const u = users.get(uname);
    if (u && !u.is_suspended) sessions.put(String(r.token), uname);
  }

  for (const r of db
    .prepare('SELECT * FROM community_proposals ORDER BY created_at ASC, id ASC')
    .all() as Array<Record<string, unknown>>) {
    const prop: CommunityProposalRecord = {
      id: String(r.id),
      name: String(r.name),
      category: String(r.category || 'School of Engineering'),
      description: String(r.description),
      charter: String(r.charter || ''),
      tags: JSON.parse(String(r.tags_json || '[]')) as string[],
      proposer: String(r.proposer),
      school_restricted: Boolean(r.school_restricted),
      allowed_school: String(r.allowed_school || ''),
      created_at: Number(r.created_at),
    };
    communityProposalsById.put(prop.id, prop);
    communityProposalQueue.enqueue(prop);
    communityByName.put(prop.name.trim().toLowerCase(), prop.id);
  }

  for (const r of db.prepare('SELECT * FROM communities').all() as Array<Record<string, unknown>>) {
    const comm: CommunityRecord = {
      id: String(r.id),
      name: String(r.name),
      category: String(r.category || 'School of Engineering'),
      description: String(r.description),
      charter: String(r.charter || ''),
      tags: JSON.parse(String(r.tags_json || '[]')) as string[],
      leader: String(r.leader),
      approved_by: String(r.approved_by || ''),
      is_suspended: Boolean(r.is_suspended),
      school_restricted: Boolean(r.school_restricted),
      allowed_school: String(r.allowed_school || ''),
      created_at: Number(r.created_at),
      join_requests: new Queue(),
      join_requests_by_user: new Map(),
      messages: [],
    };
    communitiesById.put(comm.id, comm);
    communityByName.put(comm.name.trim().toLowerCase(), comm.id);
    communityGraph.ensureCommunity(comm.id);
    communityGraph.addMember(comm.id, comm.leader);
  }

  for (const r of db.prepare('SELECT * FROM community_members').all() as Array<Record<string, unknown>>) {
    const cid = String(r.community_id);
    if (communitiesById.contains(cid)) {
      communityGraph.addMember(cid, String(r.username));
    }
  }

  for (const r of db
    .prepare('SELECT * FROM community_join_requests ORDER BY created_at ASC, username ASC')
    .all() as Array<Record<string, unknown>>) {
    const cid = String(r.community_id);
    const uname = String(r.username);
    const comm = communitiesById.get(cid);
    if (comm && !communityGraph.isMember(cid, uname)) {
      const jr: CommunityJoinRequestRecord = {
        community_id: cid,
        username: uname,
        interest: String(r.interest),
        created_at: Number(r.created_at),
      };
      comm.join_requests.enqueue(jr);
      comm.join_requests_by_user.set(uname, jr);
    }
  }

  for (const r of db
    .prepare('SELECT * FROM community_messages ORDER BY created_at DESC, id ASC')
    .all() as Array<Record<string, unknown>>) {
    const comm = communitiesById.get(String(r.community_id));
    if (comm) {
      comm.messages.push({
        id: String(r.id),
        community_id: comm.id,
        author: String(r.author),
        content: String(r.content),
        is_admin_notice: Boolean(r.is_admin_notice),
        created_at: Number(r.created_at),
      });
    }
  }

  for (const r of db
    .prepare('SELECT * FROM password_reset_requests ORDER BY created_at ASC, id ASC')
    .all() as Array<Record<string, unknown>>) {
    const reqRec: PasswordResetRequestRecord = {
      id: String(r.id),
      username: String(r.username),
      university_id: String(r.university_id),
      new_password_hash: String(r.new_password_hash),
      new_password_salt: String(r.new_password_salt),
      reason: String(r.reason || ''),
      status: String(r.status || 'pending'),
      reviewed_by: String(r.reviewed_by || ''),
      reviewed_at: r.reviewed_at != null ? Number(r.reviewed_at) : null,
      created_at: Number(r.created_at),
    };
    passwordResetById.put(reqRec.id, reqRec);
    latestPasswordResetByUser.put(reqRec.username, reqRec);
    if (reqRec.status === 'pending') {
      passwordResetQueue.enqueue(reqRec);
      pendingPasswordResetByUser.put(reqRec.username, reqRec);
    }
  }

  /* ---- Serialization Helpers ---- */
  function toPublicUser(u: UserRecord) {
    return {
      username: u.username,
      university_id: u.university_id,
      outlook_email: u.university_id,
      role: u.role,
      is_suspended: u.is_suspended,
      name: u.name,
      school: u.school,
      programme: u.programme,
      year: u.year,
      bio: u.bio,
      skills: [...u.skills],
      avatar_url: u.avatar_url,
      created_at: u.created_at,
    };
  }

  function commentToDict(c: CommentNode): Record<string, unknown> {
    const au = users.get(c.author);
    return {
      id: c.id,
      post_id: c.post_id,
      author: c.author,
      author_name: au?.name ?? c.author,
      author_avatar: au?.avatar_url ?? null,
      author_programme: au?.programme ?? '',
      content: c.content,
      created_at: c.created_at,
      parent_id: c.parent_id,
      replies: c.replies.map(commentToDict),
    };
  }

  function postToDict(p: PostRecord, viewer?: string | null, trendScore: number | null = null) {
    const au = users.get(p.author);
    let totalComments = 0;
    for (const c of p.root_comments) totalComments += countSubtree(c);
    return {
      id: p.id,
      author: p.author,
      author_name: au?.name ?? p.author,
      author_role: au?.role ?? 'student',
      author_programme: au?.programme ?? '',
      author_year: au?.year ?? '',
      author_avatar: au?.avatar_url ?? null,
      title: p.title,
      content: p.content,
      tags: [...p.tags],
      image_url: p.image_url,
      created_at: p.created_at,
      like_count: p.likes.size,
      liked_by_me: Boolean(viewer && p.likes.has(viewer)),
      comment_count: totalComments,
      comments: p.root_comments.map(commentToDict),
      trend_score: trendScore,
    };
  }

  function announcementToDict(a: AnnouncementRecord) {
    const au = users.get(a.author);
    return {
      id: a.id,
      author: a.author,
      author_name: au?.name ?? 'IT Department',
      title: a.title,
      content: a.content,
      priority: a.priority,
      category: a.category,
      created_at: a.created_at,
    };
  }

  function proposalToDict(p: CommunityProposalRecord) {
    const pu = users.get(p.proposer);
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      description: p.description,
      charter: p.charter,
      tags: [...p.tags],
      proposer: p.proposer,
      proposer_name: pu?.name ?? p.proposer,
      proposer_role: pu?.role ?? 'student',
      proposer_school: pu?.school ?? '',
      proposer_programme: pu?.programme ?? '',
      proposer_university_id: pu?.university_id ?? '',
      proposer_avatar: pu?.avatar_url ?? null,
      school_restricted: p.school_restricted,
      allowed_school: p.allowed_school,
      created_at: p.created_at,
    };
  }

  function joinReqToDict(jr: CommunityJoinRequestRecord) {
    const u = users.get(jr.username);
    return {
      community_id: jr.community_id,
      username: jr.username,
      name: u?.name ?? jr.username,
      role: u?.role ?? 'student',
      school: u?.school ?? '',
      programme: u?.programme ?? '',
      year: u?.year ?? '',
      skills: u ? [...u.skills] : [],
      avatar_url: u?.avatar_url ?? null,
      interest: jr.interest,
      created_at: jr.created_at,
    };
  }

  function communityMsgToDict(m: CommunityMessageRecord) {
    const u = users.get(m.author);
    return {
      id: m.id,
      community_id: m.community_id,
      author: m.author,
      author_name: u?.name ?? m.author,
      author_role: u?.role ?? 'student',
      author_avatar: u?.avatar_url ?? null,
      content: m.content,
      is_admin_notice: m.is_admin_notice,
      created_at: m.created_at,
    };
  }

  function serializeManagedCommunity(comm: CommunityRecord, viewer?: string | null) {
    const leaderObj = users.get(comm.leader);
    const memberUsernames = communityGraph.getMembers(comm.id);
    const members = memberUsernames
      .map((uname) => users.get(uname))
      .filter(Boolean)
      .map((u) => toPublicUser(u!));
    const internalEdges = communityGraph.internalSocialEdges(comm.id, graph);

    const viewerObj = viewer ? users.get(viewer) : undefined;
    const isAdmin = Boolean(viewerObj && viewerObj.role === 'admin');
    const isLeader = Boolean(viewer && viewer === comm.leader);
    const isMember = Boolean(viewer && communityGraph.isMember(comm.id, viewer));
    const myPending = viewer ? comm.join_requests_by_user.get(viewer) : undefined;

    let myStatus: 'leader' | 'member' | 'pending' | 'none' = 'none';
    if (isLeader) myStatus = 'leader';
    else if (isMember) myStatus = 'member';
    else if (myPending) myStatus = 'pending';

    const effectiveSchool = (comm.allowed_school || comm.category).trim();
    let canRequestJoin = true;
    let joinRestrictionReason: string | null = null;
    if (comm.school_restricted && effectiveSchool && viewerObj && !isAdmin && myStatus === 'none') {
      const viewerSchool = (viewerObj.school || '').trim().toLowerCase();
      if (viewerSchool !== effectiveSchool.toLowerCase()) {
        canRequestJoin = false;
        joinRestrictionReason = `Restricted by Community Leader or IT Admin to ${effectiveSchool} members only.`;
      }
    }

    const canReview = isLeader || isAdmin;
    const pendingJoinRequests = canReview
      ? comm.join_requests.toList().map(joinReqToDict)
      : [];

    return {
      id: comm.id,
      name: comm.name,
      category: comm.category,
      description: comm.description,
      charter: comm.charter,
      tags: [...comm.tags],
      leader: comm.leader,
      leader_name: leaderObj?.name ?? comm.leader,
      leader_role: leaderObj?.role ?? 'student',
      leader_programme: leaderObj?.programme ?? '',
      leader_avatar: leaderObj?.avatar_url ?? null,
      approved_by: comm.approved_by,
      school_restricted: comm.school_restricted,
      allowed_school: comm.allowed_school,
      can_request_join: canRequestJoin,
      join_restriction_reason: joinRestrictionReason,
      is_suspended: comm.is_suspended,
      created_at: comm.created_at,
      member_usernames: memberUsernames,
      member_count: memberUsernames.length,
      members,
      internal_edges: internalEdges,
      my_status: myStatus,
      my_pending_interest: myPending?.interest ?? null,
      pending_join_count: comm.join_requests.length,
      pending_join_requests: pendingJoinRequests,
      messages: comm.messages.slice(0, 30).map(communityMsgToDict),
    };
  }

  function passwordResetToDict(r: PasswordResetRequestRecord) {
    const u = users.get(r.username);
    return {
      id: r.id,
      username: r.username,
      university_id: r.university_id,
      name: u?.name ?? r.username,
      role: u?.role ?? 'student',
      school: u?.school ?? '',
      programme: u?.programme ?? '',
      reason: r.reason,
      status: r.status,
      created_at: r.created_at,
    };
  }

  function resolveSchoolRestriction(
    schoolRestricted: boolean,
    allowedSchool: string,
    category: string,
  ): { schoolRestricted: boolean; allowedSchool: string } {
    if (!schoolRestricted) return { schoolRestricted: false, allowedSchool: '' };
    let target = allowedSchool.trim();
    if (!target && (CHANAKYA_SCHOOLS as readonly string[]).includes(category)) {
      target = category;
    }
    if (!(CHANAKYA_SCHOOLS as readonly string[]).includes(target)) {
      throw new EngineError(
        'Please choose one of the Chanakya University Schools when restricting community access.',
      );
    }
    return { schoolRestricted: true, allowedSchool: target };
  }

  function pushNotification(
    recipient: string,
    actor: string,
    ntype: string,
    message: string,
    refId: string | null = null,
  ) {
    if (recipient === actor) return;
    const ts = nowSec();
    const item: NotificationRecord = {
      id: `ntf_${crypto.randomBytes(6).toString('hex')}`,
      recipient,
      actor,
      ntype,
      message,
      ref_id: refId,
      is_read: false,
      created_at: ts,
    };
    if (!notifications.has(recipient)) notifications.set(recipient, new Queue());
    notifications.get(recipient)!.enqueue(item);
    db.prepare(
      'INSERT INTO notifications (id, recipient, actor, ntype, message, ref_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
    ).run(item.id, recipient, actor, ntype, message, refId, ts);
  }

  function createMember(params: {
    username: string;
    university_id: string;
    role: string;
    password: string;
    name: string;
    school: string;
    programme: string;
    year: string;
    bio: string;
    skills: string[];
    avatar_url?: string | null;
  }) {
    const { hash, salt } = hashSecret(params.password);
    const ts = nowSec();
    const rec: UserRecord = {
      username: params.username,
      university_id: params.university_id,
      role: params.role,
      is_suspended: false,
      password_hash: hash,
      password_salt: salt,
      name: params.name,
      school: params.school,
      programme: params.programme,
      year: params.year,
      bio: params.bio,
      skills: [...params.skills],
      avatar_url: params.avatar_url ?? null,
      created_at: ts,
    };
    users.put(rec.username, rec);
    if (rec.university_id) usersByEmail.put(rec.university_id.toLowerCase(), rec.username);
    trie.insertUser(rec.username, rec.name, rec.university_id);
    graph.ensureUser(rec.username);
    userPosts.set(rec.username, []);
    userPortfolio.set(rec.username, []);
    notifications.set(rec.username, new Queue());
    undoStacks.set(rec.username, new Stack());
    db.prepare(
      `INSERT INTO users (username, outlook_email, university_id, role, is_suspended, password_hash, password_salt, name, school, programme, year, bio, skills_json, avatar_url, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      rec.username,
      rec.university_id,
      rec.university_id,
      rec.role,
      rec.password_hash,
      rec.password_salt,
      rec.name,
      rec.school,
      rec.programme,
      rec.year,
      rec.bio,
      JSON.stringify(rec.skills),
      rec.avatar_url,
      rec.created_at,
    );
    return rec;
  }

  function addPortfolioInternal(
    owner: string,
    category: string,
    title: string,
    issuer: string,
    issueDate: string,
    credentialId: string,
    credentialUrl: string,
    description: string,
    fileUrl: string | null = null,
  ) {
    const item: PortfolioRecord = {
      id: `pf_${crypto.randomBytes(6).toString('hex')}`,
      owner,
      category,
      title,
      issuer,
      issue_date: issueDate,
      credential_id: credentialId,
      credential_url: credentialUrl,
      description,
      file_url: fileUrl,
      created_at: nowSec(),
    };
    portfolioById.put(item.id, item);
    const list = userPortfolio.get(owner) ?? [];
    list.unshift(item);
    userPortfolio.set(owner, list);
    db.prepare(
      `INSERT INTO portfolio_items (id, owner, category, title, issuer, issue_date, credential_id, credential_url, description, file_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
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
    );
    return item;
  }

  function publishAnnouncementInternal(
    adminUsername: string,
    title: string,
    content: string,
    priority: string,
    category: string,
  ) {
    const ann: AnnouncementRecord = {
      id: `ann_${crypto.randomBytes(6).toString('hex')}`,
      author: adminUsername,
      title,
      content,
      priority,
      category,
      created_at: nowSec(),
    };
    announcementsById.put(ann.id, ann);
    announcements.unshift(ann);
    db.prepare(
      'INSERT INTO announcements (id, author, title, content, priority, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(ann.id, ann.author, ann.title, ann.content, ann.priority, ann.category, ann.created_at);

    const prefix = priority === 'urgent' ? 'SPICY NEWS (URGENT)' : 'University Announcement';
    for (const member of users.values()) {
      if (member.username !== adminUsername && !member.is_suspended) {
        pushNotification(member.username, adminUsername, 'spicy_news', `${prefix}: ${title}`, ann.id);
      }
    }
    return ann;
  }

  function ensureAdminAndAnnouncements() {
    if (!users.contains('chanakyauniversity2022')) {
      createMember({
        username: 'chanakyauniversity2022',
        university_id: 'CU-IT-ADMIN-2022',
        role: 'admin',
        password: 'chanakya@2022university',
        name: 'IT Department Administration',
        school: 'Information Technology Services',
        programme: 'Campus Network Governance',
        year: 'Campus Administrator',
        bio: 'Official Chanakya University IT Governance & Network Supervision office. Publishes urgent campus advisories and manages network integrity.',
        skills: ['Network Governance', 'Campus Infrastructure', 'Security'],
      });
    }

    const legacyAdmin = users.get('it.admin');
    if (legacyAdmin) {
      for (const ann of announcements) {
        if (ann.author === 'it.admin') ann.author = 'chanakyauniversity2022';
      }
      users.delete('it.admin');
      if (legacyAdmin.university_id) usersByEmail.delete(legacyAdmin.university_id.toLowerCase());
      trie.removeUser('it.admin', legacyAdmin.name, legacyAdmin.university_id);
      for (const [tok, uname] of sessions.entries()) {
        if (uname === 'it.admin') sessions.delete(tok);
      }
      db.prepare('UPDATE announcements SET author = ? WHERE author = ?').run('chanakyauniversity2022', 'it.admin');
      db.prepare('DELETE FROM sessions WHERE username = ?').run('it.admin');
      db.prepare('DELETE FROM users WHERE username = ?').run('it.admin');
    }

    if (announcements.length === 0) {
      publishAnnouncementInternal(
        'chanakyauniversity2022',
        'Scheduled Campus Wi-Fi 6E & GPU Cluster Maintenance Tonight (11:30 PM – 1:00 AM)',
        'The Chanakya University IT Department will upgrade core optical switches in the School of Engineering and Innovation Hub tonight between 11:30 PM and 1:00 AM IST. Save active Jupyter notebooks and checkpoint long-running training jobs before 11:15 PM.',
        'urgent',
        'IT Infrastructure',
      );
      publishAnnouncementInternal(
        'chanakyauniversity2022',
        'Chanakya Annual Engineering & Research Symposium — Project Submission Window Open',
        'Students and faculty mentors may upload project certificates, lab prototypes, and team abstracts through November 30. All registered Chanakya University ID accounts can showcase credentials in their Profile Portfolio.',
        'important',
        'University Notice',
      );
    }
  }

  // Seed default data when database is empty
  if (users.length === 0) {
    const baseNow = nowSec();
    const members = [
      {
        username: 'aarav.sharma',
        university_id: 'CU2024ENG001',
        role: 'student',
        password: 'chanakya123',
        name: 'Aarav Sharma',
        school: 'School of Engineering',
        programme: 'B.Tech. in Computer Science & Artificial Intelligence',
        year: '3rd Year',
        bio: 'Building embedded computer vision pipelines for autonomous campus rovers and low-latency Rust/Python systems.',
        skills: ['Python', 'ROS2', 'PyTorch', 'C++', 'Embedded Vision'],
        avatar_url: '/src/assets/images/avatar_student_male_1794842531165.jpg',
      },
      {
        username: 'ananya.iyer',
        university_id: 'CU2024ENG002',
        role: 'student',
        password: 'chanakya123',
        name: 'Ananya Iyer',
        school: 'School of Engineering',
        programme: 'B.Tech. in Electronics & Communication Engineering',
        year: '3rd Year',
        bio: 'Researching biosignal processing, low-noise PCB front-ends, and interpretable ML for wearable EEG.',
        skills: ['Signal Processing', 'Python', 'KiCad', 'ESP32', 'PyTorch'],
        avatar_url: '/src/assets/images/avatar_student_female_1794842531205.jpg',
      },
      {
        username: 'rohan.kulkarni',
        university_id: 'CU2025MNS014',
        role: 'student',
        password: 'chanakya123',
        name: 'Rohan Kulkarni',
        school: 'School of Mathematics and Natural Sciences',
        programme: 'B.Sc. Hons. Data Science',
        year: '2nd Year',
        bio: 'Working on campus microgrid telemetry, LoRaWAN sensor networks, and time-series forecasting.',
        skills: ['IoT', 'LoRaWAN', 'Python', 'Time Series', 'SQLite'],
        avatar_url: null,
      },
      {
        username: 'meera.nair',
        university_id: 'CU2024ENG019',
        role: 'student',
        password: 'chanakya123',
        name: 'Meera Nair',
        school: 'School of Engineering',
        programme: 'B.Tech. in Computer Science & Engineering',
        year: '3rd Year',
        bio: 'Designing tactile hardware-software interfaces and accessible scientific visualization tools.',
        skills: ['Interaction Design', 'TypeScript', 'React', 'Figma', 'WebGL'],
        avatar_url: null,
      },
      {
        username: 'kabir.menon',
        university_id: 'CU2023ENG008',
        role: 'student',
        password: 'chanakya123',
        name: 'Kabir Menon',
        school: 'School of Engineering',
        programme: 'B.Tech. in Electrical Engineering & Computer Science',
        year: '4th Year',
        bio: 'Distributed systems enthusiast exploring Raft consensus, CRDTs, and compiler IR optimizations.',
        skills: ['Rust', 'Distributed Systems', 'C++', 'Compilers', 'Linux'],
        avatar_url: null,
      },
      {
        username: 'diya.rao',
        university_id: 'CU2026BIO007',
        role: 'student',
        password: 'chanakya123',
        name: 'Diya Rao',
        school: 'School of Biosciences',
        programme: 'B.Tech. in Biotechnology & Bioengineering',
        year: '1st Year',
        bio: 'Protein folding benchmarks and graph neural networks for molecular docking at Chanakya BioLab.',
        skills: ['Graph Neural Networks', 'Python', 'Bioinformatics', 'PyTorch'],
        avatar_url: null,
      },
      {
        username: 'vikram.patel',
        university_id: 'CU2024MGT011',
        role: 'student',
        password: 'chanakya123',
        name: 'Vikram Patel',
        school: 'School of Management Sciences',
        programme: 'Bachelor of Business Administration (B.B.A. Honours)',
        year: '3rd Year',
        bio: 'Coordinating Chanakya Venture Studio; helping student hardware teams ship field pilots across Karnataka.',
        skills: ['Product Strategy', 'Hardware Pilots', 'Unit Economics', 'IoT'],
        avatar_url: null,
      },
      {
        username: 'sneha.deshmukh',
        university_id: 'CU2023MNS005',
        role: 'student',
        password: 'chanakya123',
        name: 'Sneha Deshmukh',
        school: 'School of Mathematics and Natural Sciences',
        programme: 'B.Sc. Hons. Data Science',
        year: '4th Year',
        bio: 'Graph algorithms, causal inference for urban mobility, and civic open-data tooling.',
        skills: ['Graph Theory', 'Python', 'Causal Inference', 'TypeScript'],
        avatar_url: null,
      },
      {
        username: 'aditya.verma',
        university_id: 'CU2025ENG022',
        role: 'student',
        password: 'chanakya123',
        name: 'Aditya Verma',
        school: 'School of Engineering',
        programme: 'B.Tech. in Robotics & Automation',
        year: '2nd Year',
        bio: 'Flight controller tuning, PX4 simulation, and stereo SLAM on resource-constrained SBCs.',
        skills: ['ROS2', 'PX4', 'C++', 'SLAM', 'Embedded Vision'],
        avatar_url: null,
      },
      {
        username: 'prof.raghavendra',
        university_id: 'CUFACENG004',
        role: 'faculty',
        password: 'chanakya123',
        name: 'Dr. Raghavendra Bhat',
        school: 'School of Engineering',
        programme: 'B.Tech. in Robotics & Automation',
        year: 'Associate Professor',
        bio: 'Faculty lead for the Autonomous Systems & Campus Microgrid Lab. Mentoring student hardware and distributed systems research.',
        skills: ['Embedded Systems', 'Control Theory', 'Robotics', 'Signal Processing'],
        avatar_url: null,
      },
    ];

    for (const m of members) createMember(m);

    const edges: Array<[string, string]> = [
      ['aarav.sharma', 'ananya.iyer'],
      ['aarav.sharma', 'aditya.verma'],
      ['aarav.sharma', 'kabir.menon'],
      ['ananya.iyer', 'diya.rao'],
      ['ananya.iyer', 'meera.nair'],
      ['ananya.iyer', 'prof.raghavendra'],
      ['aditya.verma', 'kabir.menon'],
      ['rohan.kulkarni', 'vikram.patel'],
      ['rohan.kulkarni', 'sneha.deshmukh'],
      ['rohan.kulkarni', 'prof.raghavendra'],
      ['vikram.patel', 'prof.raghavendra'],
      ['sneha.deshmukh', 'meera.nair'],
      ['kabir.menon', 'sneha.deshmukh'],
    ];

    for (const [u, v] of edges) {
      graph.addConnection(u, v);
      const [a, b] = u < v ? [u, v] : [v, u];
      db.prepare('INSERT OR IGNORE INTO connections (user_a, user_b, created_at) VALUES (?, ?, ?)').run(
        a,
        b,
        baseNow - 86400,
      );
    }

    const pending: Array<[string, string, number]> = [
      ['rohan.kulkarni', 'aarav.sharma', baseNow - 7200],
      ['diya.rao', 'aarav.sharma', baseNow - 3600],
      ['aarav.sharma', 'meera.nair', baseNow - 1800],
    ];
    for (const [sender, receiver, ts] of pending) {
      graph.addPendingRequest(sender, receiver, ts);
      db.prepare('INSERT OR IGNORE INTO connection_requests (from_user, to_user, created_at) VALUES (?, ?, ?)').run(
        sender,
        receiver,
        ts,
      );
      const su = users.get(sender);
      pushNotification(receiver, sender, 'connection_request', `${su?.name ?? sender} sent you a connection request.`, sender);
    }

    const seededPosts = [
      {
        author: 'aarav.sharma',
        title: 'AUV-1 Quadcopter Stereo Depth Avoidance at 45 Hz',
        content:
          'Finished bench calibration for our carbon-fiber indoor rover/drone hybrid in the Chanakya Robotics Bay. Running an OAK-D stereo depth stream into a lightweight C++ voxel occupancy grid gives us 45 Hz obstacle avoidance under 18% CPU load on Jetson Orin Nano. Looking for someone experienced in Kalman sensor fusion to help tighten drift in low-texture corridors.',
        tags: ['ROS2', 'StereoVision', 'Robotics'],
        image_url: '/src/assets/images/project_drone_vision_1794842531076.jpg',
        age_sec: 1800,
      },
      {
        author: 'ananya.iyer',
        title: 'Open-Hardware 8-Channel EEG Front-End Rev 1.2 Bench Test',
        content:
          'Just probed the ADS1299 analog front-end on our custom 4-layer PCB! Common-mode rejection at 50 Hz improved by 14 dB after moving the driven-right-leg guard trace to an inner copper plane. Next step is streaming packets over ESP32-S3 Wi-Fi to a live Python bandpass + FFT visualizer for steady-state evoked potentials.',
        tags: ['BCI', 'PCBDesign', 'SignalProcessing'],
        image_url: '/src/assets/images/project_bci_eeg_1794842530860.jpg',
        age_sec: 5400,
      },
      {
        author: 'kabir.menon',
        title: 'Why We Switched Our Lab Task Queue from Locks to a Lock-Free Ring Buffer',
        content:
          "Benchmarked our campus compute scheduler under 10k concurrent telemetry writes. Replacing a coarse mutex around a Python/C++ work queue with a single-producer single-consumer ring buffer cut p99 tail latency from 19.4 ms down to 1.8 ms. Happy to walk through the memory ordering trade-offs at Friday's systems reading group.",
        tags: ['Systems', 'Concurrency', 'C++'],
        image_url: null,
        age_sec: 11200,
      },
      {
        author: 'rohan.kulkarni',
        title: 'Solar Microgrid Node 03 — Live Campus Telemetry Pilot',
        content:
          'Deployed our third weatherproof LoRaWAN energy node beside the Innovation Hub rooftop array. Each node samples PV yield, inverter draw, and battery state-of-charge every 30 seconds and renders an on-device OLED load curve. Next week we are opening the dataset for anyone wanting to test anomaly detection models.',
        tags: ['Microgrid', 'LoRaWAN', 'Sustainability'],
        image_url: '/src/assets/images/project_campus_solar_1794842531035.jpg',
        age_sec: 16000,
      },
      {
        author: 'aditya.verma',
        title: 'PX4 Gazebo SITL Bridge for Multi-Agent Corridor Mapping',
        content:
          'Built a reproducible Dockerized PX4 + ROS2 Gazebo world matching the academic block atrium so teams can test formation flight before touching physical propellers. Ping me if your team wants the SDF mesh files.',
        tags: ['PX4', 'Simulation', 'ROS2'],
        image_url: null,
        age_sec: 24000,
      },
      {
        author: 'sneha.deshmukh',
        title: 'Measuring Homophily & Bridge Nodes in Campus Collaboration Graphs',
        content:
          'Ran Adamic-Adar and betweenness centrality on anonymized student club co-membership data. Cross-programme students (Design + CS, Policy + Data Science) account for 68% of shortest paths linking otherwise isolated departments!',
        tags: ['GraphTheory', 'NetworkScience', 'Python'],
        image_url: null,
        age_sec: 32000,
      },
      {
        author: 'meera.nair',
        title: 'Typography & Contrast Rules for Dark-Lab Oscilloscope UIs',
        content:
          'Audited 6 student hardware dashboards this semester: switching numeric readouts to tabular monospace and replacing glowing neon borders with 1px hairline grids made dense sensor tables readable from across the lab bench.',
        tags: ['DesignSystems', 'HCI', 'HardwareUI'],
        image_url: null,
        age_sec: 41000,
      },
    ];

    const createdPostIds: string[] = [];
    for (const sp of seededPosts) {
      const pid = `post_${crypto.randomBytes(6).toString('hex')}`;
      const ts = baseNow - sp.age_sec;
      const post: PostRecord = {
        id: pid,
        author: sp.author,
        title: sp.title,
        content: sp.content,
        tags: sp.tags,
        image_url: sp.image_url,
        created_at: ts,
        likes: new Set(),
        root_comments: [],
        comments_by_id: new Map(),
      };
      postsById.put(pid, post);
      const list = userPosts.get(sp.author) ?? [];
      list.push(post);
      userPosts.set(sp.author, list);
      db.prepare(
        'INSERT INTO posts (id, author, title, content, tags_json, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(pid, sp.author, sp.title, sp.content, JSON.stringify(sp.tags), sp.image_url, ts);
      createdPostIds.push(pid);
    }

    for (const list of userPosts.values()) {
      list.sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
    }

    if (createdPostIds.length >= 3) {
      const [p0, p1, p2] = createdPostIds;
      for (const l of ['ananya.iyer', 'kabir.menon', 'aditya.verma']) {
        postsById.get(p0)?.likes.add(l);
        db.prepare('INSERT OR IGNORE INTO post_likes (post_id, username, created_at) VALUES (?, ?, ?)').run(p0, l, baseNow);
      }
      for (const l of ['aarav.sharma', 'meera.nair', 'diya.rao']) {
        postsById.get(p1)?.likes.add(l);
        db.prepare('INSERT OR IGNORE INTO post_likes (post_id, username, created_at) VALUES (?, ?, ?)').run(p1, l, baseNow);
      }
      for (const l of ['aarav.sharma', 'sneha.deshmukh']) {
        postsById.get(p2)?.likes.add(l);
        db.prepare('INSERT OR IGNORE INTO post_likes (post_id, username, created_at) VALUES (?, ?, ?)').run(p2, l, baseNow);
      }

      const addSeedComment = (author: string, postId: string, content: string, parentId: string | null = null) => {
        const post = postsById.get(postId);
        if (!post) return '';
        const cid = `cmt_${crypto.randomBytes(6).toString('hex')}`;
        const ts = nowSec();
        const node: CommentNode = { id: cid, post_id: postId, author, content, created_at: ts, parent_id: parentId, replies: [] };
        post.comments_by_id.set(cid, node);
        if (parentId && post.comments_by_id.has(parentId)) post.comments_by_id.get(parentId)!.replies.push(node);
        else post.root_comments.push(node);
        db.prepare('INSERT INTO comments (id, post_id, author, content, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
          cid,
          postId,
          author,
          content,
          parentId,
          ts,
        );
        return cid;
      };

      const c0 = addSeedComment(
        'aditya.verma',
        p0,
        'I have an EKF velocity-fusion node tuned for optical flow + IMU — can pair it with your OAK-D output tomorrow.',
      );
      addSeedComment('aarav.sharma', p0, "That would be huge. Let's test it in the robotics bay after the 4 PM seminar.", c0);

      const c1 = addSeedComment(
        'meera.nair',
        p1,
        'That 50 Hz notch improvement on the trace is super clean! Are you plotting raw µV or rolling RMS in the Python viewer?',
      );
      addSeedComment(
        'ananya.iyer',
        p1,
        'Raw µV with a 1–40 Hz Butterworth bandpass — would love your feedback on the channel color palette.',
        c1,
      );
    }

    addPortfolioInternal(
      'aarav.sharma',
      'achievement',
      '1st Place — Chanakya Autonomous Robotics Challenge',
      'Chanakya University School of Engineering',
      'October 2026',
      'CU-ARC-2026-01',
      '',
      'Awarded for real-time stereo depth obstacle avoidance running on Jetson Orin Nano at 45 Hz.',
    );
    addPortfolioInternal(
      'aarav.sharma',
      'certificate',
      'Deep Learning & Computer Vision Specialization (Elite + Gold)',
      'NPTEL / IIT Madras',
      'May 2026',
      'NPTEL26CS41S9921',
      '',
      'Completed 12-week proctored coursework covering CNNs, stereo geometry, and PyTorch optimization.',
    );
    addPortfolioInternal(
      'ananya.iyer',
      'achievement',
      'IEEE Student Hardware Prototype Grant Recipient',
      'IEEE Bangalore Section',
      'September 2026',
      'IEEE-BLR-2026-14',
      '',
      'Funded fabrication of the 4-layer open-hardware 8-channel ADS1299 EEG acquisition board.',
    );
    addPortfolioInternal(
      'prof.raghavendra',
      'achievement',
      'Best Faculty Research Mentor Award',
      'Chanakya University Academic Senate',
      'August 2026',
      'CU-SEN-2026-08',
      '',
      'Recognized for supervising 6 interdisciplinary undergraduate robotics and microgrid prototypes.',
    );
  }

  function seedDefaultCommunities() {
    if (
      communitiesById.length > 0 ||
      communityProposalsById.length > 0 ||
      !users.contains('aarav.sharma') ||
      !users.contains('ananya.iyer') ||
      !users.contains('chanakyauniversity2022')
    ) {
      return;
    }

    const createSeedComm = (opts: {
      name: string;
      category: string;
      description: string;
      charter: string;
      tags: string[];
      leader: string;
      members: string[];
      pendingJoin?: { username: string; interest: string };
      messages?: Array<{ author: string; content: string; isAdminNotice?: boolean }>;
    }) => {
      const ts = nowSec();
      const comm: CommunityRecord = {
        id: `comm_${crypto.randomBytes(6).toString('hex')}`,
        name: opts.name,
        category: opts.category,
        description: opts.description,
        charter: opts.charter,
        tags: opts.tags,
        leader: opts.leader,
        approved_by: 'chanakyauniversity2022',
        is_suspended: false,
        school_restricted: false,
        allowed_school: '',
        created_at: ts,
        join_requests: new Queue(),
        join_requests_by_user: new Map(),
        messages: [],
      };
      communitiesById.put(comm.id, comm);
      communityByName.put(comm.name.trim().toLowerCase(), comm.id);
      communityGraph.ensureCommunity(comm.id);
      communityGraph.addMember(comm.id, comm.leader);
      db.prepare(
        `INSERT INTO communities (id, name, category, description, charter, tags_json, leader, approved_by, is_suspended, school_restricted, allowed_school, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '', ?)`,
      ).run(comm.id, comm.name, comm.category, comm.description, comm.charter, JSON.stringify(comm.tags), comm.leader, comm.approved_by, ts);
      db.prepare('INSERT OR IGNORE INTO community_members (community_id, username, joined_at) VALUES (?, ?, ?)').run(
        comm.id,
        comm.leader,
        ts,
      );
      for (const m of opts.members) {
        if (users.contains(m) && communityGraph.addMember(comm.id, m)) {
          db.prepare('INSERT OR IGNORE INTO community_members (community_id, username, joined_at) VALUES (?, ?, ?)').run(
            comm.id,
            m,
            ts,
          );
        }
      }
      if (opts.pendingJoin && users.contains(opts.pendingJoin.username)) {
        const jr: CommunityJoinRequestRecord = {
          community_id: comm.id,
          username: opts.pendingJoin.username,
          interest: opts.pendingJoin.interest,
          created_at: ts,
        };
        comm.join_requests.enqueue(jr);
        comm.join_requests_by_user.set(jr.username, jr);
        db.prepare('INSERT OR REPLACE INTO community_join_requests (community_id, username, interest, created_at) VALUES (?, ?, ?, ?)').run(
          comm.id,
          jr.username,
          jr.interest,
          ts,
        );
      }
      for (const msg of opts.messages ?? []) {
        const mts = nowSec();
        const rec: CommunityMessageRecord = {
          id: `cmsg_${crypto.randomBytes(6).toString('hex')}`,
          community_id: comm.id,
          author: msg.author,
          content: msg.content,
          is_admin_notice: Boolean(msg.isAdminNotice),
          created_at: mts,
        };
        comm.messages.unshift(rec);
        db.prepare(
          'INSERT INTO community_messages (id, community_id, author, content, is_admin_notice, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(rec.id, comm.id, rec.author, rec.content, rec.is_admin_notice ? 1 : 0, mts);
      }
    };

    createSeedComm({
      name: 'Chanakya Robotics & Autonomous Systems Guild',
      category: 'School of Engineering',
      description: 'Student-led robotics collective building autonomous campus rovers, stereo vision rigs, and PX4 drone stacks.',
      charter: 'Weekly hardware build sprints in the Robotics Bay, ROS2/C++ workshops, and inter-university robotics challenge prep.',
      tags: ['Robotics', 'ROS2', 'ComputerVision', 'PX4'],
      leader: 'aarav.sharma',
      members: ['aditya.verma', 'prof.raghavendra'],
      pendingJoin: {
        username: 'rohan.kulkarni',
        interest: 'Building LoRaWAN telemetry nodes and want to collaborate on autonomous rover ground-station links.',
      },
      messages: [
        {
          author: 'aarav.sharma',
          content: 'Welcome to the Robotics Guild! This Friday 4 PM in Lab 204 we are benchmarking OAK-D depth fusion.',
        },
        {
          author: 'chanakyauniversity2022',
          content: 'IT Supervision Notice: Bench Wi-Fi VLAN & Jetson lab cluster access is active for all verified guild members.',
          isAdminNotice: true,
        },
      ],
    });

    createSeedComm({
      name: 'Biosignal & Embedded Hardware Lab',
      category: 'School of Biosciences',
      description: 'Open-hardware PCB design, wearable EEG/EMG acquisition, and interpretable biomedical signal ML.',
      charter: 'Hands-on KiCad schematic reviews, analog front-end testing, and collaborative bio-AI benchmarks.',
      tags: ['Embedded', 'PCB', 'SignalProcessing', 'BioAI'],
      leader: 'ananya.iyer',
      members: ['meera.nair', 'diya.rao'],
    });

    if (users.contains('sneha.deshmukh')) {
      const ts = nowSec();
      const prop: CommunityProposalRecord = {
        id: `cprop_${crypto.randomBytes(6).toString('hex')}`,
        name: 'Campus Graph & Civic Data Collective',
        category: 'School of Mathematics and Natural Sciences',
        description: 'Open student research circle studying urban mobility networks, causal inference, and campus civic datasets.',
        charter: 'Bi-weekly reading group on network science, graph algorithms, and reproducible public-interest notebooks.',
        tags: ['GraphTheory', 'DataScience', 'CausalInference'],
        proposer: 'sneha.deshmukh',
        school_restricted: false,
        allowed_school: '',
        created_at: ts,
      };
      communityProposalsById.put(prop.id, prop);
      communityProposalQueue.enqueue(prop);
      communityByName.put(prop.name.trim().toLowerCase(), prop.id);
      db.prepare(
        `INSERT INTO community_proposals (id, name, category, description, charter, tags_json, proposer, school_restricted, allowed_school, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, '', ?)`,
      ).run(prop.id, prop.name, prop.category, prop.description, prop.charter, JSON.stringify(prop.tags), prop.proposer, ts);
    }
  }

  ensureAdminAndAnnouncements();
  seedDefaultCommunities();

  /* ---- Auth Helpers ---- */
  function extractToken(req: Request): string | null {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
      const tok = auth.slice(7).trim();
      if (tok) return tok;
    }
    const cookieHdr = req.headers.cookie || '';
    for (const part of cookieHdr.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k === 'cc_session') return decodeURIComponent(rest.join('='));
    }
    return null;
  }

  function authenticateToken(token: string | null): string | null {
    if (!token) return null;
    const uname = sessions.get(token);
    if (!uname) return null;
    const u = users.get(uname);
    if (!u || u.is_suspended) return null;
    return uname;
  }

  function requireAuth(req: Request): { username: string; token: string } {
    const token = extractToken(req);
    const username = authenticateToken(token);
    if (!username || !token) throw new EngineError('Authentication required.', 401);
    return { username, token };
  }

  function requireUser(username: string): UserRecord {
    const u = users.get(username);
    if (!u) throw new EngineError(`User '${username}' not found.`, 404);
    return u;
  }

  function requireAdmin(username: string): UserRecord {
    const u = requireUser(username);
    if (u.role !== 'admin') throw new EngineError('IT Department Administrator privileges required.', 403);
    return u;
  }

  function normalizeUsername(raw: string): string {
    const uname = raw.trim().toLowerCase();
    if (uname.length < 3 || uname.length > 32) {
      throw new EngineError('Username must be between 3 and 32 characters.');
    }
    if (!/^[a-z0-9._-]+$/.test(uname)) {
      throw new EngineError("Username may only contain letters, numbers, '.', '_', or '-'.");
    }
    return uname;
  }

  function normalizeUniversityId(raw: string): { display: string; key: string } {
    const uid = raw.trim();
    if (uid.length < 3 || uid.length > 48) {
      throw new EngineError('University ID must be between 3 and 48 characters.');
    }
    if (!/^[A-Za-z0-9._@/-]+$/.test(uid)) {
      throw new EngineError("University ID may only contain letters, numbers, '-', '_', '.', '/', or '@'.");
    }
    return { display: uid, key: uid.toLowerCase() };
  }

  function getProfile(targetUsername: string, viewer: string | null) {
    const uname = targetUsername.trim().toLowerCase();
    const u = requireUser(uname);
    const data: Record<string, unknown> = {
      ...toPublicUser(u),
      connection_count: graph.getNeighbors(uname).length,
      post_count: (userPosts.get(uname) ?? []).length,
      portfolio_count: (userPortfolio.get(uname) ?? []).length,
    };
    if (viewer && users.contains(viewer)) {
      if (viewer === uname) {
        data.relationship = 'self';
        data.degree = 0;
        data.shortest_path = [uname];
        data.mutual_connections = [];
      } else {
        const rel = graph.isConnected(viewer, uname)
          ? 'connected'
          : graph.hasPendingRequest(viewer, uname)
            ? 'outgoing_pending'
            : graph.hasPendingRequest(uname, viewer)
              ? 'incoming_pending'
              : 'none';
        const { degree, path } = graph.degreeAndShortestPath(viewer, uname);
        const mutuals = graph.mutualConnections(viewer, uname);
        data.relationship = rel;
        data.degree = degree;
        data.shortest_path = path;
        data.mutual_connections = mutuals.map((m) => users.get(m)).filter(Boolean).map((x) => toPublicUser(x!));
      }
    }
    return data;
  }

  function getUndoStatus(username: string) {
    const stack = undoStacks.get(username);
    const top = stack?.peek() as Record<string, unknown> | undefined;
    let label: string | null = null;
    if (top) {
      if (top.type === 'delete_post') label = 'Undo delete post';
      else if (top.type === 'delete_portfolio') label = 'Undo remove certificate';
      else if (top.type === 'remove_connection') label = `Undo remove @${top.other}`;
      else if (top.type === 'cancel_request') label = `Undo cancel request to @${top.to_user}`;
    }
    return { can_undo: Boolean(top), depth: stack?.length ?? 0, label };
  }

  function getSortedAnnouncements() {
    const rankMap: Record<string, number> = { urgent: 0, important: 1, general: 2 };
    const heap = new MinHeap<AnnouncementRecord>((a, b) => {
      const ra = rankMap[a.priority] ?? 2;
      const rb = rankMap[b.priority] ?? 2;
      if (ra !== rb) return ra - rb;
      if (b.created_at !== a.created_at) return b.created_at - a.created_at;
      return a.id.localeCompare(b.id);
    });
    for (const a of announcements) heap.push(a);
    const ordered: ReturnType<typeof announcementToDict>[] = [];
    while (heap.length > 0) ordered.push(announcementToDict(heap.pop()!));
    return ordered;
  }

  function mergeFeedsWithHeap(postLists: PostRecord[][], limit: number, offset = 0): PostRecord[] {
    interface HeapEntry {
      post: PostRecord;
      listIdx: number;
      itemIdx: number;
    }
    const heap = new MinHeap<HeapEntry>((a, b) => {
      if (b.post.created_at !== a.post.created_at) return b.post.created_at - a.post.created_at;
      return a.post.id.localeCompare(b.post.id);
    });
    for (let i = 0; i < postLists.length; i += 1) {
      if (postLists[i].length > 0) heap.push({ post: postLists[i][0], listIdx: i, itemIdx: 0 });
    }
    const merged: PostRecord[] = [];
    const needed = offset + limit;
    while (heap.length > 0 && merged.length < needed) {
      const top = heap.pop()!;
      merged.push(top.post);
      const nextIdx = top.itemIdx + 1;
      if (nextIdx < postLists[top.listIdx].length) {
        heap.push({ post: postLists[top.listIdx][nextIdx], listIdx: top.listIdx, itemIdx: nextIdx });
      }
    }
    return merged.slice(offset, offset + limit);
  }

  function rankTrendingWithHeap(posts: PostRecord[], limit: number) {
    const nowTs = nowSec();
    interface TrendEntry {
      score: number;
      post: PostRecord;
    }
    const heap = new MinHeap<TrendEntry>((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.post.created_at !== a.post.created_at) return b.post.created_at - a.post.created_at;
      return a.post.id.localeCompare(b.post.id);
    });
    for (const p of posts) {
      const ageHours = Math.max(0, (nowTs - p.created_at) / 3600);
      let totalComments = 0;
      for (const c of p.root_comments) totalComments += countSubtree(c);
      const raw = p.likes.size * 2 + totalComments * 3 + 0.5;
      const score = Number((raw / Math.pow(ageHours + 2, 0.85)).toFixed(3));
      heap.push({ score, post: p });
    }
    const out: TrendEntry[] = [];
    while (heap.length > 0 && out.length < limit) out.push(heap.pop()!);
    return out;
  }

  /* ---- Express Router ---- */
  const router = express.Router();
  router.use(express.json({ limit: '12mb' }));

  const handle =
    (fn: (req: Request, res: Response) => void | Promise<void>) =>
    async (req: Request, res: Response) => {
      try {
        await fn(req, res);
      } catch (err) {
        if (err instanceof EngineError) {
          const payload: Record<string, unknown> = { error: err.message };
          if (err.code) payload.code = err.code;
          res.status(err.statusCode).json(payload);
        } else {
          res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
        }
      }
    };

  router.get('/health', (_req, res) => {
    res.json({ ok: true, engine: 'NetworkEngine-Node' });
  });

  router.get('/uploads/:fname', (req, res) => {
    const fname = path.basename(req.params.fname || '');
    const fpath = path.join(actualUploadDir, fname);
    if (!fname || !fs.existsSync(fpath)) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    res.sendFile(fpath);
  });

  router.post(
    '/uploads',
    handle((req, res) => {
      requireAuth(req);
      const dataUrl = String(req.body?.data_url || '');
      if (!dataUrl.startsWith('data:image/') && !dataUrl.startsWith('data:application/pdf')) {
        throw new EngineError('Expected a valid image (PNG, JPG, WEBP, GIF) or PDF data URL.');
      }
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx === -1) throw new EngineError('Invalid upload encoding.');
      const header = dataUrl.slice(0, commaIdx);
      const b64 = dataUrl.slice(commaIdx + 1);
      const mime = header.split(';')[0].split(':')[1];
      const extMap: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'application/pdf': '.pdf',
      };
      const ext = extMap[mime];
      if (!ext) throw new EngineError('Unsupported file format. Use PNG, JPG, WEBP, GIF, or PDF.');
      const buf = Buffer.from(b64, 'base64');
      if (buf.length > 6 * 1024 * 1024) throw new EngineError('File exceeds 6 MB limit.');
      const fname = `file_${Math.floor(nowSec())}_${crypto.randomBytes(4).toString('hex')}${ext}`;
      fs.writeFileSync(path.join(actualUploadDir, fname), buf);
      res.status(201).json({ url: `/api/uploads/${fname}` });
    }),
  );

  router.get(
    '/auth/me',
    handle((req, res) => {
      const viewer = authenticateToken(extractToken(req));
      if (!viewer) {
        res.json({ user: null });
        return;
      }
      res.json({ user: getProfile(viewer, viewer), undo: getUndoStatus(viewer) });
    }),
  );

  function findPendingByIdentifier(identifier: string): PendingRegistration | undefined {
    const key = identifier.trim().toLowerCase();
    if (!key) return undefined;
    const direct = pendingRegs.get(key);
    if (direct) return direct;
    for (const pending of pendingRegs.values()) {
      if (pending.username === key || pending.university_id.toLowerCase() === key) {
        return pending;
      }
    }
    return undefined;
  }

  router.get(
    '/auth/register/status',
    handle((req, res) => {
      const identifier = String(req.query.identifier || '');
      const key = identifier.trim().toLowerCase();
      if (!key) throw new EngineError('Enter your University ID or username to check registration status.');

      let active = users.get(key);
      if (!active) {
        const mapped = usersByEmail.get(key);
        if (mapped) active = users.get(mapped);
      }
      if (active) {
        if (active.is_suspended) {
          res.json({
            status: 'suspended',
            university_id: active.university_id,
            username: active.username,
            message: `Account @${active.username} (${active.university_id}) is currently suspended by IT Administration.`,
          });
          return;
        }
        res.json({
          status: 'approved',
          university_id: active.university_id,
          username: active.username,
          message: `Your account (@${active.username}, University ID ${active.university_id}) is approved and active. You can sign in now.`,
        });
        return;
      }

      const pending = findPendingByIdentifier(key);
      if (pending) {
        res.json({
          status: 'pending',
          university_id: pending.university_id,
          username: pending.username,
          submitted_at: pending.created_at,
          message: `Your request for University ID ${pending.university_id} (@${pending.username}) has been sent and is waiting to be verified by the university admin.`,
        });
        return;
      }

      res.json({
        status: 'not_found',
        message: `No active account or pending registration request was found for '${identifier.trim()}'. If your request was rejected due to a wrong University ID, you may register again with corrected details.`,
      });
    }),
  );

  router.post(
    '/auth/register/request',
    handle((req, res) => {
      const b = req.body || {};
      const rawUid = String(b.university_id ?? b.outlook_email ?? '');
      const { display: cleanUid, key: uidKey } = normalizeUniversityId(rawUid);
      if (usersByEmail.contains(uidKey)) {
        throw new EngineError(`An account with University ID '${cleanUid}' is already registered.`, 409);
      }
      if (pendingRegs.contains(uidKey)) {
        throw new EngineError(
          `A registration request for University ID '${cleanUid}' has already been sent and is awaiting verification by the university admin.`,
          409,
        );
      }
      const uname = normalizeUsername(String(b.username || ''));
      if (users.contains(uname)) {
        throw new EngineError(`Username '@${uname}' is already taken.`, 409);
      }
      for (const existing of pendingRegs.values()) {
        if (existing.username === uname) {
          throw new EngineError(
            `Username '@${uname}' is currently reserved by a pending registration request awaiting university admin verification.`,
            409,
          );
        }
      }
      const role = String(b.role || 'student').trim().toLowerCase();
      if (role !== 'student' && role !== 'faculty') {
        throw new EngineError("Role must be 'student' or 'faculty'.");
      }
      const password = String(b.password || '');
      if (password.length < 6) throw new EngineError('Password must be at least 6 characters.');
      const name = String(b.name || '').trim();
      if (!name) throw new EngineError('Full name is required.');
      const school = String(b.school || '').trim();
      if (!school) throw new EngineError('School selection is required.');
      const programme = String(b.programme || '').trim();
      if (!programme) throw new EngineError('Programme selection is required.');
      const year = String(b.year || '').trim();
      if (!year) {
        throw new EngineError(role === 'faculty' ? 'Designation is required.' : 'Year is required.');
      }
      const bio = String(b.bio || '').trim();
      if (!bio) throw new EngineError('Short bio is required.');

      const skills = Array.isArray(b.skills)
        ? b.skills.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 16)
        : [];
      const pw = hashSecret(password);
      const ts = nowSec();
      const pending: PendingRegistration = {
        university_id: cleanUid,
        username: uname,
        role,
        password_hash: pw.hash,
        password_salt: pw.salt,
        name,
        school,
        programme,
        year,
        bio,
        skills,
        otp_hash: '',
        otp_salt: '',
        expires_at: 0,
        created_at: ts,
      };
      pendingRegs.put(uidKey, pending);
      db.prepare(
        `INSERT OR REPLACE INTO pending_registrations (outlook_email, university_id, username, role, password_hash, password_salt, name, school, programme, year, bio, skills_json, otp_hash, otp_salt, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        uidKey,
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
        JSON.stringify(pending.skills),
        pending.otp_hash,
        pending.otp_salt,
        pending.expires_at,
        pending.created_at,
      );

      for (const member of users.values()) {
        if (member.role === 'admin') {
          pushNotification(
            member.username,
            uname,
            'registration_request',
            `New registration request from ${name} (ID: ${cleanUid}, @${uname}) awaiting verification.`,
            cleanUid,
          );
        }
      }

      res.status(201).json({
        submitted: true,
        status: 'pending',
        university_id: cleanUid,
        username: uname,
        name,
        role,
        message: 'Your request has been sent and will be verified by the university admin.',
      });
    }),
  );

  router.get(
    '/auth/password-reset/status',
    handle((req, res) => {
      const identifier = String(req.query.identifier || '');
      const key = identifier.trim().toLowerCase();
      if (!key) throw new EngineError('Enter your username or University ID to check password reset status.');

      let user = users.get(key);
      if (!user) {
        const mapped = usersByEmail.get(key);
        if (mapped) user = users.get(mapped);
      }

      if (!user || user.role === 'admin') {
        res.json({
          status: 'not_found',
          message: `No password change request was found for '${identifier.trim()}'.`,
        });
        return;
      }

      const latest = latestPasswordResetByUser.get(user.username);
      if (!latest) {
        res.json({
          status: 'not_found',
          username: user.username,
          university_id: user.university_id,
          message: `No password change request has been submitted for @${user.username} (${user.university_id}).`,
        });
        return;
      }

      if (latest.status === 'pending') {
        res.json({
          status: 'pending',
          request_id: latest.id,
          username: user.username,
          university_id: user.university_id,
          submitted_at: latest.created_at,
          message: `Your password change request for @${user.username} (${user.university_id}) is waiting for IT Admin acceptance.`,
        });
        return;
      }

      if (latest.status === 'approved') {
        res.json({
          status: 'approved',
          request_id: latest.id,
          username: user.username,
          university_id: user.university_id,
          reviewed_at: latest.reviewed_at,
          message: `Your password change request for @${user.username} was accepted by the University IT Admin. You can sign in now with your new password.`,
        });
        return;
      }

      res.json({
        status: 'rejected',
        request_id: latest.id,
        username: user.username,
        university_id: user.university_id,
        reviewed_at: latest.reviewed_at,
        message: `Your recent password change request for @${user.username} was declined by the University IT Admin. Your previous password was not changed.`,
      });
    }),
  );

  router.post(
    '/auth/password-reset/request',
    handle((req, res) => {
      const b = req.body || {};
      const identifier = String(b.identifier || '');
      const key = identifier.trim().toLowerCase();
      if (!key) throw new EngineError('Enter your username or Chanakya University ID.');

      let user = users.get(key);
      if (!user) {
        const mapped = usersByEmail.get(key);
        if (mapped) user = users.get(mapped);
      }

      if (!user) {
        const pendingReg = findPendingByIdentifier(key);
        if (pendingReg) {
          throw new EngineError(
            'Your account registration is still pending IT Admin approval. Once approved, sign in with the password you registered with.',
            400,
          );
        }
        throw new EngineError('No active student or faculty account matches that username or University ID.', 404);
      }

      if (user.role === 'admin') {
        throw new EngineError('IT Administrator passwords cannot be reset through the self-service request queue.', 403);
      }
      if (user.is_suspended) {
        throw new EngineError('This account has been suspended by the IT Department Administration.', 403);
      }

      const newPassword = String(b.new_password || '');
      if (newPassword.length < 6) {
        throw new EngineError('New password must be at least 6 characters.');
      }

      if (pendingPasswordResetByUser.contains(user.username)) {
        throw new EngineError(
          `A password change request for @${user.username} (${user.university_id}) has already been sent and is waiting for IT Admin approval.`,
          409,
        );
      }

      const pw = hashSecret(newPassword);
      const ts = nowSec();
      const reason = String(b.reason || '').trim().slice(0, 300);
      const rec: PasswordResetRequestRecord = {
        id: `pwr_${crypto.randomBytes(6).toString('hex')}`,
        username: user.username,
        university_id: user.university_id,
        new_password_hash: pw.hash,
        new_password_salt: pw.salt,
        reason,
        status: 'pending',
        reviewed_by: '',
        reviewed_at: null,
        created_at: ts,
      };

      passwordResetQueue.enqueue(rec);
      passwordResetById.put(rec.id, rec);
      pendingPasswordResetByUser.put(user.username, rec);
      latestPasswordResetByUser.put(user.username, rec);
      db.prepare(
        `INSERT INTO password_reset_requests (id, username, university_id, new_password_hash, new_password_salt, reason, status, reviewed_by, reviewed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', '', NULL, ?)`,
      ).run(rec.id, rec.username, rec.university_id, rec.new_password_hash, rec.new_password_salt, rec.reason, rec.created_at);

      for (const member of users.values()) {
        if (member.role === 'admin') {
          pushNotification(
            member.username,
            user.username,
            'password_reset_request',
            `Password change request from ${user.name} (@${user.username}, ID: ${user.university_id}) awaiting acceptance.`,
            rec.id,
          );
        }
      }

      res.status(201).json({
        submitted: true,
        status: 'pending',
        request_id: rec.id,
        username: user.username,
        university_id: user.university_id,
        message: 'Your password change request has been sent to the University IT Admin. Once accepted, your password will be updated.',
      });
    }),
  );

  router.post(
    '/auth/login',
    handle((req, res) => {
      const key = String(req.body?.username || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      let user = users.get(key);
      if (!user) {
        const mapped = usersByEmail.get(key);
        if (mapped) user = users.get(mapped);
      }
      if (!user) {
        const pending = findPendingByIdentifier(key);
        if (pending && verifySecret(password, pending.password_hash, pending.password_salt)) {
          throw new EngineError(
            'Your request has been sent and will be verified by the university admin. Please sign in once your account is approved.',
            403,
            'pending_approval',
          );
        }
        throw new EngineError('Invalid username/University ID or password.', 401);
      }
      if (!verifySecret(password, user.password_hash, user.password_salt)) {
        throw new EngineError('Invalid username/University ID or password.', 401);
      }
      if (user.is_suspended) {
        throw new EngineError('This account has been suspended by the IT Department Administration.', 403);
      }
      const token = crypto.randomBytes(24).toString('base64url');
      sessions.put(token, user.username);
      db.prepare('INSERT INTO sessions (token, username, created_at) VALUES (?, ?, ?)').run(
        token,
        user.username,
        nowSec(),
      );
      res.setHeader('Set-Cookie', `cc_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
      res.json({ user: getProfile(user.username, user.username), token });
    }),
  );

  router.post(
    '/auth/logout',
    handle((req, res) => {
      const tok = extractToken(req);
      if (tok) {
        sessions.delete(tok);
        db.prepare('DELETE FROM sessions WHERE token = ?').run(tok);
      }
      res.setHeader('Set-Cookie', 'cc_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
      res.json({ ok: true });
    }),
  );

  router.get(
    '/announcements',
    handle((req, res) => {
      requireAuth(req);
      res.json({ announcements: getSortedAnnouncements() });
    }),
  );

  router.post(
    '/announcements',
    handle((req, res) => {
      const { username } = requireAuth(req);
      requireAdmin(username);
      const title = String(req.body?.title || '').trim();
      const content = String(req.body?.content || '').trim();
      const priority = String(req.body?.priority || 'urgent').trim().toLowerCase();
      const category = String(req.body?.category || 'University Notice').trim() || 'University Notice';
      if (!title) throw new EngineError('Announcement headline is required.');
      if (!content) throw new EngineError('Announcement message cannot be empty.');
      if (!['urgent', 'important', 'general'].includes(priority)) {
        throw new EngineError("Priority must be 'urgent', 'important', or 'general'.");
      }
      const ann = publishAnnouncementInternal(username, title, content, priority, category);
      res.status(201).json({ announcement: announcementToDict(ann) });
    }),
  );

  router.delete(
    '/announcements/:id',
    handle((req, res) => {
      const { username } = requireAuth(req);
      requireAdmin(username);
      const annId = req.params.id;
      if (!announcementsById.contains(annId)) throw new EngineError('Announcement not found.', 404);
      announcementsById.delete(annId);
      announcements = announcements.filter((a) => a.id !== annId);
      db.prepare('DELETE FROM announcements WHERE id = ?').run(annId);
      res.json({ deleted: annId });
    }),
  );

  router.get(
    '/admin/overview',
    handle((req, res) => {
      const { username } = requireAuth(req);
      requireAdmin(username);
      let students = 0;
      let faculty = 0;
      let admins = 0;
      let suspended = 0;
      const sortedUsers = users.values().sort((a, b) => b.created_at - a.created_at || a.username.localeCompare(b.username));
      const members = sortedUsers.map((u) => {
        if (u.role === 'student') students += 1;
        else if (u.role === 'faculty') faculty += 1;
        else if (u.role === 'admin') admins += 1;
        if (u.is_suspended) suspended += 1;
        return {
          ...toPublicUser(u),
          connection_count: graph.getNeighbors(u.username).length,
          post_count: (userPosts.get(u.username) ?? []).length,
          portfolio_count: (userPortfolio.get(u.username) ?? []).length,
        };
      });
      let degreeSum = 0;
      for (const nbrs of graph.adj.values()) degreeSum += nbrs.size;
      let pendingCount = 0;
      for (const q of graph.incomingRequests.values()) pendingCount += q.length;
      const recentPosts = postsById
        .values()
        .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))
        .map((p) => postToDict(p, username));

      const pendingRegistrations = pendingRegs
        .values()
        .sort((a, b) => a.created_at - b.created_at || a.username.localeCompare(b.username))
        .map((p) => ({
          university_id: p.university_id,
          username: p.username,
          role: p.role,
          name: p.name,
          school: p.school,
          programme: p.programme,
          year: p.year,
          bio: p.bio,
          skills: [...p.skills],
          created_at: p.created_at,
        }));

      const communityProposals = communityProposalQueue.toList().map(proposalToDict);
      const passwordResetRequests = passwordResetQueue
        .toList()
        .filter((r) => r.status === 'pending')
        .map(passwordResetToDict);
      const managedCommunities = communitiesById
        .values()
        .sort((a, b) => b.created_at - a.created_at || a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
        .map((c) => serializeManagedCommunity(c, username));

      res.json({
        metrics: {
          total_members: users.length,
          students,
          faculty,
          admins,
          suspended,
          connections: Math.floor(degreeSum / 2),
          pending_requests: pendingCount,
          pending_registrations: pendingRegistrations.length,
          pending_password_resets: passwordResetRequests.length,
          pending_community_proposals: communityProposals.length,
          managed_communities: managedCommunities.length,
          posts: postsById.length,
          portfolio_items: portfolioById.length,
          announcements: announcements.length,
        },
        pending_registrations: pendingRegistrations,
        password_reset_requests: passwordResetRequests,
        community_proposals: communityProposals,
        managed_communities: managedCommunities,
        members,
        recent_posts: recentPosts,
      });
    }),
  );

  router.post(
    '/admin/registrations/:universityId/approve',
    handle((req, res) => {
      const { username } = requireAuth(req);
      requireAdmin(username);
      const pending = findPendingByIdentifier(req.params.universityId || '');
      if (!pending) throw new EngineError('Pending registration request not found.', 404);
      const uidKey = pending.university_id.toLowerCase();
      if (users.contains(pending.username)) {
        throw new EngineError(`Username '@${pending.username}' is already taken.`, 409);
      }
      if (usersByEmail.contains(uidKey)) {
        throw new EngineError(`University ID '${pending.university_id}' is already registered.`, 409);
      }

      const ts = nowSec();
      const rec: UserRecord = {
        username: pending.username,
        university_id: pending.university_id,
        role: pending.role,
        is_suspended: false,
        password_hash: pending.password_hash,
        password_salt: pending.password_salt,
        name: pending.name,
        school: pending.school,
        programme: pending.programme,
        year: pending.year,
        bio: pending.bio,
        skills: [...pending.skills],
        avatar_url: null,
        created_at: ts,
      };
      users.put(rec.username, rec);
      usersByEmail.put(uidKey, rec.username);
      trie.insertUser(rec.username, rec.name, rec.university_id);
      graph.ensureUser(rec.username);
      userPosts.set(rec.username, []);
      userPortfolio.set(rec.username, []);
      notifications.set(rec.username, new Queue());
      undoStacks.set(rec.username, new Stack());
      db.prepare(
        `INSERT INTO users (username, outlook_email, university_id, role, is_suspended, password_hash, password_salt, name, school, programme, year, bio, skills_json, avatar_url, created_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      ).run(
        rec.username,
        rec.university_id,
        rec.university_id,
        rec.role,
        rec.password_hash,
        rec.password_salt,
        rec.name,
        rec.school,
        rec.programme,
        rec.year,
        rec.bio,
        JSON.stringify(rec.skills),
        rec.created_at,
      );
      pendingRegs.delete(uidKey);
      db.prepare('DELETE FROM pending_registrations WHERE outlook_email = ? OR lower(university_id) = ?').run(uidKey, uidKey);
      pushNotification(
        rec.username,
        username,
        'registration_approved',
        'Your Chanakya Commons registration was verified and approved by the University IT Admin.',
        rec.university_id,
      );
      res.json({
        approved: true,
        user: toPublicUser(rec),
        message: `Approved and registered ${rec.name} (${rec.university_id}).`,
      });
    }),
  );

  router.post(
    '/admin/registrations/:universityId/reject',
    handle((req, res) => {
      const { username } = requireAuth(req);
      requireAdmin(username);
      const pending = findPendingByIdentifier(req.params.universityId || '');
      if (!pending) throw new EngineError('Pending registration request not found.', 404);
      const uidKey = pending.university_id.toLowerCase();
      pendingRegs.delete(uidKey);
      db.prepare('DELETE FROM pending_registrations WHERE outlook_email = ? OR lower(university_id) = ?').run(uidKey, uidKey);
      res.json({
        rejected: true,
        university_id: pending.university_id,
        username: pending.username,
        message: `Rejected and removed registration request for ${pending.university_id}.`,
      });
    }),
  );

  router.post(
    '/admin/password-resets/:id/approve',
    handle((req, res) => {
      const { username } = requireAuth(req);
      requireAdmin(username);
      const reqId = req.params.id || '';
      const resetReq = passwordResetById.get(reqId);
      if (!resetReq || resetReq.status !== 'pending') {
        throw new EngineError('Pending password change request not found.', 404);
      }
      const target = requireUser(resetReq.username);
      if (target.role === 'admin') {
        throw new EngineError('Administrator passwords cannot be modified here.', 403);
      }

      const ts = nowSec();
      target.password_hash = resetReq.new_password_hash;
      target.password_salt = resetReq.new_password_salt;
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE username = ?').run(
        target.password_hash,
        target.password_salt,
        target.username,
      );
      for (const [tok, uname] of sessions.entries()) {
        if (uname === target.username) sessions.delete(tok);
      }
      db.prepare('DELETE FROM sessions WHERE username = ?').run(target.username);

      resetReq.status = 'approved';
      resetReq.reviewed_by = username;
      resetReq.reviewed_at = ts;
      passwordResetQueue.removeWhere((item) => item.id === reqId);
      pendingPasswordResetByUser.delete(target.username);
      latestPasswordResetByUser.put(target.username, resetReq);
      db.prepare('UPDATE password_reset_requests SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?').run(
        'approved',
        username,
        ts,
        reqId,
      );

      pushNotification(
        target.username,
        username,
        'password_reset_approved',
        'Your password change request was accepted by the University IT Admin.',
        reqId,
      );

      res.json({
        approved: true,
        request_id: reqId,
        username: target.username,
        university_id: target.university_id,
        message: `Accepted password change for ${target.name} (@${target.username}).`,
      });
    }),
  );

  router.post(
    '/admin/password-resets/:id/reject',
    handle((req, res) => {
      const { username } = requireAuth(req);
      requireAdmin(username);
      const reqId = req.params.id || '';
      const resetReq = passwordResetById.get(reqId);
      if (!resetReq || resetReq.status !== 'pending') {
        throw new EngineError('Pending password change request not found.', 404);
      }

      const ts = nowSec();
      resetReq.status = 'rejected';
      resetReq.reviewed_by = username;
      resetReq.reviewed_at = ts;
      passwordResetQueue.removeWhere((item) => item.id === reqId);
      pendingPasswordResetByUser.delete(resetReq.username);
      latestPasswordResetByUser.put(resetReq.username, resetReq);
      db.prepare('UPDATE password_reset_requests SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?').run(
        'rejected',
        username,
        ts,
        reqId,
      );

      if (users.contains(resetReq.username)) {
        pushNotification(
          resetReq.username,
          username,
          'password_reset_rejected',
          'Your password change request was declined by the University IT Admin.',
          reqId,
        );
      }

      res.json({
        rejected: true,
        request_id: reqId,
        username: resetReq.username,
        university_id: resetReq.university_id,
        message: `Declined password change request for @${resetReq.username}.`,
      });
    }),
  );

  router.post(
    '/admin/users/:target/status',
    handle((req, res) => {
      const { username } = requireAuth(req);
      requireAdmin(username);
      const t = req.params.target.trim().toLowerCase();
      const target = requireUser(t);
      if (target.role === 'admin') throw new EngineError('Administrator accounts cannot be suspended.');
      target.is_suspended = Boolean(req.body?.suspended);
      db.prepare('UPDATE users SET is_suspended = ? WHERE username = ?').run(target.is_suspended ? 1 : 0, t);
      if (target.is_suspended) {
        for (const [tok, uname] of sessions.entries()) {
          if (uname === t) sessions.delete(tok);
        }
        db.prepare('DELETE FROM sessions WHERE username = ?').run(t);
      }
      res.json({ username: t, is_suspended: target.is_suspended });
    }),
  );

  router.delete(
    '/admin/posts/:id',
    handle((req, res) => {
      const { username } = requireAuth(req);
      requireAdmin(username);
      const postId = req.params.id;
      const post = postsById.get(postId);
      if (!post) throw new EngineError('Post not found.', 404);
      postsById.delete(postId);
      userPosts.set(
        post.author,
        (userPosts.get(post.author) ?? []).filter((p) => p.id !== postId),
      );
      db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
      db.prepare('DELETE FROM post_likes WHERE post_id = ?').run(postId);
      db.prepare('DELETE FROM comments WHERE post_id = ?').run(postId);
      res.json({ deleted: postId });
    }),
  );

  router.post(
    '/admin/communities/proposals/:id/approve',
    handle((req, res) => {
      const { username } = requireAuth(req);
      requireAdmin(username);
      const propId = req.params.id;
      const prop = communityProposalsById.get(propId);
      if (!prop) throw new EngineError('Pending community proposal not found.', 404);

      const b = req.body || {};
      const useRestricted =
        b.school_restricted !== undefined ? Boolean(b.school_restricted) : prop.school_restricted;
      const rawAllowed =
        b.allowed_school !== undefined
          ? String(b.allowed_school || '')
          : prop.allowed_school || (useRestricted ? prop.category : '');
      const { schoolRestricted: finalRestricted, allowedSchool: finalAllowedSchool } =
        resolveSchoolRestriction(useRestricted, rawAllowed, prop.category);

      communityProposalsById.delete(propId);
      communityProposalQueue.removeWhere((p) => p.id === propId);
      db.prepare('DELETE FROM community_proposals WHERE id = ?').run(propId);

      const ts = nowSec();
      const comm: CommunityRecord = {
        id: `comm_${crypto.randomBytes(6).toString('hex')}`,
        name: prop.name,
        category: prop.category,
        description: prop.description,
        charter: prop.charter,
        tags: [...prop.tags],
        leader: prop.proposer,
        approved_by: username,
        is_suspended: false,
        school_restricted: finalRestricted,
        allowed_school: finalAllowedSchool,
        created_at: ts,
        join_requests: new Queue(),
        join_requests_by_user: new Map(),
        messages: [],
      };
      communitiesById.put(comm.id, comm);
      communityByName.put(comm.name.trim().toLowerCase(), comm.id);
      communityGraph.ensureCommunity(comm.id);
      communityGraph.addMember(comm.id, comm.leader);

      db.prepare(
        `INSERT INTO communities (id, name, category, description, charter, tags_json, leader, approved_by, is_suspended, school_restricted, allowed_school, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      ).run(
        comm.id,
        comm.name,
        comm.category,
        comm.description,
        comm.charter,
        JSON.stringify(comm.tags),
        comm.leader,
        comm.approved_by,
        comm.school_restricted ? 1 : 0,
        comm.allowed_school,
        ts,
      );
      db.prepare('INSERT OR IGNORE INTO community_members (community_id, username, joined_at) VALUES (?, ?, ?)').run(
        comm.id,
        comm.leader,
        ts,
      );

      pushNotification(
        comm.leader,
        username,
        'community_approved',
        `IT Admin approved your community "${comm.name}"! You are now the Community Leader.`,
        comm.id,
      );

      res.json({
        approved: true,
        community: serializeManagedCommunity(comm, username),
        message: `Approved "${comm.name}" with @${comm.leader} as Community Leader.`,
      });
    }),
  );

  router.post(
    '/admin/communities/proposals/:id/reject',
    handle((req, res) => {
      const { username } = requireAuth(req);
      requireAdmin(username);
      const propId = req.params.id;
      const prop = communityProposalsById.get(propId);
      if (!prop) throw new EngineError('Pending community proposal not found.', 404);

      communityProposalsById.delete(propId);
      communityProposalQueue.removeWhere((p) => p.id === propId);
      communityByName.delete(prop.name.trim().toLowerCase());
      db.prepare('DELETE FROM community_proposals WHERE id = ?').run(propId);

      const reason = String(req.body?.reason || '').trim();
      let msg = `Your request to start community "${prop.name}" was declined by IT Admin.`;
      if (reason) msg += ` Note: ${reason}`;
      pushNotification(prop.proposer, username, 'community_rejected', msg, propId);

      res.json({
        rejected: true,
        proposal_id: propId,
        message: `Declined community proposal "${prop.name}".`,
      });
    }),
  );

  router.post(
    '/admin/communities/:id/status',
    handle((req, res) => {
      const { username } = requireAuth(req);
      requireAdmin(username);
      const comm = communitiesById.get(req.params.id);
      if (!comm) throw new EngineError('Community not found.', 404);
      comm.is_suspended = Boolean(req.body?.suspended);
      db.prepare('UPDATE communities SET is_suspended = ? WHERE id = ?').run(comm.is_suspended ? 1 : 0, comm.id);
      pushNotification(
        comm.leader,
        username,
        'community_notice',
        comm.is_suspended
          ? `IT Admin suspended community "${comm.name}" pending supervision review.`
          : `IT Admin reactivated community "${comm.name}".`,
        comm.id,
      );
      res.json({
        community: serializeManagedCommunity(comm, username),
        is_suspended: comm.is_suspended,
      });
    }),
  );

  router.delete(
    '/admin/communities/:id',
    handle((req, res) => {
      const { username } = requireAuth(req);
      requireAdmin(username);
      const comm = communitiesById.get(req.params.id);
      if (!comm) throw new EngineError('Community not found.', 404);
      communitiesById.delete(comm.id);
      communityByName.delete(comm.name.trim().toLowerCase());
      communityGraph.removeCommunity(comm.id);
      db.prepare('DELETE FROM communities WHERE id = ?').run(comm.id);
      db.prepare('DELETE FROM community_members WHERE community_id = ?').run(comm.id);
      db.prepare('DELETE FROM community_join_requests WHERE community_id = ?').run(comm.id);
      db.prepare('DELETE FROM community_messages WHERE community_id = ?').run(comm.id);
      pushNotification(
        comm.leader,
        username,
        'community_notice',
        `IT Admin dissolved community "${comm.name}".`,
        comm.id,
      );
      res.json({ deleted: comm.id, message: `Deleted community "${comm.name}".` });
    }),
  );

  router.get(
    '/users/search',
    handle((req, res) => {
      const viewer = authenticateToken(extractToken(req));
      const q = String(req.query.q || '').trim();
      const limit = Math.min(50, Math.max(1, Number(req.query.limit || 12)));
      const matched = q
        ? trie.searchPrefix(q, limit * 2)
        : users
            .values()
            .filter((u) => u.role !== 'admin' && !u.is_suspended)
            .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
            .slice(0, limit)
            .map((u) => u.username);
      const degrees = viewer && users.contains(viewer) ? graph.bfsAllDegrees(viewer) : new Map<string, number>();
      const results = matched
        .map((uname) => users.get(uname))
        .filter((u): u is UserRecord => Boolean(u && u.role !== 'admin' && !u.is_suspended))
        .slice(0, limit)
        .map((u) => {
          const item: Record<string, unknown> = { ...toPublicUser(u) };
          if (viewer) {
            item.relationship =
              viewer === u.username
                ? 'self'
                : graph.isConnected(viewer, u.username)
                  ? 'connected'
                  : graph.hasPendingRequest(viewer, u.username)
                    ? 'outgoing_pending'
                    : graph.hasPendingRequest(u.username, viewer)
                      ? 'incoming_pending'
                      : 'none';
            item.degree = degrees.get(u.username) ?? null;
            item.mutual_count = viewer === u.username ? 0 : graph.mutualConnections(viewer, u.username).length;
          }
          return item;
        });
      res.json({ results });
    }),
  );

  router.get(
    '/users/:username/posts',
    handle((req, res) => {
      const viewer = authenticateToken(extractToken(req));
      const target = req.params.username.trim().toLowerCase();
      requireUser(target);
      res.json({ posts: (userPosts.get(target) ?? []).map((p) => postToDict(p, viewer)) });
    }),
  );

  router.get(
    '/users/:username/portfolio',
    handle((req, res) => {
      const target = req.params.username.trim().toLowerCase();
      requireUser(target);
      res.json({ items: userPortfolio.get(target) ?? [] });
    }),
  );

  router.get(
    '/users/:username',
    handle((req, res) => {
      const viewer = authenticateToken(extractToken(req));
      res.json({ profile: getProfile(req.params.username, viewer) });
    }),
  );

  router.put(
    '/profile',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const u = requireUser(username);
      const b = req.body || {};
      const cleanName = String(b.name || '').trim() || u.name;
      if (cleanName !== u.name) {
        trie.removeUser(u.username, u.name, u.university_id);
        u.name = cleanName;
        trie.insertUser(u.username, u.name, u.university_id);
      }
      if (b.school !== undefined) u.school = String(b.school || '').trim();
      u.programme = String(b.programme || '').trim();
      u.year = String(b.year || '').trim();
      u.bio = String(b.bio || '').trim();
      u.skills = Array.isArray(b.skills)
        ? b.skills.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 16)
        : u.skills;
      if (b.avatar_url !== undefined) u.avatar_url = b.avatar_url ? String(b.avatar_url) : null;
      db.prepare(
        'UPDATE users SET name = ?, school = ?, programme = ?, year = ?, bio = ?, skills_json = ?, avatar_url = ? WHERE username = ?',
      ).run(u.name, u.school, u.programme, u.year, u.bio, JSON.stringify(u.skills), u.avatar_url, u.username);
      res.json({ profile: getProfile(u.username, u.username) });
    }),
  );

  router.post(
    '/portfolio',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const b = req.body || {};
      const cat = String(b.category || 'certificate').trim().toLowerCase();
      if (cat !== 'certificate' && cat !== 'achievement') {
        throw new EngineError("Portfolio category must be 'certificate' or 'achievement'.");
      }
      const title = String(b.title || '').trim();
      const issuer = String(b.issuer || '').trim();
      if (!title) throw new EngineError('Title is required for a certificate or achievement.');
      if (!issuer) throw new EngineError('Issuing organization or event name is required.');
      const item = addPortfolioInternal(
        username,
        cat,
        title,
        issuer,
        String(b.issue_date || '').trim(),
        String(b.credential_id || '').trim(),
        String(b.credential_url || '').trim(),
        String(b.description || '').trim(),
        b.file_url ? String(b.file_url) : null,
      );
      res.status(201).json({ item });
    }),
  );

  router.delete(
    '/portfolio/:id',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const item = portfolioById.get(req.params.id);
      if (!item) throw new EngineError('Portfolio item not found.', 404);
      if (item.owner !== username) throw new EngineError('You can only remove items from your own portfolio.', 403);
      undoStacks.get(username)?.push({ type: 'delete_portfolio', item: { ...item } });
      portfolioById.delete(item.id);
      userPortfolio.set(
        username,
        (userPortfolio.get(username) ?? []).filter((x) => x.id !== item.id),
      );
      db.prepare('DELETE FROM portfolio_items WHERE id = ?').run(item.id);
      res.json({ deleted: item.id });
    }),
  );

  router.get(
    '/connections',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const connections = graph
        .getNeighbors(username)
        .map((nbr) => users.get(nbr))
        .filter(Boolean)
        .map((u) => ({ ...toPublicUser(u!), connection_count: graph.getNeighbors(u!.username).length }));
      const incoming = graph
        .getIncomingRequests(username)
        .map((r) => {
          const u = users.get(r.from_user);
          return u
            ? {
                user: toPublicUser(u),
                created_at: r.created_at,
                mutual_count: graph.mutualConnections(username, u.username).length,
              }
            : null;
        })
        .filter(Boolean);
      const outgoing = graph
        .getOutgoingRequests(username)
        .map((r) => {
          const u = users.get(r.to_user);
          return u ? { user: toPublicUser(u), created_at: r.created_at } : null;
        })
        .filter(Boolean);
      res.json({ connections, incoming_requests: incoming, outgoing_requests: outgoing });
    }),
  );

  router.get(
    '/connections/suggestions',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const limit = Math.min(30, Math.max(1, Number(req.query.limit || 12)));
      const raw = graph.peopleYouMayKnow(username, users, limit);
      const suggestions = raw
        .map((item) => {
          const u = users.get(item.username);
          if (!u) return null;
          const rel = graph.hasPendingRequest(username, u.username)
            ? 'outgoing_pending'
            : graph.hasPendingRequest(u.username, username)
              ? 'incoming_pending'
              : 'none';
          return {
            user: toPublicUser(u),
            score: item.score,
            mutual_count: item.mutual_count,
            mutual_names: item.mutual_usernames.map((m) => users.get(m)?.name).filter(Boolean),
            shared_skills: item.shared_skills,
            same_programme: item.same_programme,
            degree: item.degree,
            shortest_path: item.shortest_path.map((su) => ({ username: su, name: users.get(su)?.name ?? su })),
            relationship: rel,
          };
        })
        .filter(Boolean);
      res.json({ suggestions });
    }),
  );

  router.get(
    '/connections/path',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const target = String(req.query.target || '').trim().toLowerCase();
      if (!target) throw new EngineError('Target username is required.');
      requireUser(target);
      const { degree, path: p } = graph.degreeAndShortestPath(username, target);
      const mutuals = username === target ? [] : graph.mutualConnections(username, target);
      res.json({
        source: username,
        target,
        degree,
        shortest_path: p.map((uname) => {
          const u = users.get(uname);
          return {
            username: uname,
            name: u?.name ?? uname,
            programme: u?.programme ?? '',
            avatar_url: u?.avatar_url ?? null,
          };
        }),
        mutual_connections: mutuals.map((m) => users.get(m)).filter(Boolean).map((x) => toPublicUser(x!)),
      });
    }),
  );

  router.post(
    '/connections/request',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const target = String(req.body?.target || '').trim().toLowerCase();
      requireUser(target);
      if (username === target) throw new EngineError('You cannot connect with yourself.');
      if (graph.isConnected(username, target)) throw new EngineError('You are already connected with this user.');
      if (graph.hasPendingRequest(username, target)) throw new EngineError('Connection request already sent.');
      if (graph.hasPendingRequest(target, username)) {
        graph.removePendingRequest(target, username);
        db.prepare('DELETE FROM connection_requests WHERE from_user = ? AND to_user = ?').run(target, username);
        graph.addConnection(username, target);
        const [a, b] = username < target ? [username, target] : [target, username];
        db.prepare('INSERT OR IGNORE INTO connections (user_a, user_b, created_at) VALUES (?, ?, ?)').run(a, b, nowSec());
        res.json({ status: 'connected', username: target });
        return;
      }
      const ts = nowSec();
      graph.addPendingRequest(username, target, ts);
      db.prepare('INSERT OR REPLACE INTO connection_requests (from_user, to_user, created_at) VALUES (?, ?, ?)').run(
        username,
        target,
        ts,
      );
      const su = users.get(username);
      pushNotification(target, username, 'connection_request', `${su?.name ?? username} sent you a connection request.`, username);
      res.json({ status: 'outgoing_pending', to_user: target });
    }),
  );

  router.post(
    '/connections/accept',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const sender = String(req.body?.sender || '').trim().toLowerCase();
      requireUser(sender);
      const removed = graph.removePendingRequest(sender, username);
      if (!removed) throw new EngineError('No pending connection request from this user.', 404);
      db.prepare('DELETE FROM connection_requests WHERE from_user = ? AND to_user = ?').run(sender, username);
      graph.addConnection(username, sender);
      const [a, b] = username < sender ? [username, sender] : [sender, username];
      db.prepare('INSERT OR IGNORE INTO connections (user_a, user_b, created_at) VALUES (?, ?, ?)').run(a, b, nowSec());
      const ru = users.get(username);
      pushNotification(sender, username, 'connection_accepted', `${ru?.name ?? username} accepted your connection request.`, username);
      res.json({ status: 'connected', username: sender });
    }),
  );

  router.post(
    '/connections/reject',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const sender = String(req.body?.sender || '').trim().toLowerCase();
      const removed = graph.removePendingRequest(sender, username);
      if (!removed) throw new EngineError('No pending connection request to reject.', 404);
      db.prepare('DELETE FROM connection_requests WHERE from_user = ? AND to_user = ?').run(sender, username);
      res.json({ status: 'rejected', username: sender });
    }),
  );

  router.post(
    '/connections/cancel',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const target = String(req.body?.target || '').trim().toLowerCase();
      const removed = graph.removePendingRequest(username, target);
      if (!removed) throw new EngineError('No outgoing connection request to cancel.', 404);
      db.prepare('DELETE FROM connection_requests WHERE from_user = ? AND to_user = ?').run(username, target);
      undoStacks.get(username)?.push({ type: 'cancel_request', to_user: target });
      res.json({ status: 'cancelled', username: target });
    }),
  );

  router.delete(
    '/connections/:other',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const other = req.params.other.trim().toLowerCase();
      if (!graph.removeConnection(username, other)) throw new EngineError('You are not connected with this user.', 404);
      const [a, b] = username < other ? [username, other] : [other, username];
      db.prepare('DELETE FROM connections WHERE user_a = ? AND user_b = ?').run(a, b);
      undoStacks.get(username)?.push({ type: 'remove_connection', other });
      res.json({ status: 'removed', username: other });
    }),
  );

  router.get(
    '/communities',
    handle((req, res) => {
      const viewer = authenticateToken(extractToken(req));
      const viewerObj = viewer ? users.get(viewer) : undefined;
      const isAdmin = Boolean(viewerObj && viewerObj.role === 'admin');

      const raw = graph.detectCommunities(users);
      const communities = raw.map((c) => ({
        ...c,
        members: c.member_usernames.map((uname) => users.get(uname)).filter(Boolean).map((u) => toPublicUser(u!)),
        includes_me: Boolean(viewer && c.member_usernames.includes(viewer)),
      }));

      const managedCommunities = communitiesById
        .values()
        .filter(
          (c) =>
            !c.is_suspended ||
            isAdmin ||
            viewer === c.leader ||
            Boolean(viewer && communityGraph.isMember(c.id, viewer)),
        )
        .sort((a, b) => b.created_at - a.created_at || a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
        .map((c) => serializeManagedCommunity(c, viewer));

      const myProposals = viewer
        ? communityProposalQueue
            .toList()
            .filter((p) => p.proposer === viewer)
            .map(proposalToDict)
        : [];

      res.json({
        communities,
        managed_communities: managedCommunities,
        my_proposals: myProposals,
        school_categories: COMMUNITY_CATEGORIES,
      });
    }),
  );

  router.post(
    '/communities/proposals',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const actor = requireUser(username);
      const b = req.body || {};
      const cleanName = String(b.name || '').trim().replace(/\s+/g, ' ');
      if (cleanName.length < 3 || cleanName.length > 80) {
        throw new EngineError('Community name must be between 3 and 80 characters.');
      }
      const nameKey = cleanName.toLowerCase();
      if (communityByName.contains(nameKey)) {
        throw new EngineError(`A community or pending request named '${cleanName}' already exists.`, 409);
      }
      const category = String(b.category || 'School of Engineering').trim() || 'School of Engineering';
      const description = String(b.description || '').trim();
      if (!description) throw new EngineError('Community description is required.');
      const charter = String(b.charter || '').trim() || description;
      const tags = Array.isArray(b.tags)
        ? b.tags.map((t: unknown) => String(t).trim().replace(/^#+/, '')).filter(Boolean).slice(0, 8)
        : [];
      const { schoolRestricted, allowedSchool } = resolveSchoolRestriction(
        Boolean(b.school_restricted),
        String(b.allowed_school || ''),
        category,
      );

      const ts = nowSec();
      const prop: CommunityProposalRecord = {
        id: `cprop_${crypto.randomBytes(6).toString('hex')}`,
        name: cleanName,
        category,
        description,
        charter,
        tags,
        proposer: username,
        school_restricted: schoolRestricted,
        allowed_school: allowedSchool,
        created_at: ts,
      };
      communityProposalsById.put(prop.id, prop);
      communityProposalQueue.enqueue(prop);
      communityByName.put(nameKey, prop.id);
      db.prepare(
        `INSERT INTO community_proposals (id, name, category, description, charter, tags_json, proposer, school_restricted, allowed_school, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        prop.id,
        prop.name,
        prop.category,
        prop.description,
        prop.charter,
        JSON.stringify(prop.tags),
        prop.proposer,
        prop.school_restricted ? 1 : 0,
        prop.allowed_school,
        ts,
      );

      for (const member of users.values()) {
        if (member.role === 'admin') {
          pushNotification(
            member.username,
            username,
            'community_proposal',
            `${actor.name} requested permission to start community "${cleanName}" (${category}).`,
            prop.id,
          );
        }
      }

      res.status(201).json({
        proposal: proposalToDict(prop),
        message: 'Your community creation request has been sent to the University IT Admin for approval.',
      });
    }),
  );

  router.post(
    '/communities/:id/access-policy',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const actor = requireUser(username);
      const comm = communitiesById.get(req.params.id);
      if (!comm) throw new EngineError('Community not found.', 404);
      if (username !== comm.leader && actor.role !== 'admin') {
        throw new EngineError(
          'Only the Community Leader (Host) or IT Admin can change school access settings.',
          403,
        );
      }
      const b = req.body || {};
      const { schoolRestricted, allowedSchool } = resolveSchoolRestriction(
        Boolean(b.school_restricted),
        String(b.allowed_school || ''),
        comm.category,
      );
      comm.school_restricted = schoolRestricted;
      comm.allowed_school = allowedSchool;
      db.prepare('UPDATE communities SET school_restricted = ?, allowed_school = ? WHERE id = ?').run(
        comm.school_restricted ? 1 : 0,
        comm.allowed_school,
        comm.id,
      );
      const policyText = comm.school_restricted
        ? `restricted to ${comm.allowed_school} members only`
        : 'open to students from all Chanakya University Schools';
      if (actor.role === 'admin' && comm.leader !== username) {
        pushNotification(
          comm.leader,
          username,
          'community_notice',
          `IT Admin updated "${comm.name}" access policy: now ${policyText}.`,
          comm.id,
        );
      }
      res.json({
        community: serializeManagedCommunity(comm, username),
        school_restricted: comm.school_restricted,
        allowed_school: comm.allowed_school,
        message: `"${comm.name}" is now ${policyText}.`,
      });
    }),
  );

  router.post(
    '/communities/:id/join',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const actor = requireUser(username);
      const comm = communitiesById.get(req.params.id);
      if (!comm) throw new EngineError('Community not found.', 404);
      if (comm.is_suspended) throw new EngineError('This community is currently suspended by IT Administration.', 403);
      if (username === comm.leader || communityGraph.isMember(comm.id, username)) {
        throw new EngineError('You are already a member of this community.');
      }
      if (comm.join_requests_by_user.has(username)) {
        throw new EngineError('You already have a pending join request for this community.');
      }
      if (comm.school_restricted && actor.role !== 'admin') {
        const targetSchool = (comm.allowed_school || comm.category).trim();
        if ((actor.school || '').trim().toLowerCase() !== targetSchool.toLowerCase()) {
          throw new EngineError(
            `This community is restricted to ${targetSchool} members only by the Community Leader or IT Admin.`,
            403,
          );
        }
      }
      const interest = String(req.body?.interest || '').trim();
      if (interest.length < 5) {
        throw new EngineError('Please mention your interest in joining (at least 5 characters).');
      }
      const ts = nowSec();
      const jr: CommunityJoinRequestRecord = {
        community_id: comm.id,
        username,
        interest,
        created_at: ts,
      };
      comm.join_requests.enqueue(jr);
      comm.join_requests_by_user.set(username, jr);
      db.prepare('INSERT OR REPLACE INTO community_join_requests (community_id, username, interest, created_at) VALUES (?, ?, ?, ?)').run(
        comm.id,
        username,
        interest,
        ts,
      );
      pushNotification(
        comm.leader,
        username,
        'community_join_request',
        `${actor.name} requested to join "${comm.name}" — Interest: "${interest.slice(0, 70)}"`,
        comm.id,
      );
      res.status(201).json({
        status: 'pending',
        community: serializeManagedCommunity(comm, username),
        message: `Join request with your interest sent to Community Leader @${comm.leader}.`,
      });
    }),
  );

  router.post(
    '/communities/:id/join/cancel',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const comm = communitiesById.get(req.params.id);
      if (!comm) throw new EngineError('Community not found.', 404);
      if (!comm.join_requests_by_user.has(username)) {
        throw new EngineError('No pending join request found.', 404);
      }
      comm.join_requests_by_user.delete(username);
      comm.join_requests.removeWhere((r) => r.username === username);
      db.prepare('DELETE FROM community_join_requests WHERE community_id = ? AND username = ?').run(comm.id, username);
      res.json({
        status: 'cancelled',
        community: serializeManagedCommunity(comm, username),
        message: `Cancelled join request for "${comm.name}".`,
      });
    }),
  );

  router.post(
    '/communities/:id/join-requests/:applicant/accept',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const reviewer = requireUser(username);
      const comm = communitiesById.get(req.params.id);
      if (!comm) throw new EngineError('Community not found.', 404);
      if (username !== comm.leader && reviewer.role !== 'admin') {
        throw new EngineError('Only the Community Leader or IT Admin can review join requests.', 403);
      }
      const target = String(req.params.applicant || '').trim().toLowerCase();
      if (!comm.join_requests_by_user.has(target)) {
        throw new EngineError('Pending join request from this member not found.', 404);
      }
      comm.join_requests_by_user.delete(target);
      comm.join_requests.removeWhere((r) => r.username === target);
      db.prepare('DELETE FROM community_join_requests WHERE community_id = ? AND username = ?').run(comm.id, target);

      const ts = nowSec();
      communityGraph.addMember(comm.id, target);
      db.prepare('INSERT OR IGNORE INTO community_members (community_id, username, joined_at) VALUES (?, ?, ?)').run(
        comm.id,
        target,
        ts,
      );
      pushNotification(
        target,
        username,
        'community_join_approved',
        `You were accepted into "${comm.name}" by ${reviewer.name}!`,
        comm.id,
      );
      res.json({
        accepted: true,
        community: serializeManagedCommunity(comm, username),
        message: `Accepted @${target} into "${comm.name}".`,
      });
    }),
  );

  router.post(
    '/communities/:id/join-requests/:applicant/reject',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const reviewer = requireUser(username);
      const comm = communitiesById.get(req.params.id);
      if (!comm) throw new EngineError('Community not found.', 404);
      if (username !== comm.leader && reviewer.role !== 'admin') {
        throw new EngineError('Only the Community Leader or IT Admin can review join requests.', 403);
      }
      const target = String(req.params.applicant || '').trim().toLowerCase();
      if (!comm.join_requests_by_user.has(target)) {
        throw new EngineError('Pending join request from this member not found.', 404);
      }
      comm.join_requests_by_user.delete(target);
      comm.join_requests.removeWhere((r) => r.username === target);
      db.prepare('DELETE FROM community_join_requests WHERE community_id = ? AND username = ?').run(comm.id, target);

      pushNotification(
        target,
        username,
        'community_join_rejected',
        `Your request to join "${comm.name}" was declined by ${reviewer.name}.`,
        comm.id,
      );
      res.json({
        accepted: false,
        community: serializeManagedCommunity(comm, username),
        message: `Declined @${target}'s request to join "${comm.name}".`,
      });
    }),
  );

  router.post(
    '/communities/:id/leave',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const comm = communitiesById.get(req.params.id);
      if (!comm) throw new EngineError('Community not found.', 404);
      if (username === comm.leader) throw new EngineError('Community Leaders cannot leave their own community.');
      if (!communityGraph.removeMember(comm.id, username)) {
        throw new EngineError('You are not a member of this community.', 404);
      }
      db.prepare('DELETE FROM community_members WHERE community_id = ? AND username = ?').run(comm.id, username);
      res.json({
        left: true,
        community: serializeManagedCommunity(comm, username),
        message: `Left "${comm.name}".`,
      });
    }),
  );

  router.delete(
    '/communities/:id/members/:target',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const actor = requireUser(username);
      const comm = communitiesById.get(req.params.id);
      if (!comm) throw new EngineError('Community not found.', 404);
      if (username !== comm.leader && actor.role !== 'admin') {
        throw new EngineError('Only the Community Leader or IT Admin can remove members.', 403);
      }
      const target = String(req.params.target || '').trim().toLowerCase();
      if (target === comm.leader) throw new EngineError('The Community Leader cannot be removed from membership.');
      if (!communityGraph.removeMember(comm.id, target)) {
        throw new EngineError('Member not found in this community.', 404);
      }
      db.prepare('DELETE FROM community_members WHERE community_id = ? AND username = ?').run(comm.id, target);
      res.json({
        removed: target,
        community: serializeManagedCommunity(comm, username),
        message: `Removed @${target} from "${comm.name}".`,
      });
    }),
  );

  router.post(
    '/communities/:id/messages',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const actor = requireUser(username);
      const comm = communitiesById.get(req.params.id);
      if (!comm) throw new EngineError('Community not found.', 404);
      const isAdmin = actor.role === 'admin';
      if (comm.is_suspended && !isAdmin) {
        throw new EngineError('This community is suspended and read-only.', 403);
      }
      if (!isAdmin && !communityGraph.isMember(comm.id, username)) {
        throw new EngineError('Join this community before posting community messages.', 403);
      }
      const content = String(req.body?.content || '').trim();
      if (!content) throw new EngineError('Message cannot be empty.');
      const ts = nowSec();
      const msg: CommunityMessageRecord = {
        id: `cmsg_${crypto.randomBytes(6).toString('hex')}`,
        community_id: comm.id,
        author: username,
        content,
        is_admin_notice: isAdmin,
        created_at: ts,
      };
      comm.messages.unshift(msg);
      db.prepare(
        'INSERT INTO community_messages (id, community_id, author, content, is_admin_notice, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(msg.id, comm.id, username, content, isAdmin ? 1 : 0, ts);

      if (isAdmin || username === comm.leader) {
        const label = isAdmin ? 'IT Admin Supervision Notice' : 'Community Leader Update';
        for (const memberUname of communityGraph.getMembers(comm.id)) {
          if (memberUname !== username) {
            pushNotification(
              memberUname,
              username,
              'community_notice',
              `[${comm.name}] ${label}: ${content.slice(0, 70)}`,
              comm.id,
            );
          }
        }
      }

      res.status(201).json({
        community: serializeManagedCommunity(comm, username),
        message: isAdmin ? 'Supervision directive sent.' : 'Community message posted.',
      });
    }),
  );

  router.get(
    '/graph',
    handle((req, res) => {
      const viewer = authenticateToken(extractToken(req));
      const degrees = viewer && users.contains(viewer) ? graph.bfsAllDegrees(viewer) : new Map<string, number>();
      const nodes = users
        .values()
        .sort((a, b) => a.username.localeCompare(b.username))
        .map((u) => ({
          username: u.username,
          name: u.name,
          role: u.role,
          programme: u.programme,
          year: u.year,
          degree: degrees.get(u.username) ?? null,
          connection_count: graph.getNeighbors(u.username).length,
          avatar_url: u.avatar_url,
        }));
      const edges: Array<{ source: string; target: string }> = [];
      for (const [u, nbrs] of graph.adj.entries()) {
        for (const v of nbrs) {
          if (u < v) edges.push({ source: u, target: v });
        }
      }
      res.json({
        nodes,
        edges,
        stats: {
          vertices: users.length,
          edges: edges.length,
          total_posts: postsById.length,
          active_sessions: sessions.length,
        },
      });
    }),
  );

  router.get(
    '/feed',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const includeSelf = String(req.query.include_self ?? 'true').toLowerCase() !== 'false';
      const scope = String(req.query.scope ?? 'campus').trim().toLowerCase();
      const limit = Math.min(60, Math.max(1, Number(req.query.limit || 30)));
      let authors: string[];
      if (scope === 'connections') {
        authors = graph.getNeighbors(username);
        if (includeSelf) authors.push(username);
      } else {
        authors = users
          .values()
          .filter((u) => !u.is_suspended)
          .map((u) => u.username);
      }
      const lists = authors.map((a) => userPosts.get(a) ?? []).filter((l) => l.length > 0);
      const merged = mergeFeedsWithHeap(lists, limit, 0);
      res.json({ posts: merged.map((p) => postToDict(p, username)) });
    }),
  );

  router.get(
    '/feed/trending',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const limit = Math.min(20, Math.max(1, Number(req.query.limit || 6)));
      const scope = String(req.query.scope ?? 'campus').trim().toLowerCase();
      const authors = new Set<string>();
      if (scope === 'connections') {
        for (const nbr of graph.getNeighbors(username)) authors.add(nbr);
        authors.add(username);
      } else {
        for (const u of users.values()) {
          if (!u.is_suspended) authors.add(u.username);
        }
      }
      const candidates: PostRecord[] = [];
      for (const a of authors) candidates.push(...(userPosts.get(a) ?? []));
      const ranked = rankTrendingWithHeap(candidates, limit);
      res.json({ posts: ranked.map((r) => postToDict(r.post, username, r.score)) });
    }),
  );

  router.post(
    '/posts',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const b = req.body || {};
      const content = String(b.content || '').trim();
      if (!content) throw new EngineError('Post content cannot be empty.');
      const title = String(b.title || '').trim();
      const tags = Array.isArray(b.tags)
        ? b.tags.map((t: unknown) => String(t).trim().replace(/^#+/, '')).filter(Boolean).slice(0, 8)
        : [];
      const imageUrl = b.image_url ? String(b.image_url) : null;
      const ts = nowSec();
      const post: PostRecord = {
        id: `post_${crypto.randomBytes(6).toString('hex')}`,
        author: username,
        title,
        content,
        tags,
        image_url: imageUrl,
        created_at: ts,
        likes: new Set(),
        root_comments: [],
        comments_by_id: new Map(),
      };
      postsById.put(post.id, post);
      const list = userPosts.get(username) ?? [];
      list.unshift(post);
      userPosts.set(username, list);
      db.prepare(
        'INSERT INTO posts (id, author, title, content, tags_json, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(post.id, post.author, post.title, post.content, JSON.stringify(post.tags), post.image_url, post.created_at);
      res.status(201).json({ post: postToDict(post, username) });
    }),
  );

  router.delete(
    '/posts/:id',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const post = postsById.get(req.params.id);
      if (!post) throw new EngineError('Post not found.', 404);
      if (post.author !== username) throw new EngineError('You can only delete your own posts.', 403);
      const flatComments: Array<Record<string, unknown>> = [];
      const collect = (nodes: CommentNode[]) => {
        for (const n of nodes) {
          flatComments.push({
            id: n.id,
            post_id: n.post_id,
            author: n.author,
            content: n.content,
            parent_id: n.parent_id,
            created_at: n.created_at,
          });
          collect(n.replies);
        }
      };
      collect(post.root_comments);
      undoStacks.get(username)?.push({
        type: 'delete_post',
        post: {
          id: post.id,
          author: post.author,
          title: post.title,
          content: post.content,
          tags: [...post.tags],
          image_url: post.image_url,
          created_at: post.created_at,
          likes: Array.from(post.likes),
          comments: flatComments,
        },
      });
      postsById.delete(post.id);
      userPosts.set(
        username,
        (userPosts.get(username) ?? []).filter((p) => p.id !== post.id),
      );
      db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
      db.prepare('DELETE FROM post_likes WHERE post_id = ?').run(post.id);
      db.prepare('DELETE FROM comments WHERE post_id = ?').run(post.id);
      res.json({ deleted: post.id });
    }),
  );

  router.post(
    '/posts/:id/like',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const post = postsById.get(req.params.id);
      if (!post) throw new EngineError('Post not found.', 404);
      let liked = false;
      if (post.likes.has(username)) {
        post.likes.delete(username);
        db.prepare('DELETE FROM post_likes WHERE post_id = ? AND username = ?').run(post.id, username);
      } else {
        post.likes.add(username);
        db.prepare('INSERT OR IGNORE INTO post_likes (post_id, username, created_at) VALUES (?, ?, ?)').run(
          post.id,
          username,
          nowSec(),
        );
        liked = true;
        const actor = users.get(username);
        const snippet = post.title || post.content.slice(0, 48);
        pushNotification(post.author, username, 'like', `${actor?.name ?? username} liked your post "${snippet}".`, post.id);
      }
      res.json({ post_id: post.id, liked_by_me: liked, like_count: post.likes.size });
    }),
  );

  router.post(
    '/posts/:id/comments',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const actor = requireUser(username);
      const post = postsById.get(req.params.id);
      if (!post) throw new EngineError('Post not found.', 404);
      const content = String(req.body?.content || '').trim();
      if (!content) throw new EngineError('Comment cannot be empty.');
      const parentId = req.body?.parent_id ? String(req.body.parent_id) : null;
      const parentNode = parentId ? post.comments_by_id.get(parentId) : undefined;
      if (parentId && !parentNode) throw new EngineError('Parent comment not found.', 404);

      const ts = nowSec();
      const node: CommentNode = {
        id: `cmt_${crypto.randomBytes(6).toString('hex')}`,
        post_id: post.id,
        author: username,
        content,
        created_at: ts,
        parent_id: parentId,
        replies: [],
      };
      post.comments_by_id.set(node.id, node);
      if (parentNode) {
        parentNode.replies.push(node);
        pushNotification(parentNode.author, username, 'reply', `${actor.name} replied to your comment: "${content.slice(0, 50)}"`, post.id);
      } else {
        post.root_comments.push(node);
      }
      if (!parentNode || parentNode.author !== post.author) {
        pushNotification(post.author, username, 'comment', `${actor.name} commented on your post: "${content.slice(0, 50)}"`, post.id);
      }
      db.prepare('INSERT INTO comments (id, post_id, author, content, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        node.id,
        post.id,
        username,
        content,
        parentId,
        ts,
      );
      res.status(201).json({ post: postToDict(post, username) });
    }),
  );

  router.get(
    '/notifications',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const q = notifications.get(username) ?? new Queue();
      const list = q.toList().reverse();
      const unreadCount = list.filter((n) => !n.is_read).length;
      res.json({
        unread_count: unreadCount,
        items: list.slice(0, 40).map((n) => {
          const actor = users.get(n.actor);
          return {
            ...n,
            actor_name: actor?.name ?? n.actor,
            actor_avatar: actor?.avatar_url ?? null,
          };
        }),
      });
    }),
  );

  router.post(
    '/notifications/read',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const q = notifications.get(username);
      if (q) {
        for (const item of q.toList()) item.is_read = true;
      }
      db.prepare('UPDATE notifications SET is_read = 1 WHERE recipient = ?').run(username);
      res.json({ unread_count: 0 });
    }),
  );

  router.get(
    '/undo/status',
    handle((req, res) => {
      const { username } = requireAuth(req);
      res.json(getUndoStatus(username));
    }),
  );

  router.post(
    '/undo',
    handle((req, res) => {
      const { username } = requireAuth(req);
      const action = undoStacks.get(username)?.pop() as Record<string, unknown> | undefined;
      if (!action) throw new EngineError('Nothing to undo.', 400);

      if (action.type === 'delete_post') {
        const snap = action.post as Record<string, unknown>;
        const post: PostRecord = {
          id: String(snap.id),
          author: String(snap.author),
          title: String(snap.title || ''),
          content: String(snap.content),
          tags: (snap.tags as string[]) ?? [],
          image_url: snap.image_url ? String(snap.image_url) : null,
          created_at: Number(snap.created_at),
          likes: new Set((snap.likes as string[]) ?? []),
          root_comments: [],
          comments_by_id: new Map(),
        };
        postsById.put(post.id, post);
        const plist = userPosts.get(post.author) ?? [];
        plist.push(post);
        plist.sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
        userPosts.set(post.author, plist);
        db.prepare('INSERT INTO posts (id, author, title, content, tags_json, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          post.id,
          post.author,
          post.title,
          post.content,
          JSON.stringify(post.tags),
          post.image_url,
          post.created_at,
        );
        for (const lk of post.likes) {
          db.prepare('INSERT OR IGNORE INTO post_likes (post_id, username, created_at) VALUES (?, ?, ?)').run(post.id, lk, nowSec());
        }
        const cmts = ((snap.comments as Array<Record<string, unknown>>) ?? []).sort(
          (a, b) => Number(a.created_at) - Number(b.created_at),
        );
        for (const c of cmts) {
          const node: CommentNode = {
            id: String(c.id),
            post_id: post.id,
            author: String(c.author),
            content: String(c.content),
            created_at: Number(c.created_at),
            parent_id: c.parent_id ? String(c.parent_id) : null,
            replies: [],
          };
          post.comments_by_id.set(node.id, node);
          if (node.parent_id && post.comments_by_id.has(node.parent_id)) {
            post.comments_by_id.get(node.parent_id)!.replies.push(node);
          } else {
            post.root_comments.push(node);
          }
          db.prepare('INSERT INTO comments (id, post_id, author, content, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
            node.id,
            post.id,
            node.author,
            node.content,
            node.parent_id,
            node.created_at,
          );
        }
        res.json({ restored: 'post', message: 'Restored deleted post.' });
        return;
      }

      if (action.type === 'delete_portfolio') {
        const snap = action.item as PortfolioRecord;
        const item: PortfolioRecord = { ...snap };
        portfolioById.put(item.id, item);
        const plist = userPortfolio.get(item.owner) ?? [];
        plist.push(item);
        plist.sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
        userPortfolio.set(item.owner, plist);
        db.prepare(
          `INSERT INTO portfolio_items (id, owner, category, title, issuer, issue_date, credential_id, credential_url, description, file_url, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
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
        );
        res.json({ restored: 'portfolio', message: `Restored "${item.title}" to portfolio.` });
        return;
      }

      if (action.type === 'remove_connection') {
        const other = String(action.other);
        if (users.contains(other) && !graph.isConnected(username, other)) {
          graph.addConnection(username, other);
          const [a, b] = username < other ? [username, other] : [other, username];
          db.prepare('INSERT OR IGNORE INTO connections (user_a, user_b, created_at) VALUES (?, ?, ?)').run(a, b, nowSec());
        }
        res.json({ restored: 'connection', message: `Reconnected with @${other}.` });
        return;
      }

      if (action.type === 'cancel_request') {
        const toUser = String(action.to_user);
        if (users.contains(toUser) && !graph.isConnected(username, toUser)) {
          const ts = nowSec();
          graph.addPendingRequest(username, toUser, ts);
          db.prepare('INSERT OR REPLACE INTO connection_requests (from_user, to_user, created_at) VALUES (?, ?, ?)').run(
            username,
            toUser,
            ts,
          );
        }
        res.json({ restored: 'request', message: `Re-sent request to @${toUser}.` });
        return;
      }

      throw new EngineError('Unsupported undo action.');
    }),
  );

  router.use((_req, res) => {
    res.status(404).json({ error: 'Unknown API endpoint.' });
  });

  return router;
}
