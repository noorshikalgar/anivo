# Branching and commit rules

## Branches

| Branch | Purpose | Rules |
|---|---|---|
| `main` | Released, stable code. Each commit on `main` is a release or the planning baseline. | **Protected.** Do not push to `main`. Changes come only through a release pull request from `develop`. |
| `develop` | Integration branch. The default branch on GitHub. | **Protected.** It must always build, and all tests must pass. Changes come only through pull requests from `feat/*`, `fix/*`, `docs/*`, and `chore/*` branches. |
| `feat/<short-name>` | One feature or one roadmap item | Branch from `develop`. Squash-merge back to `develop` through a pull request. Example: `feat/engine-evaluate`. |
| `fix/<short-name>` | One bug fix | The same flow as a feature. |
| `docs/<short-name>` | Changes to documents only | The same flow as a feature. |
| `chore/<short-name>` | Build, CI, and dependency changes | The same flow as a feature. |
| `hotfix/<short-name>` | An urgent fix to a release | Branch from `main`. Merge to `main` with a pull request. Then merge `main` back to `develop`. |

## Procedure for a change

1. Update `develop`: `git switch develop && git pull`.
2. Make a branch: `git switch -c feat/<short-name>`.
3. Make commits. Small commits are good. The squash merge makes one commit on `develop`.
4. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`. All must pass.
5. Push the branch and open a pull request to `develop`.
6. Write the feature IDs (for example `FR-STEP-06`) in the pull request title or body.
7. When CI passes, squash-merge the pull request. GitHub deletes the branch.

## Procedure for a release

1. Open a pull request from `develop` to `main` with the title `release: vX.Y.Z`.
2. When CI passes, merge it with a merge commit. Do not squash. The release history stays visible.
3. Tag the merge commit on `main`: `vX.Y.Z`.
4. Publish the release (npm packages, Docker images) from the tag.

> **WARNING:** Do not force-push to `main` or `develop`. Do not delete these branches.

## Commit messages: Conventional Commits

```
<type>(<scope>): <summary in imperative mood, 72 characters maximum>

<body: what and why, wrapped at 72 characters>
```

- Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`.
- Scopes: `schema`, `ops`, `engine`, `layout`, `render`, `script`, `lint`, `fileio`, `export`, `audio`, `ai`, `bridge`, `editor`, `cli`, `mcp`, `player`, `web`, `server`, `docs`, `repo`.
- Example: `feat(engine): add deterministic flow particles (FR-STEP-06)`.
- Sign off each commit (`git commit -s`). See [12](docs/12-quality-and-security.md#licenses).

## Tags

- `vX.Y.Z` marks a release on `main`.
- `vX.Y.Z-beta.N` marks a pre-release (for example the public beta after phase 2).
