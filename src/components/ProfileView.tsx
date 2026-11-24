import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowRight,
  Award,
  Check,
  Edit3,
  ExternalLink,
  FileText,
  ImagePlus,
  Plus,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { api } from '../api';
import {
  CHANAKYA_SCHOOLS,
  FACULTY_DESIGNATIONS,
  SCHOOL_PROGRAMMES,
  STUDENT_YEARS,
} from '../data/universityCatalog';
import type { DegreePathResult, PortfolioItem, PostItem, UserProfile } from '../types';
import { Avatar } from './Avatar';
import { PostCard } from './PostCard';

interface ProfileViewProps {
  username: string;
  currentUsername: string;
  refreshKey?: number;
  onProfileUpdated: (updated: UserProfile) => void;
  onNavigateProfile: (username: string) => void;
  onConnectionChanged: () => Promise<void>;
  onPostMutated: () => Promise<void>;
}

export function ProfileView({
  username,
  currentUsername,
  refreshKey = 0,
  onProfileUpdated,
  onNavigateProfile,
  onConnectionChanged,
  onPostMutated,
}: ProfileViewProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [pathResult, setPathResult] = useState<DegreePathResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  // Edit profile state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSchool, setEditSchool] = useState('');
  const [editProgramme, setEditProgramme] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editSkills, setEditSkills] = useState('');
  const [editAvatar, setEditAvatar] = useState<string | null>(null);

  // Portfolio add form state
  const [addingPortfolio, setAddingPortfolio] = useState(false);
  const [pfCategory, setPfCategory] = useState<'certificate' | 'achievement'>('certificate');
  const [pfTitle, setPfTitle] = useState('');
  const [pfIssuer, setPfIssuer] = useState('');
  const [pfDate, setPfDate] = useState('');
  const [pfCredId, setPfCredId] = useState('');
  const [pfCredUrl, setPfCredUrl] = useState('');
  const [pfDescription, setPfDescription] = useState('');
  const [pfFileUrl, setPfFileUrl] = useState<string | null>(null);
  const [pfUploading, setPfUploading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ profile: p }, { items: pfItems }, { posts: userPosts }] = await Promise.all([
        api.getProfile(username),
        api.getPortfolio(username),
        api.getUserPosts(username),
      ]);
      setProfile(p);
      setPortfolio(pfItems);
      setPosts(userPosts);

      setEditName(p.name);
      setEditSchool(p.school || '');
      setEditProgramme(p.programme);
      setEditYear(p.year);
      setEditBio(p.bio);
      setEditSkills(p.skills.join(', '));
      setEditAvatar(p.avatar_url);

      if (username !== currentUsername) {
        const pathRes = await api.getDegreeAndPath(username);
        setPathResult(pathRes);
      } else {
        setPathResult(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setEditing(false);
    setAddingPortfolio(false);
    loadData();
  }, [username, refreshKey]);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setBusyAction(true);
    try {
      const skills = editSkills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api.updateProfile({
        name: editName,
        school: editSchool,
        programme: editProgramme,
        year: editYear,
        bio: editBio,
        skills,
        avatar_url: editAvatar,
      });
      setProfile(res.profile);
      onProfileUpdated(res.profile);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setBusyAction(false);
    }
  };

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusyAction(true);
    try {
      const url = await api.uploadImage(file);
      setEditAvatar(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setBusyAction(false);
      e.target.value = '';
    }
  };

  const handlePortfolioFilePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPfUploading(true);
    try {
      const url = await api.uploadFile(file);
      setPfFileUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload certificate file');
    } finally {
      setPfUploading(false);
      e.target.value = '';
    }
  };

  const handleAddPortfolio = async (e: FormEvent) => {
    e.preventDefault();
    if (!pfTitle.trim() || !pfIssuer.trim() || busyAction) return;
    setBusyAction(true);
    setError(null);
    try {
      const res = await api.addPortfolioItem({
        category: pfCategory,
        title: pfTitle.trim(),
        issuer: pfIssuer.trim(),
        issue_date: pfDate.trim(),
        credential_id: pfCredId.trim(),
        credential_url: pfCredUrl.trim(),
        description: pfDescription.trim(),
        file_url: pfFileUrl,
      });
      setPortfolio((prev) => [res.item, ...prev]);
      setPfTitle('');
      setPfIssuer('');
      setPfDate('');
      setPfCredId('');
      setPfCredUrl('');
      setPfDescription('');
      setPfFileUrl(null);
      setAddingPortfolio(false);
      await onConnectionChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save portfolio item');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeletePortfolio = async (itemId: string) => {
    setBusyAction(true);
    try {
      await api.deletePortfolioItem(itemId);
      setPortfolio((prev) => prev.filter((item) => item.id !== itemId));
      await onConnectionChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove portfolio item');
    } finally {
      setBusyAction(false);
    }
  };

  const runRelationshipAction = async (fn: () => Promise<unknown>) => {
    setBusyAction(true);
    try {
      await fn();
      await Promise.all([loadData(), onConnectionChanged()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyAction(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-lg bg-[#2B2B2B]/15" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-48 bg-[#2B2B2B]/15 rounded-md" />
              <div className="h-4 w-72 bg-[#2B2B2B]/10 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="bg-[#FFFFFF] border border-[#EC6E3C] rounded-xl p-6 text-sm text-[#2B2B2B]">
        {error}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6 text-sm text-[#2B2B2B]">
        Profile not found.
      </div>
    );
  }

  const isSelf = profile.username === currentUsername;
  const roleLabel =
    profile.role === 'admin'
      ? 'IT Department Admin'
      : profile.role === 'faculty'
        ? 'Faculty'
        : 'Student';

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-4 py-2.5 text-sm text-[#2B2B2B] bg-[#EC6E3C]/12 border border-[#EC6E3C] rounded-lg">
          {error}
        </div>
      )}

      {/* Main Profile Sheet */}
      <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <Avatar name={profile.name} src={profile.avatar_url} size="xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h1 className="font-display text-2xl font-bold text-[#2B2B2B]">
                  {profile.name}
                </h1>
                <span className="text-sm font-mono text-[#2B2B2B]/75">@{profile.username}</span>
                <span className="text-xs font-bold text-[#006E53]">{roleLabel}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-[#2B2B2B]/80">
                {profile.school && (
                  <>
                    <span className="font-medium text-[#2B2B2B]">{profile.school}</span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>{profile.programme}</span>
                {profile.year && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{profile.year}</span>
                  </>
                )}
                {(profile.university_id || profile.outlook_email) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-xs text-[#2B2B2B]">
                      ID: {profile.university_id || profile.outlook_email}
                    </span>
                  </>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 text-xs font-mono tabular-nums text-[#2B2B2B]/75">
                <span>{profile.connection_count} connections</span>
                <span aria-hidden="true">·</span>
                <span>{portfolio.length} portfolio credentials</span>
                <span aria-hidden="true">·</span>
                <span>{posts.length} posts</span>
                {!isSelf && pathResult && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#006E53] font-semibold">
                      {pathResult.degree !== null
                        ? `${pathResult.degree}${
                            pathResult.degree === 1
                              ? 'st'
                              : pathResult.degree === 2
                                ? 'nd'
                                : pathResult.degree === 3
                                  ? 'rd'
                                  : 'th'
                          } degree`
                        : 'Not connected in graph'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Profile Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isSelf ? (
              <button
                type="button"
                onClick={() => setEditing((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#006E53]" />
                <span>{editing ? 'Cancel Edit' : 'Edit Profile'}</span>
              </button>
            ) : (
              <>
                {profile.relationship === 'none' && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => runRelationshipAction(() => api.sendRequest(profile.username))}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg transition-opacity whitespace-nowrap shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-white" />
                    <span>Connect</span>
                  </button>
                )}
                {profile.relationship === 'outgoing_pending' && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => runRelationshipAction(() => api.cancelRequest(profile.username))}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#2B2B2B] bg-white border border-[#EC6E3C] hover:bg-[#EC6E3C]/12 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <X className="w-3.5 h-3.5 text-[#EC6E3C]" />
                    <span>Cancel Request</span>
                  </button>
                )}
                {profile.relationship === 'incoming_pending' && (
                  <>
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() =>
                        runRelationshipAction(() => api.acceptRequest(profile.username))
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg transition-opacity whitespace-nowrap shrink-0"
                    >
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>Accept Request</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() =>
                        runRelationshipAction(() => api.rejectRequest(profile.username))
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>Reject</span>
                    </button>
                  </>
                )}
                {profile.relationship === 'connected' && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() =>
                      runRelationshipAction(() => api.removeConnection(profile.username))
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#2B2B2B] bg-white border border-[#2B2B2B]/20 hover:bg-[#EC6E3C]/12 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <UserMinus className="w-3.5 h-3.5 text-[#EC6E3C]" />
                    <span>Remove Connection</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Bio & Skills */}
        {!editing ? (
          <div className="mt-5 pt-5 border-t border-[#2B2B2B]/15 space-y-4">
            <p className="text-[15px] text-[#2B2B2B] leading-relaxed max-w-3xl">
              {profile.bio || 'No bio added yet.'}
            </p>
            {profile.skills.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#2B2B2B]/80 mb-2">
                  Skills &amp; Research Interests
                </p>
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((skill) => (
                    <span
                      key={skill}
                      className="px-2.5 py-1 text-xs font-medium text-[#2B2B2B] bg-white border border-[#2B2B2B]/20 rounded-md"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSaveProfile} className="mt-5 pt-5 border-t border-[#2B2B2B]/15 space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={editName || profile.name} src={editAvatar} size="lg" />
              <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg cursor-pointer transition-colors">
                <ImagePlus className="w-4 h-4 text-[#006E53]" />
                <span>Update Photo</span>
                <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
                  {profile.role === 'faculty' ? 'Designation' : 'Year'}
                </label>
                {profile.role === 'admin' ? (
                  <input
                    type="text"
                    value={editYear}
                    onChange={(e) => setEditYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B]"
                  />
                ) : (
                  <select
                    required
                    value={editYear}
                    onChange={(e) => setEditYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B]"
                  >
                    <option value="">
                      {profile.role === 'faculty' ? '-- Select Designation --' : '-- Select Year --'}
                    </option>
                    {(profile.role === 'faculty' ? FACULTY_DESIGNATIONS : STUDENT_YEARS).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {profile.role === 'admin' ? (
              <div>
                <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">Department</label>
                <input
                  type="text"
                  value={editProgramme}
                  onChange={(e) => setEditProgramme(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B]"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">School</label>
                  <select
                    required
                    value={editSchool}
                    onChange={(e) => {
                      setEditSchool(e.target.value);
                      setEditProgramme('');
                    }}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B]"
                  >
                    <option value="">-- Select School --</option>
                    {CHANAKYA_SCHOOLS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                {editSchool && (
                  <div>
                    <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">Programme</label>
                    <select
                      required
                      value={editProgramme}
                      onChange={(e) => setEditProgramme(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B]"
                    >
                      <option value="">-- Select Programme --</option>
                      {(SCHOOL_PROGRAMMES[editSchool] ?? []).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">Bio</label>
              <textarea
                rows={3}
                required
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#2B2B2B]/80 mb-1">
                Skills / Research Interests (optional, comma-separated)
              </label>
              <input
                type="text"
                value={editSkills}
                onChange={(e) => setEditSkills(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/15 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg"
              >
                {busyAction ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Dedicated Profile Portfolio: Certificates & Achievements (Separate from Posts) */}
      <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#2B2B2B]/15">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#2B2B2B]">
              Profile Portfolio — Certificates &amp; Achievements
            </h2>
            <p className="text-xs text-[#2B2B2B]/80 mt-0.5">
              Verified credentials, course certificates, and honors saved privately to your profile portfolio (not published as feed posts).
            </p>
          </div>
          {isSelf && (
            <button
              type="button"
              onClick={() => setAddingPortfolio((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg transition-opacity whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
              <span>{addingPortfolio ? 'Close Form' : 'Add Certificate / Achievement'}</span>
            </button>
          )}
        </div>

        {/* Add Certificate / Achievement Form */}
        {isSelf && addingPortfolio && (
          <form
            onSubmit={handleAddPortfolio}
            className="p-5 bg-[#EC6E3C]/[0.06] border border-[#2B2B2B]/15 rounded-xl space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-white border border-[#2B2B2B]/25 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPfCategory('certificate')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    pfCategory === 'certificate'
                      ? 'bg-[#006E53] text-white'
                      : 'text-[#2B2B2B] hover:bg-[#EC6E3C]/12'
                  }`}
                >
                  Certificate
                </button>
                <button
                  type="button"
                  onClick={() => setPfCategory('achievement')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    pfCategory === 'achievement'
                      ? 'bg-[#006E53] text-white'
                      : 'text-[#2B2B2B] hover:bg-[#EC6E3C]/12'
                  }`}
                >
                  Achievement / Award
                </button>
              </div>
              <span className="text-xs font-medium text-[#006E53]">
                Saved only to Profile Portfolio
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={pfTitle}
                  onChange={(e) => setPfTitle(e.target.value)}
                  placeholder="e.g. NPTEL Deep Learning Gold Elite"
                  className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                  Issuing Organization / Event
                </label>
                <input
                  type="text"
                  required
                  value={pfIssuer}
                  onChange={(e) => setPfIssuer(e.target.value)}
                  placeholder="e.g. IIT Madras / IEEE / Chanakya University"
                  className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                  Date Issued
                </label>
                <input
                  type="text"
                  value={pfDate}
                  onChange={(e) => setPfDate(e.target.value)}
                  placeholder="e.g. October 2026"
                  className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                  Credential ID (optional)
                </label>
                <input
                  type="text"
                  value={pfCredId}
                  onChange={(e) => setPfCredId(e.target.value)}
                  placeholder="e.g. CU-2026-884"
                  className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                  Verification URL (optional)
                </label>
                <input
                  type="url"
                  value={pfCredUrl}
                  onChange={(e) => setPfCredUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#2B2B2B] mb-1">
                Summary (optional)
              </label>
              <textarea
                rows={2}
                value={pfDescription}
                onChange={(e) => setPfDescription(e.target.value)}
                placeholder="Key skills validated, project award context, or rank achieved..."
                className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] resize-none text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#2B2B2B] bg-white border border-[#2B2B2B]/25 hover:border-[#006E53] rounded-lg cursor-pointer transition-colors">
                  <FileText className="w-4 h-4 text-[#006E53]" />
                  <span>
                    {pfUploading
                      ? 'Uploading file...'
                      : pfFileUrl
                        ? 'Replace Certificate File'
                        : 'Attach Certificate (Image or PDF)'}
                  </span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handlePortfolioFilePick}
                    disabled={pfUploading}
                    className="hidden"
                  />
                </label>
                {pfFileUrl && (
                  <button
                    type="button"
                    onClick={() => setPfFileUrl(null)}
                    className="text-xs font-semibold text-[#EC6E3C] hover:underline"
                  >
                    Remove file
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAddingPortfolio(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/15 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyAction || pfUploading || !pfTitle.trim() || !pfIssuer.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-50 rounded-lg"
                >
                  {busyAction ? 'Saving...' : 'Save to Portfolio'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Portfolio Items List */}
        {portfolio.length === 0 ? (
          <div className="py-8 text-center">
            <Award className="w-6 h-6 text-[#EC6E3C] mx-auto" />
            <p className="mt-2 text-sm text-[#2B2B2B]/80">
              {isSelf
                ? 'No certificates or achievements saved yet. Add your first credential to build your portfolio.'
                : `${profile.name} has not added certificates or achievements yet.`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#2B2B2B]/15">
            {portfolio.map((item) => {
              const isPdf = item.file_url?.toLowerCase().endsWith('.pdf');
              return (
                <div key={item.id} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-[#2B2B2B]/80">
                      <span className="font-bold text-[#006E53] capitalize">
                        {item.category}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.issuer}</span>
                      {item.issue_date && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{item.issue_date}</span>
                        </>
                      )}
                      {item.credential_id && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">ID: {item.credential_id}</span>
                        </>
                      )}
                    </div>

                    <h3 className="mt-1 font-display text-base font-semibold text-[#2B2B2B]">
                      {item.title}
                    </h3>

                    {item.description && (
                      <p className="mt-1 text-sm text-[#2B2B2B]/80 leading-relaxed max-w-2xl">
                        {item.description}
                      </p>
                    )}

                    <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs">
                      {item.file_url && !isPdf && (
                        <a
                          href={item.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-semibold text-[#006E53] hover:underline"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>View Certificate Image</span>
                        </a>
                      )}
                      {item.file_url && isPdf && (
                        <a
                          href={item.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-semibold text-[#006E53] hover:underline"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Open Certificate PDF</span>
                        </a>
                      )}
                      {item.credential_url && (
                        <a
                          href={item.credential_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-[#EC6E3C] hover:underline"
                        >
                          <span>Verify Credential</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {item.file_url && !isPdf && (
                      <div className="mt-3 max-w-sm overflow-hidden rounded-lg border border-[#2B2B2B]/15 bg-white">
                        <img
                          src={item.file_url}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full max-h-48 object-cover block"
                        />
                      </div>
                    )}
                  </div>

                  {isSelf && (
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => handleDeletePortfolio(item.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/15 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[#EC6E3C]" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Shortest Connection Chain & Mutuals (when viewing another student/faculty) */}
      {!isSelf && pathResult && (
        <section className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-[#2B2B2B]">
              Shortest Connection Chain (BFS)
            </h2>
            {pathResult.shortest_path.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {pathResult.shortest_path.map((step, idx) => (
                  <div key={step.username} className="flex items-center gap-2">
                    {idx > 0 && <ArrowRight className="w-4 h-4 text-[#EC6E3C] shrink-0" />}
                    <button
                      type="button"
                      onClick={() => onNavigateProfile(step.username)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        step.username === currentUsername || step.username === profile.username
                          ? 'bg-[#006E53]/10 border-[#006E53] text-[#2B2B2B] font-semibold'
                          : 'bg-white border-[#2B2B2B]/15 text-[#2B2B2B] hover:border-[#EC6E3C]'
                      }`}
                    >
                      <Avatar name={step.name} src={step.avatar_url} size="xs" />
                      <span>{step.name}</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-[#2B2B2B]/80">
                No path currently connects you and {profile.name} in the campus graph.
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-[#2B2B2B]/15">
            <h3 className="font-display text-sm font-semibold text-[#2B2B2B]">
              Mutual Connections ({pathResult.mutual_connections.length})
            </h3>
            {pathResult.mutual_connections.length > 0 ? (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {pathResult.mutual_connections.map((m) => (
                  <button
                    key={m.username}
                    type="button"
                    onClick={() => onNavigateProfile(m.username)}
                    className="flex items-center gap-3 p-2.5 text-left bg-white border border-[#2B2B2B]/20 hover:border-[#006E53] rounded-lg transition-colors"
                  >
                    <Avatar name={m.name} src={m.avatar_url} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#2B2B2B] truncate">{m.name}</p>
                      <p className="text-xs text-[#2B2B2B]/75 truncate">{m.programme}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-[#2B2B2B]/75">No direct mutual connections yet.</p>
            )}
          </div>
        </section>
      )}

      {/* Published Posts */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[#2B2B2B]">
            {isSelf ? 'Your Projects & Posts' : `${profile.name}'s Projects & Posts`}
          </h2>
          <span className="text-xs font-mono tabular-nums text-[#2B2B2B]/75">
            {posts.length} {posts.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {posts.length === 0 ? (
          <div className="bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-8 text-center">
            <UserCheck className="w-6 h-6 text-[#006E53] mx-auto" />
            <p className="mt-2 text-sm text-[#2B2B2B]/80">
              {isSelf
                ? 'You have not shared any projects or ideas yet.'
                : `${profile.name} has not published any posts yet.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUsername={currentUsername}
                onNavigateProfile={onNavigateProfile}
                onToggleLike={async (postId) => {
                  const res = await api.toggleLike(postId);
                  setPosts((prev) =>
                    prev.map((p) =>
                      p.id === postId
                        ? { ...p, liked_by_me: res.liked_by_me, like_count: res.like_count }
                        : p,
                    ),
                  );
                }}
                onAddComment={async (postId, text, parentId) => {
                  const res = await api.addComment(postId, text, parentId);
                  setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
                }}
                onDeletePost={async (postId) => {
                  await api.deletePost(postId);
                  await Promise.all([loadData(), onPostMutated()]);
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
