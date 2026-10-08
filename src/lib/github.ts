import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verifies GitHub's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body). */
export function verifyGithubSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !header.startsWith('sha256=') || !secret) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(header); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface GithubActivity { kind: 'github_pr_merged' | 'github_push'; title: string; body: string | null; link: string | null; actor: string | null }

/** Maps the GitHub events we care about to activity-stream entries; everything else is ignored. */
export function githubToActivity(event: string | null, p: Record<string, unknown>): GithubActivity | null {
  const repo = (p.repository as { full_name?: string } | undefined)?.full_name ?? 'repository';
  if (event === 'pull_request') {
    const pr = p.pull_request as { merged?: boolean; number?: number; title?: string; html_url?: string; user?: { login?: string }; changed_files?: number; additions?: number; deletions?: number } | undefined;
    if (p.action !== 'closed' || !pr?.merged) return null;
    return { kind: 'github_pr_merged', title: `Merged PR #${pr.number} in ${repo}: ${pr.title ?? ''}`.slice(0, 200),
      body: pr.changed_files !== undefined ? `${pr.changed_files} files changed (+${pr.additions ?? 0}, -${pr.deletions ?? 0})` : null, link: pr.html_url ?? null, actor: pr.user?.login ?? null };
  }
  if (event === 'push') {
    const commits = (p.commits as unknown[] | undefined)?.length ?? 0;
    const ref = String(p.ref ?? '').replace('refs/heads/', '');
    if (!commits) return null;
    return { kind: 'github_push', title: `Pushed ${commits} commit${commits === 1 ? '' : 's'} to ${repo}@${ref}`, body: null,
      link: (p.compare as string) ?? null, actor: (p.pusher as { name?: string } | undefined)?.name ?? null };
  }
  return null;
}
