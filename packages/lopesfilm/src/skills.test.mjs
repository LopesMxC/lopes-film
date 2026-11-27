import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, symlinkSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addSkills, alwaysSkills, setSkillAlways, asRun, coreSkills, findSkill, skillsNamed, agentName, listSkills, migrateMySkills, mySkillsDir, parseSkillFile, readSkill, removeSkill, setSkillCover, setSkillOn, SKILL_UID, skillOrigins, skillText, skillUid, agentNames, SKILL_PLATFORMS, thisPlatform, folderSize, folderSizeAsync } from './skills.mjs';
import { commitSkills, discardSkills, previewFolder, previewSkills, skillCommand, skillsCommand } from './skills-cli.mjs';

const skill = (dir, name, description, body = 'How to make it.', extra = {}) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`);
  for (const [file, text] of Object.entries(extra)) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return dir;
};

const coverPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

test('cover edits do not follow a personal skill folder outside its library or write through metadata symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'of-skill-cover-links-'));
  const mine = join(root, 'mine');
  mkdirSync(mine);
  const outside = skill(join(root, 'outside'), 'linked', 'Outside');
  symlinkSync(outside, join(mine, 'linked'), 'junction');
  assert.throws(() => setSkillCover('linked', coverPng, { mine }), /inside your skills folder/);
  assert.equal(existsSync(join(outside, 'lopesfilm.json')), false);
  const own = skill(join(mine, 'own'), 'own', 'Own');
  const metadata = join(root, 'shared.json');
  writeFileSync(metadata, '{"custom":"original"}');
  /* A file symlink needs privileges on Windows; the folder-junction boundary above still runs there. */
  if (process.platform === 'win32') return;
  symlinkSync(metadata, join(own, 'lopesfilm.json'));
  setSkillCover('own', coverPng, { mine });
  assert.equal(readFileSync(metadata, 'utf8'), '{"custom":"original"}');
  assert.equal(lstatSync(join(own, 'lopesfilm.json')).isSymbolicLink(), false);
  setSkillCover('own', null, { mine });
  assert.deepEqual(JSON.parse(readFileSync(join(own, 'lopesfilm.json'), 'utf8')), { custom: 'original' });
});

test('a chosen cover is kept with the copied skill, preserving its metadata and source', async () => {
  const root = mkdtempSync(join(tmpdir(), 'of-skill-cover-'));
  const meta = { title: { en: 'A title' }, kind: 'style', custom: 'kept' };
  const from = skill(join(root, 'source'), 'covered', 'Covered skill', 'Steps', { 'lopesfilm.json': JSON.stringify(meta) });
  const [kept] = await addSkills(from, { mine: join(root, 'mine'), covers: { covered: coverPng } });
  assert.ok(kept.cover);
  assert.deepEqual(readFileSync(join(kept.folder, kept.cover)), Buffer.from(coverPng.split(',')[1], 'base64'));
  const saved = JSON.parse(readFileSync(join(kept.folder, 'lopesfilm.json'), 'utf8'));
  assert.deepEqual(saved, { ...meta, cover: kept.cover });
  assert.deepEqual(JSON.parse(readFileSync(join(from, 'lopesfilm.json'), 'utf8')), meta);
  assert.equal(existsSync(join(from, kept.cover)), false);
  assert.equal(readSkill(kept.folder, 'mine').cover, kept.cover, 'cover persists when read again');
});

test('covers follow each skill through a fetched collection; unselected covers remain unchanged', async () => {
  const root = mkdtempSync(join(tmpdir(), 'of-skill-covers-'));
  const mine = join(root, 'mine');
  const { staging } = await previewSkills('https://github.com/x/y', { mine, fetch: async (_url, into) => {
    const pack = join(into, 'pack');
    skill(join(pack, 'one'), 'one', 'One');
    skill(join(pack, 'two'), 'two', 'Two', 'Steps', { 'lopesfilm.json': '{"cover":"original.png"}', 'original.png': Buffer.from(coverPng.split(',')[1], 'base64') });
    return pack;
  } });
  const kept = await commitSkills(staging, { mine, covers: { one: coverPng } });
  assert.ok(kept.find(s => s.name === 'one').cover);
  assert.equal(kept.find(s => s.name === 'two').cover, 'original.png');
});

test('invalid cover data is rejected before replacing an existing skill', async () => {
  const root = mkdtempSync(join(tmpdir(), 'of-skill-bad-cover-'));
  const mine = join(root, 'mine');
  const from = skill(join(root, 'from'), 'same', 'New');
  const previous = skill(join(mine, 'same'), 'same', 'Original');
  for (const data of ['data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,bm90IGEgcG5n', `data:image/png;base64,${'A'.repeat(7 * 1024 * 1024)}`]) {
    await assert.rejects(addSkills(from, { mine, covers: { same: data } }), /Skill cover (must|exceeds|does)/);
    assert.equal(readSkill(previous, 'mine').description, 'Original');
  }
});

test('a SKILL.md front matter: plain, quoted and block values; the body after it', () => {
  const { fields, body } = parseSkillFile([
    '---',
    'name: lyric-pv',
    'description: "Lyric videos: words on the beat"',
    'license: \'MIT\'',
    'when: |',
    '  a song',
    '  with words',
    'note: >',
    '  folded',
    '  into one',
    'long: starts here',
    '  and goes on',
    '---',
    '',
    '# Lyric PV',
  ].join('\n'));
  assert.deepEqual(fields, { name: 'lyric-pv', description: 'Lyric videos: words on the beat', license: 'MIT', when: 'a song\nwith words', note: 'folded into one', long: 'starts here and goes on' });
  assert.equal(body, '# Lyric PV');
  assert.deepEqual(parseSkillFile('no front matter').fields, {});
  assert.deepEqual(parseSkillFile('---\n---\nBody'), { fields: {}, body: 'Body' });
  assert.deepEqual(parseSkillFile('---\r\n---\r\nBody'), { fields: {}, body: 'Body' });
});

test('skills are listed from the project, yours and the official ones, each by its uid: the first holding a uid winning, two of a name both there', () => {
  const root = mkdtempSync(join(tmpdir(), 'of-skills-'));
  const project = join(root, 'film');
  const mine = join(root, 'mine');
  const official = join(root, 'official');
  skill(join(project, 'skills', 'brand'), 'brand', 'This film\'s brand');
  skill(join(mine, 'brand'), 'brand', 'My brand');
  skill(join(mine, 'lyric-pv'), 'lyric-pv', 'Lyric videos', 'Use the engine.', { 'scripts/build.sh': 'echo', 'lib/engine.js': '' });
  skill(join(official, 'brand'), 'brand', 'Official brand');
  skill(join(official, 'kinetic'), 'kinetic', 'Official kinetic');
  /* the person's kinetic, added from Lopes.Film's own repository: that official one */
  skill(join(mine, 'kinetic'), 'kinetic', 'Kinetic from Lopes.Film');
  writeFileSync(join(mine, '.origins.json'), JSON.stringify({ kinetic: { from: 'link', address: 'https://github.com/openfilm/skills' } }));
  mkdirSync(join(mine, 'not-a-skill'), { recursive: true });
  const all = listSkills({ project, mine, official });
  assert.deepEqual(all.map((s) => [s.uid, s.source, s.description]), [
    ['project/brand', 'project', 'This film\'s brand'], ['local/brand', 'mine', 'My brand'], ['lopesfilm/brand', 'official', 'Official brand'],
    ['lopesfilm/kinetic', 'mine', 'Kinetic from Lopes.Film'], ['local/lyric-pv', 'mine', 'Lyric videos'],
  ]);
  assert.deepEqual(all[3].over, ['official']);
  const lyric = all[4];
  assert.deepEqual(lyric.scripts, ['lib/engine.js', 'scripts/build.sh'], 'what an agent could run, for the person to see');
  /* by its name alone, two owners have one: none chosen, both named */
  assert.equal(findSkill('brand', { mine, official }), null, 'two of the name: none chosen for the agent');
  assert.deepEqual(skillsNamed('brand', { mine, official }).map((s) => s.uid).sort(), ['local/brand', 'lopesfilm/brand']);
  assert.equal(findSkill('local-brand', { mine, official }).uid, 'local/brand', 'as an agent is given it');
  assert.equal(findSkill('lopesfilm:brand', { mine, official }).uid, 'lopesfilm/brand', 'as Claude Code names it in a plugin');
  assert.equal(findSkill('lopesfilm/brand', { mine, official }).description, 'Official brand', 'by uid: that one');
  assert.equal(findSkill('nothing', { mine, official }), null);
  const text = skillText(lyric);
  assert.match(text, /^<skill name="local-lyric-pv" full-name="local\/lyric-pv" folder=".*mine[\\/]lyric-pv">\n---/);
  assert.match(text, /Use the engine\.\n<\/skill>$/);
});

test('lopesfilm.json says what a skill needs and the computers it runs on; anything else there is left out', () => {
  const root = mkdtempSync(join(tmpdir(), 'of-skill-needs-'));
  const folder = skill(join(root, 'demo'), 'app-demo', 'Films a program', 'Steps', { 'lopesfilm.json': JSON.stringify({
    needs: { en: 'Windows 10 or 11, FFmpeg 8', 'zh-CN': 'Windows 10 或 11，FFmpeg 8', 'x y': 'not a language' },
    platforms: ['windows', 'amiga'],
  }) });
  const read = readSkill(folder, 'mine');
  assert.deepEqual(read.needs, { en: 'Windows 10 or 11, FFmpeg 8', 'zh-CN': 'Windows 10 或 11，FFmpeg 8' });
  assert.deepEqual(read.platforms, ['windows']);
  const plain = readSkill(skill(join(root, 'plain'), 'plain', 'Plain', 'Steps', { 'lopesfilm.json': JSON.stringify({ platforms: ['amiga'], needs: 7 }) }), 'mine');
  assert.equal(plain.platforms, undefined, 'no computer it names is one: none said, so every one');
  assert.equal(plain.needs, undefined);
  assert.ok(SKILL_PLATFORMS.includes(thisPlatform()));
});

test('lopesfilm skill by a name two owners share names neither, and lists each by its full name', async () => {
  const root = mkdtempSync(join(tmpdir(), 'of-skill-two-'));
  const mine = join(root, 'mine');
  skill(join(mine, 'brand'), 'brand', 'Mine');
  const film = join(root, 'film');
  mkdirSync(film);
  writeFileSync(join(film, 'film.html'), '<!doctype html>');
  skill(join(film, 'skills', 'brand'), 'brand', 'This film\'s');
  const both = await skillCommand(['brand'], 'lopesfilm', { cwd: film, mine });
  assert.equal(both.ok, false);
  assert.deepEqual(both.lines.slice(1), ['  lopesfilm skill project/brand', '  lopesfilm skill local/brand']);
  const one = await skillCommand(['local/brand'], 'lopesfilm', { cwd: film, mine });
  assert.ok(one.ok && /full-name="local\/brand"/.test(one.lines[0]));
});

test('a skill is named by its front matter, else its folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-skill-'));
  mkdirSync(join(dir, 'kinetic'));
  writeFileSync(join(dir, 'kinetic', 'SKILL.md'), 'Just words.');
  assert.equal(readSkill(join(dir, 'kinetic'), 'mine').name, 'kinetic');
});

test('adding a skill copies it into yours (a folder of skills adds each), the one of the same name to the trash', async () => {
  const root = mkdtempSync(join(tmpdir(), 'of-add-'));
  const mine = join(root, 'mine');
  process.env.LOPESFILM_TRASH_DIR = join(root, 'trash');
  skill(join(mine, 'brand'), 'brand', 'Old');
  const one = skill(join(root, 'src', 'brand-kit'), 'brand', 'New', 'b', { '.git/HEAD': 'x' });
  const added = await addSkills(one, { mine });
  assert.deepEqual(added.map((s) => [s.name, s.description]), [['brand', 'New']]);
  assert.ok(!existsSync(join(mine, 'brand', '.git')), 'no git history');
  assert.ok(existsSync(one), 'a folder of the person\'s is copied, not moved');
  assert.match(readFileSync(join(root, 'trash', 'brand', 'SKILL.md'), 'utf8'), /Old/, 'the one replaced is in the trash');
  assert.equal(await removeSkill('brand', { mine }), true);
  assert.ok(!existsSync(join(mine, 'brand')));
  assert.ok(existsSync(join(root, 'trash', 'brand 2')), 'removed: to the trash too');
  assert.equal(await removeSkill('nothing', { mine }), false);

  const pack = join(root, 'pack');
  skill(join(pack, 'skills', 'a'), 'a', 'A');
  skill(join(pack, 'skills', 'b'), 'b', 'B');
  assert.deepEqual((await addSkills(pack, { mine })).map((s) => s.name).sort(), ['a', 'b']);
  await assert.rejects(addSkills(join(root, 'src'), { mine: join(root, 'other') }).then(() => addSkills(mkdtempSync(join(tmpdir(), 'empty-')), { mine })), /not a skill/);
  delete process.env.LOPESFILM_TRASH_DIR;
});

test('yours are kept beside the projects, and those kept in Studio\'s home before move there', () => {
  const before = { library: process.env.LOPESFILM_LIBRARY, skills: process.env.LOPESFILM_SKILLS };
  const root = mkdtempSync(join(tmpdir(), 'of-mine-'));
  delete process.env.LOPESFILM_SKILLS;
  process.env.LOPESFILM_LIBRARY = join(root, 'Lopes.Film', 'Projects');
  try {
    assert.equal(mySkillsDir(), join(root, 'Lopes.Film', 'Skills'));
    const old = join(root, 'home', 'skills');
    skill(join(old, 'brand'), 'brand', 'Mine');
    skill(join(old, 'kinetic'), 'kinetic', 'Old copy');
    skill(join(root, 'Lopes.Film', 'Skills', 'kinetic'), 'kinetic', 'Already there');
    assert.deepEqual(migrateMySkills({ from: old, to: mySkillsDir() }), ['brand']);
    assert.ok(existsSync(join(mySkillsDir(), 'brand', 'SKILL.md')));
    assert.match(readFileSync(join(mySkillsDir(), 'kinetic', 'SKILL.md'), 'utf8'), /Already there/, 'one there already is not overwritten');
    assert.match(readFileSync(join(old, 'README.txt'), 'utf8'), /kept in .*Skills now[\s\S]*kinetic/);
    assert.deepEqual(migrateMySkills({ from: old, to: mySkillsDir() }), [], 'once moved, nothing more');
  } finally {
    if (before.library === undefined) delete process.env.LOPESFILM_LIBRARY; else process.env.LOPESFILM_LIBRARY = before.library;
    if (before.skills !== undefined) process.env.LOPESFILM_SKILLS = before.skills;
  }
});

test('adding from an address is looked at first: kept, or let go', async () => {
  const root = mkdtempSync(join(tmpdir(), 'of-preview-'));
  const mine = join(root, 'mine');
  skill(join(mine, 'lyric-pv'), 'lyric-pv', 'Mine');
  /* added from that address before: the same skill, which the fetch replaces */
  writeFileSync(join(mine, '.origins.json'), JSON.stringify({ 'lyric-pv': { from: 'link', address: 'https://github.com/x/y' } }));
  const fetch = async (_url, into) => { skill(join(into, 'pack', 'skills', 'lyric-pv'), 'lyric-pv', 'Theirs', 'x', { 'scripts/a.py': 'print(1)' }); skill(join(into, 'pack', 'skills', 'charts'), 'charts', 'Charts'); return join(into, 'pack'); };
  const seen = await previewSkills('https://github.com/x/y', { mine, fetch });
  assert.deepEqual(seen.skills.map((s) => [s.name, s.replaces, s.scripts.length]).sort(), [['charts', false, 0], ['lyric-pv', true, 1]]);
  assert.ok(seen.skills.every((s) => s.size > 0));
  assert.deepEqual(listSkills({ mine, official: join(root, 'none') }).map((s) => s.description), ['Mine'], 'nothing kept yet');
  process.env.LOPESFILM_TRASH_DIR = join(root, 'trash');
  const kept = await commitSkills(seen.staging, { mine });
  delete process.env.LOPESFILM_TRASH_DIR;
  assert.deepEqual(kept.map((s) => s.name).sort(), ['charts', 'lyric-pv']);
  assert.ok(!existsSync(seen.staging), 'the fetch is cleared');
  const again = await previewSkills('https://github.com/x/y', { mine, fetch });
  await discardSkills(again.staging, { mine });
  assert.ok(!existsSync(again.staging));
  await assert.rejects(commitSkills(join(root, 'elsewhere'), { mine }), /Nothing is waiting/);
});

test('a folder on this computer looked at where it is; one already among the person\'s own, or not a skill, refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'of-folder-'));
  const mine = join(root, 'mine');
  skill(join(mine, 'charts'), 'charts', 'Mine');
  const pack = join(root, 'pack');
  skill(join(pack, 'charts'), 'charts', 'Theirs', 'x', { 'scripts/a.py': 'print(1)' });
  skill(join(pack, 'captions'), 'captions', 'Captions');
  const seen = previewFolder(pack, { mine });
  assert.deepEqual(seen.skills.map((s) => [s.name, s.replaces, s.scripts.length]).sort(), [['captions', false, 0], ['charts', true, 1]]);
  assert.deepEqual(previewFolder(join(pack, 'captions'), { mine }).skills.map((s) => s.name), ['captions'], 'one skill\'s own folder');
  assert.deepEqual(previewFolder(join(pack, 'captions', 'SKILL.md'), { mine }), previewFolder(join(pack, 'captions'), { mine }), 'its SKILL.md for it');
  assert.equal(readSkill(join(mine, 'charts'), 'mine')?.description, 'Mine', 'nothing copied yet');
  assert.throws(() => previewFolder(join(mine, 'charts'), { mine }), /among your skills/);
  assert.throws(() => previewFolder(mine, { mine }), /among your skills/);
  assert.throws(() => previewFolder(root + '-none', { mine }), /no SKILL\.md/);
  mkdirSync(join(root, 'empty'));
  assert.throws(() => previewFolder(join(root, 'empty'), { mine }), /no SKILL\.md/);
});

test('lopesfilm skills and skill: the list, one printed whole, one added from an address', async () => {
  const root = mkdtempSync(join(tmpdir(), 'of-cli-'));
  const home = join(root, 'home');
  const film = join(root, 'film');
  mkdirSync(film);
  writeFileSync(join(film, 'film.html'), '<!doctype html>');
  skill(join(film, 'skills', 'brand'), 'brand', 'This film\'s brand');
  const before = process.env.LOPESFILM_SKILLS;
  const beforeHome = process.env.LOPESFILM_HOME;
  const beforeShared = process.env.LOPESFILM_SHARED_HOME;
  delete process.env.LOPESFILM_SHARED_HOME;
  process.env.LOPESFILM_SKILLS = join(home, 'skills');
  /* the skills kept in Studio's home before, moved as the commands run: a scratch home, never the person's */
  process.env.LOPESFILM_HOME = join(root, 'studio-home');
  try {
    const listed = skillsCommand('lopesfilm', { cwd: film });
    assert.ok(listed.lines.some((l) => /project\/brand\s+this project/.test(l)));
    assert.ok(listed.lines.some((l) => l.includes('This film\'s brand')));
    /* outside a project: none of this film's; Lopes.Film's own once installed, and not while off */
    assert.match(skillsCommand('lopesfilm', { cwd: root }).lines[0], /^No skills installed\./);
    /* one installed from Discover (studio/server/skill-catalog.mjs): its folder, with where it came from */
    const installed = skill(join(root, 'studio-home', 'skills-installed', 'lopesfilm-replicate'), 'replicate', 'Remake a video');
    writeFileSync(join(installed, '.source.json'), JSON.stringify({ repo: 'https://github.com/openfilm/skill-replicate', path: 'skills/replicate', commit: 'a'.repeat(40), version: '0.1.0' }));
    const outside = skillsCommand('lopesfilm', { cwd: root }).lines;
    assert.match(outside[0], /^Skills\. /);
    assert.ok(!outside.some((l) => /this project/.test(l)) && outside.some((l) => /lopesfilm\/replicate\s+installed/.test(l)));
    setSkillOn('lopesfilm/replicate', false);
    assert.ok(!skillsCommand('lopesfilm', { cwd: root }).lines.some((l) => /replicate/.test(l)), 'off: offered to no agent');
    setSkillOn('lopesfilm/replicate', true);

    const printed = await skillCommand(['brand'], 'lopesfilm', { cwd: film });
    assert.ok(printed.ok);
    assert.match(printed.lines[0], /^<skill name="project-brand" full-name="project\/brand"/);
    const missing = await skillCommand(['nope'], 'lopesfilm', { cwd: film });
    assert.deepEqual([missing.ok, missing.usage], [false, true]);

    /* an address: fetched (here, made) into a folder of the one it is given */
    const fetched = await skillCommand(['add', 'https://github.com/someone/skills/tree/main/lyric-pv'], 'lopesfilm', {
      cwd: film,
      fetch: async (_url, into) => skill(join(into, 'lyric-pv'), 'lyric-pv', 'Lyric videos', 'x', { 'scripts/make.py': '' }),
    });
    assert.ok(fetched.ok, fetched.lines.join('\n'));
    assert.match(fetched.lines.join('\n'), /Added someone\/lyric-pv: Lyric videos[\s\S]*scripts\/make\.py[\s\S]*only skills you trust/);
    assert.ok(readFileSync(join(home, 'skills', 'lyric-pv', 'SKILL.md'), 'utf8').includes('Lyric videos'));
    assert.deepEqual(listSkills({ mine: join(home, 'skills'), official: join(root, 'none') }).map((s) => s.name), ['lyric-pv'], 'nothing left from the fetch');
  } finally {
    if (before === undefined) delete process.env.LOPESFILM_SKILLS; else process.env.LOPESFILM_SKILLS = before;
    if (beforeHome === undefined) delete process.env.LOPESFILM_HOME; else process.env.LOPESFILM_HOME = beforeHome;
    if (beforeShared !== undefined) process.env.LOPESFILM_SHARED_HOME = beforeShared;
  }
});

test('a skill as people see it: its lopesfilm.json title and summary by language; none, or not one, read as nothing', () => {
  const root = mkdtempSync(join(tmpdir(), 'of-shown-'));
  const dir = skill(join(root, 'replicate'), 'replicate', 'For the agent.');
  writeFileSync(join(dir, 'lopesfilm.json'), JSON.stringify({ title: { en: 'Replicate a video', 'zh-CN': '复刻视频', bad: 1, 'not a lang': 'x' }, summary: 'One line.' }));
  assert.deepEqual(readSkill(dir, 'official').shown, { title: { en: 'Replicate a video', 'zh-CN': '复刻视频' }, summary: { en: 'One line.' } });
  writeFileSync(join(dir, 'lopesfilm.json'), '{ not json');
  assert.equal(readSkill(dir, 'official').shown, undefined);
  assert.equal(readSkill(skill(join(root, 'plain'), 'plain', 'x'), 'mine').shown, undefined);
});

test("a skill's lopesfilm.json: its version, kind, order, mark and media; anything wrong left out; else the front matter's version", () => {
  const root = mkdtempSync(join(tmpdir(), 'of-skill-look-'));
  const a = skill(join(root, 'a'), 'a', 'Does a.', 'How.', {
    'lopesfilm.json': JSON.stringify({ version: '0.2.0', kind: 'style', order: 3, icon: 'film', cover: 'cover.jpg', preview: 'none.mp4' }),
    'cover.jpg': 'jpeg',
  });
  assert.deepEqual((({ version, kind, order, icon, cover, preview }) => ({ version, kind, order, icon, cover, preview }))(readSkill(a, 'official')),
    { version: '0.2.0', kind: 'style', order: 3, icon: 'film', cover: 'cover.jpg', preview: undefined });
  const b = skill(join(root, 'b'), 'b', 'Does b.', 'How.', { 'lopesfilm.json': JSON.stringify({ version: 'latest', kind: 'other', order: 'first', icon: 'Big Icon', cover: '../x.jpg' }) });
  const read = readSkill(b, 'mine');
  for (const key of ['version', 'kind', 'order', 'icon', 'cover']) assert.equal(read?.[key], undefined, key);
  mkdirSync(join(root, 'c'));
  writeFileSync(join(root, 'c', 'SKILL.md'), '---\nname: c\ndescription: Does c.\nversion: 1.4\n---\nHow.\n');
  assert.equal(readSkill(join(root, 'c'), 'mine')?.version, '1.4');
});

test('where the person\'s skills came from: a folder, or the address commitSkills was given; forgotten when removed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'of-skill-origin-'));
  const mine = join(root, 'mine');
  const src = skill(join(root, 'src', 'cards'), 'cards', 'Makes cards.');
  await addSkills(src, { mine });
  assert.deepEqual((({ from, address }) => ({ from, address }))(skillOrigins(mine).cards), { from: 'folder', address: src });
  const fetched = skill(join(root, 'net', 'lyrics'), 'lyrics', 'Makes lyric videos.');
  const { staging } = await previewSkills('https://github.com/someone/lyrics', { mine, fetch: async (_url, into) => { const to = join(into, 'lyrics'); cpSync(fetched, to, { recursive: true }); return to; } });
  await commitSkills(staging, { mine });
  assert.deepEqual((({ from, address }) => ({ from, address }))(skillOrigins(mine).lyrics), { from: 'link', address: 'https://github.com/someone/lyrics' });
  await removeSkill('cards', { mine });
  assert.equal(skillOrigins(mine).cards, undefined);
  assert.ok(skillOrigins(mine).lyrics);
});

test("a cover's format is what its bytes are, and a cover chosen before goes when it is replaced; the skill's own picture stays", () => {
  const root = mkdtempSync(join(tmpdir(), 'of-skill-cover-swap-'));
  const mine = join(root, 'mine');
  skill(join(mine, 'own'), 'own', 'Own', 'Steps', { 'lopesfilm.json': '{"cover":"original.png"}', 'original.png': Buffer.from(coverPng.split(',')[1], 'base64') });
  /* a JPEG the browser called a PNG, from its file's name */
  const jpeg = `data:image/png;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).toString('base64')}`;
  const first = setSkillCover('own', jpeg, { mine }).cover;
  assert.match(first, /^lopesfilm-cover-.+\.jpg$/);
  const second = setSkillCover('own', coverPng, { mine }).cover;
  assert.match(second, /\.png$/);
  assert.equal(existsSync(join(mine, 'own', first)), false, 'the cover chosen before is gone');
  assert.equal(existsSync(join(mine, 'own', 'original.png')), true);
  assert.equal(setSkillCover('own', null, { mine }).cover, undefined);
  assert.equal(existsSync(join(mine, 'own', second)), false);
  assert.equal(existsSync(join(mine, 'own', 'original.png')), true, 'a picture of the skill\'s own stays');
  assert.throws(() => setSkillCover('own', `data:image/png;base64,${Buffer.from('GIF89a......').toString('base64')}`, { mine }), /PNG, JPEG or WebP/);
});

test("Lopes.Film's own skills: in order, each named by the manual, printed with the command as run here, never in the library", async () => {
  const manual = readFileSync(new URL('../MANUAL.md', import.meta.url), 'utf8');
  const core = coreSkills();
  assert.deepEqual(core.map((s) => s.uid), ['lopesfilm/edit', 'lopesfilm/media', 'lopesfilm/canvas', 'lopesfilm/cutting', 'lopesfilm/design', 'lopesfilm/motion', 'lopesfilm/gsap', 'lopesfilm/remotion', 'lopesfilm/shorts', 'lopesfilm/ads', 'lopesfilm/explainer', 'lopesfilm/grading', 'lopesfilm/sound', 'lopesfilm/listen', 'lopesfilm/freesound', 'lopesfilm/dataviz', 'lopesfilm/from-video', 'lopesfilm/recreate', 'lopesfilm/breakdown', 'lopesfilm/economy', 'lopesfilm/economy-input', 'lopesfilm/economy-output', 'lopesfilm/economy-prompt', 'lopesfilm/caveman', 'lopesfilm/craft', 'lopesfilm/smooth'], 'in the order agents are given them');
  for (const s of core) {
    assert.ok(s.shown?.title['zh-CN'] && s.shown.summary.en, `${s.name} has a title and a summary for people`);
    assert.ok(manual.includes(`\`${s.name}\``), `the manual names ${s.name}`);
    assert.ok(s.description.length > 40, `${s.name} says when it is read`);
  }
  assert.ok(manual.split(/\s+/).length < 400, 'the manual is a page: how a film is made is a skill');
  const text = (name) => readFileSync(core.find((s) => s.name === name).file, 'utf8');
  assert.match(text('edit'), /The one rule: the picture depends only on t/);
  assert.match(text('media'), /--take <id>/);
  assert.match(text('canvas'), /canvas apply/);
  /* read from their files, they say the command on the PATH (the app's own, or the one installed) */
  for (const s of core) assert.ok(!readFileSync(s.file, 'utf8').includes('npx lopesfilm'), `${s.name} says \`lopesfilm\``);
  assert.equal(asRun('`lopesfilm-edit`: `lopesfilm look`, and `lopesfilm skill <name>`', 'npx -y lopesfilm@latest'),
    '`lopesfilm-edit`: `npx -y lopesfilm@latest look`, and `npx -y lopesfilm@latest skill <name>`', 'a skill\'s name stays');
  const printed = await skillCommand(['lopesfilm/edit'], 'npx -y lopesfilm@latest', { cwd: tmpdir() });
  assert.ok(printed.ok);
  assert.ok(printed.lines[0].includes('`npx -y lopesfilm@latest look`') && !/npx lopesfilm /.test(printed.lines[0]));
  assert.equal(findSkill('lopesfilm-media')?.uid, 'lopesfilm/media', 'as an agent is given it');
  assert.equal(agentName(core[0]), 'lopesfilm-edit');
  assert.ok(!listSkills().some((s) => core.some((c) => c.name === s.name)), 'in no library');
});

test("a skill's uid, owner/name: whose it is read from where it came from, never from what it says of itself", () => {
  assert.equal(skillUid('official', 'keynote'), 'lopesfilm/keynote');
  assert.equal(skillUid('mine', 'tdd', { from: 'link', address: 'github.com/MattPocock/skills' }), 'mattpocock/tdd');
  assert.equal(skillUid('mine', 'cut', { from: 'link', address: 'https://gitlab.com/group/sub/repo/-/tree/main/cut' }), 'gitlab-group/cut');
  assert.equal(skillUid('mine', 'look', { from: 'folder', address: '/tmp/look' }), 'local/look');
  assert.equal(skillUid('mine', 'look'), 'local/look', 'made here');
  assert.equal(skillUid('mine', 'x', { from: 'link', address: 'not an address' }), 'local/x');
  assert.equal(skillUid('project', 'brand'), 'project/brand');
  assert.ok(SKILL_UID.test('lopesfilm/edit') && !SKILL_UID.test('lopesfilm') && !SKILL_UID.test('a/b/c'));
});

test('two skills of a name are both had, each by its uid; an agent is given the second as owner-name', async () => {
  const root = mkdtempSync(join(tmpdir(), 'of-skill-uids-'));
  const mine = join(root, 'mine'), official = join(root, 'official'), project = join(root, 'project');
  const write = (dir, name, body = 'Steps.') => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${body}\n---\n${body}`); };
  write(join(official, 'keynote'), 'keynote', 'Lopes.Film');
  write(join(project, 'skills', 'keynote'), 'keynote', 'The project');
  write(join(root, 'from-river', 'keynote'), 'keynote', 'River');
  write(join(root, 'from-ana', 'keynote'), 'keynote', 'Ana');
  await addSkills(join(root, 'from-river', 'keynote'), { mine, origin: { from: 'link', address: 'https://github.com/river/film-skills' } });
  await addSkills(join(root, 'from-ana', 'keynote'), { mine, origin: { from: 'link', address: 'https://github.com/ana/skills' } });
  const listed = listSkills({ project, mine, official });
  assert.deepEqual(listed.map((s) => s.uid), ['project/keynote', 'ana/keynote', 'river/keynote', 'lopesfilm/keynote'], 'the project\'s, the person\'s, the official one');
  assert.notEqual(listed.find((s) => s.uid === 'ana/keynote').folder, listed.find((s) => s.uid === 'river/keynote').folder, 'each in a folder of its own');
  /* the same skill again replaces it */
  write(join(root, 'from-river', 'keynote'), 'keynote', 'River, again');
  await addSkills(join(root, 'from-river', 'keynote'), { mine, origin: { from: 'link', address: 'https://github.com/river/film-skills' } });
  const again = listSkills({ project, mine, official }).filter((s) => s.uid === 'river/keynote');
  assert.equal(again.length, 1);
  assert.equal(again[0].description, 'River, again');
  assert.equal(findSkill('ana/keynote', { project, mine, official }).description, 'Ana');
  assert.deepEqual(agentNames(listed).map((s) => s.as), ['project-keynote', 'ana-keynote', 'river-keynote', 'lopesfilm-keynote'], 'every one by whose it is, not only the second');
  rmSync(root, { recursive: true, force: true });
});

test('an installed skill is its repository\'s account\'s: Lopes.Film\'s own is lopesfilm, anyone else\'s is theirs', () => {
  const root = mkdtempSync(join(tmpdir(), 'of-installed-owner-'));
  const ours = skill(join(root, 'lopesfilm-replicate'), 'replicate', 'Ours');
  writeFileSync(join(ours, '.source.json'), JSON.stringify({ repo: 'https://github.com/openfilm/skill-replicate', path: 'skills/replicate', commit: 'a'.repeat(40), version: '0.1.0' }));
  const theirs = skill(join(root, 'ana-lyrics'), 'lyrics', 'Theirs');
  writeFileSync(join(theirs, '.source.json'), JSON.stringify({ repo: 'https://github.com/Ana/lyric-skills', path: 'skills/lyrics', commit: 'b'.repeat(40), version: '1.0.0' }));
  assert.deepEqual([readSkill(ours, 'official').uid, readSkill(theirs, 'official').uid], ['lopesfilm/replicate', 'ana/lyrics']);
});

test('the folder walk reads asynchronously: same bytes, and Studio still runs while the disk is read', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'of-skill-size-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, '.git', 'objects'), Buffer.alloc(1000));
  mkdirSync(join(dir, 'nested'));
  writeFileSync(join(dir, 'nested', 'part'), '12345');
  writeFileSync(join(dir, 'top'), 'abc');

  const same = folderSize(dir);
  assert.equal(same, 8, '.git is left out, files in a folder inside it counted');
  assert.equal(await folderSizeAsync(dir), same, 'the asynchronous walk reads the same bytes');
  assert.equal(await folderSizeAsync(join(dir, 'gone')), 0, 'a folder that is not there holds nothing');

  /* a synchronous walk ends inside one tick: nothing else in Studio gets to run while a slow disk is read */
  let turns = 0;
  let walking = true;
  const turn = () => { if (walking) { turns++; setImmediate(turn); } };
  setImmediate(turn);
  await folderSizeAsync(dir);
  walking = false;
  assert.ok(turns > 0, 'the event loop turned while the walk waited for the disk');
});

test('a skill named with capitals is found by its name alone', () => {
  const root = mkdtempSync(join(tmpdir(), 'of-skill-capitals-'));
  const mine = join(root, 'mine');
  const none = join(root, 'none');
  mkdirSync(none, { recursive: true });
  skill(join(mine, 'myskill'), 'MySkill', 'A skill written with capitals');
  try {
    const where = { mine, official: none };
    for (const key of ['myskill', 'MySkill', '  MYSKILL  ']) {
      assert.deepEqual(skillsNamed(key, where).map((s) => s.name), ['MySkill']);
    }
    assert.deepEqual(skillsNamed('local-myskill', where).map((s) => s.name), ['MySkill']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a skill\'s category: its lopesfilm.json\'s, else its front matter\'s, else read from its words', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { readSkill, inferCategory } = await import('./skills.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'vf-cat-'));
  const make = (name, front, json) => {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${front.description ?? 'Does a thing.'}\n${front.category ? `category: ${front.category}\n` : ''}---\nBody.`);
    if (json) writeFileSync(join(dir, name, 'lopesfilm.json'), JSON.stringify(json));
  };
  make('a', { category: 'customize' });
  make('b', { category: 'edit' }, { category: 'optimize' });
  make('c', { description: 'Save tokens on long sessions.' });
  make('d', { description: 'Trim and cut clips on the timeline.' });
  make('e', { category: 'nonsense' });
  assert.equal(readSkill(join(dir, 'a'), 'mine')?.category, 'customize', 'the front matter');
  assert.equal(readSkill(join(dir, 'b'), 'mine')?.category, 'optimize', 'lopesfilm.json first');
  assert.equal(readSkill(join(dir, 'c'), 'mine')?.category, 'optimize', 'read from its words');
  assert.equal(readSkill(join(dir, 'd'), 'mine')?.category, 'edit');
  assert.equal(readSkill(join(dir, 'e'), 'mine')?.category, 'function', 'an unknown one is read from its words, then function');
  assert.equal(inferCategory('brand-kit', 'Your brand colors and fonts.', undefined), 'customize');
});

test('skills applied in every session: a few by default, the person\'s switch wins, none that are off', () => {
  const home = mkdtempSync(join(tmpdir(), 'always-'));
  const mine = mkdtempSync(join(tmpdir(), 'always-mine-'));
  for (const name of ['ponytail', 'ponytail-audit', 'other']) {
    mkdirSync(join(mine, name));
    writeFileSync(join(mine, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} does a thing and is read when asked for it, long enough to count.\n---\n\n# ${name}\n`);
  }
  const names = (where = {}) => alwaysSkills({ mine, official: join(home, 'none'), home, ...where }).applied.map((s) => s.name);
  /* economy, caveman, cutting and design are Lopes.Film's own; ponytail is a name given by default */
  assert.deepEqual(names().filter((n) => !['economy', 'economy-input', 'economy-output', 'economy-prompt', 'caveman', 'cutting', 'design'].includes(n)), ['ponytail']);
  assert.ok(['economy', 'economy-input', 'economy-output', 'economy-prompt', 'caveman', 'cutting', 'design'].every((n) => names().includes(n)));
  const other = listSkills({ mine, official: join(home, 'none') }).find((s) => s.name === 'other');
  setSkillAlways(other.uid, true, home);
  assert.ok(names().includes('other'), 'the person\'s switch adds one');
  const pony = listSkills({ mine, official: join(home, 'none') }).find((s) => s.name === 'ponytail');
  setSkillAlways(pony.uid, false, home);
  assert.ok(!names().includes('ponytail'), 'and takes one away');
  setSkillAlways(pony.uid, null, home);
  assert.ok(names().includes('ponytail'), 'null is the default again');
  setSkillOn(other.uid, false, home);
  assert.ok(!names().includes('other'), 'a skill turned off is not applied');
  const tight = alwaysSkills({ mine, official: join(home, 'none'), home, limit: 10 });
  assert.equal(tight.applied.length, 0, 'over the limit nothing is put in whole');
  assert.ok(tight.left.length > 0, 'and they are named instead');
});

test('the skills released with the package are put among the installed ones once, never over a change or after an uninstall', async () => {
  const { mkdtempSync, existsSync, rmSync, writeFileSync, readFileSync, readdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { seedBundledSkills, bundledSkillsDir, listSkills } = await import('./skills.mjs');
  const to = mkdtempSync(join(tmpdir(), 'bundled-'));
  const put = seedBundledSkills({ to });
  assert.ok(put.includes('animate') && put.includes('emil-design-eng'), put.join(','));
  const mine = mkdtempSync(join(tmpdir(), 'mine-'));
  const listed = listSkills({ mine, official: to });
  const animate = listed.find((s) => s.name === 'animate');
  assert.equal(animate.uid, 'emilkowalski/animate');
  assert.equal(animate.source, 'official');
  assert.ok(existsSync(join(animate.folder, 'RECIPES.md')), 'its other files come with it');
  assert.deepEqual(seedBundledSkills({ to }), [], 'a second run puts nothing');
  rmSync(animate.folder, { recursive: true });
  writeFileSync(join(to, 'emilkowalski-ask-emil', 'SKILL.md'), readFileSync(join(to, 'emilkowalski-ask-emil', 'SKILL.md'), 'utf8') + '\nmine');
  assert.deepEqual(seedBundledSkills({ to }), [], 'uninstalled stays uninstalled; a changed one is left');
  assert.ok(!existsSync(join(to, 'emilkowalski-animate')));
  assert.ok(readdirSync(bundledSkillsDir()).includes('LICENSE-emilkowalski.txt'));
});
