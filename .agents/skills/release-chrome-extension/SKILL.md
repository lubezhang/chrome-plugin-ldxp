---
name: release-chrome-extension
description: Prepare this Chrome extension release by updating its manifest version, building the upload package, writing an English changelog, and creating a GitHub tag. Use when publishing a release, not for ordinary builds or changelog-only updates.
---

# Release Chrome Extension

Prepare a release whose version, package, changelog, and GitHub tag all describe the same committed source state.

## Required Input

Obtain the exact target version from the user. Do not infer a patch, minor, or major version from commit messages. Stop if the requested version is not greater than the version in `manifest.json` or is not a valid Chrome extension version.

## Prepare the Release

1. Inspect `git status`, the current branch, `origin`, the manifest version, and existing local and remote tags. Preserve unrelated working-tree changes. Confirm the planned `v<version>` tag does not exist locally or on `origin`.
2. Update only the `version` field in `manifest.json`, preserving its JSON formatting. Add the release entry to `CHANGELOG.md` in English and retain the repository's existing format.
3. Derive changelog content from commits since the previous release tag, or from the available history when no prior tag exists. Include only verifiable user-visible additions, changes, fixes, and breaking changes. Do not invent features, dates, links, issue numbers, or prior releases. Move applicable entries from `Unreleased` into the new version section, retaining an empty `Unreleased` heading when it is the local convention.
4. Run `./scripts/build.sh`. It must produce `dist/linked-shop-helper-<version>.zip`; verify the command succeeds, the archive passes integrity checks, and its embedded `manifest.json` has the requested version. Run focused tests or static checks when the repository provides them. Do not tag a failed or unverified build.

## Commit and Tag

The release tag must point to a commit containing the version and changelog changes. Stage only those release files and create a conventional release commit if they are not already committed. Never include unrelated user changes.

Before creating or pushing a tag, report the target version, commit SHA, archive path, changed release files, remote branch, and tag name. Create and push an annotated `v<version>` tag only when the current user request explicitly authorizes publication. If the request only prepares a release, stop after verification and provide the exact commit and tag commands for review.

Push the release commit to its intended remote branch before pushing the tag. Recheck the remote tag immediately before creation to prevent collisions. Do not force-push, retag, delete tags, or create a GitHub Release unless the user specifically requests one.

## Completion Report

Report the manifest version, package path, validation performed, release commit, tag, and push result. State clearly if the workflow stopped before the external publication step.
