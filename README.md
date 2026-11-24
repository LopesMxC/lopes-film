<p align="center">
  <br>
  <img src="docs/logo-light.svg#gh-light-mode-only" alt="Lopes.Film" height="72">
  <img src="docs/logo-dark.svg#gh-dark-mode-only" alt="Lopes.Film" height="72">
</p>

<h3 align="center">The open source AI video agent.</h3>

<p align="center">One HTML file, one function, one real editor.</p>

<p align="center"><b>English</b> · <a href="README.zh-CN.md">简体中文</a></p>

## About

Lopes.Film lets your coding agent make videos, and lets you edit them.

Ask Codex, Claude Code or any coding agent to make a film. It writes the film as web pages, and Studio, a local
editor that runs in your browser, shows it taking shape. Then change anything you like, by hand or by asking.

- **One HTML file.** `film.html` cuts animated web pages, footage, pictures and sound together on tracks, styled
  with CSS. Nothing new to learn: your agent already knows the web.
- **One function.** Each shot is a web page that draws any moment with `frame(t)`, using anything a browser can
  draw: three.js, WebGL, canvas, SVG, CSS, GSAP, video and more. No framework (like Remotion or HyperFrames): one
  function is enough.
- **One real editor.** Move, scale and rotate any element inside a page, change its text, color and style; place,
  crop and restyle every clip, trim and cut them on the timeline.

## Install

Requires Node 22.2+ and ffmpeg, on macOS, Windows or Linux (git too, for Studio's saved versions); the first run
downloads a headless Chromium (about 100 MB).

```sh
npx skills add lopesfilm/lopesfilm
```

Then ask your agent for a film:

> Make a 20-second launch video for my CLI, with music.

It opens the film in Studio and you watch it take shape. If your agent has no skills, tell it: "Run
`npx -y lopesfilm@latest` and follow what it prints."

Or use the desktop app (built from this repository, see [From source](#from-source)): Studio with a chat beside it
for the agents you have. It comes with ffmpeg and the headless browser, so there is nothing else to install.

Making, editing and rendering films needs no account, and Lopes.Film's library of music, sounds, voices, stickers,
transitions, effects and templates is free to use. For generated voice, music, images and video, connect the services
you use (ElevenLabs, OpenAI, Google, OpenRouter, fal and others) with your own keys in Studio's Settings → Services.

## Commands

Your agent runs them; so can you, with `npx -y lopesfilm@latest <command>` or `npm i -g lopesfilm`.

```sh
lopesfilm                          # what a film is, and Lopes.Film's own skills: where an agent starts
lopesfilm open   [folder | url]    # show a film in Studio: a new one, an existing one, one from GitHub, else this one or the last
lopesfilm look   [what] [t | a-b]  # check the film, a page or a media file: a contact sheet, one frame, or a range
lopesfilm render [a-b]             # the MP4; --4k, --blur (motion blur), --alpha (.webm / .mov), --loudness=-14
lopesfilm get    [what]            # media: free from Lopes.Film's library first, else made by a connected service
lopesfilm canvas [apply <steps>]   # the canvas beside the edit: read it, or lay out notes, files and what to make
lopesfilm skills                   # the skills a film can be made with; `lopesfilm skill <name>` prints one
lopesfilm doctor                   # what this computer has for Lopes.Film, to paste into an issue
```

`lopesfilm <command> --help` lists a command's options; `lopesfilm get` alone lists what can be made, what the library
has, and how to connect a service in Studio.

## Studio

Studio runs on your machine, in your browser: use one built on Chromium (Chrome, Edge), the engine films are drawn
and exported with, so the preview is what you export. Everything in the film can be changed: text and layers in the
picture, clips on the timeline, their place, look, volume and speed, and the subtitles. Your edits are saved to the
film's files, so the agent sees and keeps them, and you can save named versions to go back to. Export a video, a GIF,
the sound or its stems, subtitles, stills, slides, a transparent video, or the timeline itself for Final Cut Pro,
Premiere Pro and DaVinci Resolve.

Beside the edit is the canvas (⌘E switches between them): a board where you and the agent lay out notes, pictures,
clips, voice-over, music and sound, wire them into each other, make each with your services, and send what you made
to the timeline in order. A project can have several, each also seen as a storyboard. The library, in the assets
drawer, holds footage, voices, sounds, music, text, stickers, filters, effects, transitions and templates, and the
skills.

The desktop app ([apps/desktop](apps/desktop)) is Studio with a chat beside it, for Claude Code, Codex and the other
agents, or its own agent with your own key.

## Skills

How a film is made lives in skills, not in the tool. `lopesfilm` prints one page: what a film is, and Lopes.Film's own
skills, which hold the rest: `edit` (the project, film.html and pages, and checking them), `media` (the library and
the services) and `canvas`. An agent reads the one a task needs with `lopesfilm skill <name>`.

Every other skill is a way of making a kind of film, known by its full name, `owner/name`. Studio's library lists
Lopes.Film's and the community's under Discover; install one there, try it in a conversation without installing it, or add your own from a link
or a folder (`lopesfilm skill add <link>`). An installed skill is offered to every agent.

## How it works

A film is a folder with a `film.html`: tracks of clips cut together.

```html
<meta name="viewport" content="width=1920, height=1080">
<style>
  .card { object-fit: cover; border-radius: 24px; }
</style>
<section>
  <iframe src="title.html#t=0,4"></iframe>
</section>
<section>
  <video src="assets/footage.mp4#t=12,18" at="4" speed="0.5" class="card" style="left: 160px; top: 90px; width: 1600px; height: 700px"></video>
</section>
<section>
  <audio src="assets/music.mp3" volume="0.6"></audio>
</section>
```

Each `<section>` is a track, in the order the timeline shows them: the first on top. A clip is an element: a page,
a video, a still picture or a sound. Which part of its file plays is a media fragment (`#t=12,18`), where it starts
is `at`, where it sits is its style's `left`, `top`, `width` and `height`, and how it looks is CSS. Every sound is a
clip of its own. `overrides` hold your changes to elements of a page, and agents keep them when they edit.

A page is a web page that draws any moment of itself, and that is the whole contract:

```html
<script type="module">
window.film = {
  frame(t) { /* draw the complete picture at t seconds, with anything */ },
  duration: 4,               // optional: its own length, in seconds
  ready: loadFonts(),        // optional: a Promise for fonts, images, models, data
  width: 480, height: 320,   // optional: a page that is only a part of the picture
};
</script>
```

**The one rule:** the same `t` always draws the same picture, whatever was drawn before. Frames are asked for out of
order, in parallel and between frames (for motion blur), so a page that keeps the rule renders the same at any size,
on any machine. Anything else that makes pictures (Python, Blender, a video model) comes in as video or images.

Lopes.Film spends its effort where models fail: checking the film. `look` draws every frame of its sheet twice, in two
shuffled orders, and names any that changed, along with page errors, fonts that failed to load, missing sound files,
and text cut off by the frame.

[MANUAL.md](packages/lopesfilm/MANUAL.md) is the page `lopesfilm` prints, and
[packages/lopesfilm/manual](packages/lopesfilm/manual) holds Lopes.Film's own skills; [SPEC.md](packages/lopesfilm/SPEC.md)
is for anyone building a player, renderer or editor.

## From source

You need Node 22.18 or later, pnpm 9 (`corepack enable` gives you the version this repository names), ffmpeg on the
PATH, and git.

```sh
git clone <the address of this repository> lopesfilm && cd lopesfilm
pnpm install
pnpm dev            # Studio from this checkout, with a sample film, beside an installed Lopes.Film
pnpm test
```

Tell your coding agent to run `packages/lopesfilm/.dev/bin/lopesfilm` and it makes films with your checkout, in that
Studio. Every Lopes.Film, installed or from source, keeps its projects in the same library.

`pnpm dev:desktop` runs the desktop app from source, and `pnpm typecheck`, `pnpm build` and `pnpm audit:public` do
what they say.
[CONTRIBUTING.md](CONTRIBUTING.md) has the details of each package.

## Community

Questions, ideas, films you made and bugs go to this repository's Discussions and Issues. With a bug, attach the
report from Studio's Settings → Developer → Copy report (or `npx lopesfilm doctor`).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security issue, see [SECURITY.md](SECURITY.md).

## License

The format, the CLI, Studio and the desktop app are [MIT](LICENSE). The Lopes.Film name and logo are trademarks: see
[TRADEMARK.md](TRADEMARK.md).

## Origin

Lopes.Film is a modified fork of [OpenFilm](https://github.com/openfilm) (MIT, © the OpenFilm contributors),
maintained by Lopes. The original licence and notices are kept in [LICENSE](LICENSE) and
[THIRD_PARTY_NOTICES.md](packages/lopesfilm/THIRD_PARTY_NOTICES.md), as the licence asks. Part of the library
(some effects, texts, stickers, sounds and music) still comes from OpenFilm's library, under its own
[licence](packages/lopesfilm/library/LICENSE.md); the example photos are from Unsplash
([credits](packages/lopesfilm/library/PHOTO-CREDITS.md)).
