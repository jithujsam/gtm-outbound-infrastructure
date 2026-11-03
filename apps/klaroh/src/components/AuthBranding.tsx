import Image from 'next/image';

interface AuthBrandingProps {
  headline: string;
  supporting: string;
}

export default function AuthBranding({ headline, supporting }: AuthBrandingProps) {
  return (
    <section className="hidden flex-col justify-between overflow-hidden bg-primary p-10 lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-1/2">
      {/* Soft background mesh */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-20">
        <div className="absolute -left-[10%] -top-[10%] h-[70%] w-[70%] rounded-full bg-primary-fixed-dim blur-[120px]" />
        <div className="absolute -bottom-[10%] -right-[10%] h-[60%] w-[60%] rounded-full bg-primary-fixed blur-[100px]" />
      </div>

      {/* Logo */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-lowest shadow-modal">
          <Image src="/logo.svg" alt="Klaroh" width={22} height={22} />
        </div>
        <span className="font-sans text-xl font-semibold tracking-tight text-on-primary">Klaroh</span>
      </div>

      {/* Headline */}
      <div className="relative z-10 max-w-lg">
        {/* Not a heading: each page has its own h1 in the form column. */}
        <p className="type-page-title text-on-primary">{headline}</p>
        <p className="font-sans mt-6 text-lg leading-relaxed text-on-primary-container">
          {supporting}
        </p>
      </div>

      {/* Social proof */}
      <div className="relative z-10">
        <p className="font-sans text-xs text-on-primary-container/60">
          © {new Date().getFullYear()} Klaroh Platform. Precision. Transparency. Authority.
        </p>
      </div>
    </section>
  );
}

/** Brand mark for small screens, where the green panel is hidden. */
export function AuthMobileBrand() {
  return (
    <div className="mb-8 flex items-center gap-3 lg:hidden">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/60 bg-surface-container-lowest">
        <Image src="/logo.svg" alt="" width={20} height={20} />
      </div>
      <span className="font-sans text-xl font-semibold tracking-tight text-on-surface">Klaroh</span>
    </div>
  );
}
