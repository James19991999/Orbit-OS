export function Prose({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 [&_h2]:mt-8 [&_h2]:text-headline-sm [&_li]:mt-1 [&_p]:mt-3 [&_p]:text-body-lg [&_p]:text-on-surface-variant [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-body-lg [&_ul]:text-on-surface-variant">
      <h1 className="text-headline-lg-mobile md:text-headline-lg">{title}</h1>
      {updated && <p className="!text-body-sm">Last updated {updated}</p>}
      {children}
    </article>
  );
}
