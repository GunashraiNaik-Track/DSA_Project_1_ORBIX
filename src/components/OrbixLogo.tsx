interface OrbixLogoProps {
  size?: 'sm' | 'lg';
  showTagline?: boolean;
  tone?: 'light' | 'dark';
}

const ORBIX_LOGO_SRC = '/assets/aistudio/IMG-20261121-WA0001_9a2d529a.jpg';

export function OrbixLogo({ size = 'sm', showTagline, tone }: OrbixLogoProps) {
  const withTagline = showTagline ?? size === 'lg';
  const resolvedTone = tone ?? 'dark';

  if (size === 'lg') {
    return (
      <div className="inline-flex flex-col items-center text-center select-none">
        <div className="relative w-44 h-44 sm:w-52 sm:h-52 overflow-hidden [clip-path:circle(48.5%_at_50%_50%)] bg-[#2B2B2B] ring-2 ring-[#EC6E3C] shadow-lg">
          <img
            src={ORBIX_LOGO_SRC}
            alt="ORBIX logo"
            className="w-full h-full object-cover object-center scale-[1.22] pointer-events-none select-none"
          />
        </div>
        {withTagline && (
          <span
            className={`mt-3 text-sm sm:text-base font-bold tracking-wide ${
              resolvedTone === 'light' ? 'text-[#EC6E3C]' : 'text-[#006E53]'
            }`}
          >
            Connect. Collaborate. Grow.
          </span>
        )}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0">
      <span className="relative w-10 h-10 overflow-hidden [clip-path:circle(48.5%_at_50%_50%)] bg-[#2B2B2B] ring-1 ring-[#EC6E3C] shrink-0">
        <img
          src={ORBIX_LOGO_SRC}
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover object-center scale-[1.22] pointer-events-none select-none"
        />
      </span>
      <span className="flex flex-col items-start leading-none">
        <span
          className={`font-display text-lg font-bold tracking-[0.12em] ${
            resolvedTone === 'light' ? 'text-white' : 'text-[#2B2B2B]'
          }`}
        >
          ORBIX
        </span>
        {withTagline && (
          <span
            className={`mt-0.5 text-[10px] font-semibold tracking-wide ${
              resolvedTone === 'light' ? 'text-[#EC6E3C]' : 'text-[#006E53]'
            }`}
          >
            Connect. Collaborate. Grow.
          </span>
        )}
      </span>
    </span>
  );
}
