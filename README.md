# pi-model-release-sort

A pi package that sorts the model selector (`/model` and its shortcut) by **release date**, so new models show up first instead of old ones.

- The current model and the default model stay at the top (same as pi).
- All other models are listed newest → oldest. Models without a known date go to the end.
- The "scoped" tab is sorted the same way.

Release dates come from [models.dev](https://models.dev/api.json). They are downloaded once a day and stored in `~/.pi/agent/cache/model-release-dates.json`. If the download fails, the last cached dates are used. With no cache at all, pi's normal order is used.

## Install

```bash
pi install ./path/to/pi-model-release-sort
```

Or try it for one run:

```bash
pi -e ./path/to/pi-model-release-sort
```

## Command

| Command | What it does |
|---|---|
| `/model-sort` | Pick an option from a menu |
| `/model-sort newest` | Newest first (default) |
| `/model-sort oldest` | Oldest first |
| `/model-sort off` | pi's normal order |
| `/model-sort refresh` | Download the release dates again now |

The choice is saved in `~/.pi/agent/model-release-sort.json`.

## How it works

pi does not let extensions replace the built-in `/model` command, so this package replaces the sort function of pi's own `ModelSelectorComponent`. Because it relies on that internal method (`sortModels`), a future pi version may break it. If that happens, the selector falls back to pi's normal order.
