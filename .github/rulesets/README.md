# Repository rulesets

`protect-main.json` is the ruleset that protects `main`. It is kept here so the rules are reviewed like code; GitHub applies it only after an admin imports it.

**Import:** Settings → Rules → Rulesets → **New ruleset ▾ → Import a ruleset** → choose `protect-main.json` → **Create**.

| Rule | Setting |
| --- | --- |
| Applies to | The default branch (`main`) only. Feature branches like `claude/…` stay free to create and push |
| Enforcement | Active, with **no bypass list**: admins follow it too |
| Require a pull request before merging | 0 approvals while one person develops (GitHub never lets authors approve their own pull requests); stale approvals dismissed on new pushes; all review conversations resolved |
| Require status checks to pass | All six CI checks, and the branch must be up to date with `main` |
| Block force pushes | On: history on `main` can't be rewritten |
| Restrict deletions | On: `main` can't be deleted |

When a second developer joins, raise `required_approving_review_count` to `1` (in the file and in GitHub).

If you rename a CI job in `.github/workflows/ci.yml`, update its name here and in GitHub too. Otherwise the required check never reports, and every pull request waits forever.
