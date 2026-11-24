import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Flame,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  Megaphone,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from './api';
import { AuthView } from './components/AuthView';
import { Avatar } from './components/Avatar';
import { CampusGraphCanvas } from './components/CampusGraphCanvas';
import { ComposeModal } from './components/ComposeModal';
import { OrbixLogo } from './components/OrbixLogo';
import { PostCard, formatRelativeTime } from './components/PostCard';
import { ProfileView } from './components/ProfileView';
import { CHANAKYA_SCHOOLS, COMMUNITY_CATEGORIES } from './data/universityCatalog';
import type {
  AdminGovernanceOverview,
  AnnouncementItem,
  CommunityCluster,
  CommunityProposalItem,
  DegreePathResult,
  GraphSnapshot,
  ManagedCommunityItem,
  NetworkOverview,
  NotificationItem,
  PostItem,
  SuggestionItem,
  UndoStatus,
  UserProfile,
  UserSummary,
} from './types';

type TabView =
  | 'feed'
  | 'network'
  | 'discover'
  | 'communities'
  | 'spicy_news'
  | 'governance'
  | 'profile';

interface NavRoute {
  tab: TabView;
  profileUsername?: string;
}

function formatDegreeLabel(deg: number | null | undefined): string {
  if (deg === 0) return 'You';
  if (deg === 1) return '1st degree';
  if (deg === 2) return '2nd degree';
  if (deg === 3) return '3rd degree';
  if (deg && deg > 3) return `${deg}th degree`;
  return 'Unreachable';
}

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Navigation & Back Stack
  const [route, setRoute] = useState<NavRoute>({ tab: 'feed' });
  const [backStack, setBackStack] = useState<NavRoute[]>([]);

  // Feed & Subviews
  const [feedMode, setFeedMode] = useState<'all' | 'connections' | 'trending'>('all');
  const [feedPosts, setFeedPosts] = useState<PostItem[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<PostItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  // Network, Suggestions, Communities, Graph
  const [network, setNetwork] = useState<NetworkOverview>({
    connections: [],
    incoming_requests: [],
    outgoing_requests: [],
  });
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [communities, setCommunities] = useState<CommunityCluster[]>([]);
  const [managedCommunities, setManagedCommunities] = useState<ManagedCommunityItem[]>([]);
  const [myCommunityProposals, setMyCommunityProposals] = useState<CommunityProposalItem[]>([]);
  const [graphSnapshot, setGraphSnapshot] = useState<GraphSnapshot | null>(null);

  // Managed Communities creation, school categories, access policy, join interest, messaging & admin review state
  const [selectedSchoolCategory, setSelectedSchoolCategory] = useState<string>('ALL');
  const [createCommunityOpen, setCreateCommunityOpen] = useState(false);
  const [commName, setCommName] = useState('');
  const [commCategory, setCommCategory] = useState<string>(CHANAKYA_SCHOOLS[0]);
  const [commSchoolRestricted, setCommSchoolRestricted] = useState(false);
  const [commAllowedSchool, setCommAllowedSchool] = useState<string>(CHANAKYA_SCHOOLS[0]);
  const [commDescription, setCommDescription] = useState('');
  const [commCharter, setCommCharter] = useState('');
  const [commTagsInput, setCommTagsInput] = useState('');
  const [commSubmitting, setCommSubmitting] = useState(false);
  const [joiningCommunityId, setJoiningCommunityId] = useState<string | null>(null);
  const [joinInterestText, setJoinInterestText] = useState('');
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [communityMessageDrafts, setCommunityMessageDrafts] = useState<Record<string, string>>({});
  const [communityPolicySchoolDrafts, setCommunityPolicySchoolDrafts] = useState<Record<string, string>>({});
  const [communityBusyId, setCommunityBusyId] = useState<string | null>(null);
  const [proposalRejectNotes, setProposalRejectNotes] = useState<Record<string, string>>({});
  const [proposalPolicyOverrides, setProposalPolicyOverrides] = useState<
    Record<string, { school_restricted: boolean; allowed_school: string }>
  >({});

  // Shortest Chain Explorer state
  const [allDirectoryUsers, setAllDirectoryUsers] = useState<UserSummary[]>([]);
  const [pathTarget, setPathTarget] = useState<string>('');
  const [pathInspection, setPathInspection] = useState<DegreePathResult | null>(null);

  // Trie Prefix Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSummary[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Notifications Queue & Undo Stack
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifBoxRef = useRef<HTMLDivElement>(null);
  const [undoStatus, setUndoStatus] = useState<UndoStatus>({
    can_undo: false,
    depth: 0,
    label: null,
  });

  // Compose Modal & Toast Banner
  const [composeOpen, setComposeOpen] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);

  // Spicy News & IT Governance state
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [adminOverview, setAdminOverview] = useState<AdminGovernanceOverview | null>(null);
  const [newsTitle, setNewsTitle] = useState('');
  const [newsPriority, setNewsPriority] = useState<'urgent' | 'important' | 'general'>('urgent');
  const [newsCategory, setNewsCategory] = useState('IT & Campus Alert');
  const [newsContent, setNewsContent] = useState('');
  const [newsPublishing, setNewsPublishing] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);

  const showBanner = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => {
      setStatusBanner((curr) => (curr === msg ? null : curr));
    }, 3500);
  };

  const navigateTo = (next: NavRoute) => {
    setRoute((prev) => {
      if (
        prev.tab === next.tab &&
        prev.profileUsername === next.profileUsername
      ) {
        return prev;
      }
      setBackStack((stack) => [...stack.slice(-24), prev]);
      return next;
    });
    setSearchOpen(false);
    setNotifOpen(false);

    if (next.tab === 'discover' || next.tab === 'network') {
      Promise.all([
        api.searchUsers('', 50),
        api.getSuggestions(12),
        api.getNetwork(),
      ])
        .then(([dirRes, suggRes, netRes]) => {
          setAllDirectoryUsers(dirRes.results);
          setSuggestions(suggRes.suggestions);
          setNetwork(netRes);
        })
        .catch(() => {});
    }
  };

  const handleBack = () => {
    setBackStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setRoute(previous);
      return stack.slice(0, -1);
    });
  };

  const openStudentProfile = (username: string) => {
    navigateTo({ tab: 'profile', profileUsername: username });
  };

  const refreshAllWorkspaceData = async (
    mode: 'all' | 'connections' | 'trending' = feedMode,
    knownRole?: UserProfile['role'],
  ) => {
    setFeedLoading(true);
    try {
      const effectiveRole = knownRole ?? currentUser?.role;
      const [
        feedRes,
        trendRes,
        netRes,
        suggRes,
        commRes,
        graphRes,
        notifRes,
        undoRes,
        dirRes,
        annRes,
      ] = await Promise.all([
        mode === 'trending'
          ? api.getTrending(12, 'campus')
          : api.getFeed(mode === 'connections' ? 'connections' : 'campus'),
        api.getTrending(5, 'campus'),
        api.getNetwork(),
        api.getSuggestions(12),
        api.getCommunities(),
        api.getGraphSnapshot(),
        api.getNotifications(),
        api.getUndoStatus(),
        api.searchUsers('', 50),
        api.getAnnouncements(),
      ]);

      setFeedPosts(feedRes.posts);
      setTrendingPosts(trendRes.posts);
      setNetwork(netRes);
      setSuggestions(suggRes.suggestions);
      setCommunities(commRes.communities);
      setManagedCommunities(commRes.managed_communities || []);
      setMyCommunityProposals(commRes.my_proposals || []);
      setGraphSnapshot(graphRes);
      setNotifications(notifRes.items);
      setUnreadCount(notifRes.unread_count);
      setUndoStatus(undoRes);
      setAllDirectoryUsers(dirRes.results);
      setAnnouncements(annRes.announcements);

      if (effectiveRole === 'admin') {
        api
          .getAdminOverview()
          .then(setAdminOverview)
          .catch(() => setAdminOverview(null));
      } else {
        setAdminOverview(null);
      }

      api
        .getMe()
        .then((meRes) => {
          if (meRes.user) setCurrentUser(meRes.user);
        })
        .catch(() => {});
    } finally {
      setFeedLoading(false);
    }
  };

  // Boot session check
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.getMe();
        if (!mounted) return;
        if (res.user) {
          setCurrentUser(res.user);
          setRoute({ tab: res.user.role === 'admin' ? 'governance' : 'feed' });
          await refreshAllWorkspaceData('all', res.user.role);
        }
      } catch {
        // Not logged in
      } finally {
        if (mounted) setAuthChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Refresh feed when switching feedMode
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      setFeedLoading(true);
      try {
        const res =
          feedMode === 'trending'
            ? await api.getTrending(12, 'campus')
            : await api.getFeed(feedMode === 'connections' ? 'connections' : 'campus');
        setFeedPosts(res.posts);
      } finally {
        setFeedLoading(false);
      }
    })();
  }, [feedMode]);

  // Live Trie Prefix Search as user types
  useEffect(() => {
    if (!currentUser) return;
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchUsers(trimmed, 8);
        if (!cancelled) {
          setSearchResults(res.results);
        }
      } catch {
        if (!cancelled) setSearchResults([]);
      }
    }, 90);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, currentUser]);

  // Click-outside close for search & notification popovers
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (notifBoxRef.current && !notifBoxRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // Load default path target when entering Network tab
  useEffect(() => {
    if (!currentUser || allDirectoryUsers.length === 0) return;
    const others = allDirectoryUsers.filter((u) => u.username !== currentUser.username);
    if (others.length === 0) return;
    const candidate = pathTarget && pathTarget !== currentUser.username ? pathTarget : others[0].username;
    setPathTarget(candidate);
    api
      .getDegreeAndPath(candidate)
      .then(setPathInspection)
      .catch(() => setPathInspection(null));
  }, [currentUser, allDirectoryUsers, pathTarget]);

  const handleAuthenticated = async (user: UserProfile) => {
    setCurrentUser(user);
    setRoute({ tab: user.role === 'admin' ? 'governance' : 'feed' });
    setBackStack([]);
    await refreshAllWorkspaceData('all', user.role);
  };

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    setFeedPosts([]);
    setAnnouncements([]);
    setAdminOverview(null);
    setBackStack([]);
    setRoute({ tab: 'feed' });
  };

  const handlePublishSpicyNews = async (e: FormEvent) => {
    e.preventDefault();
    if (!newsTitle.trim() || !newsContent.trim() || newsPublishing) return;
    setNewsPublishing(true);
    try {
      await api.publishAnnouncement({
        title: newsTitle.trim(),
        content: newsContent.trim(),
        priority: newsPriority,
        category: newsCategory.trim() || 'University Notice',
      });
      setNewsTitle('');
      setNewsContent('');
      showBanner('Spicy News bulletin published and broadcast to Chanakya University members.');
      await refreshAllWorkspaceData();
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Unable to publish announcement');
    } finally {
      setNewsPublishing(false);
    }
  };

  const handleProposeCommunity = async (e: FormEvent) => {
    e.preventDefault();
    if (!commName.trim() || !commDescription.trim() || commSubmitting) return;
    setCommSubmitting(true);
    try {
      const tags = commTagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const effectiveAllowedSchool = commSchoolRestricted
        ? (commAllowedSchool ||
            ((CHANAKYA_SCHOOLS as readonly string[]).includes(commCategory)
              ? commCategory
              : CHANAKYA_SCHOOLS[0]))
        : '';
      const res = await api.proposeCommunity({
        name: commName.trim(),
        category: commCategory,
        description: commDescription.trim(),
        charter: commCharter.trim() || commDescription.trim(),
        tags,
        school_restricted: commSchoolRestricted,
        allowed_school: effectiveAllowedSchool,
      });
      setCommName('');
      setCommDescription('');
      setCommCharter('');
      setCommTagsInput('');
      setCommSchoolRestricted(false);
      setCommAllowedSchool(CHANAKYA_SCHOOLS[0]);
      setCreateCommunityOpen(false);
      showBanner(res.message);
      await refreshAllWorkspaceData();
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Unable to submit community request');
    } finally {
      setCommSubmitting(false);
    }
  };

  const handleUpdateCommunityAccessPolicy = async (
    communityId: string,
    schoolRestricted: boolean,
    allowedSchool = '',
  ) => {
    setCommunityBusyId(communityId);
    try {
      const res = await api.setCommunityAccessPolicy(communityId, {
        school_restricted: schoolRestricted,
        allowed_school: schoolRestricted ? allowedSchool : '',
      });
      showBanner(res.message);
      await refreshAllWorkspaceData();
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Unable to update community access policy');
    } finally {
      setCommunityBusyId(null);
    }
  };

  const handleSubmitJoinCommunity = async (communityId: string) => {
    if (!joinInterestText.trim() || joinSubmitting) return;
    setJoinSubmitting(true);
    try {
      const res = await api.requestJoinCommunity(communityId, joinInterestText.trim());
      setJoiningCommunityId(null);
      setJoinInterestText('');
      showBanner(res.message);
      await refreshAllWorkspaceData();
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Unable to send join request');
    } finally {
      setJoinSubmitting(false);
    }
  };

  const handleSendCommunityMessage = async (communityId: string) => {
    const draft = (communityMessageDrafts[communityId] || '').trim();
    if (!draft) return;
    setCommunityBusyId(communityId);
    try {
      await api.postCommunityMessage(communityId, draft);
      setCommunityMessageDrafts((prev) => ({ ...prev, [communityId]: '' }));
      showBanner(
        currentUser?.role === 'admin'
          ? 'IT Admin supervision notice sent to community.'
          : 'Message posted to community.',
      );
      await refreshAllWorkspaceData();
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Unable to send community message');
    } finally {
      setCommunityBusyId(null);
    }
  };

  const handleUndo = async () => {
    try {
      const res = await api.undoLastAction();
      showBanner(res.message);
      setProfileRefreshKey((k) => k + 1);
      await refreshAllWorkspaceData();
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Nothing to undo');
    }
  };

  const handleOpenNotifications = async () => {
    const nextState = !notifOpen;
    setNotifOpen(nextState);
    if (nextState && unreadCount > 0) {
      await api.markNotificationsRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#FFFFFF] flex items-center justify-center">
        <p className="text-sm text-[#2B2B2B] font-medium">Loading ORBIX...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthView onAuthenticated={handleAuthenticated} />;
  }

  const activeProfileUsername = route.profileUsername || currentUser.username;
  const navItems: Array<{ id: TabView; label: string }> = [
    { id: 'feed', label: 'Feed' },
    { id: 'network', label: 'Network' },
    { id: 'discover', label: 'Discover' },
    { id: 'communities', label: 'Communities' },
    ...(currentUser.role === 'admin' ? [{ id: 'governance' as const, label: 'IT Governance' }] : []),
    { id: 'profile', label: 'Profile' },
  ];
  const urgentCount = announcements.filter((a) => a.priority === 'urgent').length;

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#2B2B2B] flex flex-col">
      {/* Strict 3-Zone Top Bar Contract — Japanese Kabuki Palette */}
      <header className="sticky top-0 z-30 bg-[#FFFFFF] border-b border-[#2B2B2B]/15 text-[#2B2B2B]">
        <div className="h-1.5 kabuki-stripe" />
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: ORBIX brand logo */}
          <button
            type="button"
            onClick={() => navigateTo({ tab: 'feed' })}
            aria-label="ORBIX Home"
            className="inline-flex items-center hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
          >
            <OrbixLogo size="sm" />
          </button>

          {/* Zone 2: Concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold">
            {navItems.map((item) => {
              const isActive =
                route.tab === item.id &&
                (item.id !== 'profile' || activeProfileUsername === currentUser.username);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    item.id === 'profile'
                      ? openStudentProfile(currentUser.username)
                      : navigateTo({ tab: item.id })
                  }
                  className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-[#006E53] text-[#006E53] font-bold'
                      : 'border-transparent text-[#2B2B2B]/75 hover:text-[#EC6E3C]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg transition-opacity whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-white" />
            <span>New Post</span>
          </button>
        </div>

        {/* Mobile Secondary Nav Row */}
        <div className="md:hidden bg-[#2B2B2B]/[0.03] border-t border-[#2B2B2B]/15 px-4 py-2 flex items-center gap-3 overflow-x-auto text-xs font-semibold">
          {navItems.map((item) => {
            const isActive =
              route.tab === item.id &&
              (item.id !== 'profile' || activeProfileUsername === currentUser.username);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  item.id === 'profile'
                    ? openStudentProfile(currentUser.username)
                    : navigateTo({ tab: item.id })
                }
                className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[#006E53] text-white font-semibold'
                    : 'text-[#2B2B2B] hover:bg-[#EC6E3C]/12'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Workspace Utility Toolbar: Back Stack, Trie Prefix Search (Pure White), Spicy News, Undo Stack, Alerts, Sign Out */}
      <div className="bg-[#2B2B2B]/[0.03] border-b border-[#2B2B2B]/15">
        <div className="max-w-[1280px] mx-auto px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-[240px]">
            <button
              type="button"
              onClick={handleBack}
              disabled={backStack.length === 0}
              title="Back navigation stack"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 disabled:opacity-40 disabled:hover:bg-white rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            {/* Trie Prefix Search Input — Pure White */}
            <div ref={searchBoxRef} className="relative flex-1 max-w-md">
              <div className="relative">
                <Search className="w-4 h-4 text-[#2B2B2B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onFocus={() => setSearchOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  placeholder="Search students or faculty by name, username, or University ID..."
                  className="w-full pl-9 pr-8 py-1.5 text-sm text-[#2B2B2B] bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] placeholder:text-[#2B2B2B]/50"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#2B2B2B] hover:opacity-75"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {searchOpen && searchQuery.trim().length > 0 && (
                <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#2B2B2B]/20 rounded-xl shadow-lg z-40 overflow-hidden">
                  <div className="px-3.5 py-2 bg-white border-b border-[#2B2B2B]/15 flex items-center justify-between text-[11px] text-[#2B2B2B] font-medium">
                    <span>Trie prefix directory matches</span>
                    <span className="font-mono tabular-nums">{searchResults.length} matches</span>
                  </div>
                  {searchResults.length === 0 ? (
                    <div className="px-4 py-4 text-xs text-[#2B2B2B]/80 bg-white">
                      No students or faculty matching &ldquo;{searchQuery}&rdquo;.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#2B2B2B]/15 max-h-80 overflow-y-auto bg-white">
                      {searchResults.map((u) => (
                        <div
                          key={u.username}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-white hover:bg-[#EC6E3C]/[0.06] transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => openStudentProfile(u.username)}
                            className="flex items-center gap-3 min-w-0 flex-1 text-left"
                          >
                            <Avatar name={u.name} src={u.avatar_url} size="sm" />
                            <div className="min-w-0">
                              <div className="flex items-baseline gap-2">
                                <span className="text-sm font-semibold text-[#2B2B2B] truncate">
                                  {u.name}
                                </span>
                                <span className="text-xs font-mono text-[#2B2B2B]/75 truncate">
                                  @{u.username}
                                </span>
                              </div>
                              <p className="text-xs text-[#2B2B2B]/75 truncate">
                                {u.university_id ? `${u.university_id} · ` : ''}
                                {u.school ? `${u.school} · ` : ''}
                                {u.programme} · {formatDegreeLabel(u.degree)}
                              </p>
                            </div>
                          </button>
                          {u.relationship === 'none' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await api.sendRequest(u.username);
                                showBanner(`Connection request sent to ${u.name}.`);
                                await refreshAllWorkspaceData();
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-md whitespace-nowrap shrink-0"
                            >
                              Connect
                            </button>
                          )}
                          {u.relationship === 'connected' && (
                            <span className="text-xs font-semibold text-[#006E53] whitespace-nowrap shrink-0">
                              Connected
                            </span>
                          )}
                          {u.relationship === 'outgoing_pending' && (
                            <span className="text-xs font-medium text-[#EC6E3C] whitespace-nowrap shrink-0">
                              Pending
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Toolbar Controls: Spicy News Icon, Undo Stack, Notifications Queue, Account Logout */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => navigateTo({ tab: 'spicy_news' })}
              title="Spicy News — Urgent University Bulletins & Latest News"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                route.tab === 'spicy_news'
                  ? 'bg-[#EC6E3C]/15 text-[#2B2B2B] border-[#EC6E3C]'
                  : 'bg-white hover:bg-[#EC6E3C]/12 text-[#2B2B2B] border-[#2B2B2B]/20'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-[#EC6E3C]" />
              <span>Spicy News</span>
              {announcements.length > 0 && (
                <span className="font-mono tabular-nums px-1.5 py-0.5 text-[11px] font-semibold bg-[#EC6E3C] text-[#2B2B2B] rounded-md">
                  {urgentCount > 0 ? urgentCount : announcements.length}
                </span>
              )}
            </button>

            {undoStatus.can_undo && (
              <button
                type="button"
                onClick={handleUndo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 border border-[#006E53] rounded-lg transition-opacity whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5 text-white" />
                <span>{undoStatus.label || 'Undo'}</span>
              </button>
            )}

            <div ref={notifBoxRef} className="relative">
              <button
                type="button"
                onClick={handleOpenNotifications}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Bell className="w-3.5 h-3.5 text-[#006E53]" />
                <span>Alerts</span>
                {unreadCount > 0 && (
                  <span className="font-mono tabular-nums px-1.5 py-0.5 text-[11px] font-semibold bg-[#EC6E3C] text-[#2B2B2B] rounded-md">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-1.5 w-80 sm:w-96 bg-white border border-[#2B2B2B]/20 rounded-xl shadow-lg z-40 overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#2B2B2B]/[0.03] border-b border-[#2B2B2B]/15 flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#2B2B2B]">
                      Notifications Queue
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-[#2B2B2B]/75">
                      {notifications.length} recent
                    </span>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-[#2B2B2B]/80">
                      No notifications yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#2B2B2B]/15 max-h-96 overflow-y-auto">
                      {notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            if (n.ntype === 'announcement' || n.ntype === 'spicy_news') {
                              navigateTo({ tab: 'spicy_news' });
                            } else if (
                              n.ntype === 'registration_request' ||
                              n.ntype === 'community_proposal' ||
                              n.ntype === 'password_reset_request'
                            ) {
                              navigateTo({ tab: 'governance' });
                            } else if (n.ntype.startsWith('community_')) {
                              navigateTo({ tab: 'communities' });
                            } else {
                              openStudentProfile(n.actor);
                            }
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-[#EC6E3C]/[0.06] flex items-start gap-3 transition-colors"
                        >
                          <Avatar name={n.actor_name} src={n.actor_avatar} size="xs" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-[#2B2B2B] leading-snug">{n.message}</p>
                            <p className="mt-1 text-[11px] font-mono tabular-nums text-[#2B2B2B]/75">
                              {formatRelativeTime(n.created_at)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 text-[#EC6E3C]" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Transient Action Feedback Banner */}
      {statusBanner && (
        <div className="max-w-[1280px] w-full mx-auto px-6 pt-4">
          <div className="px-4 py-2.5 bg-[#006E53]/10 text-[#2B2B2B] text-xs font-semibold rounded-lg flex items-center justify-between gap-4 border border-[#006E53]">
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-[#2B2B2B] hover:opacity-75"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-6">
        {route.tab === 'feed' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Primary Feed Column */}
            <div className="lg:col-span-8 space-y-5">
              <div className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-1 p-1 bg-white border border-[#2B2B2B]/25 rounded-lg">
                  {(
                    [
                      { id: 'all', label: 'All Campus Feed' },
                      { id: 'connections', label: 'Connections Only' },
                      { id: 'trending', label: 'Trending' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFeedMode(opt.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        feedMode === opt.id
                          ? 'bg-[#006E53] text-white'
                          : 'text-[#2B2B2B] hover:bg-[#EC6E3C]/12'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <span className="text-xs font-mono tabular-nums text-[#2B2B2B]/80">
                  {feedMode === 'trending'
                    ? 'Max-heap ranked across campus'
                    : feedMode === 'connections'
                      ? 'Heap-merged connections only'
                      : 'Open campus feed · Heap-merged newest first'}
                </span>
              </div>

              {feedLoading ? (
                <div className="space-y-4">
                  {[1, 2].map((idx) => (
                    <div
                      key={idx}
                      className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6 animate-pulse space-y-3"
                    >
                      <div className="h-4 w-44 bg-[#2B2B2B]/15 rounded-md" />
                      <div className="h-4 w-full bg-[#2B2B2B]/10 rounded-md" />
                      <div className="h-4 w-3/4 bg-[#2B2B2B]/10 rounded-md" />
                    </div>
                  ))}
                </div>
              ) : feedPosts.length === 0 ? (
                <div className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-10 text-center">
                  <p className="font-display text-base font-semibold text-[#2B2B2B]">
                    {feedMode === 'connections'
                      ? 'No posts from your direct connections yet'
                      : 'No campus posts yet'}
                  </p>
                  <p className="mt-1 text-sm text-[#2B2B2B]/80 max-w-md mx-auto">
                    {feedMode === 'connections'
                      ? 'Switch to All Campus Feed to read everyone across Chanakya University, or connect with classmates in Discover.'
                      : 'Be the first member on campus to publish a research update, prototype, or announcement.'}
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setComposeOpen(true)}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg whitespace-nowrap shrink-0"
                    >
                      Publish First Post
                    </button>
                    {feedMode === 'connections' ? (
                      <button
                        type="button"
                        onClick={() => setFeedMode('all')}
                        className="px-4 py-2 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg whitespace-nowrap shrink-0"
                      >
                        View All Campus Feed
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigateTo({ tab: 'discover' })}
                        className="px-4 py-2 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg whitespace-nowrap shrink-0"
                      >
                        Discover Peers
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {feedPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      currentUsername={currentUser.username}
                      onNavigateProfile={openStudentProfile}
                      onToggleLike={async (postId) => {
                        const res = await api.toggleLike(postId);
                        setFeedPosts((prev) =>
                          prev.map((p) =>
                            p.id === postId
                              ? { ...p, liked_by_me: res.liked_by_me, like_count: res.like_count }
                              : p,
                          ),
                        );
                      }}
                      onAddComment={async (postId, text, parentId) => {
                        const res = await api.addComment(postId, text, parentId);
                        setFeedPosts((prev) =>
                          prev.map((p) => (p.id === postId ? res.post : p)),
                        );
                      }}
                      onDeletePost={async (postId) => {
                        await api.deletePost(postId);
                        showBanner('Post deleted. You can restore it with Undo.');
                        await refreshAllWorkspaceData();
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right Sidebar */}
            <aside className="lg:col-span-4 space-y-5">
              {/* Spicy News / University Latest News Preview */}
              <div className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#2B2B2B]/15">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-[#EC6E3C] shrink-0" />
                    <h2 className="font-display text-sm font-semibold text-[#2B2B2B]">
                      Spicy News · Latest News
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateTo({ tab: 'spicy_news' })}
                    className="text-xs font-semibold text-[#006E53] hover:underline"
                  >
                    {currentUser.role === 'admin' ? 'Publish / View' : 'View all'}
                  </button>
                </div>
                {announcements.length === 0 ? (
                  <p className="mt-3 text-xs text-[#2B2B2B]/75">
                    No active university announcements.
                  </p>
                ) : (
                  <div className="mt-3 divide-y divide-[#2B2B2B]/15">
                    {announcements.slice(0, 2).map((ann) => (
                      <button
                        key={ann.id}
                        type="button"
                        onClick={() => navigateTo({ tab: 'spicy_news' })}
                        className="py-2.5 first:pt-0 last:pb-0 text-left w-full group"
                      >
                        <div className="flex items-center gap-2 text-[11px] font-medium">
                          {ann.priority === 'urgent' ? (
                            <span className="inline-flex items-center gap-1 text-[#EC6E3C] font-bold">
                              <AlertTriangle className="w-3 h-3" />
                              URGENT · SPICY NEWS
                            </span>
                          ) : ann.priority === 'important' ? (
                            <span className="text-[#006E53] font-bold">IMPORTANT</span>
                          ) : (
                            <span className="text-[#2B2B2B] font-semibold">UNIVERSITY NEWS</span>
                          )}
                          <span aria-hidden="true" className="text-[#2B2B2B]/40">·</span>
                          <span className="text-[#2B2B2B]/75 truncate">{ann.category}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-[#2B2B2B] group-hover:text-[#006E53] line-clamp-2">
                          {ann.title}
                        </p>
                        <p className="mt-1 text-[11px] font-mono tabular-nums text-[#2B2B2B]/70">
                          {formatRelativeTime(ann.created_at)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Member Identity Summary */}
              <div className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-5">
                <button
                  type="button"
                  onClick={() => openStudentProfile(currentUser.username)}
                  className="flex items-center gap-3 text-left w-full group"
                >
                  <Avatar name={currentUser.name} src={currentUser.avatar_url} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="font-display font-semibold text-[#2B2B2B] group-hover:text-[#006E53] truncate">
                        {currentUser.name}
                      </p>
                      <span className="text-[11px] font-bold text-[#006E53] shrink-0">
                        {currentUser.role === 'admin'
                          ? 'IT Admin'
                          : currentUser.role === 'faculty'
                            ? 'Faculty'
                            : 'Student'}
                      </span>
                    </div>
                    <p className="text-xs text-[#2B2B2B]/75 truncate">
                      {currentUser.school ? `${currentUser.school} · ` : ''}
                      {currentUser.programme}
                    </p>
                  </div>
                </button>
                <div className="mt-4 pt-3 border-t border-[#2B2B2B]/15 grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2 bg-white border border-[#2B2B2B]/20 rounded-lg">
                    <p className="text-[#2B2B2B]/75">Connections</p>
                    <p className="font-mono tabular-nums text-base font-semibold text-[#2B2B2B] mt-0.5">
                      {network.connections.length}
                    </p>
                  </div>
                  <div className="p-2 bg-white border border-[#2B2B2B]/20 rounded-lg">
                    <p className="text-[#2B2B2B]/75">Requests</p>
                    <p className="font-mono tabular-nums text-base font-semibold text-[#EC6E3C] mt-0.5">
                      {network.incoming_requests.length}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openStudentProfile(currentUser.username)}
                    className="p-2 bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg text-left transition-colors"
                  >
                    <p className="text-[#2B2B2B]/75">Portfolio</p>
                    <p className="font-mono tabular-nums text-base font-semibold text-[#006E53] mt-0.5">
                      {currentUser.portfolio_count ?? 0}
                    </p>
                  </button>
                </div>
              </div>

              {/* Pending Requests Queue Preview */}
              {network.incoming_requests.length > 0 && (
                <div className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-5">
                  <div className="flex items-center justify-between pb-3 border-b border-[#2B2B2B]/15">
                    <h2 className="font-display text-sm font-semibold text-[#2B2B2B]">
                      Pending Requests
                    </h2>
                    <button
                      type="button"
                      onClick={() => navigateTo({ tab: 'network' })}
                      className="text-xs font-semibold text-[#006E53] hover:underline"
                    >
                      Manage all
                    </button>
                  </div>
                  <div className="mt-3 divide-y divide-[#2B2B2B]/15">
                    {network.incoming_requests.slice(0, 3).map((req) => (
                      <div key={req.user.username} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => openStudentProfile(req.user.username)}
                            className="shrink-0"
                          >
                            <Avatar name={req.user.name} src={req.user.avatar_url} size="sm" />
                          </button>
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => openStudentProfile(req.user.username)}
                              className="text-sm font-semibold text-[#2B2B2B] hover:text-[#006E53] truncate block text-left"
                            >
                              {req.user.name}
                            </button>
                            <p className="text-xs text-[#2B2B2B]/75 truncate">
                              {req.user.programme} · {req.mutual_count || 0} mutuals
                            </p>
                          </div>
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await api.acceptRequest(req.user.username);
                              showBanner(`Connected with ${req.user.name}.`);
                              await refreshAllWorkspaceData();
                            }}
                            className="flex-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg transition-opacity"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await api.rejectRequest(req.user.username);
                              await refreshAllWorkspaceData();
                            }}
                            className="flex-1 px-3 py-1.5 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending Across Campus */}
              <div className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#2B2B2B]/15">
                  <h2 className="font-display text-sm font-semibold text-[#2B2B2B]">
                    Trending Across Campus
                  </h2>
                  <button
                    type="button"
                    onClick={() => setFeedMode('trending')}
                    className="text-xs font-semibold text-[#006E53] hover:underline"
                  >
                    View all
                  </button>
                </div>
                {trendingPosts.length === 0 ? (
                  <p className="mt-3 text-xs text-[#2B2B2B]/75">
                    No trending posts on campus yet.
                  </p>
                ) : (
                  <div className="mt-3 divide-y divide-[#2B2B2B]/15">
                    {trendingPosts.slice(0, 3).map((tp) => (
                      <div key={tp.id} className="py-2.5 first:pt-0 last:pb-0">
                        <button
                          type="button"
                          onClick={() => openStudentProfile(tp.author)}
                          className="text-left w-full group"
                        >
                          <p className="text-xs font-semibold text-[#2B2B2B] group-hover:text-[#006E53] line-clamp-2">
                            {tp.title || tp.content.slice(0, 72)}
                          </p>
                          <p className="mt-1 text-[11px] text-[#2B2B2B]/70 font-mono tabular-nums">
                            {tp.author_name} · {tp.like_count} likes · {tp.comment_count} comments
                          </p>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* People You May Know Top 3 */}
              <div className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#2B2B2B]/15">
                  <h2 className="font-display text-sm font-semibold text-[#2B2B2B]">
                    People You May Know
                  </h2>
                  <button
                    type="button"
                    onClick={() => navigateTo({ tab: 'discover' })}
                    className="text-xs font-semibold text-[#006E53] hover:underline"
                  >
                    See all
                  </button>
                </div>
                {suggestions.length === 0 ? (
                  <p className="mt-3 text-xs text-[#2B2B2B]/75">
                    You are connected with everyone currently registered.
                  </p>
                ) : (
                  <div className="mt-3 divide-y divide-[#2B2B2B]/15">
                    {suggestions.slice(0, 3).map((item) => (
                      <div
                        key={item.user.username}
                        className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => openStudentProfile(item.user.username)}
                          className="flex items-center gap-2.5 min-w-0 text-left flex-1"
                        >
                          <Avatar name={item.user.name} src={item.user.avatar_url} size="sm" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#2B2B2B] hover:text-[#006E53] truncate">
                              {item.user.name}
                            </p>
                            <p className="text-xs text-[#2B2B2B]/75 truncate">
                              {item.mutual_count} mutuals · {formatDegreeLabel(item.degree)}
                            </p>
                          </div>
                        </button>
                        {item.relationship === 'none' ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await api.sendRequest(item.user.username);
                              showBanner(`Connection request sent to ${item.user.name}.`);
                              await refreshAllWorkspaceData();
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-md whitespace-nowrap shrink-0"
                          >
                            Connect
                          </button>
                        ) : (
                          <span className="text-xs font-medium text-[#EC6E3C] whitespace-nowrap shrink-0">
                            Pending
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        {route.tab === 'network' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Incoming Requests Queue */}
              <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6">
                <div className="flex items-center justify-between pb-4 border-b border-[#2B2B2B]/15">
                  <div>
                    <h1 className="font-display text-lg font-semibold text-[#2B2B2B]">
                      Incoming Connection Requests
                    </h1>
                    <p className="text-xs text-[#2B2B2B]/80 mt-0.5">
                      FIFO queue of directed edges awaiting acceptance.
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-xs text-[#EC6E3C] font-semibold">
                    {network.incoming_requests.length} pending
                  </span>
                </div>

                {network.incoming_requests.length === 0 ? (
                  <p className="mt-5 text-sm text-[#2B2B2B]/80">No incoming requests right now.</p>
                ) : (
                  <div className="mt-4 divide-y divide-[#2B2B2B]/15">
                    {network.incoming_requests.map((req) => (
                      <div
                        key={req.user.username}
                        className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                      >
                        <button
                          type="button"
                          onClick={() => openStudentProfile(req.user.username)}
                          className="flex items-center gap-3 min-w-0 text-left flex-1"
                        >
                          <Avatar name={req.user.name} src={req.user.avatar_url} size="md" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#2B2B2B] hover:text-[#006E53] truncate">
                              {req.user.name}
                            </p>
                            <p className="text-xs text-[#2B2B2B]/80 truncate">
                              {req.user.programme} · {req.mutual_count || 0} mutual connections
                            </p>
                          </div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={async () => {
                              await api.acceptRequest(req.user.username);
                              showBanner(`Connected with ${req.user.name}.`);
                              await refreshAllWorkspaceData();
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg"
                          >
                            <Check className="w-3.5 h-3.5 text-white" />
                            <span>Accept</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await api.rejectRequest(req.user.username);
                              await refreshAllWorkspaceData();
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Outgoing Pending Requests */}
              <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6">
                <div className="flex items-center justify-between pb-4 border-b border-[#2B2B2B]/15">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-[#2B2B2B]">
                      Outgoing Requests
                    </h2>
                    <p className="text-xs text-[#2B2B2B]/80 mt-0.5">
                      Cancel any pending request before it is accepted.
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-xs text-[#006E53] font-semibold">
                    {network.outgoing_requests.length} sent
                  </span>
                </div>

                {network.outgoing_requests.length === 0 ? (
                  <p className="mt-5 text-sm text-[#2B2B2B]/80">No outgoing pending requests.</p>
                ) : (
                  <div className="mt-4 divide-y divide-[#2B2B2B]/15">
                    {network.outgoing_requests.map((req) => (
                      <div
                        key={req.user.username}
                        className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                      >
                        <button
                          type="button"
                          onClick={() => openStudentProfile(req.user.username)}
                          className="flex items-center gap-3 min-w-0 text-left flex-1"
                        >
                          <Avatar name={req.user.name} src={req.user.avatar_url} size="md" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#2B2B2B] hover:text-[#006E53] truncate">
                              {req.user.name}
                            </p>
                            <p className="text-xs text-[#2B2B2B]/80 truncate">
                              {req.user.programme} · @{req.user.username}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await api.cancelRequest(req.user.username);
                            showBanner(`Cancelled request to ${req.user.name}.`);
                            await refreshAllWorkspaceData();
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#EC6E3C] rounded-lg whitespace-nowrap shrink-0"
                        >
                          Cancel Request
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Degree & Shortest Connection Chain Explorer */}
            <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#2B2B2B]/15">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#2B2B2B]">
                    Shortest Chain &amp; Mutual Connections Explorer (BFS)
                  </h2>
                  <p className="text-xs text-[#2B2B2B]/80 mt-0.5">
                    Compute degree of connection and shortest path across the adjacency list graph.
                  </p>
                </div>
                <select
                  value={pathTarget}
                  onChange={(e) => setPathTarget(e.target.value)}
                  className="px-3.5 py-2 text-sm text-[#2B2B2B] bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53]"
                >
                  {allDirectoryUsers
                    .filter((u) => u.username !== currentUser.username)
                    .map((u) => (
                      <option key={u.username} value={u.username}>
                        {u.name} (@{u.username})
                      </option>
                    ))}
                </select>
              </div>

              {pathInspection && (
                <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-7 space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-[#2B2B2B]/80">Degree from you:</span>
                      <span className="font-mono font-semibold text-[#006E53]">
                        {formatDegreeLabel(pathInspection.degree)}
                      </span>
                    </div>
                    {pathInspection.shortest_path.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {pathInspection.shortest_path.map((step, idx) => (
                          <div key={step.username} className="flex items-center gap-2">
                            {idx > 0 && <ArrowRight className="w-4 h-4 text-[#EC6E3C]" />}
                            <button
                              type="button"
                              onClick={() => openStudentProfile(step.username)}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg text-xs font-medium text-[#2B2B2B] transition-colors"
                            >
                              <Avatar name={step.name} src={step.avatar_url} size="xs" />
                              <span>{step.name}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[#2B2B2B]/80">
                        No connecting chain exists yet. Send a request to bridge your networks!
                      </p>
                    )}
                  </div>

                  <div className="lg:col-span-5 lg:border-l lg:border-[#2B2B2B]/15 lg:pl-6">
                    <p className="text-xs font-semibold text-[#2B2B2B]">
                      Mutual Connections ({pathInspection.mutual_connections.length})
                    </p>
                    {pathInspection.mutual_connections.length === 0 ? (
                      <p className="mt-1.5 text-xs text-[#2B2B2B]/80">None in common yet.</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {pathInspection.mutual_connections.map((m) => (
                          <button
                            key={m.username}
                            type="button"
                            onClick={() => openStudentProfile(m.username)}
                            className="px-2.5 py-1 text-xs font-medium text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg"
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Accepted Connections Roster */}
            <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6">
              <div className="flex items-center justify-between pb-4 border-b border-[#2B2B2B]/15">
                <h2 className="font-display text-lg font-semibold text-[#2B2B2B]">
                  Your Connections ({network.connections.length})
                </h2>
              </div>

              {network.connections.length === 0 ? (
                <p className="mt-5 text-sm text-[#2B2B2B]/80">
                  You do not have any connections yet. Visit Discover to connect with classmates.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {network.connections.map((conn) => (
                    <div
                      key={conn.username}
                      className="p-4 bg-white border border-[#2B2B2B]/20 rounded-xl flex items-start justify-between gap-4"
                    >
                      <button
                        type="button"
                        onClick={() => openStudentProfile(conn.username)}
                        className="flex items-start gap-3 min-w-0 text-left flex-1"
                      >
                        <Avatar name={conn.name} src={conn.avatar_url} size="md" />
                        <div className="min-w-0">
                          <p className="font-semibold text-[#2B2B2B] hover:text-[#006E53] truncate">
                            {conn.name}
                          </p>
                          <p className="text-xs text-[#2B2B2B]/80 truncate">
                            {conn.programme} · {conn.year}
                          </p>
                          <p className="mt-1 text-xs text-[#2B2B2B]/80 line-clamp-2">{conn.bio}</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await api.removeConnection(conn.username);
                          showBanner(`Removed ${conn.name} from your connections (Undo available).`);
                          await refreshAllWorkspaceData();
                        }}
                        title="Remove connection"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#2B2B2B] bg-[#FFFFFF] hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <UserMinus className="w-3.5 h-3.5 text-[#EC6E3C]" />
                        <span>Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {route.tab === 'discover' && (
          <div className="space-y-6">
            <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#2B2B2B]/15">
                <div>
                  <h1 className="font-display text-xl font-bold text-[#2B2B2B]">
                    People You May Know
                  </h1>
                  <p className="text-xs text-[#2B2B2B]/80 mt-1">
                    Ranked in memory using Adamic-Adar mutual connections, multi-hop BFS distance, shared skills, and school/programme overlap.
                  </p>
                </div>
                <span className="font-mono tabular-nums text-xs text-[#006E53] font-semibold">
                  {suggestions.length} suggestions
                </span>
              </div>

              {suggestions.length === 0 ? (
                <p className="mt-5 text-sm text-[#2B2B2B]/80">
                  No additional peers to suggest right now.
                </p>
              ) : (
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {suggestions.map((item) => (
                    <div
                      key={item.user.username}
                      className="p-5 bg-white border border-[#2B2B2B]/20 rounded-xl flex flex-col justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => openStudentProfile(item.user.username)}
                            className="flex items-start gap-3 min-w-0 text-left flex-1"
                          >
                            <Avatar name={item.user.name} src={item.user.avatar_url} size="md" />
                            <div className="min-w-0">
                              <p className="font-display font-semibold text-[#2B2B2B] hover:text-[#006E53] truncate">
                                {item.user.name}
                              </p>
                              <p className="text-xs text-[#2B2B2B]/80 truncate">
                                {item.user.school ? `${item.user.school} · ` : ''}
                                {item.user.programme} · {item.user.year}
                              </p>
                            </div>
                          </button>

                          {item.relationship === 'none' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await api.sendRequest(item.user.username);
                                showBanner(`Request sent to ${item.user.name}.`);
                                await refreshAllWorkspaceData();
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg whitespace-nowrap shrink-0"
                            >
                              <UserPlus className="w-3.5 h-3.5 text-white" />
                              <span>Connect</span>
                            </button>
                          )}
                          {item.relationship === 'outgoing_pending' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await api.cancelRequest(item.user.username);
                                await refreshAllWorkspaceData();
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-[#2B2B2B] bg-[#FFFFFF] hover:bg-[#EC6E3C]/12 border border-[#EC6E3C] rounded-lg whitespace-nowrap shrink-0"
                            >
                              Pending (Cancel)
                            </button>
                          )}
                          {item.relationship === 'incoming_pending' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await api.acceptRequest(item.user.username);
                                await refreshAllWorkspaceData();
                              }}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg whitespace-nowrap shrink-0"
                            >
                              Accept Request
                            </button>
                          )}
                        </div>

                        <p className="mt-3 text-sm text-[#2B2B2B] leading-relaxed line-clamp-2">
                          {item.user.bio || 'Chanakya University member'}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-[#2B2B2B]/15 space-y-1.5 text-xs text-[#2B2B2B]/80">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono tabular-nums">
                          <span className="text-[#006E53] font-semibold">
                            {formatDegreeLabel(item.degree)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.mutual_count} mutuals</span>
                          <span aria-hidden="true">·</span>
                          <span>Rank {item.score.toFixed(2)}</span>
                        </div>
                        {item.mutual_names.length > 0 && (
                          <p className="text-xs text-[#2B2B2B]/80">
                            Mutual: {item.mutual_names.slice(0, 3).join(', ')}
                          </p>
                        )}
                        {item.shared_skills.length > 0 && (
                          <p className="text-xs text-[#EC6E3C] font-semibold">
                            Shared skills: {item.shared_skills.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {graphSnapshot && (
              <CampusGraphCanvas
                graph={graphSnapshot}
                viewerUsername={currentUser.username}
                highlightedPath={pathInspection?.shortest_path.map((s) => s.username)}
                onSelectUser={openStudentProfile}
              />
            )}
          </div>
        )}

        {route.tab === 'communities' && (() => {
          const visibleCommunities =
            selectedSchoolCategory === 'ALL'
              ? managedCommunities
              : managedCommunities.filter((c) => c.category === selectedSchoolCategory);

          return (
          <div className="space-y-6">
            {/* Official University Communities Header + School Categories + Create Proposal Request */}
            <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#2B2B2B]/15">
                <div>
                  <h1 className="font-display text-xl font-bold text-[#2B2B2B]">
                    Chanakya University Communities by School
                  </h1>
                  <p className="text-xs text-[#2B2B2B]/80 mt-1">
                    Communities are categorized by School and open to students from every School by default unless the Community Host or IT Admin restricts access to a specific School.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  {currentUser.role === 'admin' && (adminOverview?.community_proposals?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => navigateTo({ tab: 'governance' })}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#EC6E3C] rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[#EC6E3C]" />
                      <span>
                        Assess Proposals ({adminOverview?.community_proposals?.length})
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCreateCommunityOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg transition-opacity whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 text-white" />
                    <span>{createCommunityOpen ? 'Close Form' : 'Request New Community'}</span>
                  </button>
                </div>
              </div>

              {createCommunityOpen && (
                <form
                  onSubmit={handleProposeCommunity}
                  className="p-5 bg-[#EC6E3C]/[0.06] border border-[#2B2B2B]/15 rounded-xl space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-sm font-semibold text-[#2B2B2B]">
                      Request Permission to Start a New Community
                    </h2>
                    <span className="text-xs text-[#006E53] font-medium">
                      Sent to IT Admin FIFO review queue · Proposer becomes Community Leader
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                        Community Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={commName}
                        onChange={(e) => setCommName(e.target.value)}
                        placeholder="e.g. Chanakya Quantum Computing Guild"
                        className="w-full px-3 py-2 text-sm text-[#2B2B2B] placeholder:text-[#2B2B2B]/50 bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                        School Category *
                      </label>
                      <select
                        value={commCategory}
                        onChange={(e) => {
                          const nextCat = e.target.value;
                          setCommCategory(nextCat);
                          if ((CHANAKYA_SCHOOLS as readonly string[]).includes(nextCat)) {
                            setCommAllowedSchool(nextCat);
                          }
                        }}
                        className="w-full px-3 py-2 text-sm text-[#2B2B2B] bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53]"
                      >
                        {COMMUNITY_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* School Access Policy Selection */}
                  <div className="p-3.5 bg-white border border-[#2B2B2B]/20 rounded-xl space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#2B2B2B]">
                        Who Can Request to Join This Community?
                      </span>
                      <span className="text-[11px] text-[#2B2B2B]/75">
                        Open across all schools by default; Host or IT Admin can update anytime
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCommSchoolRestricted(false)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                          !commSchoolRestricted
                            ? 'bg-[#006E53] text-white border-[#006E53]'
                            : 'bg-[#FFFFFF] text-[#2B2B2B] border-[#2B2B2B]/15 hover:bg-[#EC6E3C]/10'
                        }`}
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Open to All Schools (Recommended)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCommSchoolRestricted(true);
                          if ((CHANAKYA_SCHOOLS as readonly string[]).includes(commCategory)) {
                            setCommAllowedSchool(commCategory);
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                          commSchoolRestricted
                            ? 'bg-[#EC6E3C]/15 text-[#2B2B2B] border-[#EC6E3C] font-semibold'
                            : 'bg-[#FFFFFF] text-[#2B2B2B] border-[#2B2B2B]/15 hover:bg-[#EC6E3C]/10'
                        }`}
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Restrict to Specific School Only</span>
                      </button>
                    </div>
                    {commSchoolRestricted && (
                      <div className="pt-1">
                        <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                          Eligible School *
                        </label>
                        <select
                          value={commAllowedSchool}
                          onChange={(e) => setCommAllowedSchool(e.target.value)}
                          className="w-full sm:w-auto min-w-[280px] px-3 py-1.5 text-xs text-[#2B2B2B] bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53]"
                        >
                          {CHANAKYA_SCHOOLS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                      Purpose &amp; Description *
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={commDescription}
                      onChange={(e) => setCommDescription(e.target.value)}
                      placeholder="Describe what members will build, research, or collaborate on..."
                      className="w-full px-3 py-2 text-sm text-[#2B2B2B] placeholder:text-[#2B2B2B]/50 bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                        Leadership Charter / Weekly Activity
                      </label>
                      <input
                        type="text"
                        value={commCharter}
                        onChange={(e) => setCommCharter(e.target.value)}
                        placeholder="e.g. Weekly lab sprints & peer paper reviews"
                        className="w-full px-3 py-2 text-sm text-[#2B2B2B] placeholder:text-[#2B2B2B]/50 bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                        Focus Tags (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={commTagsInput}
                        onChange={(e) => setCommTagsInput(e.target.value)}
                        placeholder="e.g. Robotics, AI, Embedded Systems"
                        className="w-full px-3 py-2 text-sm text-[#2B2B2B] placeholder:text-[#2B2B2B]/50 bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setCreateCommunityOpen(false)}
                      className="px-3.5 py-2 text-xs font-medium text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/10 border border-[#2B2B2B]/20 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={commSubmitting || !commName.trim() || !commDescription.trim()}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-50 rounded-lg transition-opacity whitespace-nowrap"
                    >
                      {commSubmitting ? 'Sending to Admin...' : 'Submit Community Request to IT Admin'}
                    </button>
                  </div>
                </form>
              )}

              {/* School Category Filter Bar */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#2B2B2B]">
                  Browse Communities by School Category
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSchoolCategory('ALL')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                      selectedSchoolCategory === 'ALL'
                        ? 'bg-[#006E53] text-white border-[#006E53]'
                        : 'bg-white text-[#2B2B2B] border-[#2B2B2B]/15 hover:bg-[#EC6E3C]/10'
                    }`}
                  >
                    All Schools ({managedCommunities.length})
                  </button>
                  {COMMUNITY_CATEGORIES.map((cat) => {
                    const count = managedCommunities.filter((c) => c.category === cat).length;
                    const isActive = selectedSchoolCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedSchoolCategory(cat)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                          isActive
                            ? 'bg-[#006E53] text-white border-[#006E53]'
                            : 'bg-white text-[#2B2B2B] border-[#2B2B2B]/15 hover:bg-[#EC6E3C]/10'
                        }`}
                      >
                        {cat} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {myCommunityProposals.length > 0 && (
                <div className="p-4 bg-white border border-[#EC6E3C] rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[#2B2B2B] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#EC6E3C]" />
                      <span>Your Pending Community Creation Requests</span>
                    </p>
                    <span className="font-mono tabular-nums text-[11px] text-[#EC6E3C] font-semibold">
                      {myCommunityProposals.length} awaiting IT Admin approval
                    </span>
                  </div>
                  <div className="divide-y divide-[#2B2B2B]/15">
                    {myCommunityProposals.map((prop) => (
                      <div key={prop.id} className="py-2 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-[#2B2B2B]">
                            {prop.name}
                          </span>
                          <span className="text-[11px] font-medium text-[#2B2B2B]/75">
                            {prop.category} ·{' '}
                            {prop.school_restricted
                              ? `Restricted to ${prop.allowed_school || prop.category}`
                              : 'Open to All Schools'}{' '}
                            · Submitted {formatRelativeTime(prop.created_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#2B2B2B]/85">{prop.description}</p>
                        <p className="mt-1 text-[11px] font-semibold text-[#006E53]">
                          Once IT Admin approves, you will automatically be assigned as Community Leader.
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {visibleCommunities.length === 0 ? (
                <div className="py-8 text-center">
                  <Users className="w-6 h-6 text-[#006E53] mx-auto" />
                  <p className="mt-2 text-sm text-[#2B2B2B]/80">
                    {selectedSchoolCategory === 'ALL'
                      ? 'No official communities launched yet. Submit a request to start the first one!'
                      : `No communities under ${selectedSchoolCategory} yet. Submit a proposal to start one!`}
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {visibleCommunities.map((comm) => {
                    const isLeader = comm.my_status === 'leader';
                    const isMember = comm.my_status === 'member';
                    const isAdmin = currentUser.role === 'admin';
                    const canManage = isLeader || isAdmin;
                    const canMessage = isLeader || isMember || isAdmin;
                    const canJoinHere = comm.can_request_join !== false;
                    const defaultPolicySchool =
                      comm.allowed_school ||
                      ((CHANAKYA_SCHOOLS as readonly string[]).includes(comm.category)
                        ? comm.category
                        : CHANAKYA_SCHOOLS[0]);
                    const selectedPolicySchool =
                      communityPolicySchoolDrafts[comm.id] ?? defaultPolicySchool;

                    return (
                      <article
                        key={comm.id}
                        className="p-5 border border-[#2B2B2B]/15 rounded-xl space-y-4 bg-[#FFFFFF]"
                      >
                        {/* Header & Membership Action */}
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                              <h2 className="font-display text-lg font-bold text-[#2B2B2B]">
                                {comm.name}
                              </h2>
                              {comm.is_suspended && (
                                <span className="px-2 py-0.5 text-xs font-semibold text-[#2B2B2B] bg-[#EC6E3C]/15 border border-[#EC6E3C] rounded-md">
                                  Suspended by IT Admin
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#2B2B2B]/80">
                              <span className="font-medium text-[#2B2B2B]">{comm.category}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-[#006E53]">
                                {comm.school_restricted
                                  ? `Restricted: ${comm.allowed_school || comm.category} Only`
                                  : 'Open to All Schools'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {comm.member_count} {comm.member_count === 1 ? 'member' : 'members'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {comm.internal_edges} graph connections
                              </span>
                              <span aria-hidden="true">·</span>
                              <button
                                type="button"
                                onClick={() => openStudentProfile(comm.leader)}
                                className="font-semibold text-[#006E53] hover:text-[#EC6E3C] hover:underline transition-colors"
                              >
                                Community Leader: {comm.leader_name} (@{comm.leader})
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            {comm.my_status === 'leader' && (
                              <span className="px-3 py-1.5 text-xs font-semibold text-[#006E53] bg-[#006E53]/10 border border-[#006E53] rounded-md whitespace-nowrap shrink-0">
                                You Lead This Community
                              </span>
                            )}

                            {comm.my_status === 'member' && (
                              <>
                                <span className="text-xs font-semibold text-[#006E53] whitespace-nowrap shrink-0">
                                  Member
                                </span>
                                <button
                                  type="button"
                                  disabled={communityBusyId === comm.id}
                                  onClick={async () => {
                                    setCommunityBusyId(comm.id);
                                    try {
                                      const res = await api.leaveCommunity(comm.id);
                                      showBanner(res.message);
                                      await refreshAllWorkspaceData();
                                    } finally {
                                      setCommunityBusyId(null);
                                    }
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/10 border border-[#2B2B2B]/20 rounded-lg whitespace-nowrap shrink-0"
                                >
                                  Leave Community
                                </button>
                              </>
                            )}

                            {comm.my_status === 'pending' && (
                              <button
                                type="button"
                                disabled={communityBusyId === comm.id}
                                onClick={async () => {
                                  setCommunityBusyId(comm.id);
                                  try {
                                    const res = await api.cancelJoinCommunity(comm.id);
                                    showBanner(res.message);
                                    await refreshAllWorkspaceData();
                                  } finally {
                                    setCommunityBusyId(null);
                                  }
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-[#2B2B2B] bg-[#EC6E3C]/10 hover:bg-[#EC6E3C]/20 border border-[#EC6E3C] rounded-lg whitespace-nowrap shrink-0"
                              >
                                Pending Review · Cancel
                              </button>
                            )}

                            {comm.my_status === 'none' && !comm.is_suspended && canJoinHere && (
                              <button
                                type="button"
                                onClick={() => {
                                  setJoiningCommunityId(
                                    joiningCommunityId === comm.id ? null : comm.id,
                                  );
                                  setJoinInterestText('');
                                }}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg transition-opacity whitespace-nowrap shrink-0"
                              >
                                <UserPlus className="w-3.5 h-3.5 text-white" />
                                <span>Join Community</span>
                              </button>
                            )}

                            {comm.my_status === 'none' && !comm.is_suspended && !canJoinHere && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2B2B2B] bg-white border border-[#2B2B2B]/25 rounded-md whitespace-nowrap shrink-0">
                                <Lock className="w-3.5 h-3.5 text-[#EC6E3C]" />
                                <span>{comm.allowed_school || comm.category} Only</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Host / Admin School Access Policy Control */}
                        {canManage && (
                          <div className="p-3 bg-[#EC6E3C]/[0.06] border border-[#2B2B2B]/15 rounded-lg flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-[#2B2B2B]">
                              <span className="font-semibold">
                                School Access Control (Host / Admin):
                              </span>{' '}
                              {comm.school_restricted
                                ? `Currently limited to ${comm.allowed_school || comm.category} members only.`
                                : 'Open — students from every School can request to join.'}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {comm.school_restricted ? (
                                <button
                                  type="button"
                                  disabled={communityBusyId === comm.id}
                                  onClick={() => handleUpdateCommunityAccessPolicy(comm.id, false)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0"
                                >
                                  <Globe className="w-3.5 h-3.5 text-white" />
                                  <span>Open to All Schools</span>
                                </button>
                              ) : (
                                <>
                                  <select
                                    value={selectedPolicySchool}
                                    onChange={(e) =>
                                      setCommunityPolicySchoolDrafts((prev) => ({
                                        ...prev,
                                        [comm.id]: e.target.value,
                                      }))
                                    }
                                    className="px-2.5 py-1.5 text-xs text-[#2B2B2B] bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53]"
                                  >
                                    {CHANAKYA_SCHOOLS.map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    disabled={communityBusyId === comm.id}
                                    onClick={() =>
                                      handleUpdateCommunityAccessPolicy(
                                        comm.id,
                                        true,
                                        selectedPolicySchool,
                                      )
                                    }
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#2B2B2B] bg-[#EC6E3C]/15 hover:bg-[#EC6E3C]/25 border border-[#EC6E3C] disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0"
                                  >
                                    <Lock className="w-3.5 h-3.5 text-[#EC6E3C]" />
                                    <span>Restrict to This School</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {comm.my_status === 'none' && !canJoinHere && comm.join_restriction_reason && (
                          <div className="px-3 py-2 bg-[#EC6E3C]/[0.08] border border-[#EC6E3C] rounded-lg text-xs text-[#2B2B2B]">
                            {comm.join_restriction_reason}
                          </div>
                        )}

                        {/* Description, Charter & Tags */}
                        <div className="space-y-1.5">
                          <p className="text-sm text-[#2B2B2B] leading-relaxed">
                            {comm.description}
                          </p>
                          {comm.charter && comm.charter !== comm.description && (
                            <p className="text-xs text-[#2B2B2B]/80">
                              <span className="font-semibold text-[#2B2B2B]">Charter:</span>{' '}
                              {comm.charter}
                            </p>
                          )}
                          {comm.tags.length > 0 && (
                            <p className="text-xs text-[#006E53] font-semibold">
                              Focus: {comm.tags.join(' · ')}
                            </p>
                          )}
                        </div>

                        {/* Pending interest confirmation for applicant */}
                        {comm.my_status === 'pending' && comm.my_pending_interest && (
                          <div className="p-3 bg-white border border-[#EC6E3C] rounded-lg text-xs text-[#2B2B2B]">
                            <span className="font-semibold">
                              Your join request is awaiting leader {comm.leader_name}:
                            </span>{' '}
                            &ldquo;{comm.my_pending_interest}&rdquo;
                          </div>
                        )}

                        {/* Inline Join-with-Interest Prompt */}
                        {joiningCommunityId === comm.id && (
                          <div className="p-4 bg-[#EC6E3C]/[0.06] border border-[#2B2B2B]/15 rounded-xl space-y-3">
                            <p className="text-xs font-semibold text-[#2B2B2B]">
                              Share your interest with Community Leader {comm.leader_name}
                            </p>
                            <textarea
                              rows={2}
                              value={joinInterestText}
                              onChange={(e) => setJoinInterestText(e.target.value)}
                              placeholder="Explain why you want to join and what skills, coursework, or project interest you bring..."
                              className="w-full px-3 py-2 text-sm text-[#2B2B2B] placeholder:text-[#2B2B2B]/50 bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] resize-none"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setJoiningCommunityId(null);
                                  setJoinInterestText('');
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/10 border border-[#2B2B2B]/20 rounded-lg"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={joinSubmitting || joinInterestText.trim().length < 5}
                                onClick={() => handleSubmitJoinCommunity(comm.id)}
                                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-50 rounded-lg whitespace-nowrap"
                              >
                                {joinSubmitting ? 'Sending...' : 'Send Join Request to Leader'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Leader / Admin Join Request Review Queue (FIFO) */}
                        {canManage && comm.pending_join_requests.length > 0 && (
                          <div className="pt-3 border-t border-[#2B2B2B]/15 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <h3 className="text-xs font-semibold text-[#2B2B2B] flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-[#EC6E3C]" />
                                <span>
                                  Join Requests Awaiting Leader Review ({comm.pending_join_requests.length})
                                </span>
                              </h3>
                              <span className="text-[11px] font-mono text-[#006E53]">
                                FIFO queue with stated interest
                              </span>
                            </div>
                            <div className="divide-y divide-[#2B2B2B]/15 bg-white border border-[#2B2B2B]/20 rounded-xl px-4">
                              {comm.pending_join_requests.map((req) => (
                                <div
                                  key={req.username}
                                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                >
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-baseline gap-x-2">
                                      <button
                                        type="button"
                                        onClick={() => openStudentProfile(req.username)}
                                        className="text-xs font-semibold text-[#2B2B2B] hover:text-[#006E53] hover:underline"
                                      >
                                        {req.name}
                                      </button>
                                      <span className="text-[11px] font-mono text-[#2B2B2B]/75">
                                        @{req.username}
                                      </span>
                                      <span className="text-[11px] text-[#2B2B2B]/75">
                                        {req.programme} · {req.year}
                                      </span>
                                    </div>
                                    <p className="text-xs text-[#2B2B2B] bg-[#EC6E3C]/[0.06] border border-[#2B2B2B]/15 rounded-lg px-2.5 py-1.5">
                                      <span className="font-semibold">
                                        Interest in joining:
                                      </span>{' '}
                                      {req.interest}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      disabled={communityBusyId === comm.id}
                                      onClick={async () => {
                                        setCommunityBusyId(comm.id);
                                        try {
                                          const res = await api.acceptCommunityJoin(
                                            comm.id,
                                            req.username,
                                          );
                                          showBanner(res.message);
                                          await refreshAllWorkspaceData();
                                        } finally {
                                          setCommunityBusyId(null);
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg whitespace-nowrap"
                                    >
                                      <Check className="w-3.5 h-3.5 text-white" />
                                      <span>Accept</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={communityBusyId === comm.id}
                                      onClick={async () => {
                                        setCommunityBusyId(comm.id);
                                        try {
                                          const res = await api.rejectCommunityJoin(
                                            comm.id,
                                            req.username,
                                          );
                                          showBanner(res.message);
                                          await refreshAllWorkspaceData();
                                        } finally {
                                          setCommunityBusyId(null);
                                        }
                                      }}
                                      className="px-3 py-1.5 text-xs font-medium text-[#2B2B2B] bg-[#FFFFFF] hover:bg-[#EC6E3C]/10 border border-[#2B2B2B]/20 rounded-lg whitespace-nowrap"
                                    >
                                      Decline
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Members Roster */}
                        <div className="pt-3 border-t border-[#2B2B2B]/15 space-y-2">
                          <p className="text-xs font-semibold text-[#2B2B2B]">
                            Community Members ({comm.member_count})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {comm.members.map((member) => (
                              <div
                                key={member.username}
                                className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-white border border-[#2B2B2B]/20 rounded-lg"
                              >
                                <button
                                  type="button"
                                  onClick={() => openStudentProfile(member.username)}
                                  className="inline-flex items-center gap-2 text-left hover:underline"
                                >
                                  <Avatar name={member.name} src={member.avatar_url} size="xs" />
                                  <span className="text-xs font-medium text-[#2B2B2B]">
                                    {member.name}
                                    {member.username === comm.leader ? ' (Leader)' : ''}
                                  </span>
                                </button>
                                {canManage && member.username !== comm.leader && (
                                  <button
                                    type="button"
                                    title={`Remove ${member.name}`}
                                    disabled={communityBusyId === comm.id}
                                    onClick={async () => {
                                      setCommunityBusyId(comm.id);
                                      try {
                                        const res = await api.removeCommunityMember(
                                          comm.id,
                                          member.username,
                                        );
                                        showBanner(res.message);
                                        await refreshAllWorkspaceData();
                                      } finally {
                                        setCommunityBusyId(null);
                                      }
                                    }}
                                    className="text-[#EC6E3C] hover:opacity-75"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Community Messages & Admin Supervision Updates */}
                        <div className="pt-3 border-t border-[#2B2B2B]/15 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-[#2B2B2B] flex items-center gap-1.5">
                              <MessageSquare className="w-3.5 h-3.5 text-[#006E53]" />
                              <span>Community Updates &amp; Admin Supervision</span>
                            </p>
                            <span className="text-[11px] font-mono tabular-nums text-[#2B2B2B]/75">
                              {comm.messages.length} messages
                            </span>
                          </div>

                          {comm.messages.length > 0 && (
                            <div className="space-y-2 max-h-56 overflow-y-auto">
                              {comm.messages.slice(0, 6).map((msg) => (
                                <div
                                  key={msg.id}
                                  className={`px-3 py-2 rounded-lg text-xs border ${
                                    msg.is_admin_notice
                                      ? 'bg-[#006E53]/10 border-[#006E53]'
                                      : 'bg-white border-[#2B2B2B]/15'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <span className="font-semibold text-[#2B2B2B]">
                                      {msg.author_name}
                                      {msg.is_admin_notice
                                        ? ' · IT Admin Supervision'
                                        : msg.author === comm.leader
                                          ? ' · Leader'
                                          : ''}
                                    </span>
                                    <span className="font-mono tabular-nums text-[11px] text-[#2B2B2B]/70">
                                      {formatRelativeTime(msg.created_at)}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[#2B2B2B] leading-snug">{msg.content}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {canMessage && (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={communityMessageDrafts[comm.id] || ''}
                                onChange={(e) =>
                                  setCommunityMessageDrafts((prev) => ({
                                    ...prev,
                                    [comm.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSendCommunityMessage(comm.id);
                                  }
                                }}
                                placeholder={
                                  isAdmin
                                    ? 'Send an IT Admin supervision directive to this community...'
                                    : 'Share an update or discussion note with community members...'
                                }
                                className="flex-1 px-3 py-2 text-xs text-[#2B2B2B] placeholder:text-[#2B2B2B]/50 bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53]"
                              />
                              <button
                                type="button"
                                disabled={
                                  communityBusyId === comm.id ||
                                  !(communityMessageDrafts[comm.id] || '').trim()
                                }
                                onClick={() => handleSendCommunityMessage(comm.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0"
                              >
                                <Send className="w-3.5 h-3.5 text-white" />
                                <span>{isAdmin ? 'Send Notice' : 'Send'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* DSA Label Propagation Detected Circles */}
            <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#2B2B2B]/15">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#2B2B2B]">
                    Graph-Detected Network Circles (Label Propagation)
                  </h2>
                  <p className="text-xs text-[#2B2B2B]/80 mt-1">
                    Tightly connected student clusters discovered automatically from the SocialGraph adjacency list.
                  </p>
                </div>
                <span className="font-mono tabular-nums text-xs text-[#006E53] font-semibold">
                  {communities.length} circles detected
                </span>
              </div>

              {communities.length === 0 ? (
                <div className="py-8 text-center">
                  <Users className="w-6 h-6 text-[#006E53] mx-auto" />
                  <p className="mt-2 text-sm text-[#2B2B2B]/80">
                    Network circles emerge once students form connected clusters.
                  </p>
                </div>
              ) : (
                <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {communities.map((comm) => (
                    <div
                      key={comm.id}
                      className="p-5 bg-white border border-[#2B2B2B]/20 rounded-xl flex flex-col justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-display text-base font-semibold text-[#2B2B2B]">
                              {comm.name}
                            </h3>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[#2B2B2B]/75 font-mono tabular-nums">
                              <span>{comm.member_count} members</span>
                              <span aria-hidden="true">·</span>
                              <span>{comm.internal_edges} internal edges</span>
                              <span aria-hidden="true">·</span>
                              <span>Density {(comm.density * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                          {comm.includes_me && (
                            <span className="text-xs font-semibold text-[#006E53] whitespace-nowrap shrink-0">
                              Your Circle
                            </span>
                          )}
                        </div>

                        {comm.top_skills.length > 0 && (
                          <p className="mt-3 text-xs text-[#2B2B2B] font-medium">
                            Focus areas: {comm.top_skills.join(' · ')}
                          </p>
                        )}
                      </div>

                      <div className="pt-3 border-t border-[#2B2B2B]/15 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {comm.members.map((member) => (
                          <button
                            key={member.username}
                            type="button"
                            onClick={() => openStudentProfile(member.username)}
                            className="flex items-center gap-2.5 p-2 text-left rounded-lg bg-[#FFFFFF] hover:bg-[#EC6E3C]/10 border border-[#2B2B2B]/15 transition-colors"
                          >
                            <Avatar name={member.name} src={member.avatar_url} size="xs" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#2B2B2B] truncate">
                                {member.name}
                              </p>
                              <p className="text-[11px] text-[#2B2B2B]/75 truncate">
                                {member.programme}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          );
        })()}

        {route.tab === 'spicy_news' && (
          <div className="space-y-6">
            <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#2B2B2B]/15">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-lg bg-[#EC6E3C]/12 border border-[#EC6E3C] text-[#EC6E3C] shrink-0">
                    <Flame className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="font-display text-xl font-bold text-[#2B2B2B]">
                      Spicy News — University Latest News &amp; Urgent Bulletins
                    </h1>
                    <p className="text-xs text-[#2B2B2B]/80 mt-1">
                      Official campus-wide announcements and urgent IT or academic bulletins broadcast across Chanakya University.
                    </p>
                  </div>
                </div>
                <span className="font-mono tabular-nums text-xs text-[#EC6E3C] font-semibold">
                  {announcements.length} {announcements.length === 1 ? 'bulletin' : 'bulletins'}
                </span>
              </div>

              {currentUser.role === 'admin' && (
                <form
                  onSubmit={handlePublishSpicyNews}
                  className="p-5 bg-[#EC6E3C]/[0.06] border border-[#2B2B2B]/15 rounded-xl space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#2B2B2B]">
                      <Megaphone className="w-4 h-4 text-[#EC6E3C]" />
                      <span>Publish University-Wide Spicy News</span>
                    </div>
                    <span className="text-xs text-[#006E53] font-medium">
                      Notifies all active students and faculty
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                        Announcement Headline
                      </label>
                      <input
                        type="text"
                        required
                        value={newsTitle}
                        onChange={(e) => setNewsTitle(e.target.value)}
                        placeholder="e.g. Urgent Campus Wi-Fi Core Upgrade Tonight 11 PM"
                        className="w-full px-3 py-2 text-sm text-[#2B2B2B] placeholder:text-[#2B2B2B]/50 bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                        Category
                      </label>
                      <input
                        type="text"
                        value={newsCategory}
                        onChange={(e) => setNewsCategory(e.target.value)}
                        placeholder="IT & Campus Alert"
                        className="w-full px-3 py-2 text-sm text-[#2B2B2B] placeholder:text-[#2B2B2B]/50 bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#2B2B2B] mb-1.5">
                      Priority Level
                    </label>
                    <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#2B2B2B]/20 rounded-lg">
                      {(
                        [
                          { id: 'urgent', label: 'Urgent (Spicy News)' },
                          { id: 'important', label: 'Important' },
                          { id: 'general', label: 'General News' },
                        ] as const
                      ).map((lvl) => (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => setNewsPriority(lvl.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            newsPriority === lvl.id
                              ? lvl.id === 'urgent'
                                ? 'bg-[#EC6E3C] text-[#2B2B2B] font-semibold'
                                : 'bg-[#006E53] text-white'
                              : 'text-[#2B2B2B] hover:bg-[#EC6E3C]/10'
                          }`}
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                      Full Announcement Details
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={newsContent}
                      onChange={(e) => setNewsContent(e.target.value)}
                      placeholder="Write clear, actionable details for students and faculty..."
                      className="w-full px-3 py-2 text-sm text-[#2B2B2B] placeholder:text-[#2B2B2B]/50 bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] resize-none"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={newsPublishing || !newsTitle.trim() || !newsContent.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-50 rounded-lg transition-opacity"
                    >
                      <Flame className="w-3.5 h-3.5 text-white" />
                      <span>{newsPublishing ? 'Broadcasting...' : 'Broadcast Spicy News'}</span>
                    </button>
                  </div>
                </form>
              )}

              {announcements.length === 0 ? (
                <div className="py-10 text-center">
                  <Flame className="w-6 h-6 text-[#EC6E3C] mx-auto" />
                  <p className="mt-2 text-sm text-[#2B2B2B]/80">
                    No Spicy News bulletins published yet.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#2B2B2B]/15">
                  {announcements.map((ann) => (
                    <article
                      key={ann.id}
                      className="py-5 first:pt-0 last:pb-0 flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                          {ann.priority === 'urgent' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EC6E3C]/15 text-[#2B2B2B] font-semibold border border-[#EC6E3C]">
                              <AlertTriangle className="w-3.5 h-3.5 text-[#EC6E3C]" />
                              URGENT · SPICY NEWS
                            </span>
                          ) : ann.priority === 'important' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#006E53]/10 text-[#006E53] font-semibold border border-[#006E53]">
                              <Flame className="w-3.5 h-3.5" />
                              IMPORTANT BULLETIN
                            </span>
                          ) : (
                            <span className="font-semibold text-[#006E53]">UNIVERSITY NEWS</span>
                          )}
                          <span aria-hidden="true" className="text-[#2B2B2B]/40">·</span>
                          <span className="font-medium text-[#2B2B2B]">{ann.category}</span>
                          <span aria-hidden="true" className="text-[#2B2B2B]/40">·</span>
                          <span className="text-[#2B2B2B]/80">Issued by {ann.author_name}</span>
                          <span aria-hidden="true" className="text-[#2B2B2B]/40">·</span>
                          <span className="font-mono tabular-nums text-[#2B2B2B]/70">
                            {formatRelativeTime(ann.created_at)}
                          </span>
                        </div>

                        <h2 className="mt-1.5 font-display text-lg font-semibold text-[#2B2B2B]">
                          {ann.title}
                        </h2>
                        <p className="mt-1.5 text-sm text-[#2B2B2B] leading-relaxed whitespace-pre-line max-w-3xl">
                          {ann.content}
                        </p>
                      </div>

                      {currentUser.role === 'admin' && (
                        <button
                          type="button"
                          disabled={adminBusy}
                          onClick={async () => {
                            setAdminBusy(true);
                            try {
                              await api.deleteAnnouncement(ann.id);
                              showBanner('Announcement removed.');
                              await refreshAllWorkspaceData();
                            } finally {
                              setAdminBusy(false);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-[#EC6E3C]" />
                          <span>Remove</span>
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {route.tab === 'governance' && currentUser.role === 'admin' && (
          <div className="space-y-6">
            <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#2B2B2B]/15">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-lg bg-[#006E53]/10 border border-[#006E53] text-[#006E53] shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="font-display text-xl font-bold text-[#2B2B2B]">
                      IT Department Network Governance &amp; Supervision
                    </h1>
                    <p className="text-xs text-[#2B2B2B]/80 mt-1">
                      Supervise Chanakya University accounts, suspend policy-violating members, moderate posts, and broadcast Spicy News.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigateTo({ tab: 'spicy_news' })}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg transition-opacity whitespace-nowrap shrink-0"
                >
                  <Flame className="w-3.5 h-3.5 text-[#EC6E3C]" />
                  <span>Publish Spicy News</span>
                </button>
              </div>

              {adminOverview && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
                  {[
                    { label: 'Total Members', value: adminOverview.metrics.total_members },
                    { label: 'Students / Faculty', value: `${adminOverview.metrics.students} / ${adminOverview.metrics.faculty}` },
                    { label: 'Graph Connections', value: adminOverview.metrics.connections },
                    { label: 'Suspended Accounts', value: adminOverview.metrics.suspended },
                    { label: 'Campus Posts', value: adminOverview.metrics.posts },
                    {
                      label: 'Pending Registrations',
                      value: adminOverview.metrics.pending_registrations ?? 0,
                    },
                    {
                      label: 'Password Reset Requests',
                      value: adminOverview.metrics.pending_password_resets ?? 0,
                    },
                    {
                      label: 'Community Proposals',
                      value: adminOverview.metrics.pending_community_proposals ?? 0,
                    },
                    {
                      label: 'Official Communities',
                      value: adminOverview.metrics.managed_communities ?? 0,
                    },
                    { label: 'Portfolio Credentials', value: adminOverview.metrics.portfolio_items },
                    { label: 'Spicy News Bulletins', value: adminOverview.metrics.announcements },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="p-3.5 bg-white border border-[#2B2B2B]/15 rounded-xl"
                    >
                      <p className="text-xs text-[#2B2B2B]/75 font-medium">{stat.label}</p>
                      <p className="mt-1 font-mono tabular-nums text-lg font-bold text-[#006E53]">
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Pending Registration Approvals (FIFO Queue) */}
            <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#2B2B2B]/15">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#2B2B2B] flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#EC6E3C]" />
                    <span>Pending Registration Approvals</span>
                  </h2>
                  <p className="text-xs text-[#2B2B2B]/80 mt-0.5">
                    Verify Chanakya University IDs before accepting students or faculty into the network. Reject requests with an incorrect ID so they can re-apply.
                  </p>
                </div>
                <span className="font-mono tabular-nums text-xs font-semibold text-[#EC6E3C]">
                  {adminOverview?.pending_registrations?.length ?? 0} awaiting review
                </span>
              </div>

              {(adminOverview?.pending_registrations?.length ?? 0) === 0 ? (
                <p className="mt-4 text-sm text-[#2B2B2B]/80">
                  No pending student or faculty registration requests right now.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-[#2B2B2B]/15">
                  {(adminOverview?.pending_registrations ?? []).map((req) => (
                    <div
                      key={req.university_id}
                      className="py-4 first:pt-0 last:pb-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <span className="text-sm font-semibold text-[#2B2B2B]">
                            {req.name}
                          </span>
                          <span className="text-xs font-mono text-[#2B2B2B]/75">
                            @{req.username}
                          </span>
                          <span className="text-xs font-semibold text-[#006E53] capitalize">
                            {req.role}
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-[#2B2B2B]/70">
                            Submitted {formatRelativeTime(req.created_at)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white border border-[#2B2B2B]/20 font-mono tabular-nums font-semibold text-[#2B2B2B]">
                            University ID: {req.university_id}
                          </span>
                          <span className="text-[#2B2B2B]/80">
                            {req.school} · {req.programme} · {req.year}
                          </span>
                        </div>

                        <p className="text-xs text-[#2B2B2B]/85 leading-relaxed">
                          {req.bio}
                        </p>

                        {req.skills.length > 0 && (
                          <p className="text-[11px] text-[#2B2B2B]/75">
                            <span className="font-semibold text-[#2B2B2B]">Skills:</span>{' '}
                            {req.skills.join(', ')}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          disabled={adminBusy}
                          onClick={async () => {
                            setAdminBusy(true);
                            try {
                              const res = await api.approveRegistration(req.university_id);
                              showBanner(res.message);
                              await refreshAllWorkspaceData();
                            } catch (err) {
                              showBanner(
                                err instanceof Error
                                  ? err.message
                                  : 'Unable to accept registration request',
                              );
                            } finally {
                              setAdminBusy(false);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-50 rounded-lg transition-opacity whitespace-nowrap"
                        >
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>Accept &amp; Register</span>
                        </button>
                        <button
                          type="button"
                          disabled={adminBusy}
                          onClick={async () => {
                            setAdminBusy(true);
                            try {
                              const res = await api.rejectRegistration(req.university_id);
                              showBanner(res.message);
                              await refreshAllWorkspaceData();
                            } catch (err) {
                              showBanner(
                                err instanceof Error
                                  ? err.message
                                  : 'Unable to reject registration request',
                              );
                            } finally {
                              setAdminBusy(false);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <X className="w-3.5 h-3.5 text-[#EC6E3C]" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Pending Password Change Requests (FIFO Queue) */}
            <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#2B2B2B]/15">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#2B2B2B] flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#EC6E3C]" />
                    <span>Pending Password Change Requests</span>
                  </h2>
                  <p className="text-xs text-[#2B2B2B]/80 mt-0.5">
                    Students or faculty who forgot their password request a password update here. Accepting immediately updates their password and clears old sessions.
                  </p>
                </div>
                <span className="font-mono tabular-nums text-xs font-semibold text-[#EC6E3C]">
                  {adminOverview?.password_reset_requests?.length ?? 0} awaiting review
                </span>
              </div>

              {(adminOverview?.password_reset_requests?.length ?? 0) === 0 ? (
                <p className="mt-4 text-sm text-[#2B2B2B]/80">
                  No pending password change requests right now.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-[#2B2B2B]/15">
                  {(adminOverview?.password_reset_requests ?? []).map((req) => (
                    <div
                      key={req.id}
                      className="py-4 first:pt-0 last:pb-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <span className="text-sm font-semibold text-[#2B2B2B]">
                            {req.name}
                          </span>
                          <span className="text-xs font-mono text-[#2B2B2B]/75">
                            @{req.username}
                          </span>
                          <span className="text-xs font-semibold text-[#006E53] capitalize">
                            {req.role}
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-[#2B2B2B]/70">
                            Requested {formatRelativeTime(req.created_at)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white border border-[#2B2B2B]/20 font-mono tabular-nums font-semibold text-[#2B2B2B]">
                            University ID: {req.university_id}
                          </span>
                          {(req.school || req.programme) && (
                            <span className="text-[#2B2B2B]/80">
                              {req.school ? `${req.school} · ` : ''}
                              {req.programme}
                            </span>
                          )}
                        </div>

                        {req.reason && (
                          <p className="text-xs text-[#2B2B2B]/85 leading-relaxed">
                            <span className="font-semibold text-[#2B2B2B]">Note:</span> {req.reason}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          disabled={adminBusy}
                          onClick={async () => {
                            setAdminBusy(true);
                            try {
                              const res = await api.approvePasswordReset(req.id);
                              showBanner(res.message);
                              await refreshAllWorkspaceData();
                            } catch (err) {
                              showBanner(
                                err instanceof Error
                                  ? err.message
                                  : 'Unable to accept password change request',
                              );
                            } finally {
                              setAdminBusy(false);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-50 rounded-lg transition-opacity whitespace-nowrap"
                        >
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>Accept &amp; Change Password</span>
                        </button>
                        <button
                          type="button"
                          disabled={adminBusy}
                          onClick={async () => {
                            setAdminBusy(true);
                            try {
                              const res = await api.rejectPasswordReset(req.id);
                              showBanner(res.message);
                              await refreshAllWorkspaceData();
                            } catch (err) {
                              showBanner(
                                err instanceof Error
                                  ? err.message
                                  : 'Unable to reject password change request',
                              );
                            } finally {
                              setAdminBusy(false);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <X className="w-3.5 h-3.5 text-[#EC6E3C]" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Pending Community Proposals (IT Admin Assessment Queue) */}
            <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#2B2B2B]/15">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#2B2B2B] flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#006E53]" />
                    <span>Pending Community Creation Proposals</span>
                  </h2>
                  <p className="text-xs text-[#2B2B2B]/80 mt-0.5">
                    Assess new student or faculty requests to start a campus community. Approving assigns the proposer as Community Leader.
                  </p>
                </div>
                <span className="font-mono tabular-nums text-xs font-semibold text-[#EC6E3C]">
                  {adminOverview?.community_proposals?.length ?? 0} awaiting assessment
                </span>
              </div>

              {(adminOverview?.community_proposals?.length ?? 0) === 0 ? (
                <p className="mt-4 text-sm text-[#2B2B2B]/80">
                  No pending community creation requests right now.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-[#2B2B2B]/15">
                  {(adminOverview?.community_proposals ?? []).map((prop) => {
                    const defaultOverrideSchool =
                      prop.allowed_school ||
                      ((CHANAKYA_SCHOOLS as readonly string[]).includes(prop.category)
                        ? prop.category
                        : CHANAKYA_SCHOOLS[0]);
                    const override = proposalPolicyOverrides[prop.id] ?? {
                      school_restricted: prop.school_restricted,
                      allowed_school: defaultOverrideSchool,
                    };

                    return (
                    <div
                      key={prop.id}
                      className="py-4 first:pt-0 last:pb-0 flex flex-col lg:flex-row lg:items-start justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <span className="text-sm font-bold text-[#2B2B2B]">
                            {prop.name}
                          </span>
                          <span className="text-xs font-medium text-[#2B2B2B]/80">
                            {prop.category}
                          </span>
                          <span className="text-xs font-semibold text-[#006E53]">
                            {prop.school_restricted
                              ? `Requested: ${prop.allowed_school || prop.category} Only`
                              : 'Requested: Open to All Schools'}
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-[#2B2B2B]/70">
                            Requested {formatRelativeTime(prop.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-[#2B2B2B]/80">
                          <span className="font-semibold text-[#2B2B2B]">Proposed Leader:</span>{' '}
                          {prop.proposer_name} (@{prop.proposer}) · {prop.proposer_role} ·{' '}
                          {prop.proposer_university_id} · {prop.proposer_programme}
                        </p>
                        <p className="text-xs text-[#2B2B2B] leading-relaxed">
                          {prop.description}
                        </p>
                        {prop.charter && prop.charter !== prop.description && (
                          <p className="text-xs text-[#2B2B2B]/80">
                            <span className="font-semibold text-[#2B2B2B]">Charter:</span>{' '}
                            {prop.charter}
                          </p>
                        )}
                        {prop.tags.length > 0 && (
                          <p className="text-[11px] text-[#006E53] font-medium">
                            Focus: {prop.tags.join(' · ')}
                          </p>
                        )}

                        <div className="pt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-[#2B2B2B]">
                            Access on Approval:
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setProposalPolicyOverrides((prev) => ({
                                ...prev,
                                [prop.id]: {
                                  school_restricted: false,
                                  allowed_school: override.allowed_school,
                                },
                              }))
                            }
                            className={`px-2.5 py-1 text-[11px] font-medium rounded-md border ${
                              !override.school_restricted
                                ? 'bg-[#006E53] text-white border-[#006E53]'
                                : 'bg-white text-[#2B2B2B] border-[#2B2B2B]/15'
                            }`}
                          >
                            Open to All Schools
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setProposalPolicyOverrides((prev) => ({
                                ...prev,
                                [prop.id]: {
                                  school_restricted: true,
                                  allowed_school: override.allowed_school,
                                },
                              }))
                            }
                            className={`px-2.5 py-1 text-[11px] font-medium rounded-md border ${
                              override.school_restricted
                                ? 'bg-[#EC6E3C]/15 text-[#2B2B2B] border-[#EC6E3C] font-semibold'
                                : 'bg-white text-[#2B2B2B] border-[#2B2B2B]/15'
                            }`}
                          >
                            Restrict to School Only
                          </button>
                          {override.school_restricted && (
                            <select
                              value={override.allowed_school}
                              onChange={(e) =>
                                setProposalPolicyOverrides((prev) => ({
                                  ...prev,
                                  [prop.id]: {
                                    school_restricted: true,
                                    allowed_school: e.target.value,
                                  },
                                }))
                              }
                              className="px-2 py-1 text-[11px] text-[#2B2B2B] bg-white border border-[#2B2B2B]/25 rounded-md focus:outline-none focus:border-[#006E53]"
                            >
                              {CHANAKYA_SCHOOLS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <input
                          type="text"
                          value={proposalRejectNotes[prop.id] || ''}
                          onChange={(e) =>
                            setProposalRejectNotes((prev) => ({
                              ...prev,
                              [prop.id]: e.target.value,
                            }))
                          }
                          placeholder="Optional assessment note (sent if declined)..."
                          className="mt-1 w-full max-w-md px-2.5 py-1 text-xs text-[#2B2B2B] placeholder:text-[#2B2B2B]/50 bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53]"
                        />
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          disabled={adminBusy}
                          onClick={async () => {
                            setAdminBusy(true);
                            try {
                              const res = await api.approveCommunityProposal(prop.id, {
                                school_restricted: override.school_restricted,
                                allowed_school: override.school_restricted
                                  ? override.allowed_school
                                  : '',
                              });
                              showBanner(res.message);
                              await refreshAllWorkspaceData();
                            } catch (err) {
                              showBanner(
                                err instanceof Error
                                  ? err.message
                                  : 'Unable to approve community proposal',
                              );
                            } finally {
                              setAdminBusy(false);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-50 rounded-lg transition-opacity whitespace-nowrap"
                        >
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>Approve &amp; Assign Leader</span>
                        </button>
                        <button
                          type="button"
                          disabled={adminBusy}
                          onClick={async () => {
                            setAdminBusy(true);
                            try {
                              const res = await api.rejectCommunityProposal(
                                prop.id,
                                proposalRejectNotes[prop.id] || '',
                              );
                              showBanner(res.message);
                              await refreshAllWorkspaceData();
                            } catch (err) {
                              showBanner(
                                err instanceof Error
                                  ? err.message
                                  : 'Unable to decline community proposal',
                              );
                            } finally {
                              setAdminBusy(false);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <X className="w-3.5 h-3.5 text-[#EC6E3C]" />
                          <span>Decline</span>
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Community Supervision & Directives */}
            <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#2B2B2B]/15">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#2B2B2B]">
                    Managed Communities Supervision &amp; Directives
                  </h2>
                  <p className="text-xs text-[#2B2B2B]/80 mt-0.5">
                    Assess community activity, manage School exclusivity vs open campus access, send official IT Admin directives, or suspend/dissolve communities.
                  </p>
                </div>
                <span className="font-mono tabular-nums text-xs text-[#006E53] font-semibold">
                  {adminOverview?.managed_communities?.length ?? 0} communities
                </span>
              </div>

              {(adminOverview?.managed_communities?.length ?? 0) === 0 ? (
                <p className="mt-4 text-sm text-[#2B2B2B]/80">No managed communities active yet.</p>
              ) : (
                <div className="mt-4 divide-y divide-[#2B2B2B]/15">
                  {(adminOverview?.managed_communities ?? []).map((comm) => {
                    const defaultGovSchool =
                      comm.allowed_school ||
                      ((CHANAKYA_SCHOOLS as readonly string[]).includes(comm.category)
                        ? comm.category
                        : CHANAKYA_SCHOOLS[0]);
                    const selectedGovSchool =
                      communityPolicySchoolDrafts[comm.id] ?? defaultGovSchool;

                    return (
                    <div key={comm.id} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-bold text-[#2B2B2B]">
                              {comm.name}
                            </span>
                            <span className="text-xs text-[#2B2B2B]/75 font-medium">
                              Leader: {comm.leader_name} (@{comm.leader})
                            </span>
                            <span className="text-xs font-semibold text-[#006E53]">
                              {comm.school_restricted
                                ? `${comm.allowed_school || comm.category} Only`
                                : 'Open to All Schools'}
                            </span>
                            {comm.is_suspended ? (
                              <span className="px-2 py-0.5 text-xs font-semibold text-[#2B2B2B] bg-[#EC6E3C]/15 border border-[#EC6E3C] rounded-md">
                                Suspended
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-[#006E53]">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#2B2B2B]/75 font-mono tabular-nums mt-0.5">
                            {comm.category} · {comm.member_count} members ·{' '}
                            {comm.pending_join_count} pending join requests ·{' '}
                            {comm.internal_edges} SocialGraph edges
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {comm.school_restricted ? (
                            <button
                              type="button"
                              disabled={adminBusy || communityBusyId === comm.id}
                              onClick={() => handleUpdateCommunityAccessPolicy(comm.id, false)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#006E53] hover:opacity-90 rounded-lg whitespace-nowrap"
                            >
                              <Globe className="w-3.5 h-3.5 text-white" />
                              <span>Open to All Schools</span>
                            </button>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              <select
                                value={selectedGovSchool}
                                onChange={(e) =>
                                  setCommunityPolicySchoolDrafts((prev) => ({
                                    ...prev,
                                    [comm.id]: e.target.value,
                                  }))
                                }
                                className="px-2 py-1.5 text-xs text-[#2B2B2B] bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53]"
                              >
                                {CHANAKYA_SCHOOLS.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={adminBusy || communityBusyId === comm.id}
                                onClick={() =>
                                  handleUpdateCommunityAccessPolicy(
                                    comm.id,
                                    true,
                                    selectedGovSchool,
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/10 border border-[#2B2B2B]/20 rounded-lg whitespace-nowrap"
                              >
                                <Lock className="w-3.5 h-3.5 text-[#EC6E3C]" />
                                <span>Restrict School</span>
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            disabled={adminBusy}
                            onClick={async () => {
                              setAdminBusy(true);
                              try {
                                const res = await api.setCommunitySuspended(
                                  comm.id,
                                  !comm.is_suspended,
                                );
                                showBanner(res.message);
                                await refreshAllWorkspaceData();
                              } finally {
                                setAdminBusy(false);
                              }
                            }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                              comm.is_suspended
                                ? 'text-white bg-[#006E53] hover:opacity-90 border-[#006E53]'
                                : 'text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border-[#2B2B2B]/20'
                            }`}
                          >
                            {comm.is_suspended ? 'Reactivate' : 'Suspend'}
                          </button>
                          <button
                            type="button"
                            disabled={adminBusy}
                            onClick={async () => {
                              setAdminBusy(true);
                              try {
                                const res = await api.deleteCommunity(comm.id);
                                showBanner(res.message);
                                await refreshAllWorkspaceData();
                              } finally {
                                setAdminBusy(false);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#2B2B2B] bg-[#EC6E3C]/15 hover:bg-[#EC6E3C]/25 border border-[#EC6E3C] rounded-lg transition-colors whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-[#EC6E3C]" />
                            <span>Dissolve</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={communityMessageDrafts[comm.id] || ''}
                          onChange={(e) =>
                            setCommunityMessageDrafts((prev) => ({
                              ...prev,
                              [comm.id]: e.target.value,
                            }))
                          }
                          placeholder={`Send IT Admin supervision notice to ${comm.name}...`}
                          className="flex-1 px-3 py-1.5 text-xs text-[#2B2B2B] placeholder:text-[#2B2B2B]/50 bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53]"
                        />
                        <button
                          type="button"
                          disabled={
                            adminBusy ||
                            communityBusyId === comm.id ||
                            !(communityMessageDrafts[comm.id] || '').trim()
                          }
                          onClick={() => handleSendCommunityMessage(comm.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0"
                        >
                          <Send className="w-3.5 h-3.5 text-white" />
                          <span>Send Directive</span>
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Member Governance Roster */}
            <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6">
              <div className="flex items-center justify-between pb-4 border-b border-[#2B2B2B]/15">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#2B2B2B]">
                    Registered University Accounts
                  </h2>
                  <p className="text-xs text-[#2B2B2B]/80 mt-0.5">
                    Review verified University IDs, schools, programmes, roles, graph activity, and account status.
                  </p>
                </div>
                <span className="font-mono tabular-nums text-xs text-[#006E53] font-semibold">
                  {adminOverview?.members.length ?? 0} accounts
                </span>
              </div>

              <div className="mt-4 divide-y divide-[#2B2B2B]/15">
                {(adminOverview?.members ?? []).map((member) => {
                  const isSelfAdmin = member.username === currentUser.username || member.role === 'admin';
                  return (
                    <div
                      key={member.username}
                      className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <button
                        type="button"
                        onClick={() => openStudentProfile(member.username)}
                        className="flex items-center gap-3 min-w-0 text-left flex-1"
                      >
                        <Avatar name={member.name} src={member.avatar_url} size="md" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-semibold text-[#2B2B2B] hover:text-[#006E53] hover:underline truncate">
                              {member.name}
                            </span>
                            <span className="text-xs font-mono text-[#2B2B2B]/75">
                              @{member.username}
                            </span>
                            <span className="text-xs font-semibold text-[#006E53] capitalize">
                              {member.role}
                            </span>
                          </div>
                          <p className="text-xs text-[#2B2B2B]/75 truncate">
                            {member.university_id || member.outlook_email} ·{' '}
                            {member.school ? `${member.school} · ` : ''}
                            {member.programme} · {member.connection_count ?? 0} connections
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-3 shrink-0">
                        {member.is_suspended ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EC6E3C]/15 border border-[#EC6E3C] text-xs font-semibold text-[#2B2B2B]">
                            <Ban className="w-3.5 h-3.5 text-[#EC6E3C]" />
                            <span>Suspended</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#006E53]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Active</span>
                          </span>
                        )}

                        {!isSelfAdmin && (
                          <button
                            type="button"
                            disabled={adminBusy}
                            onClick={async () => {
                              setAdminBusy(true);
                              try {
                                const nextState = !member.is_suspended;
                                await api.setMemberSuspended(member.username, nextState);
                                showBanner(
                                  nextState
                                    ? `Suspended @${member.username}.`
                                    : `Reinstated @${member.username}.`,
                                );
                                await refreshAllWorkspaceData();
                              } finally {
                                setAdminBusy(false);
                              }
                            }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                              member.is_suspended
                                ? 'text-white bg-[#006E53] hover:opacity-90 border-[#006E53]'
                                : 'text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border-[#2B2B2B]/20'
                            }`}
                          >
                            {member.is_suspended ? 'Reinstate' : 'Suspend'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Campus Post Supervision */}
            <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6">
              <div className="flex items-center justify-between pb-4 border-b border-[#2B2B2B]/15">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#2B2B2B]">
                    Campus Post Supervision
                  </h2>
                  <p className="text-xs text-[#2B2B2B]/80 mt-0.5">
                    Review recent student and faculty project posts across the campus network.
                  </p>
                </div>
                <span className="font-mono tabular-nums text-xs text-[#006E53] font-semibold">
                  {adminOverview?.recent_posts.length ?? 0} recent posts
                </span>
              </div>

              {(adminOverview?.recent_posts.length ?? 0) === 0 ? (
                <p className="mt-4 text-sm text-[#2B2B2B]/80">No posts published yet.</p>
              ) : (
                <div className="mt-4 divide-y divide-[#2B2B2B]/15">
                  {(adminOverview?.recent_posts ?? []).map((p) => (
                    <div
                      key={p.id}
                      className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-[#2B2B2B]/75">
                          <button
                            type="button"
                            onClick={() => openStudentProfile(p.author)}
                            className="font-semibold text-[#2B2B2B] hover:text-[#006E53] hover:underline"
                          >
                            {p.author_name} (@{p.author})
                          </button>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatRelativeTime(p.created_at)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {p.like_count} likes · {p.comment_count} comments
                          </span>
                        </div>
                        {p.title && (
                          <p className="mt-1 font-display text-sm font-semibold text-[#2B2B2B]">
                            {p.title}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-[#2B2B2B] line-clamp-2 max-w-3xl">
                          {p.content}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={adminBusy}
                        onClick={async () => {
                          setAdminBusy(true);
                          try {
                            await api.adminDeletePost(p.id);
                            showBanner(`Removed post by @${p.author}.`);
                            await refreshAllWorkspaceData();
                          } finally {
                            setAdminBusy(false);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[#EC6E3C]" />
                        <span>Remove Post</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {route.tab === 'profile' && (
          <ProfileView
            username={activeProfileUsername}
            currentUsername={currentUser.username}
            refreshKey={profileRefreshKey}
            onProfileUpdated={(updated) => setCurrentUser(updated)}
            onNavigateProfile={openStudentProfile}
            onConnectionChanged={async () => {
              await refreshAllWorkspaceData();
            }}
            onPostMutated={async () => {
              showBanner('Post removed. Use Undo in the toolbar to restore it.');
              await refreshAllWorkspaceData();
            }}
          />
        )}
      </main>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onCreated={async () => {
          showBanner('Post published to your campus network feed.');
          await refreshAllWorkspaceData();
        }}
      />
    </div>
  );
}
