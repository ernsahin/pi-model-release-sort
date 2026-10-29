# Contributing

Thanks for helping! Issues and pull requests are welcome.

## How changes get merged

- Every pull request needs a review and approval from the maintainer
  ([@ernsahin](https://github.com/ernsahin)) before it is merged. This is enforced through
  `.github/CODEOWNERS` and branch protection on `main`.
- CI (type check + tests) must pass.
- Releases to npm are made only by the maintainer.

## Development

Requirements: Node.js 22.19 or newer and [pi](https://pi.dev).

```bash
npm install
npm run check      # type check + tests
pi -e .            # run pi with your local copy of the package
```

Project layout:

| File | What it does |
|---|---|
| `src/index.ts` | Extension entry point |
| `src/selector-patch.ts` | Hooks into pi's model selector |
| `src/arrange.ts` | Sorting and hiding rules (pure, tested) |
| `src/release-dates.ts` | Downloads and looks up release dates from models.dev |
| `src/config.ts` | Settings file format and validation |
| `src/command.ts` | `/model-sort` command and menu |

## Pull request checklist

- Keep the change focused on one thing.
- Add or update tests for changes in `arrange.ts`, `release-dates.ts` or `config.ts`.
- Run `npm run check`.
- Try it in pi with `pi -e .` and open `/model`.
- Add a line under `Unreleased` in `CHANGELOG.md`.

## Reporting bugs

Please include your pi version (`pi --version`), the output of `/model-sort status`,
and what you expected to see.
