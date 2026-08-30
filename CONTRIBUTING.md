# Contributing

## Before you start

Search the [issue tracker](https://github.com/thazhemadam/vim-state/issues) before you start a large change. Open an issue when a change affects public behavior or package architecture.

Use Node.js 24 and npm 11, the versions used by the main CI job. CI also tests Pi 0.79.8 on Node.js 22.19.0 and the latest Pi release on Node.js 24.

## Install the repository

```bash
git clone https://github.com/thazhemadam/vim-state.git
cd vim-state
npm ci
```

Do not edit generated files in `dist/`. The build creates these files.

## Make a change

Keep host-neutral behavior in `packages/vim-state`. Keep Pi terminal and editor behavior in `packages/integrations/pi-vim`.

Add a test for each behavior change:

- Add state and editing tests under `packages/vim-state/test/`.
- Add Pi adapter tests under `packages/integrations/pi-vim/test/`.

Start the local Pi development session when a change affects interactive behavior:

```bash
npm run dev:pi
```

This command uses `.pi-dev/` for local session data. Delete this data with `npm run dev:pi:clean`.

## Run the checks

Run these commands before you submit a pull request:

```bash
npm run check
npm test
npm run check:packages
```

Use `npm run format` after documentation or source changes. Then inspect the diff because this command formats the full repository.

## Add a changeset

Add a Changeset for a user-visible package change:

```bash
npm run changeset
```

Select each affected package and the correct semantic version change:

- `patch`: a compatible correction or small behavior change
- `minor`: a compatible feature
- `major`: an incompatible public API or behavior change

Write the summary for package users. State the result, not the implementation process.

A documentation-only or repository-only change does not need a Changeset when published package behavior stays the same.

Commit the generated file under `.changeset/` with the code change. Do not edit package versions or changelogs directly.

## Pull request checklist

Before you submit a pull request, verify:

- The change has one clear purpose.
- Tests cover new or corrected behavior.
- Public documentation matches the behavior.
- `npm run check` succeeds.
- `npm test` succeeds.
- `npm run check:packages` succeeds.
- A Changeset exists when a published package changes.

## Commit messages

Use a short imperative subject. Describe the user problem and the result in the commit body when the subject is not sufficient.

Keep unrelated changes in separate commits. Do not include generated build output.

## Release process

Maintainers publish through the GitHub Actions release workflow. Read [`docs/releasing.md`](docs/releasing.md) before you merge a release pull request.

## License

By submitting a contribution, you agree that the project can distribute it under the [LGPL-3.0-only repository license](LICENSE).
