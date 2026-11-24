# Third-party notices

Studio's editor (`studio/ui/dist`) bundles:

- **Inter** by Rasmus Andersson, via `@fontsource-variable/inter`: SIL Open Font License 1.1
  (https://openfontlicense.org).
- **React** and **React DOM**: MIT License, © Meta Platforms, Inc. and affiliates.
- **Lucide** icons (`lucide-react`): ISC License, © Lucide Contributors.

The CLI depends on **playwright-core** (Apache License 2.0), which downloads a headless Chromium on first use.

## Caveman

`packages/lopesfilm/manual/caveman/SKILL.md` is Caveman by Julius Brussee, Apache License 2.0
(https://github.com/JuliusBrussee/caveman, commit b4ee71d), included unchanged apart from a note line and a `category`
in its front matter. Its LICENSE and NOTICE are beside it.

## Vendored in the page layer (`packages/lopesfilm/src/compat/vendor`)

Each with its licence beside it. **sucrase** (MIT, © 2012-2018 various contributors, https://github.com/alangpierce/sucrase),
bundled into one file, translates TSX, JSX and TypeScript for the pages. **lottie-web** (MIT, © 2015 Bodymovin,
https://github.com/airbnb/lottie-web), its light build, draws `@remotion/lottie`'s `<Lottie>`. **htm** (Apache License 2.0)
is the `html` tag. Remotion is a trademark of its owners; Lopes.Film's `remotion` layer is its own code that reads the same API
and is not affiliated with Remotion.
