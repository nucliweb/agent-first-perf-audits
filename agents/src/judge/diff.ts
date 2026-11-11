// The diff of the branch under comparison, as the Judge reads it: the changes in apps/shop without
// the tests that the branch adjusts, which tell nothing about the cause of a regression.
import { execFileSync } from "node:child_process";

const EXCLUDES = [":(exclude)apps/shop/*.test.mjs", ":(exclude)apps/shop/**/*.test.ts"];

// The repo is mounted from the host inside the ci service, with another owner than the container user
const git = (repo: string, ...args: string[]) =>
  execFileSync("git", ["-c", `safe.directory=${repo}`, "-C", repo, ...args], { encoding: "utf8" }).trim();

export const diffOf = (repo: string, baseline: string, candidate: string) =>
  git(repo, "diff", `${baseline}...${candidate}`, "--", "apps/shop", ...EXCLUDES);

// The local and remote branches of the repo, such as main and origin/pr/lcp-hero-lazy
export const refsOf = (repo: string) => git(repo, "for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes").split("\n");

// The ref of a shop image: scripts/build-shop.sh tags it with the ref and "/" as "-". A branch of a
// fresh clone may exist only on the remote, so a local branch wins over the remote one.
export function refOfTag(tag: string, refs: string[]): string {
  const named = (ref: string) => ref.replaceAll("/", "-") === tag;
  const ref = refs.find(named) ?? refs.find((r) => r.startsWith("origin/") && named(r.slice("origin/".length)));
  if (!ref) throw new Error(`No branch of the repo builds the shop image ${tag}. Fetch the branches of the repo first.`);
  return ref;
}
