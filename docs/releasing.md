# Release process

This repository uses [Changesets](https://github.com/changesets/changesets) and GitHub Actions. The workflow updates affected package versions and can publish npm tarballs, create Git tags, and create GitHub releases.

The packages do not use a fixed version group. A Changeset must name each package that needs a release.

## Required repository configuration

Configure these GitHub repository values before you enable publishing:

| Type     | Name                      | Purpose                                                                          |
| -------- | ------------------------- | -------------------------------------------------------------------------------- |
| Variable | `RELEASE_APP_ID`          | Identifies the GitHub App that creates release commits, pull requests, and tags. |
| Secret   | `RELEASE_APP_PRIVATE_KEY` | Authenticates the release GitHub App.                                            |
| Variable | `NPM_RELEASES_ENABLED`    | Enables the pack and publish jobs when the value is `true`.                      |

Install the GitHub App on this repository. Grant it read and write access to Contents and Pull requests.

Create a GitHub environment named `release`. Configure its protection rules to enforce the required maintainer approval policy.

Configure npm trusted publishing for both package names and this repository workflow:

- `@thazhemadam/vim-state`
- `@thazhemadam/pi-vim`
- Workflow file: `.github/workflows/release.yml`
- Environment: `release`

The publish job uses npm 11.16.0 and GitHub Actions OIDC. It does not use an `NPM_TOKEN` secret.

Keep `NPM_RELEASES_ENABLED` set to a value other than `true` until trusted publishing and the release environment are ready. The workflow can still create the version pull request.

## Prepare a package change

1. Make the package change.
2. Add or update tests.
3. Update the package documentation when public behavior changes.
4. Run `npm run changeset`.
5. Select all affected packages.
6. Commit the generated `.changeset/*.md` file with the change.

Do not edit package versions, changelogs, or tags in a feature pull request.

## Verify release input

Run the primary validation checks:

```bash
npm ci
npm run check
npm test
npm run check:packages
```

Inspect each pending Changeset and verify that its summary describes the user-visible change.

## Create the version pull request

Merge the package change into `main`. The release workflow reads the pending Changesets and creates or updates one version pull request.

The version pull request runs:

```bash
npm run version-packages
```

This command performs these actions:

1. Runs `changeset version`.
2. Updates package versions and changelogs.
3. Updates internal dependency ranges.
4. Refreshes `package-lock.json` without lifecycle scripts.

Review the version pull request for these items:

- Correct package versions
- Correct changelog entries
- Correct internal dependency ranges
- No unrelated file changes
- Successful CI checks

## Publish

Merge the version pull request into `main`.

The release workflow switches to publish mode because no pending Changesets remain. It then performs these jobs:

1. The `pack` job runs all checks and builds npm tarballs.
2. The workflow stores the tarballs in a GitHub artifact.
3. The protected `publish` job requests npm trusted-publishing credentials.
4. Changesets publishes the tarballs from the artifact.
5. Changesets pushes package tags and creates GitHub releases.

The package tags use these forms:

```text
@thazhemadam/vim-state@<version>
@thazhemadam/pi-vim@<version>
```

## Verify a release

After the publish job succeeds, run these commands:

```bash
npm view @thazhemadam/vim-state version
npm view @thazhemadam/pi-vim version
```

Then inspect the GitHub releases and tags. Install the exact Pi extension version when the release changes integration behavior:

```bash
pi install npm:@thazhemadam/pi-vim@<version>
pi
```

Run `/pi-vim-status` in Pi, then manually test any integration behavior affected by the release.

## Recovery

Do not reuse an npm package version after npm accepts it. Prepare a new patch Changeset for a correction.

If the pack job fails, correct the source change or package metadata. Then merge the correction into `main`.

If the publish job fails before npm accepts a package, first correct any credential or environment approval errors. Then rerun the failed GitHub Actions jobs.

If only one package publishes, inspect npm before a rerun. Changesets skips versions that already exist and publishes the remaining package when the release plan permits it.
