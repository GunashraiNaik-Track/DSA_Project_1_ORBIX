export type RelationshipState =
  | 'self'
  | 'connected'
  | 'outgoing_pending'
  | 'incoming_pending'
  | 'none';

export type MemberRole = 'student' | 'faculty' | 'admin';

export interface UserSummary {
  username: string;
  university_id: string;
  outlook_email: string;
  role: MemberRole;
  is_suspended?: boolean;
  name: string;
  school: string;
  programme: string;
  year: string;
  bio: string;
  skills: string[];
  avatar_url: string | null;
  created_at: number;
  relationship?: RelationshipState;
  degree?: number | null;
  mutual_count?: number;
  connection_count?: number;
  post_count?: number;
  portfolio_count?: number;
}

export interface AnnouncementItem {
  id: string;
  author: string;
  author_name: string;
  title: string;
  content: string;
  priority: 'urgent' | 'important' | 'general';
  category: string;
  created_at: number;
}

export interface PendingRegistrationItem {
  university_id: string;
  username: string;
  role: MemberRole;
  name: string;
  school: string;
  programme: string;
  year: string;
  bio: string;
  skills: string[];
  created_at: number;
}

export interface PasswordResetRequestItem {
  id: string;
  username: string;
  university_id: string;
  name: string;
  role: MemberRole;
  school: string;
  programme: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: number;
}

export interface AdminGovernanceOverview {
  metrics: {
    total_members: number;
    students: number;
    faculty: number;
    admins: number;
    suspended: number;
    connections: number;
    pending_requests: number;
    pending_registrations: number;
    pending_password_resets?: number;
    pending_community_proposals: number;
    managed_communities: number;
    posts: number;
    portfolio_items: number;
    announcements: number;
  };
  pending_registrations: PendingRegistrationItem[];
  password_reset_requests?: PasswordResetRequestItem[];
  community_proposals: CommunityProposalItem[];
  managed_communities: ManagedCommunityItem[];
  members: UserSummary[];
  recent_posts: PostItem[];
}

export interface UserProfile extends UserSummary {
  connection_count: number;
  post_count: number;
  portfolio_count?: number;
  shortest_path?: Array<{
    username: string;
    name: string;
  }> | string[];
  mutual_connections?: UserSummary[];
}

export interface PortfolioItem {
  id: string;
  owner: string;
  category: 'certificate' | 'achievement';
  title: string;
  issuer: string;
  issue_date: string;
  credential_id: string;
  credential_url: string;
  description: string;
  file_url: string | null;
  created_at: number;
}

export interface RegistrationRequestResponse {
  submitted: boolean;
  status: 'pending';
  university_id: string;
  username: string;
  name: string;
  role: MemberRole;
  message: string;
}

export interface RegistrationStatusResponse {
  status: 'pending' | 'approved' | 'suspended' | 'not_found';
  message: string;
  university_id?: string;
  username?: string;
  submitted_at?: number;
}

export interface PasswordResetRequestResponse {
  submitted: boolean;
  status: 'pending';
  request_id: string;
  username: string;
  university_id: string;
  message: string;
}

export interface PasswordResetStatusResponse {
  status: 'pending' | 'approved' | 'rejected' | 'not_found';
  message: string;
  request_id?: string;
  username?: string;
  university_id?: string;
  submitted_at?: number;
  reviewed_at?: number | null;
}

export interface CommentNode {
  id: string;
  post_id: string;
  author: string;
  author_name: string;
  author_avatar: string | null;
  author_programme: string;
  content: string;
  created_at: number;
  parent_id: string | null;
  replies: CommentNode[];
}

export interface PostItem {
  id: string;
  author: string;
  author_name: string;
  author_role?: MemberRole;
  author_programme: string;
  author_year: string;
  author_avatar: string | null;
  title: string;
  content: string;
  tags: string[];
  image_url: string | null;
  created_at: number;
  like_count: number;
  liked_by_me: boolean;
  comment_count: number;
  comments: CommentNode[];
  trend_score: number | null;
}

export interface PendingRequestItem {
  user: UserSummary;
  created_at: number;
  mutual_count?: number;
}

export interface NetworkOverview {
  connections: UserSummary[];
  incoming_requests: PendingRequestItem[];
  outgoing_requests: PendingRequestItem[];
}

export interface SuggestionItem {
  user: UserSummary;
  score: number;
  mutual_count: number;
  mutual_names: string[];
  shared_skills: string[];
  same_programme: boolean;
  degree: number | null;
  shortest_path: Array<{ username: string; name: string }>;
  relationship: RelationshipState;
}

export interface PathStep {
  username: string;
  name: string;
  programme: string;
  avatar_url: string | null;
}

export interface DegreePathResult {
  source: string;
  target: string;
  degree: number | null;
  shortest_path: PathStep[];
  mutual_connections: UserSummary[];
}

export interface CommunityCluster {
  id: string;
  name: string;
  dominant_programme: string;
  top_skills: string[];
  member_usernames: string[];
  member_count: number;
  internal_edges: number;
  density: number;
  members: UserSummary[];
  includes_me: boolean;
}

export interface CommunityProposalItem {
  id: string;
  name: string;
  category: string;
  description: string;
  charter: string;
  tags: string[];
  proposer: string;
  proposer_name: string;
  proposer_role: MemberRole;
  proposer_school: string;
  proposer_programme: string;
  proposer_university_id: string;
  proposer_avatar: string | null;
  school_restricted: boolean;
  allowed_school: string;
  created_at: number;
}

export interface CommunityJoinRequestItem {
  community_id: string;
  username: string;
  name: string;
  role: MemberRole;
  school: string;
  programme: string;
  year: string;
  skills: string[];
  avatar_url: string | null;
  interest: string;
  created_at: number;
}

export interface CommunityMessageItem {
  id: string;
  community_id: string;
  author: string;
  author_name: string;
  author_role: MemberRole;
  author_avatar: string | null;
  content: string;
  is_admin_notice: boolean;
  created_at: number;
}

export interface ManagedCommunityItem {
  id: string;
  name: string;
  category: string;
  description: string;
  charter: string;
  tags: string[];
  leader: string;
  leader_name: string;
  leader_role: MemberRole;
  leader_programme: string;
  leader_avatar: string | null;
  approved_by: string;
  school_restricted: boolean;
  allowed_school: string;
  can_request_join?: boolean;
  join_restriction_reason?: string | null;
  is_suspended: boolean;
  created_at: number;
  member_usernames: string[];
  member_count: number;
  members: UserSummary[];
  internal_edges: number;
  my_status: 'leader' | 'member' | 'pending' | 'none';
  my_pending_interest: string | null;
  pending_join_count: number;
  pending_join_requests: CommunityJoinRequestItem[];
  messages: CommunityMessageItem[];
}

export interface CommunitiesOverviewResponse {
  communities: CommunityCluster[];
  managed_communities: ManagedCommunityItem[];
  my_proposals: CommunityProposalItem[];
  school_categories?: string[];
}

export interface NotificationItem {
  id: string;
  recipient: string;
  actor: string;
  actor_name: string;
  actor_avatar: string | null;
  ntype: string;
  message: string;
  ref_id: string | null;
  is_read: boolean;
  created_at: number;
}

export interface UndoStatus {
  can_undo: boolean;
  depth: number;
  label: string | null;
}

export interface GraphSnapshot {
  nodes: Array<{
    username: string;
    name: string;
    role?: MemberRole;
    programme: string;
    year: string;
    degree: number | null;
    connection_count: number;
    avatar_url: string | null;
  }>;
  edges: Array<{
    source: string;
    target: string;
  }>;
  stats: {
    vertices: number;
    edges: number;
    total_posts: number;
    active_sessions: number;
  };
}
