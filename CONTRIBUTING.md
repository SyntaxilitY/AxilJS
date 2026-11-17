# Contributing to AxilJS

Thanks for your interest in AxilJS! Every contribution helps — bug reports, docs, tests and code.

## Before you start
- Search [existing issues](https://github.com/SyntaxilitY/AxilJS/issues) before opening a new one.
- For a large change or new feature, open an issue first so we can agree on the approach.

## Development setup
```bash
git clone https://github.com/<your-username>/AxilJS.git
cd AxilJS
npm install
npm run build:all
```

## Making a change
1. Fork the repository and create a branch from `main`:
   `git checkout -b fix/short-description`
2. Make your change and add or update tests.
3. Make sure everything builds and tests pass.
4. Commit with a clear message, e.g. `FIX: orm migration status on sqlite` or `ADD: queue job priority`.
5. Push to your fork and open a Pull Request against `main`.

## Code guidelines
- All code must be TypeScript with strict mode.
- Every file must have a top-level comment.
- Every public function must have JSDoc.
- Every new feature must have tests.
- No circular dependencies between packages.
- All PRs must build without errors.

## Review process
- A maintainer reviews every PR. You may be asked for changes — that's normal.
- PRs are merged with **squash merge** to keep history clean.
- Commits must be signed. See [GitHub's guide on signing commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits).

## License
By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
