import type {
  AdminGovernanceOverview,
  AnnouncementItem,
  CommunitiesOverviewResponse,
  CommunityProposalItem,
  DegreePathResult,
  GraphSnapshot,
  ManagedCommunityItem,
  MemberRole,
  NetworkOverview,
  NotificationItem,
  PasswordResetRequestResponse,
  PasswordResetStatusResponse,
  PortfolioItem,
  PostItem,
  RegistrationRequestResponse,
  RegistrationStatusResponse,
  SuggestionItem,
  UndoStatus,
  UserProfile,
  UserSummary,
} from './types';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const TOKEN_KEY = 'chanakya_commons_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { error: text || 'Unexpected server response' };
  }

  if (!res.ok) {
    const msg = typeof data.error === 'string' ? data.error : `Request failed (${res.status})`;
    const code = typeof data.code === 'string' ? data.code : undefined;
    throw new ApiError(msg, res.status, code);
  }
  return data as T;
}

async function uploadFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
  const res = await request<{ url: string }>('/api/uploads', {
    method: 'POST',
    body: JSON.stringify({ data_url: dataUrl }),
  });
  return res.url;
}

export const api = {
  getMe: () =>
    request<{ user: UserProfile | null; undo?: UndoStatus }>('/api/auth/me'),

  submitRegistrationRequest: (payload: {
    university_id: string;
    username: string;
    password: string;
    name: string;
    role: MemberRole;
    school: string;
    programme: string;
    year: string;
    bio: string;
    skills: string[];
  }) =>
    request<RegistrationRequestResponse>('/api/auth/register/request', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  checkRegistrationStatus: (identifier: string) =>
    request<RegistrationStatusResponse>(
      `/api/auth/register/status?identifier=${encodeURIComponent(identifier)}`,
    ),

  submitPasswordResetRequest: (payload: {
    identifier: string;
    new_password: string;
    reason?: string;
  }) =>
    request<PasswordResetRequestResponse>('/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  checkPasswordResetStatus: (identifier: string) =>
    request<PasswordResetStatusResponse>(
      `/api/auth/password-reset/status?identifier=${encodeURIComponent(identifier)}`,
    ),

  login: async (identifier: string, password: string) => {
    const res = await request<{ user: UserProfile; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: identifier, password }),
    });
    setStoredToken(res.token);
    return res;
  },

  logout: async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },

  uploadImage: uploadFile,
  uploadFile,

  searchUsers: (q: string, limit = 15) =>
    request<{ results: UserSummary[] }>(
      `/api/users/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),

  getProfile: (username: string) =>
    request<{ profile: UserProfile }>(`/api/users/${encodeURIComponent(username)}`),

  updateProfile: (payload: {
    name: string;
    school?: string;
    programme: string;
    year: string;
    bio: string;
    skills: string[];
    avatar_url?: string | null;
  }) =>
    request<{ profile: UserProfile }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getPortfolio: (username: string) =>
    request<{ items: PortfolioItem[] }>(
      `/api/users/${encodeURIComponent(username)}/portfolio`,
    ),

  addPortfolioItem: (payload: {
    category: 'certificate' | 'achievement';
    title: string;
    issuer: string;
    issue_date: string;
    credential_id: string;
    credential_url: string;
    description: string;
    file_url?: string | null;
  }) =>
    request<{ item: PortfolioItem }>('/api/portfolio', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deletePortfolioItem: (itemId: string) =>
    request<{ deleted: string }>(`/api/portfolio/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    }),

  getUserPosts: (username: string) =>
    request<{ posts: PostItem[] }>(`/api/users/${encodeURIComponent(username)}/posts`),

  getFeed: (scope: 'campus' | 'connections' = 'campus', includeSelf = true) =>
    request<{ posts: PostItem[] }>(
      `/api/feed?scope=${scope}&include_self=${includeSelf}&limit=40`,
    ),

  getTrending: (limit = 6, scope: 'campus' | 'connections' = 'campus') =>
    request<{ posts: PostItem[] }>(`/api/feed/trending?limit=${limit}&scope=${scope}`),

  createPost: (payload: {
    title: string;
    content: string;
    tags: string[];
    image_url?: string | null;
  }) =>
    request<{ post: PostItem }>('/api/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deletePost: (postId: string) =>
    request<{ deleted: string }>(`/api/posts/${encodeURIComponent(postId)}`, {
      method: 'DELETE',
    }),

  toggleLike: (postId: string) =>
    request<{ post_id: string; liked_by_me: boolean; like_count: number }>(
      `/api/posts/${encodeURIComponent(postId)}/like`,
      { method: 'POST' },
    ),

  addComment: (postId: string, content: string, parentId?: string | null) =>
    request<{ post: PostItem }>(`/api/posts/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, parent_id: parentId || null }),
    }),

  getNetwork: () => request<NetworkOverview>('/api/connections'),

  getSuggestions: (limit = 12) =>
    request<{ suggestions: SuggestionItem[] }>(
      `/api/connections/suggestions?limit=${limit}`,
    ),

  getDegreeAndPath: (target: string) =>
    request<DegreePathResult>(
      `/api/connections/path?target=${encodeURIComponent(target)}`,
    ),

  sendRequest: (target: string) =>
    request<{ status: string }>('/api/connections/request', {
      method: 'POST',
      body: JSON.stringify({ target }),
    }),

  acceptRequest: (sender: string) =>
    request<{ status: string }>('/api/connections/accept', {
      method: 'POST',
      body: JSON.stringify({ sender }),
    }),

  rejectRequest: (sender: string) =>
    request<{ status: string }>('/api/connections/reject', {
      method: 'POST',
      body: JSON.stringify({ sender }),
    }),

  cancelRequest: (target: string) =>
    request<{ status: string }>('/api/connections/cancel', {
      method: 'POST',
      body: JSON.stringify({ target }),
    }),

  removeConnection: (other: string) =>
    request<{ status: string }>(`/api/connections/${encodeURIComponent(other)}`, {
      method: 'DELETE',
    }),

  getCommunities: () =>
    request<CommunitiesOverviewResponse>('/api/communities'),

  proposeCommunity: (payload: {
    name: string;
    category: string;
    description: string;
    charter: string;
    tags: string[];
    school_restricted?: boolean;
    allowed_school?: string;
  }) =>
    request<{ proposal: CommunityProposalItem; message: string }>(
      '/api/communities/proposals',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  setCommunityAccessPolicy: (
    communityId: string,
    payload: { school_restricted: boolean; allowed_school?: string },
  ) =>
    request<{
      community: ManagedCommunityItem;
      school_restricted: boolean;
      allowed_school: string;
      message: string;
    }>(`/api/communities/${encodeURIComponent(communityId)}/access-policy`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  requestJoinCommunity: (communityId: string, interest: string) =>
    request<{ status: string; community: ManagedCommunityItem; message: string }>(
      `/api/communities/${encodeURIComponent(communityId)}/join`,
      {
        method: 'POST',
        body: JSON.stringify({ interest }),
      },
    ),

  cancelJoinCommunity: (communityId: string) =>
    request<{ status: string; community: ManagedCommunityItem; message: string }>(
      `/api/communities/${encodeURIComponent(communityId)}/join/cancel`,
      { method: 'POST' },
    ),

  acceptCommunityJoin: (communityId: string, applicant: string) =>
    request<{ accepted: boolean; community: ManagedCommunityItem; message: string }>(
      `/api/communities/${encodeURIComponent(communityId)}/join-requests/${encodeURIComponent(applicant)}/accept`,
      { method: 'POST' },
    ),

  rejectCommunityJoin: (communityId: string, applicant: string) =>
    request<{ accepted: boolean; community: ManagedCommunityItem; message: string }>(
      `/api/communities/${encodeURIComponent(communityId)}/join-requests/${encodeURIComponent(applicant)}/reject`,
      { method: 'POST' },
    ),

  leaveCommunity: (communityId: string) =>
    request<{ left: boolean; community: ManagedCommunityItem; message: string }>(
      `/api/communities/${encodeURIComponent(communityId)}/leave`,
      { method: 'POST' },
    ),

  removeCommunityMember: (communityId: string, target: string) =>
    request<{ removed: string; community: ManagedCommunityItem; message: string }>(
      `/api/communities/${encodeURIComponent(communityId)}/members/${encodeURIComponent(target)}`,
      { method: 'DELETE' },
    ),

  postCommunityMessage: (communityId: string, content: string) =>
    request<{ message_record: unknown; community: ManagedCommunityItem; message: string }>(
      `/api/communities/${encodeURIComponent(communityId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      },
    ),

  getGraphSnapshot: () => request<GraphSnapshot>('/api/graph'),

  getNotifications: () =>
    request<{ unread_count: number; items: NotificationItem[] }>('/api/notifications'),

  markNotificationsRead: () =>
    request<{ unread_count: number }>('/api/notifications/read', { method: 'POST' }),

  getUndoStatus: () => request<UndoStatus>('/api/undo/status'),

  undoLastAction: () =>
    request<{ restored: string; message: string }>('/api/undo', { method: 'POST' }),

  getAnnouncements: () =>
    request<{ announcements: AnnouncementItem[] }>('/api/announcements'),

  publishAnnouncement: (payload: {
    title: string;
    content: string;
    priority: 'urgent' | 'important' | 'general';
    category: string;
  }) =>
    request<{ announcement: AnnouncementItem }>('/api/announcements', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteAnnouncement: (annId: string) =>
    request<{ deleted: string }>(`/api/announcements/${encodeURIComponent(annId)}`, {
      method: 'DELETE',
    }),

  getAdminOverview: () =>
    request<AdminGovernanceOverview>('/api/admin/overview'),

  setMemberSuspended: (username: string, suspended: boolean) =>
    request<{ username: string; is_suspended: boolean }>(
      `/api/admin/users/${encodeURIComponent(username)}/status`,
      {
        method: 'POST',
        body: JSON.stringify({ suspended }),
      },
    ),

  approveRegistration: (universityId: string) =>
    request<{ approved: boolean; user: UserSummary; message: string }>(
      `/api/admin/registrations/${encodeURIComponent(universityId)}/approve`,
      { method: 'POST' },
    ),

  rejectRegistration: (universityId: string) =>
    request<{ rejected: boolean; university_id: string; username: string; message: string }>(
      `/api/admin/registrations/${encodeURIComponent(universityId)}/reject`,
      { method: 'POST' },
    ),

  approvePasswordReset: (requestId: string) =>
    request<{
      approved: boolean;
      request_id: string;
      username: string;
      university_id: string;
      message: string;
    }>(`/api/admin/password-resets/${encodeURIComponent(requestId)}/approve`, {
      method: 'POST',
    }),

  rejectPasswordReset: (requestId: string) =>
    request<{
      rejected: boolean;
      request_id: string;
      username: string;
      university_id: string;
      message: string;
    }>(`/api/admin/password-resets/${encodeURIComponent(requestId)}/reject`, {
      method: 'POST',
    }),

  approveCommunityProposal: (
    proposalId: string,
    payload?: { school_restricted?: boolean; allowed_school?: string },
  ) =>
    request<{ approved: boolean; community: ManagedCommunityItem; message: string }>(
      `/api/admin/communities/proposals/${encodeURIComponent(proposalId)}/approve`,
      {
        method: 'POST',
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      },
    ),

  rejectCommunityProposal: (proposalId: string, reason = '') =>
    request<{ rejected: boolean; proposal_id: string; message: string }>(
      `/api/admin/communities/proposals/${encodeURIComponent(proposalId)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    ),

  setCommunitySuspended: (communityId: string, suspended: boolean) =>
    request<{ community_id: string; is_suspended: boolean; message: string }>(
      `/api/admin/communities/${encodeURIComponent(communityId)}/status`,
      {
        method: 'POST',
        body: JSON.stringify({ suspended }),
      },
    ),

  deleteCommunity: (communityId: string) =>
    request<{ deleted: string; message: string }>(
      `/api/admin/communities/${encodeURIComponent(communityId)}`,
      { method: 'DELETE' },
    ),

  adminDeletePost: (postId: string) =>
    request<{ deleted: string }>(`/api/admin/posts/${encodeURIComponent(postId)}`, {
      method: 'DELETE',
    }),
};
