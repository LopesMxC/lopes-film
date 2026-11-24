/**
 * Build the app people install: `pnpm --filter @lopesfilm/desktop release` (`--arch=x64` for Intel Macs, default this
 * Mac's; `--unsigned` for a local try; `--platform=win --arch=x64|arm64` for the Windows installer, built here too;
 * `--official` for the project's own build; `--preview` for "Lopes.Film Preview", an app of its own to try a build in).
 *
 * Which build it is comes from the `lopesfilm` package's product files: a build of this source uses product.json,
 * empty in the repository (no update feed: the app never looks for updates); `--official` uses product.official.json
 * (the update feed under its `desktop.updates`).
 *
 *   1. the window's page (shell/: Studio's editor with the chat beside it) and Studio's editor on its own (the
 *      `lopesfilm` package's UI) are built (the chat's `@lopesfilm/shared` is bundled into the page);
 *   2. a stage folder gets the app's own files and a plain npm install of what it needs at run time: the `lopesfilm`
 *      package as `npm pack` makes it (what npm would publish), the agents' ACP adapters
 *      and the updater. Optional dependencies are left out: the adapters would bring the makers' own Claude Code and
 *      Codex programs (200–330 MB each), and the app uses the person's own installation instead (src/agents.mjs).
 *      The staged `lopesfilm` package gets the build's product.json;
 *   2b. the programs the app needs that are not node modules, for the platform and chip built for, in the app's
 *      resources (runtime/; src/main.mjs puts them to use): ffmpeg and ffprobe with their license (src/ffmpeg-runtime.mjs),
 *      and the headless browser Studio and `lopesfilm` draw pages in (Playwright's, the revision the staged
 *      playwright-core takes). People never download either: on a slow or blocked connection the first start used to
 *      fail there;
 *   3. electron-builder makes the .dmg (to download) and the .zip (for updates), signed with the Developer ID
 *      LOPESFILM_SIGN_IDENTITY ("Name (TEAMID)") and notarized (APPLE_TEAM_ID, the `lopesfilm-notary` keychain profile or
 *      LOPESFILM_NOTARY_PROFILE), with the update feed written in (none without one). Without LOPESFILM_SIGN_IDENTITY
 *      and APPLE_TEAM_ID the build is unsigned, as with --unsigned.
 *
 *   4. the .dmg is signed and notarized too, so the download itself opens without a warning.
 *
 * Windows: an NSIS installer (Lopes.Film-Setup-<version>-<arch>.exe, per user, no admin) and its feed (latest.yml). It is
 * built on this Mac: the program's icon and version are written into Lopes.Film.exe with resedit (rcedit would need
 * wine). Not code-signed yet (no Windows certificate): SmartScreen asks once, "More info" → "Run anyway".
 *
 * Output: .release/<arch>/out (git-ignored). Nothing is uploaded: official builds are published by the project's
 * release pipeline.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lockedOverrides, versionsOffLock } from './locked-versions.mjs';
import { brandAsset, loadBrand } from '../../../brands/load.mjs';
import { rebrandStage } from './rebrand.mjs';

const require = createRequire(import.meta.url);
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/* the `lopesfilm` package (Studio, the CLI), where node finds it */
const protocol = dirname(require.resolve('lopesfilm/package.json'));
const asked = process.argv.find((a) => a.startsWith('--arch='))?.slice('--arch='.length);
const arch = asked === 'x64' || asked === 'arm64' ? asked : process.arch === 'arm64' ? 'arm64' : 'x64';
const win = process.argv.includes('--platform=win');
const work = join(desktop, '.release', win ? `win-${arch}` : arch);
const stage = join(work, 'app');
const out = join(work, 'out');
/* the Developer ID ("Name (TEAMID)") and its team, from the environment (the release pipeline's secrets) */
const IDENTITY = process.env.LOPESFILM_SIGN_IDENTITY?.trim() || '';
const TEAM_ID = process.env.APPLE_TEAM_ID?.trim() || '';
const unsigned = process.argv.includes('--unsigned') || (!win && (!IDENTITY || !TEAM_ID));
if (unsigned && !win && !process.argv.includes('--unsigned')) {
  console.warn('LOPESFILM_SIGN_IDENTITY and APPLE_TEAM_ID are not set: building an unsigned app (not notarized). Official builds are signed by the release pipeline.');
}

/* this build's product: its update feed (see the header) */
const official = process.argv.includes('--official');
/* --preview: "Lopes.Film Preview", to try a build in apart from an installed Lopes.Film: its own name and bundle, data
   folder, Studio home, port and projects (src/flavor.mjs `preview`, from the package's `lopesfilmFlavor`); no updates */
const preview = process.argv.includes('--preview');
if (preview && official) throw new Error('--preview is never the official build');
/* --brand=lopes|global|verkz: Lopes.Film (the source's own), GlobalFilm or VerkzFilm (brands/): its name, appId, icons, colors, folders */
const brandId = process.argv.find((a) => a.startsWith('--brand='))?.slice('--brand='.length) || process.env.LOPESFILM_BRAND || 'lopes';
const brand = loadBrand(brandId);
process.env.LOPESFILM_BRAND = brand.id;
if (preview && brand.id !== 'lopes') throw new Error('--preview is only for Lopes.Film');
const NAME = preview ? 'Lopes.Film Preview' : brand.name;
const ICON_ICO = brandAsset(brand.id, 'icon.ico');
const ICON_ICNS = brandAsset(brand.id, 'icon.icns');
const ICON_PNG = brandAsset(brand.id, 'icon.png');
const productFile = join(protocol, official ? 'product.official.json' : 'product.json');
const product = JSON.parse(readFileSync(productFile, 'utf8'));
const updates = typeof product.desktop?.updates === 'string' ? product.desktop.updates.trim().replace(/\/+$/, '') : '';
/** Where the packaged app looks for updates (the release's files are uploaded there), or null: it never looks. */
/* O feed é o site de atualizações da Lopes (lopes-updates/), nunca o do product.json (que era o do projeto original):
   LOPESFILM_UPDATE_FEED=https://seu-site/feed/lopes-film no build, ou "updates" no brand.json da marca. Sem nenhum dos
   dois, o app não procura atualizações. */
const feedUrl = (process.env.LOPESFILM_UPDATE_FEED || (typeof brand.updates === 'string' ? brand.updates : '')).trim().replace(/\/+$/, '');
export const FEED = preview || !/^https:\/\//.test(feedUrl) ? null : feedUrl;
void updates;
const NOTARY_PROFILE = process.env.LOPESFILM_NOTARY_PROFILE || 'lopesfilm-notary';

/* on a Windows computer npm and pnpm are .cmd files: they need a shell (none of the arguments has a space) */
const shell = process.platform === 'win32';
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...(shell && /^p?npm$/.test(cmd) ? { shell } : {}), ...opts });
const pkg = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'));
/* each compile has its own version: the package's, with its patch raised by a counter kept on this computer
   (~/.lopesfilm-build.json), so an installed Lopes.Film is offered the update and Settings shows which build it is */
const buildVersion = (() => {
  if (process.argv.includes('--keep-version')) return pkg.version;
  const file = join(homedir(), '.lopesfilm-build.json');
  let known = {};
  try { known = JSON.parse(readFileSync(file, 'utf8')); } catch { /* the first build here */ }
  const n = known.base === pkg.version ? Number(known.n) + 1 || 1 : 1;
  try { writeFileSync(file, JSON.stringify({ base: pkg.version, n })); } catch { /* counted again next time */ }
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  return `${major}.${minor}.${patch + n}`;
})();
console.log(`${NAME} build ${buildVersion}`);

/* 1. the window's page, and Studio's editor for the package */
const vite = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
run(process.execPath, [vite, 'build', '--config', 'shell/vite.config.ts', '--logLevel', 'warn'], { cwd: desktop });
/* the old assets stay: a Studio already running from this checkout keeps loading the pages it has open */
run(process.execPath, [vite, 'build', '--config', 'studio/ui/vite.config.ts', '--emptyOutDir=false', '--logLevel', 'warn'], { cwd: protocol });

/* 2. the stage */
rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
mkdirSync(stage, { recursive: true });
cpSync(join(desktop, 'src'), join(stage, 'src'), { recursive: true, filter: (from) => !from.endsWith('.test.mjs') });
cpSync(join(desktop, 'shell/dist'), join(stage, 'shell/dist'), { recursive: true });
/* the window's icon on Windows (src/main.mjs reads ../build/icon.png): the brand's */
mkdirSync(join(stage, 'build'), { recursive: true });
cpSync(ICON_PNG, join(stage, 'build/icon.png'));
/* the providers every copy of the app starts with (build/providers.seed.json), see src/legacy-home.mjs */
cpSync(join(desktop, 'build/providers.seed.json'), join(stage, 'build/providers.seed.json'));
const pack = (dir) => execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', shell ? `"${work}"` : work, '--silent'], { cwd: dir, encoding: 'utf8', shell }).trim().split(/\r?\n/).pop();
const dependencies = { ...pkg.dependencies, lopesfilm: `file:../${pack(protocol)}` };
/* npm takes the versions pnpm's lockfile has (locked-versions.mjs): what the tests ran with, not the latest */
const lockedTree = JSON.parse(execFileSync('pnpm', ['list', '--prod', '--depth', 'Infinity', '--json'], { cwd: desktop, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell }))[0];
writeFileSync(join(stage, 'package.json'), `${JSON.stringify({
  name: 'lopesfilm-desktop',
  productName: NAME,
  ...(preview ? { lopesfilmFlavor: 'preview' } : {}),
  appBrand: { id: brand.id, name: brand.name, appId: brand.appId, homeDir: brand.homeDir, libraryDir: brand.libraryDir, studioPort: brand.studioPort },
  version: buildVersion,
  description: pkg.description,
  author: 'Lopes',
  license: 'UNLICENSED',
  private: true,
  type: 'module',
  main: 'src/main.mjs',
  dependencies,
  overrides: lockedOverrides(lockedTree, pkg.dependencies),
}, null, 2)}\n`);
run('npm', ['install', '--omit=dev', '--omit=optional', '--no-audit', '--no-fund', '--no-package-lock', '--loglevel=error'], { cwd: stage });
const offLock = versionsOffLock(lockedTree, join(stage, 'node_modules'));
if (offLock.length) {
  throw new Error(`The installer's packages are not the lockfile's:\n${offLock.map((p) => `  ${p.name} ${p.version} (locked: ${p.locked.join(', ')})`).join('\n')}`);
}
/* the build's product file */
cpSync(productFile, join(stage, 'node_modules/lopesfilm/product.json'));
/* Studio's own version (Settings → About) is this build's too */
const studioPackage = join(stage, 'node_modules/lopesfilm/package.json');
writeFileSync(studioPackage, `${JSON.stringify({ ...JSON.parse(readFileSync(studioPackage, 'utf8')), version: buildVersion }, null, 2)}\n`);

/* 2b. ffmpeg and the headless browser, for the platform and chip built for */
const runtime = join(work, 'runtime');
const { ffmpegDownloadable, fetchFfmpeg } = await import(pathToFileURL(join(desktop, 'src/ffmpeg-runtime.mjs')).href);
const platform = win ? 'win32' : 'darwin';
if (ffmpegDownloadable(platform, arch)) await fetchFfmpeg(join(runtime, 'ffmpeg'), { platform, arch, license: true });
else console.warn(`No ffmpeg build for ${platform}-${arch}: this app downloads none either; people install their own.`);
run(process.execPath, [join(stage, 'node_modules/playwright-core/cli.js'), 'install', 'chromium-headless-shell'], {
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(runtime, 'ms-playwright'), PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: win ? 'win64' : arch === 'arm64' ? 'mac15-arm64' : 'mac15' },
});

/* 2c. a brand other than Lopes.Film (GlobalFilm, VerkzFilm): its own internal names too (the command, LOPESFILM_*, the package; rebrand.mjs) */
const changedByBrand = rebrandStage(stage, brand);
if (changedByBrand) console.log(`${brand.name}: ${changedByBrand} files renamed inside (${brand.internal})`);

/* 3. the app */
/* the installer script, with the brand's website (the "developer's site" link on the last page) put in front */
const installerScript = join(work, 'installer.nsh');
const lfTheme = brand.theme?.dark ?? { bgApp: '#0a0c08', bgPanel: '#12150e', bgRaised: '#1b2014', accent: '#b8e23c' };
const lfHex = (c) => String(c).replace('#', '').toUpperCase();
const lfBgr = (c) => { const h = lfHex(c); return `0x${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`; };
writeFileSync(installerScript, `!define LF_BG "${lfHex(lfTheme.bgApp)}"\n!define LF_FIELD "${lfHex(lfTheme.bgRaised)}"\n!define LF_BGR "${lfBgr(lfTheme.bgApp)}"\n!define LF_FIELD_BGR "${lfBgr(lfTheme.bgRaised)}"\n!define LF_ACCENT_BGR "${lfBgr(lfTheme.accent)}"\n` + (brand.website ? `!define LF_SITE "${brand.website}"\n` : '') + readFileSync(join(desktop, 'build/installer.nsh'), 'utf8'));
const builder = require('electron-builder');
const electronVersion = require('electron/package.json').version;
const env = unsigned || win ? { CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_LINK ? 'true' : 'false' } : { APPLE_KEYCHAIN_PROFILE: NOTARY_PROFILE, APPLE_TEAM_ID: TEAM_ID };
Object.assign(process.env, env);
await builder.build({
  projectDir: stage,
  publish: 'never',
  ...(win ? { win: ['nsis'] } : { mac: ['dmg', 'zip'] }),
  [arch]: true,
  config: {
    afterPack: win ? (context) => windowsResources(context) : undefined,
    /* unsigned on a Mac: signed ad hoc, whole, before the .dmg and .zip are made. Electron's fuses are written into
       its framework after the linker signed it, and an Apple chip kills a program whose pages no longer match its
       signature ("Code Signature Invalid") the moment it starts */
    afterSign: !win && unsigned ? (context) => adHocSign(context) : undefined,
    win: {
      icon: ICON_ICO,
      /* resedit writes the icon and version (afterPack); rcedit would need wine on this Mac */
      signAndEditExecutable: false,
      /* signed only when CSC_LINK (.pfx) and CSC_KEY_PASSWORD are set in the environment; otherwise unsigned as before */
      ...(process.env.CSC_LINK ? { signtoolOptions: { signingHashAlgorithms: ['sha256'] } } : {}),
      artifactName: `${NAME.replace(' ', '-')}-Setup-\${arch}.\${ext}`,
    },
    nsis: {
      /* electron-builder leaves these out of its archive and adds them back apart, skipping node_modules: the
         library's previews (node_modules/lopesfilm/library/.../preview.mp4) would never reach the computer */
      preCompressedFileExtensions: null,
      /* the installer asks where to put the app (the person's own folder by default), so it need not live on C: */
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      perMachine: false,
      /* no "for everyone / just me" screen: it is a plain dialog that cannot wear the installer's theme, and the app is made
         to live in the person's own folder (no UAC, and the updates install without asking) */
      allowElevation: false,
      include: installerScript,
      /* every screen in Portuguese (the welcome and finish texts are written in it too): no English left in the buttons and titles */
      installerLanguages: ['pt_BR'],
      language: '1046',
      multiLanguageInstaller: true,
      displayLanguageSelector: false,
      /* the installer art of every brand, in the Lopes.Film pattern (build/make-installer-art.py makes it) */
      installerSidebar: join(desktop, `build/installer-${brand.id}-sidebar.bmp`),
      uninstallerSidebar: join(desktop, `build/installer-${brand.id}-sidebar.bmp`),
      installerHeader: join(desktop, `build/installer-${brand.id}-header.bmp`),
      installerIcon: ICON_ICO,
      uninstallerIcon: ICON_ICO,
      shortcutName: NAME,
      deleteAppDataOnUninstall: false,
      artifactName: `${NAME.replace(' ', '-')}-Setup-\${arch}.\${ext}`,
    },
    appId: preview ? 'dev.lopesfilm.desktop.preview' : brand.appId,
    productName: NAME,
    copyright: `Copyright © 2026 ${brand.company}`,
    electronVersion,
    asar: true,
    /* run by Electron as Node from outside the archive: the CLI the agents run, the agents' adapters */
    asarUnpack: [`node_modules/${brand.internal}/**`, 'node_modules/@agentclientprotocol/**', 'node_modules/playwright-core/**'],
    files: ['src/**/*', 'shell/dist/**/*', 'build/icon.png', 'build/providers.seed.json', 'package.json', 'node_modules/**/*'],
    /* ffmpeg and the headless browser (2b), as files of their own beside the archive: they run as programs */
    extraResources: [{ from: runtime, to: 'runtime' }],
    directories: { output: out, buildResources: join(desktop, 'build') },
    electronFuses: {
      runAsNode: true,
      enableCookieEncryption: true,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
    },
    /* one feed folder for both channels: the app reads latest(-mac).yml, or beta(-mac).yml when Beta Updates is on
       (src/update-channel.mjs); publishing puts this build's feed under either name */
    publish: FEED ? [{ provider: 'generic', url: FEED, channel: 'latest' }] : null,
    mac: {
      category: 'public.app-category.video',
      icon: ICON_ICNS,
      minimumSystemVersion: '13.0',
      /* the .zip the updater downloads; the .dmg has its own name (dmg.artifactName) */
      artifactName: `${NAME.replace(' ', '-')}-\${version}-\${arch}-mac.\${ext}`,
      hardenedRuntime: true,
      gatekeeperAssess: false,
      entitlements: join(desktop, 'build/entitlements.mac.plist'),
      entitlementsInherit: join(desktop, 'build/entitlements.mac.plist'),
      /* what macOS says when Studio's record button first asks for the microphone (the entitlement above lets it) */
      extendInfo: { NSMicrophoneUsageDescription: `${NAME} records sound from the microphone when you press Record.` },
      ...(unsigned ? { identity: null } : { identity: IDENTITY, notarize: true }),
    },
    /* the downloads keep one name from version to version: the website links the latest release's by it */
    dmg: { title: NAME, artifactName: `${NAME.replace(' ', '-')}-\${arch}.\${ext}` },
  },
});

if (!unsigned && !win && FEED) {
  const app = join(out, arch === 'arm64' ? 'mac-arm64' : 'mac', `${NAME}.app`);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  run('/usr/bin/xcrun', ['stapler', 'validate', app]);
  /* 4. the download */
  const dmg = join(out, `${NAME.replace(' ', '-')}-${arch}.dmg`);
  run('/usr/bin/codesign', ['--sign', `Developer ID Application: ${IDENTITY}`, '--timestamp', dmg]);
  run('/usr/bin/xcrun', ['notarytool', 'submit', dmg, '--keychain-profile', NOTARY_PROFILE, '--wait']);
  run('/usr/bin/xcrun', ['stapler', 'staple', dmg]);
  run('/usr/sbin/spctl', ['-a', '-t', 'open', '--context', 'context:primary-signature', '-v', dmg]);
  /* signing and stapling changed the .dmg: the feed lists it as it is now (the updater itself takes the .zip) */
  const bytes = readFileSync(dmg);
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  const feed = join(out, 'latest-mac.yml');
  const name = basename(dmg);
  writeFileSync(feed, readFileSync(feed, 'utf8').replace(new RegExp(`(- url: ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n\\s+sha512: )\\S+(\\n\\s+size: )\\d+`), `$1${sha512}$2${bytes.length}`));
  if (!readFileSync(feed, 'utf8').includes(sha512)) throw new Error('the feed does not list the signed .dmg');
}
console.log(`\n${readdirSync(out).filter((f) => /\.(dmg|zip|exe|yml)$/.test(f)).map((f) => join(out, f)).join('\n')}`);
console.log(`feed: ${FEED ?? 'none (a build of this source: it never looks for updates)'}`);
if (FEED && !existsSync(join(out, win ? 'latest.yml' : 'latest-mac.yml'))) process.exitCode = 1;

/** An unsigned Mac app signed ad hoc (no identity), all of it, so it starts. @param {{ appOutDir: string }} context */
function adHocSign(context) {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', join(context.appOutDir, `${NAME}.app`)], { stdio: 'inherit' });
}

/** Lopes.Film.exe's icon and version, as rcedit would write them. */
async function windowsResources(context) {
  const ResEdit = await import('resedit');
  const PE = await import('pe-library');
  const file = join(context.appOutDir, `${NAME}.exe`);
  /* Windows (an antivirus scanning the exe just unpacked, a copy of the app still running) can hold the file for a
     moment: it is read and written again for up to a minute before the build gives up on it */
  const locked = (e) => ['EBUSY', 'EPERM', 'EACCES'].includes(e?.code);
  const again = async (action) => {
    for (let tries = 1; ; tries++) {
      try { return action(); } catch (e) {
        if (!locked(e) || tries === 30) throw e;
        if (tries === 1) console.log(`${NAME}.exe is in use; waiting for it to be free...`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  };
  const exe = PE.NtExecutable.from(await again(() => readFileSync(file)), { ignoreCert: true });
  const res = PE.NtExecutableResource.from(exe);
  const icon = ResEdit.Data.IconFile.from(readFileSync(ICON_ICO));
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, icon.icons.map((item) => item.data));
  const info = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] ?? ResEdit.Resource.VersionInfo.createEmpty();
  const [major, minor, patch] = buildVersion.split('.').map(Number);
  info.setFileVersion(major, minor, patch, 0, 1033);
  info.setProductVersion(major, minor, patch, 0, 1033);
  info.setStringValues({ lang: 1033, codepage: 1200 }, {
    ProductName: NAME, FileDescription: NAME, CompanyName: brand.company, OriginalFilename: `${NAME}.exe`,
    InternalName: NAME, LegalCopyright: `Copyright © 2026 ${brand.company}`, FileVersion: buildVersion, ProductVersion: buildVersion,
  });
  info.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  const bytes = Buffer.from(exe.generate());
  await again(() => writeFileSync(file, bytes));
}
