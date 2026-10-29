# pi-model-release-sort

A [pi](https://pi.dev) package that orders the `/model` list by **release date** (newest first)
instead of by provider name, and lets you **hide** the models you never use.

[![CI](https://github.com/ernsahin/pi-model-release-sort/actions/workflows/ci.yml/badge.svg)](https://github.com/ernsahin/pi-model-release-sort/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/pi-model-release-sort)](https://www.npmjs.com/package/pi-model-release-sort)

## Install

```bash
pi install npm:pi-model-release-sort
```

Try it for a single run without installing:

```bash
pi -e npm:pi-model-release-sort
```

## What it does

- `/model` (and its keyboard shortcut) list the newest models first. Models with no known date go to the end.
- Your current model and default model stay at the top, as in plain pi. They are never hidden.
- The "scoped" tab is sorted and filtered the same way.
- You can hide single models, whole providers, or every model older than N months.

## Settings

Run `/model-sort` to open the settings menu:

```
Model list · 12 hidden
  Order: newest
  Hide models… (3 selected)
  Hide providers… (1 selected)
  Hide older than: 12 months
  Refresh release dates
  Reset to defaults
```

Or use subcommands (with autocomplete):

| Command | What it does |
|---|---|
| `/model-sort newest` | Newest release first (default) |
| `/model-sort oldest` | Oldest release first |
| `/model-sort off` | pi's built-in order (hiding still applies) |
| `/model-sort hide <provider/model>` | Hide one model |
| `/model-sort unhide <provider/model>` | Show it again |
| `/model-sort hide-provider <provider>` | Hide all models of a provider |
| `/model-sort unhide-provider <provider>` | Show them again |
| `/model-sort older-than <months\|off>` | Hide models released more than N months ago |
| `/model-sort status` | Show the current settings |
| `/model-sort refresh` | Download release dates again |
| `/model-sort reset` | Restore the defaults |

Settings are saved in `~/.pi/agent/model-release-sort.json`:

```json
{
  "order": "newest",
  "hiddenModels": ["openai/gpt-4o"],
  "hiddenProviders": ["openrouter"],
  "hideOlderThanMonths": 12
}
```

Defaults: `order` is `"newest"`, nothing is hidden.

## Where release dates come from

pi's model data has no release dates, so they are taken from the public
[models.dev](https://models.dev) catalog (`https://models.dev/api.json`).

- Downloaded in the background at most once a day and cached in `~/.pi/agent/cache/model-release-dates.json`.
- Matched by provider and model id, then by model id alone (so `openai-codex/gpt-5.5` uses the date of `openai/gpt-5.5`).
- Offline: the cached dates are used. With no cache at all, pi's normal order is used.
- No other data is sent anywhere.

## Compatibility

pi does not let extensions replace the built-in `/model` command. This package wraps two internal
methods of pi's `ModelSelectorComponent` (`sortModels` and `loadModelsFromSnapshot`). Tested with
pi 1.4.0. If a future pi release changes those methods, the package shows a warning and pi falls back
to its normal order. Nothing breaks.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
