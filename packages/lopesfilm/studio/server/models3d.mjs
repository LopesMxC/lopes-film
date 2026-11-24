// @ts-check
/**
 * A 3D model on the timeline (a .glb, .gltf or .fbx): the film plays pages, not models, so a model put on the timeline
 * becomes a page of its own, `scenes/3d-<name>.html`, that shows it with three.js (Studio's own copy, served as
 * `__film/three/three-model.mjs`): lit, framed to fit, its own animation played on the film's time, turning slowly,
 * over a transparent background so it sits on the footage under it. The page is a normal page: its look can be changed
 * in it (an agent can light it, move the camera, add text) and it is drawn exactly frame by frame.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

export const MODEL_EXT = /\.(glb|gltf|fbx)$/i;
export const isModel = (/** @type {unknown} */ src) => typeof src === 'string' && MODEL_EXT.test(src.split(/[?#]/)[0] ?? '');

/** @param {string} name */
const slug = (name) => name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'model';

/**
 * The page that shows the model `src` (relative to the film's folder), made once: its path, relative to the film.
 * @param {string} root the film's folder @param {string} src
 */
export async function modelPage(root, src) {
  const file = src.split(/[?#]/)[0] ?? src;
  const rel = `scenes/3d-${slug(basename(file, extname(file)))}.html`;
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    await mkdir(join(root, 'scenes'), { recursive: true });
    await writeFile(abs, pageFor(`../${file}`, /\.fbx$/i.test(file) ? 'fbx' : 'gltf', basename(file)));
  }
  return rel;
}

/** The operations with every model put on the timeline replaced by its page. @param {string} root @param {any[]} ops */
export async function withModelPages(root, ops) {
  if (!Array.isArray(ops) || !ops.some((op) => isModel(op?.clip?.src))) return ops;
  const out = [];
  for (const op of ops) {
    if (op?.op === 'insert' && isModel(op.clip?.src)) {
      const page = await modelPage(root, op.clip.src);
      out.push({ ...op, clip: { ...op.clip, src: page } });
    } else out.push(op);
  }
  return out;
}

/** @param {string} url the model, from the page @param {'fbx' | 'gltf'} kind @param {string} name */
function pageFor(url, kind, name) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${name.replace(/[<&]/g, '')}</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}canvas{display:block;width:100%;height:100%}</style>
</head><body>
<script type="module">
/* a 3D model shown on the film's time (studio/server/models3d.mjs). Change it here:
   TURN = how far it turns per second (radians; 0 = still), CAMERA = where the camera looks from (x, y, z, of the model's size),
   CLIP = which of its animations plays (by name or number), SCALE, LIGHT. */
import { THREE, GLTFLoader, FBXLoader, RoomEnvironment } from '../__film/three/three-model.mjs';
import * as FilmCompat from 'film-compat';
const MODEL = ${JSON.stringify(url)};
const TURN = 0.35, CAMERA = [0.9, 0.55, 1.6], CLIP = 0, SCALE = 1, LIGHT = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45 * LIGHT;
scene.add(new THREE.HemisphereLight(0xffffff, 0x333340, 0.35 * LIGHT));
const sun = new THREE.DirectionalLight(0xffffff, 1.6 * LIGHT); sun.position.set(3, 5, 4); scene.add(sun);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 1000);
const holder = new THREE.Group(); scene.add(holder);
let mixer = null, action = null;

const loaded = new Promise((done, fail) => {
  const loader = ${kind === 'fbx' ? 'new FBXLoader()' : 'new GLTFLoader()'};
  loader.load(MODEL, (got) => {
    const model = got.scene ?? got;
    holder.add(model);
    /* framed to fit: its middle at the origin, the camera far enough to see all of it */
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    model.position.sub(mid);
    /* the sphere around it, so it fits whichever way it turns */
    const r = (size.length() / 2) * SCALE || 1;
    holder.scale.setScalar(SCALE);
    const d = r / Math.sin((Math.min(camera.fov, camera.fov * camera.aspect) * Math.PI) / 360) * 1.15;
    const v = new THREE.Vector3(...CAMERA).normalize().multiplyScalar(d);
    camera.position.copy(v); camera.near = d / 100; camera.far = d * 100; camera.updateProjectionMatrix(); camera.lookAt(0, 0, 0);
    const clips = got.animations ?? model.animations ?? [];
    if (clips.length) {
      mixer = new THREE.AnimationMixer(model);
      const clip = typeof CLIP === 'string' ? clips.find((c) => c.name === CLIP) ?? clips[0] : clips[CLIP] ?? clips[0];
      action = mixer.clipAction(clip); action.play();
    }
    done();
  }, undefined, (e) => fail(new Error('the model could not be read: ' + (e?.message ?? e))));
});
FilmCompat.waitFor(loaded);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
FilmCompat.three(renderer, scene, camera, (t) => {
  holder.rotation.y = t * TURN;
  if (mixer && action) { const len = action.getClip().duration || 1; mixer.setTime(t % len); }
});
</script>
</body></html>
`;
}
