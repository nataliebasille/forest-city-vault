import type { ReactNode } from "react";
import { SiteHeader } from "@/components/nav/SiteHeader";

type LegalPageProps = {
  /** Document title, e.g. "Privacy Policy". */
  title: string;
  /** Short one-line summary shown under the title. */
  intro: string;
  /** Small uppercase label above the title. Defaults to "Legal". */
  eyebrow?: string;
  /** Formatted "Last updated" date. Omit for pages without a revision date. */
  lastUpdated?: string;
  /** The document body: use `<h2>`, `<h3>`, `<p>`, `<ul>/<li>`, `<a>`. */
  children: ReactNode;
};

/**
 * Shared shell for legal/informational documents (Privacy Policy, EULA,
 * Support). Renders the site header, a titled hero, and a readable prose
 * column. Styling for the body is applied via child selectors on
 * {@link PROSE_CLASS} so pages can author plain semantic HTML without repeating
 * Tailwind on every element.
 */
export function LegalPage({
  title,
  intro,
  eyebrow = "Legal",
  lastUpdated,
  children,
}: LegalPageProps) {
  return (
    <main className="vault-paper min-h-full">
      <SiteHeader />

      <section className="border-b border-surface-500/25 bg-gradient-to-b from-accent-50/45 via-accent-50/20 to-accent-50/35">
        <div className="mx-auto w-full max-w-3xl px-6 py-14 md:px-10 md:py-20">
          <p className="flex items-center gap-3 font-subheading text-xs font-semibold tracking-[0.28em] text-primary-500 uppercase">
            <span className="h-px w-8 bg-primary-500" aria-hidden="true" />
            {eyebrow}
          </p>
          <h1 className="mt-5 font-heading text-4xl leading-[1.05] text-ink sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 text-lg/8 text-on-surface-50/80">{intro}</p>
          {lastUpdated ?
            <p className="mt-4 font-subheading text-sm font-semibold text-ink/60">
              Last updated: {lastUpdated}
            </p>
          : null}
        </div>
      </section>

      <section className="bg-surface-50 py-14 md:py-20">
        <div className="mx-auto w-full max-w-3xl px-6 md:px-10">
          <article className={PROSE_CLASS}>{children}</article>
        </div>
      </section>
    </main>
  );
}

/**
 * Typography for legal document bodies. Each tag selector sets its own top
 * margin so no element ever matches two conflicting spacing utilities.
 */
const PROSE_CLASS = [
  "text-base/7 text-on-surface-50/85",
  "[&>*:first-child]:mt-0",
  "[&_h2]:mt-10 [&_h2]:font-heading [&_h2]:text-2xl [&_h2]:text-ink [&_h2]:sm:text-3xl",
  "[&_h3]:mt-6 [&_h3]:font-subheading [&_h3]:font-semibold [&_h3]:text-ink",
  "[&_p]:mt-4",
  "[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6",
  "[&_li]:mt-2 [&_li]:marker:text-primary-500",
  "[&_a]:font-semibold [&_a]:text-primary-500 [&_a]:underline",
  "[&_strong]:font-semibold [&_strong]:text-ink",
].join(" ");
