#!/usr/bin/env node
/** Write studio/server/skill-curated.json: reviewed skills of public GitHub repositories (Apache-2.0 / MIT per each repo's licence; the Remotion repository states none, so those are only pointed to, never bundled), pinned at a commit with a manifest of their files (path, size, sha256) so Discover shows them and checks every
 * file it downloads. Reads the local clones only:  node scripts/skill-curated.mjs <dir with anthropics_skills, greensock_gsap-skills, vercel-labs_agent-skills> */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('usage: skill-curated.mjs <clones dir>');
const PICK = [
  ['greensock/gsap-skills', 'greensock_gsap-skills', ['gsap-core', 'gsap-timeline', 'gsap-plugins', 'gsap-utils', 'gsap-performance', 'gsap-scrolltrigger', 'gsap-react', 'gsap-frameworks']],
  ['anthropics/skills', 'anthropics_skills', ['frontend-design', 'canvas-design', 'algorithmic-art', 'theme-factory', 'brand-guidelines', 'slack-gif-creator', 'skill-creator']],
  ['vercel-labs/agent-skills', 'vercel-labs_agent-skills', ['web-design-guidelines']],
  ['remotion-dev/skills', 'remotion_skills', ['remotion-best-practices', 'remotion-captions', 'remotion-create', 'remotion-docs', 'remotion-interactivity', 'remotion-license', 'remotion-maps', 'remotion-markup', 'remotion-multimedia', 'remotion-render', 'remotion-saas', 'remotion-studio', 'remotion-upgrade']],
];
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
/* a clone that is not there keeps what the file already lists from its repository */
const out = new URL('../studio/server/skill-curated.json', import.meta.url);
let skills = [];
try { skills = JSON.parse(readFileSync(out, 'utf8')).skills; } catch { /* first time */ }
for (const [repo, dir, names] of PICK) {
  const clone = join(root, dir);
  try { statSync(clone); } catch { continue; }
  skills = skills.filter((s) => s.repo !== `https://github.com/${repo}`);
  const commit = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD']).toString().trim();
  for (const name of names) {
    const base = join(clone, 'skills', name);
    const files = walk(base).map((f) => { const b = readFileSync(f); return { path: relative(base, f).split(sep).join('/'), size: b.length, sha256: createHash('sha256').update(b).digest('hex') }; })
      .filter((f) => !f.path.split('/').some((p) => p.startsWith('.'))).sort((a, b) => a.path.localeCompare(b.path));
    skills.push({ name, repo: `https://github.com/${repo}`, path: `skills/${name}`, version: readFileSync(join(base, 'SKILL.md'), 'utf8').match(/^version:\s*['"]?(\d+\.\d+\.\d+)/m)?.[1] ?? '1.0.0', commit, files });
  }
}
writeFileSync(out, `${JSON.stringify({ version: 1, skills })}\n`);
console.log(skills.map((s) => `${s.name} ${s.files.length} files`).join('\n'));
