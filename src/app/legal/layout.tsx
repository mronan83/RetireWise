import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 md:py-16">
      <nav className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <Link href="/" className="font-heading font-semibold hover:underline">
          RetireWise
        </Link>
        <Link href="/legal/terms" className="text-muted-foreground hover:underline">
          Terms
        </Link>
        <Link href="/legal/privacy" className="text-muted-foreground hover:underline">
          Privacy
        </Link>
      </nav>
      <article className="space-y-5 text-[15px] leading-relaxed">
        {children}
      </article>
    </div>
  );
}
