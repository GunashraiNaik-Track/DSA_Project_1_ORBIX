import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  GraduationCap,
  KeyRound,
  Search,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { ApiError, api } from '../api';
import {
  CHANAKYA_SCHOOLS,
  FACULTY_DESIGNATIONS,
  SCHOOL_PROGRAMMES,
  STUDENT_YEARS,
} from '../data/universityCatalog';
import type {
  MemberRole,
  PasswordResetRequestResponse,
  PasswordResetStatusResponse,
  RegistrationRequestResponse,
  RegistrationStatusResponse,
  UserProfile,
} from '../types';
import { OrbixLogo } from './OrbixLogo';

interface AuthViewProps {
  onAuthenticated: (user: UserProfile) => Promise<void>;
}

export function AuthView({ onAuthenticated }: AuthViewProps) {
  const isAdminPortal =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('portal') === 'admin';

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');

  // Login fields
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Registration request fields
  const [role, setRole] = useState<MemberRole>('student');
  const [universityId, setUniversityId] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [programme, setProgramme] = useState('');
  const [year, setYear] = useState('');
  const [bio, setBio] = useState('');
  const [skillsText, setSkillsText] = useState('');

  // Submitted request confirmation state
  const [submittedRequest, setSubmittedRequest] = useState<RegistrationRequestResponse | null>(null);

  // Sign-in registration status check state
  const [statusIdentifier, setStatusIdentifier] = useState('');
  const [statusChecking, setStatusChecking] = useState(false);
  const [statusResult, setStatusResult] = useState<RegistrationStatusResponse | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);

  // Forgot password request state (no OTP — queued for IT Admin acceptance)
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [submittedReset, setSubmittedReset] = useState<PasswordResetRequestResponse | null>(null);
  const [resetStatusIdentifier, setResetStatusIdentifier] = useState('');
  const [resetStatusChecking, setResetStatusChecking] = useState(false);
  const [resetStatusResult, setResetStatusResult] = useState<PasswordResetStatusResponse | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const availableProgrammes = school ? SCHOOL_PROGRAMMES[school] ?? [] : [];

  const handleRoleSwitch = (nextRole: MemberRole) => {
    setRole(nextRole);
    setYear('');
  };

  const handleSchoolChange = (nextSchool: string) => {
    setSchool(nextSchool);
    setProgramme('');
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPendingNotice(null);
    setLoading(true);
    try {
      const res = await api.login(loginIdentifier.trim(), loginPassword);
      if (isAdminPortal && res.user.role !== 'admin') {
        await api.logout();
        setError('IT Department Administrator credentials are required for this portal.');
        return;
      }
      await onAuthenticated(res.user);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'pending_approval') {
        setPendingNotice(err.message);
        setStatusIdentifier(loginIdentifier.trim());
      } else {
        setError(err instanceof Error ? err.message : 'Unable to sign in');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPendingNotice(null);
    setResetStatusResult(null);

    if (!resetIdentifier.trim()) {
      setError('Enter your username or Chanakya University ID.');
      return;
    }
    if (resetNewPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.submitPasswordResetRequest({
        identifier: resetIdentifier.trim(),
        new_password: resetNewPassword,
        reason: resetReason.trim(),
      });
      setSubmittedReset(res);
      setResetStatusIdentifier(res.university_id || res.username);
      setLoginIdentifier(res.username);
      setResetNewPassword('');
      setResetConfirmPassword('');
      setResetReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send password change request');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckResetStatus = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetStatusResult(null);
    const query = resetStatusIdentifier.trim();
    if (!query) {
      setError('Enter your username or University ID to check password change status.');
      return;
    }
    setResetStatusChecking(true);
    try {
      const res = await api.checkPasswordResetStatus(query);
      setResetStatusResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to check password change status');
    } finally {
      setResetStatusChecking(false);
    }
  };

  const handleSubmitRegistration = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPendingNotice(null);

    if (!universityId.trim()) {
      setError('University ID is required.');
      return;
    }
    if (!regUsername.trim()) {
      setError('Unique username is required.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!name.trim()) {
      setError('Full name is required.');
      return;
    }
    if (!school) {
      setError('Please select your School.');
      return;
    }
    if (!programme) {
      setError('Please select your Programme.');
      return;
    }
    if (!year) {
      setError(role === 'faculty' ? 'Please select your Designation.' : 'Please select your Year.');
      return;
    }
    if (!bio.trim()) {
      setError('Short bio is required.');
      return;
    }

    setLoading(true);
    try {
      const skills = skillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api.submitRegistrationRequest({
        university_id: universityId.trim(),
        username: regUsername.trim(),
        password: regPassword,
        name: name.trim(),
        role,
        school,
        programme,
        year,
        bio: bio.trim(),
        skills,
      });
      setSubmittedRequest(res);
      setLoginIdentifier(res.university_id);
      setStatusIdentifier(res.university_id);
      setLoginPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit registration request');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusResult(null);
    const query = statusIdentifier.trim();
    if (!query) {
      setError('Enter your University ID or username to check registration status.');
      return;
    }
    setStatusChecking(true);
    try {
      const res = await api.checkRegistrationStatus(query);
      setStatusResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to check registration status');
    } finally {
      setStatusChecking(false);
    }
  };

  if (isAdminPortal) {
    return (
      <div className="min-h-screen bg-[#FFFFFF] flex flex-col">
        <header className="bg-[#FFFFFF] border-b border-[#2B2B2B]/15 text-[#2B2B2B]">
          <div className="h-1.5 kabuki-stripe" />
          <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
            <div className="flex items-center gap-3 min-w-0">
              <OrbixLogo size="sm" />
              <span className="hidden sm:inline-block h-4 w-px bg-[#2B2B2B]/20" aria-hidden="true" />
              <span className="hidden sm:inline-block text-xs font-bold text-[#006E53] whitespace-nowrap shrink-0">
                IT Department Governance Portal
              </span>
            </div>
            <a
              href="/"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg transition-opacity whitespace-nowrap shrink-0"
            >
              Student &amp; Faculty Portal
            </a>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-6 py-12 bg-[#FFFFFF]">
          <section className="w-full max-w-md bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl overflow-hidden shadow-xs">
            <div className="h-1.5 kabuki-stripe" />
            <div className="p-7">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#006E53]">
                <ShieldCheck className="w-4 h-4 text-[#006E53]" />
                <span>IT Department Administration</span>
              </div>

              <h1 className="mt-2 font-display text-2xl font-bold text-[#2B2B2B]">
                IT Admin Sign In
              </h1>
              <p className="mt-1 text-sm text-[#2B2B2B]/80">
                Authorized Chanakya University IT personnel only. Verify new registration requests, supervise member accounts, review campus posts, and broadcast Spicy News.
              </p>

              {error && (
                <div
                  role="alert"
                  className="mt-4 px-3.5 py-2.5 text-sm text-[#2B2B2B] bg-[#EC6E3C]/12 border border-[#EC6E3C] rounded-lg"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#2B2B2B] mb-1.5">
                    Admin Username *
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="Enter IT admin username"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#2B2B2B] mb-1.5">
                    Admin Password *
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter IT admin password"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-50 rounded-lg transition-opacity"
                >
                  <ShieldCheck className="w-4 h-4 text-white" />
                  <span>{loading ? 'Authenticating...' : 'Sign In to IT Governance'}</span>
                </button>
              </form>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFFFF] flex flex-col">
      {/* Main Top Bar — Japanese Kabuki Palette */}
      <header className="bg-[#FFFFFF] border-b border-[#2B2B2B]/15 text-[#2B2B2B]">
        <div className="h-1.5 kabuki-stripe" />
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="/"
            aria-label="ORBIX — Connect. Collaborate. Grow."
            className="inline-flex items-center shrink-0"
          >
            <OrbixLogo size="sm" />
          </a>
          <div className="hidden md:flex items-center gap-6 text-xs font-bold text-[#2B2B2B]">
            <span className="whitespace-nowrap shrink-0">
              Chanakya University · Student &amp; Faculty Exchange
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setSubmittedRequest(null);
              setError(null);
              setPendingNotice(null);
              setStatusResult(null);
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg transition-opacity whitespace-nowrap shrink-0"
          >
            {mode === 'login' ? 'Register with University ID' : 'Sign In'}
          </button>
        </div>
      </header>

      {/* Main 2-column split */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Editorial Campus Showcase */}
        <section className="lg:col-span-7 flex flex-col justify-between bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl overflow-hidden">
          <div className="h-1.5 kabuki-stripe" />
          <div className="relative min-h-[340px] sm:min-h-[390px] overflow-hidden bg-[#2B2B2B] flex flex-col items-center justify-center px-6 py-10 text-center">
            {/* Subtle constellation backdrop using Japanese Kabuki colors */}
            <svg
              aria-hidden="true"
              viewBox="0 0 720 400"
              className="absolute inset-0 w-full h-full opacity-60 pointer-events-none"
              preserveAspectRatio="xMidYMid slice"
            >
              <g stroke="#EC6E3C" strokeOpacity="0.45" strokeWidth="1.25">
                <line x1="65" y1="75" x2="175" y2="120" />
                <line x1="175" y1="120" x2="115" y2="260" />
                <line x1="175" y1="120" x2="290" y2="55" />
                <line x1="560" y1="60" x2="650" y2="145" />
                <line x1="560" y1="60" x2="470" y2="135" />
                <line x1="650" y1="145" x2="600" y2="275" />
                <line x1="115" y1="260" x2="230" y2="330" />
                <line x1="485" y1="305" x2="600" y2="275" />
              </g>
              <g fill="#FFFFFF" fillOpacity="0.85">
                <circle cx="65" cy="75" r="4" />
                <circle cx="175" cy="120" r="5" />
                <circle cx="560" cy="60" r="4.5" />
                <circle cx="650" cy="145" r="5" />
                <circle cx="230" cy="330" r="3.5" />
              </g>
              <g fill="#006E53">
                <circle cx="115" cy="260" r="4.5" />
                <circle cx="290" cy="55" r="4" />
                <circle cx="470" cy="135" r="4" />
                <circle cx="600" cy="275" r="5" />
                <circle cx="485" cy="305" r="4" />
              </g>
            </svg>

            <div className="relative z-10 max-w-xl mx-auto flex flex-col items-center">
              <OrbixLogo size="lg" tone="light" />

              <div className="mt-5 flex items-center gap-3 w-full max-w-xs justify-center">
                <span className="h-px flex-1 bg-[#EC6E3C]/50" aria-hidden="true" />
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#EC6E3C]/40 rounded-lg text-xs font-semibold text-[#2B2B2B] whitespace-nowrap">
                  <GraduationCap className="w-3.5 h-3.5 text-[#006E53]" />
                  <span>Chanakya University student network</span>
                </span>
                <span className="h-px flex-1 bg-[#EC6E3C]/50" aria-hidden="true" />
              </div>

              <h1 className="mt-5 font-display text-3xl sm:text-4xl font-bold leading-tight text-white text-balance">
                Connect with students.
                <br />
                Share ideas.{' '}
                <span className="inline-block px-2.5 py-0.5 rounded-lg bg-[#006E53] text-white">
                  Build together.
                </span>
              </h1>
            </div>
          </div>

          <div className="p-7 grid grid-cols-1 sm:grid-cols-3 gap-6 border-t border-[#2B2B2B]/15 bg-[#FFFFFF]">
            <div>
              <p className="font-display text-sm font-semibold text-[#2B2B2B]">
                <span className="font-mono text-[#EC6E3C] mr-1.5">01.</span>Admin-Verified Onboarding
              </p>
              <p className="mt-1 text-xs text-[#2B2B2B]/80 leading-relaxed">
                Students and faculty submit their University ID, School, and Programme for fast verification by the University IT Admin.
              </p>
            </div>
            <div>
              <p className="font-display text-sm font-semibold text-[#2B2B2B]">
                <span className="font-mono text-[#006E53] mr-1.5">02.</span>Profile Portfolio Vault
              </p>
              <p className="mt-1 text-xs text-[#2B2B2B]/80 leading-relaxed">
                Store academic certificates, competition awards, and credential files directly on your profile portfolio.
              </p>
            </div>
            <div>
              <p className="font-display text-sm font-semibold text-[#2B2B2B]">
                <span className="font-mono text-[#2B2B2B] mr-1.5">03.</span>Adjacency-List Graph
              </p>
              <p className="mt-1 text-xs text-[#2B2B2B]/80 leading-relaxed">
                Explore 1st, 2nd, and 3rd degree connection chains via breadth-first search and heap-merged feeds.
              </p>
            </div>
          </div>
        </section>

        {/* Right Auth Panel */}
        <section className="lg:col-span-5 bg-[#FFFFFF] border border-[#2B2B2B]/15 rounded-xl p-7 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-1 p-1 bg-white border border-[#2B2B2B]/25 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setPendingNotice(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'login'
                    ? 'bg-[#006E53] text-white'
                    : 'text-[#2B2B2B] hover:bg-[#EC6E3C]/12'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setPendingNotice(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'register'
                    ? 'bg-[#006E53] text-white'
                    : 'text-[#2B2B2B] hover:bg-[#EC6E3C]/12'
                }`}
              >
                Register (University ID)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setError(null);
                  setPendingNotice(null);
                  setSubmittedReset(null);
                  if (loginIdentifier.trim() && !resetIdentifier) {
                    setResetIdentifier(loginIdentifier.trim());
                    setResetStatusIdentifier(loginIdentifier.trim());
                  }
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'forgot'
                    ? 'bg-[#006E53] text-white'
                    : 'text-[#2B2B2B] hover:bg-[#EC6E3C]/12'
                }`}
              >
                Forgot Password
              </button>
            </div>

            <h2 className="mt-5 font-display text-2xl font-bold text-[#2B2B2B]">
              {mode === 'login'
                ? 'Sign in to ORBIX'
                : mode === 'forgot'
                  ? submittedReset
                    ? 'Password Change Request Sent'
                    : 'Request Password Change'
                  : submittedRequest
                    ? 'Registration Request Sent'
                    : 'Request Campus Account'}
            </h2>
            <p className="mt-1 text-sm text-[#2B2B2B]/85">
              {mode === 'login'
                ? 'Sign in with your username or Chanakya University ID.'
                : mode === 'forgot'
                  ? submittedReset
                    ? 'Your new password request has been queued for IT Admin approval. Once accepted, your password will be updated.'
                    : 'Enter your username or University ID and desired new password. Your request goes to the University IT Admin for acceptance.'
                  : submittedRequest
                    ? 'Your registration details have been queued for University IT Admin approval.'
                    : 'All fields marked * are mandatory. Only Skills / Research Interests is optional.'}
            </p>

            {pendingNotice && (
              <div
                role="status"
                className="mt-4 px-3.5 py-3 text-sm text-[#2B2B2B] bg-[#EC6E3C]/12 border border-[#EC6E3C] rounded-lg flex items-start gap-2.5"
              >
                <Clock className="w-4 h-4 text-[#EC6E3C] shrink-0 mt-0.5" />
                <span>{pendingNotice}</span>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mt-4 px-3.5 py-2.5 text-sm text-[#2B2B2B] bg-[#EC6E3C]/12 border border-[#EC6E3C] rounded-lg"
              >
                {error}
              </div>
            )}

            {mode === 'login' ? (
              <div className="mt-5 space-y-5">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#2B2B2B] mb-1.5">
                      Username or University ID
                    </label>
                    <input
                      type="text"
                      required
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      placeholder="e.g. aarav.sharma or CU2024ENG001"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="block text-xs font-semibold text-[#2B2B2B]">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgot');
                          setError(null);
                          setPendingNotice(null);
                          setSubmittedReset(null);
                          setResetStatusResult(null);
                          if (loginIdentifier.trim()) {
                            setResetIdentifier(loginIdentifier.trim());
                            setResetStatusIdentifier(loginIdentifier.trim());
                          }
                        }}
                        className="text-xs font-semibold text-[#006E53] hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-50 rounded-lg transition-opacity"
                  >
                    <KeyRound className="w-4 h-4 text-white" />
                    <span>{loading ? 'Signing in...' : 'Sign In'}</span>
                  </button>
                </form>

                {/* Inline Registration Approval Status Checker (White Search Input) */}
                <div className="pt-4 border-t border-[#2B2B2B]/15 space-y-2.5">
                  <p className="text-xs font-semibold text-[#2B2B2B]">
                    Check Registration Verification Status
                  </p>
                  <form onSubmit={handleCheckStatus} className="flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                      <Search className="w-3.5 h-3.5 text-[#2B2B2B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={statusIdentifier}
                        onChange={(e) => setStatusIdentifier(e.target.value)}
                        placeholder="Enter University ID or username"
                        className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={statusChecking}
                      className="px-3 py-2 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      {statusChecking ? 'Checking...' : 'Check Status'}
                    </button>
                  </form>

                  {statusResult && (
                    <div
                      role="status"
                      className={`px-3 py-2.5 text-xs rounded-lg border flex items-start gap-2 ${
                        statusResult.status === 'approved'
                          ? 'text-white bg-[#006E53] border-[#006E53]'
                          : 'text-[#2B2B2B] bg-[#EC6E3C]/12 border-[#EC6E3C]'
                      }`}
                    >
                      {statusResult.status === 'approved' ? (
                        <CheckCircle2 className="w-4 h-4 text-white shrink-0 mt-0.5" />
                      ) : statusResult.status === 'pending' ? (
                        <Clock className="w-4 h-4 text-[#EC6E3C] shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-[#EC6E3C] shrink-0 mt-0.5" />
                      )}
                      <span>{statusResult.message}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : mode === 'forgot' ? (
              <div className="mt-5 space-y-5">
                {submittedReset ? (
                  <div className="space-y-4">
                    <div
                      role="status"
                      className="p-4 bg-[#EC6E3C]/[0.06] border border-[#EC6E3C] rounded-xl space-y-2.5"
                    >
                      <div className="flex items-start gap-2.5">
                        <Clock className="w-5 h-5 text-[#EC6E3C] shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-[#2B2B2B]">
                            {submittedReset.message}
                          </p>
                          <p className="mt-1 text-xs text-[#2B2B2B]/80 leading-relaxed">
                            Your current password stays active until the University IT Admin accepts this change request.
                          </p>
                        </div>
                      </div>
                      <div className="pt-2.5 border-t border-[#2B2B2B]/15 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[#2B2B2B]/75 block">University ID</span>
                          <span className="font-mono font-semibold text-[#2B2B2B]">
                            {submittedReset.university_id}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#2B2B2B]/75 block">Username</span>
                          <span className="font-mono font-semibold text-[#2B2B2B]">
                            @{submittedReset.username}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setLoginIdentifier(submittedReset.username);
                        setLoginPassword('');
                        setSubmittedReset(null);
                        setError(null);
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg transition-opacity"
                    >
                      <span>Back to Sign In</span>
                      <ArrowRight className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitPasswordReset} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
                        Username or Chanakya University ID *
                      </label>
                      <input
                        type="text"
                        required
                        value={resetIdentifier}
                        onChange={(e) => setResetIdentifier(e.target.value)}
                        placeholder="e.g. aarav.sharma or CU2024ENG001"
                        className="w-full px-3.5 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
                          New Password *
                        </label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={resetNewPassword}
                          onChange={(e) => setResetNewPassword(e.target.value)}
                          placeholder="Min 6 characters"
                          className="w-full px-3.5 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
                          Confirm New Password *
                        </label>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={resetConfirmPassword}
                          onChange={(e) => setResetConfirmPassword(e.target.value)}
                          placeholder="Re-enter new password"
                          className="w-full px-3.5 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
                        Verification Note for IT Admin (optional)
                      </label>
                      <textarea
                        rows={2}
                        value={resetReason}
                        onChange={(e) => setResetReason(e.target.value)}
                        placeholder="e.g. Forgot password — please verify with my department / University ID"
                        className="w-full px-3.5 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] resize-none text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-50 rounded-lg transition-opacity"
                    >
                      <Send className="w-4 h-4 text-white" />
                      <span>{loading ? 'Sending Request...' : 'Send Password Change Request'}</span>
                    </button>
                  </form>
                )}

                {/* Check Password Change Request Status (Pure White Search Input) */}
                <div className="pt-4 border-t border-[#2B2B2B]/15 space-y-2.5">
                  <p className="text-xs font-semibold text-[#2B2B2B]">
                    Check Password Change Request Status
                  </p>
                  <form onSubmit={handleCheckResetStatus} className="flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                      <Search className="w-3.5 h-3.5 text-[#2B2B2B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={resetStatusIdentifier}
                        onChange={(e) => setResetStatusIdentifier(e.target.value)}
                        placeholder="Enter University ID or username"
                        className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={resetStatusChecking}
                      className="px-3 py-2 text-xs font-semibold text-[#2B2B2B] bg-white hover:bg-[#EC6E3C]/12 border border-[#2B2B2B]/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      {resetStatusChecking ? 'Checking...' : 'Check Status'}
                    </button>
                  </form>

                  {resetStatusResult && (
                    <div
                      role="status"
                      className={`px-3 py-2.5 text-xs rounded-lg border flex items-start justify-between gap-2 ${
                        resetStatusResult.status === 'approved'
                          ? 'text-white bg-[#006E53] border-[#006E53]'
                          : 'text-[#2B2B2B] bg-[#EC6E3C]/12 border-[#EC6E3C]'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {resetStatusResult.status === 'approved' ? (
                          <CheckCircle2 className="w-4 h-4 text-white shrink-0 mt-0.5" />
                        ) : resetStatusResult.status === 'pending' ? (
                          <Clock className="w-4 h-4 text-[#EC6E3C] shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-[#EC6E3C] shrink-0 mt-0.5" />
                        )}
                        <span>{resetStatusResult.message}</span>
                      </div>
                      {resetStatusResult.status === 'approved' && (
                        <button
                          type="button"
                          onClick={() => {
                            setMode('login');
                            if (resetStatusResult.username) {
                              setLoginIdentifier(resetStatusResult.username);
                            }
                            setLoginPassword('');
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-white text-[#2B2B2B] rounded-md whitespace-nowrap shrink-0"
                        >
                          Sign In
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : submittedRequest ? (
              <div className="mt-5 space-y-4">
                <div
                  role="status"
                  className="p-4 bg-[#EC6E3C]/[0.06] border border-[#EC6E3C] rounded-xl space-y-2.5"
                >
                  <div className="flex items-start gap-2.5">
                    <Clock className="w-5 h-5 text-[#EC6E3C] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-[#2B2B2B]">
                        Your request has been sent and will be verified by the university admin.
                      </p>
                      <p className="mt-1 text-xs text-[#2B2B2B]/80 leading-relaxed">
                        Your Chanakya University ID and username are reserved while the IT Department reviews your request. Once approved, you can sign in immediately.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-[#2B2B2B]/15 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[#2B2B2B]/75 block">University ID</span>
                      <span className="font-mono font-semibold text-[#2B2B2B]">
                        {submittedRequest.university_id}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#2B2B2B]/75 block">Username</span>
                      <span className="font-mono font-semibold text-[#2B2B2B]">
                        @{submittedRequest.username}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-3.5 py-2.5 bg-white border border-[#2B2B2B]/20 rounded-lg text-xs text-[#2B2B2B]">
                  Noticed a mistake in your University ID? If the ID is wrong, the university admin will not accept the request and will clear it so you can register again with the right ID.
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setStatusIdentifier(submittedRequest.university_id);
                    setLoginIdentifier(submittedRequest.university_id);
                    setSubmittedRequest(null);
                    setError(null);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#006E53] hover:opacity-90 rounded-lg transition-opacity"
                >
                  <span>Go to Sign In &amp; Check Status</span>
                  <ArrowRight className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitRegistration} className="mt-5 space-y-3.5">
                {/* Role selector: Student or Faculty */}
                <div>
                  <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
                    Campus Role *
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-white border border-[#2B2B2B]/25 rounded-lg">
                    <button
                      type="button"
                      onClick={() => handleRoleSwitch('student')}
                      className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        role === 'student'
                          ? 'bg-[#006E53] text-white'
                          : 'text-[#2B2B2B] hover:bg-[#EC6E3C]/12'
                      }`}
                    >
                      Student
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRoleSwitch('faculty')}
                      className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        role === 'faculty'
                          ? 'bg-[#006E53] text-white'
                          : 'text-[#2B2B2B] hover:bg-[#EC6E3C]/12'
                      }`}
                    >
                      Faculty
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
                    Chanakya University ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={universityId}
                    onChange={(e) => setUniversityId(e.target.value)}
                    placeholder={role === 'faculty' ? 'e.g. CUFACENG012' : 'e.g. CU2025CSE042'}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
                      Unique Username *
                    </label>
                    <input
                      type="text"
                      required
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="e.g. kavya.rao"
                      className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
                      Password *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={role === 'faculty' ? 'e.g. Dr. Kavya Rao' : 'e.g. Kavya Rao'}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                  />
                </div>

                {/* School Selection -> Cascades Programme Options */}
                <div>
                  <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
                    School *
                  </label>
                  <select
                    required
                    value={school}
                    onChange={(e) => handleSchoolChange(e.target.value)}
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

                {school && (
                  <div className="p-3 bg-[#EC6E3C]/[0.06] border border-[#2B2B2B]/15 rounded-lg space-y-1.5">
                    <label className="block text-xs font-semibold text-[#2B2B2B]">
                      Programme ({school}) *
                    </label>
                    <select
                      required
                      value={programme}
                      onChange={(e) => setProgramme(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B]"
                    >
                      <option value="">-- Select Programme --</option>
                      {availableProgrammes.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
                    {role === 'faculty' ? 'Designation *' : 'Year *'}
                  </label>
                  <select
                    required
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B]"
                  >
                    <option value="">
                      {role === 'faculty' ? '-- Select Designation --' : '-- Select Year --'}
                    </option>
                    {(role === 'faculty' ? FACULTY_DESIGNATIONS : STUDENT_YEARS).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#2B2B2B] mb-1">
                    Short Bio *
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="What are you studying, building, teaching, or researching?"
                    className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] resize-none text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#2B2B2B]/80 mb-1">
                    Skills / Research Interests (optional, comma-separated)
                  </label>
                  <input
                    type="text"
                    value={skillsText}
                    onChange={(e) => setSkillsText(e.target.value)}
                    placeholder="Python, Robotics, Public Policy, Biotechnology"
                    className="w-full px-3 py-2 text-sm bg-white border border-[#2B2B2B]/25 rounded-lg focus:outline-none focus:border-[#006E53] text-[#2B2B2B] placeholder:text-[#2B2B2B]/50"
                  />
                </div>

                {/* Pre-Submission University ID & Details Verification Sign */}
                <div className="p-3 bg-[#EC6E3C]/10 border border-[#EC6E3C] rounded-lg flex items-start gap-2.5 text-xs text-[#2B2B2B]">
                  <AlertTriangle className="w-4 h-4 text-[#EC6E3C] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[#2B2B2B]">
                      Check for any corrections before submitting
                    </p>
                    <p className="mt-0.5 leading-relaxed text-[#2B2B2B]/80">
                      Please verify your Chanakya University ID, username, school, and programme carefully. Your request will not be accepted by the university admin if your University ID is wrong.
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#006E53] hover:opacity-90 disabled:opacity-50 rounded-lg transition-opacity"
                >
                  <Send className="w-4 h-4 text-white" />
                  <span>{loading ? 'Sending Request...' : 'Send Request to University Admin'}</span>
                </button>
              </form>
            )}
          </div>

          <div className="mt-6 pt-5 border-t border-[#2B2B2B]/15">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#2B2B2B]">
                  IT Department Governance
                </p>
                <p className="text-xs text-[#2B2B2B]/80 mt-0.5">
                  Opens dedicated IT Admin Login in a new tab
                </p>
              </div>
              <a
                href="/?portal=admin"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#2B2B2B] hover:opacity-90 rounded-lg transition-opacity whitespace-nowrap shrink-0"
              >
                <span>IT Admin Login</span>
                <ExternalLink className="w-3.5 h-3.5 text-white" />
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
