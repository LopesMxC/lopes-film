// @ts-check
/**
 * The agent's edits, made by the editor: `lopesfilm edit` sends operations (the ones of ops.mjs) here; when a page shows
 * the project they go to it, its cursor goes to the clip and the editor makes the edit as its own (the same function
 * a mouse uses: undo step, locked tracks, caption cues), then the page says how it went. With no page showing the
 * project, or one that does not take the job, Studio makes the edit itself, so an agent always gets its edit.
 */
import { randomUUID } from 'node:crypto';

/**
 * `{"op":"cut","clip":"<id>","at":<film seconds>}`, the cut as an agent says it, as the split ops.mjs applies, for when Studio
 * makes the edit itself: the clip's trim (`time`, source seconds) is divided where `at` falls. The editor works out its own.
 * @param {{ tracks: Array<{ clips: Array<Record<string, any>> }> }} value @param {any[]} ops
 */
export function expandCuts(value, ops) {
  return ops.map((op) => {
    if (op?.op !== 'cut') return op;
    const clip = value.tracks.flatMap((t) => t.clips).find((c) => c.id === op.clip);
    if (!clip) throw new Error(`clip "${op.clip}" is not in the film`);
    const from = Array.isArray(clip.time) ? clip.time[0] : 0;
    const to = Array.isArray(clip.time) ? clip.time[1] : undefined;
    const start = Number(clip.at ?? 0), speed = Number(clip.speed) > 0 ? Number(clip.speed) : 1;
    if (to === undefined) throw new Error('this clip can only be cut with the editor open: it has no trim to divide');
    const cut = from + (Number(op.at) - start) * speed;
    if (!(cut > from && cut < to)) throw new Error(`${op.at} s is not inside clip "${op.clip}"`);
    return { op: 'split', clip: op.clip, at: Number(op.at), time: [from, cut], restTime: [cut, to] };
  });
}

/** How long a page has to take a job (it says so at once), and to finish one operation. */
const CLAIM_MS = 2500;
const EACH_MS = 20000;

/**
 * @param {{ emit: (root: string, event: unknown) => void, pages: (root: string) => number,
 *           direct: (root: string, ops: unknown[]) => Promise<unknown> }} o
 */
export function createAgentOps({ emit, pages, direct }) {
  /** @type {Map<string, { root: string, claimed: boolean, settle: (r: { ok: boolean, error?: string, by: 'editor' | 'studio' }) => void, wait: ReturnType<typeof setTimeout> | null, ops: unknown[], each: number }>} */
  const jobs = new Map();

  /** @param {string} root @param {unknown[]} ops @param {string} [label] */
  function run(root, ops, label) {
    const through = async () => {
      try { await direct(root, ops); return { ok: true, by: /** @type {const} */ ('studio') }; }
      catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e), by: /** @type {const} */ ('studio') }; }
    };
    if (!pages(root)) return through();
    const id = randomUUID();
    return new Promise((resolve) => {
      const job = { root, claimed: false, ops, each: ops.length, wait: /** @type {ReturnType<typeof setTimeout> | null} */ (null),
        settle: (/** @type {any} */ r) => { if (job.wait) clearTimeout(job.wait); jobs.delete(id); resolve(r); } };
      jobs.set(id, job);
      /* nobody took it in time: Studio does it */
      job.wait = setTimeout(() => { jobs.delete(id); void through().then(resolve); }, CLAIM_MS);
      emit(root, { type: 'agent-ops', id, ops, ...(label ? { label } : {}) });
    });
  }

  /** The page takes the job: false when it was given up (Studio did it, or it is not there). */
  function claim(/** @type {string} */ id) {
    const job = jobs.get(id);
    if (!job) return false;
    job.claimed = true;
    if (job.wait) clearTimeout(job.wait);
    job.wait = setTimeout(() => { jobs.delete(id); void direct(job.root, job.ops).then(() => job.settle({ ok: true, by: 'studio' }), (e) => job.settle({ ok: false, error: String(e?.message ?? e), by: 'studio' })); }, EACH_MS * Math.max(1, job.each));
    return true;
  }

  function done(/** @type {string} */ id, /** @type {string | null | undefined} */ error) {
    const job = jobs.get(id);
    if (!job) return false;
    job.settle(error ? { ok: false, error, by: 'editor' } : { ok: true, by: 'editor' });
    return true;
  }

  return { run, claim, done };
}
