# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-10-29

### Changed

- `/model-sort` opens a new settings panel with Models, Providers and Options tabs instead of a chain of menus.
  The list fits the terminal and scrolls, the cursor stays in place after a change, and models can be searched.

### Added

- Bulk actions: hide or show all listed models, hide everything below the cursor, toggle a whole provider.
- `/model`: a message explains why a model can't be unhidden (provider or age rule) and when a search only
  matches hidden models.

### Fixed

- Lower rows of the model list were cut off and the list jumped back to the top after every toggle.

## [0.3.0] - 2026-10-29

### Added

- Keys inside the `/model` window: `alt+h` hide/unhide, `alt+o` change order, `alt+a` show hidden models.
- Release date shown next to each model in `/model`.
- `keys` setting to change those keys.

## [0.2.0] - 2026-10-29

### Added

- Hide single models, whole providers, or models older than N months from the `/model` list.
- `/model-sort` settings menu, plus subcommands (`hide`, `unhide`, `hide-provider`,
  `unhide-provider`, `older-than`, `status`, `reset`).
- Tests, type checking and CI.

## [0.1.0] - 2026-10-29

### Added

- Sort the `/model` list by release date (newest or oldest first) using models.dev data.
