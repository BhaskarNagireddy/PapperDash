# Main Branch Protection Rules - Owner Approval Mandatory

## ⛔ CRITICAL REQUIREMENTS

**No merge to `main` without explicit approval from @BhaskarNagireddy.**

### Enforcement Rules

| Rule | Status | Effect |
|------|--------|--------|
| **Pull Request Required** | ✅ Enabled | All code must come through a PR; no direct commits |
| **Status Checks** | ✅ Enabled | Must pass: `typecheck`, `test`, `lint` |
| **Owner Approval Only** | ✅ Enabled | **Only @BhaskarNagireddy can approve** |
| **No Force Pushes** | ✅ Locked | Cannot override history, even as admin |
| **No Deletions** | ✅ Locked | Branch cannot be deleted |
| **Signed Commits** | ✅ Required | All commits must be GPG/SSH signed |
| **Stale Reviews Dismissed** | ✅ Enabled | New commits require fresh approvals |
| **Up-to-Date Required** | ✅ Enabled | Must be synced with main before merge |

---

## How This Works

### For Developers

1. **Create a feature branch:**
   ```bash
   git checkout -b feat/payment-integration
   ```

2. **Push to remote:**
   ```bash
   git push origin feat/payment-integration
   ```

3. **Open a Pull Request**
   - Include a detailed description
   - Link to related issues (`Closes #123`)
   - Explain changes in each affected block

4. **Automated Checks Run**
   - TypeScript type checking
   - Unit & integration tests
   - ESLint + boundary rules
   - Secret detection

5. **Wait for Owner Approval**
   - ❌ **Developers CANNOT merge** — no self-approval
   - ❌ **Admins CANNOT bypass** — no force merge option
   - ✅ **Only @BhaskarNagireddy can approve and merge**

### For the Owner (@BhaskarNagireddy)

When reviewing a PR:

1. **Check All Details** (see PR Review Checklist below)
2. **Approve** if satisfied
3. **Merge** using GitHub's merge button

**Important:** After approving, you MUST manually merge. The ruleset prevents auto-merge.

---

## What You'll See in Every PR

### Required Information for Your Review

#### 1. **PR Title & Description**
   - Clear summary of what changed and why
   - Links to related issues or ADRs

#### 2. **Changed Files** (visible in PR)
   - File count, additions, deletions
   - Which blocks/services affected

#### 3. **CI Status** (visible in PR checks)
   - ✅ All checks must pass
   - 🔴 Any red checks block merge

#### 4. **Review Comments** (visible in PR)
   - All feedback threads
   - Resolved vs. unresolved discussions

#### 5. **Commits** (visible in PR)
   - Commit messages (should reference tickets/issues)
   - Who authored each change

#### 6. **Approval Status**
   - Shows who reviewed
   - Shows approval state

---

## PR Review Checklist for Owner

Before approving any merge to `main`, verify:

### Code Quality
- [ ] All CI checks pass (typecheck, test, lint)
- [ ] No code quality issues or warnings
- [ ] Code follows project conventions

### Security & Compliance
- [ ] No hardcoded secrets or credentials
- [ ] No suspicious third-party dependencies added
- [ ] Commits are signed (GPG/SSH)
- [ ] No dangerous patterns (exec, eval, etc.)

### Architecture & Design
- [ ] Changes respect block boundaries
- [ ] No inappropriate cross-block dependencies
- [ ] Event contracts are versioned (backward compatible)
- [ ] Outbox pattern used for state changes

### Payments & Identity (Sensitive Blocks)
- [ ] If changes touch `payments/`: test Stripe integration
- [ ] If changes touch `identity/`: validate session handling
- [ ] If changes touch `platform/`: confirm no data leak
- [ ] Error messages don't expose system details

### Database Changes
- [ ] Migrations are backward compatible
- [ ] No breaking schema changes
- [ ] Rollback plan documented (if needed)
- [ ] Foreign keys properly indexed

### Documentation
- [ ] Updated API docs if endpoints changed
- [ ] Updated README if setup changed
- [ ] Architecture docs updated if blocks changed
- [ ] Comments in complex code sections

### Testing
- [ ] Test coverage is adequate
- [ ] Edge cases are covered
- [ ] Integration tests pass
- [ ] No flaky tests

---

## Common Scenarios

### Scenario 1: Developer Tries to Merge Without Approval
**Result:** ❌ GitHub blocks it. Merge button says "Waiting for approval."

### Scenario 2: Admin Tries to Force Merge (Bypass Rules)
**Result:** ❌ Force merge is **disabled** in settings. Cannot bypass.

### Scenario 3: New Commits Pushed After Approval
**Result:** ❌ Approval is dismissed (stale). Must re-approve the new commits.

### Scenario 4: Status Check Fails
**Result:** ❌ GitHub blocks merge until all checks pass.

### Scenario 5: Correct Flow - PR is Ready
1. Developer opens PR
2. CI checks pass ✅
3. Owner reviews PR thoroughly
4. Owner clicks **Approve**
5. Owner clicks **Merge** ← Only now can merge happen

---

## Accessing This Ruleset

### View Current Rules
- Go to: **Settings** → **Rules** (or **Branches** → **Branch protection rules**)
- Filter by `main`
- Confirm all rules are enabled

### Making Changes to Rules
Only the repository owner (@BhaskarNagireddy) can modify these rules.

To add/remove rules:
1. Go to **Settings** → **Rules**
2. Click the rule
3. Edit and save

---

## Merge Policy Summary

```
┌─────────────────────────────────────────────────┐
│                  PR to main                      │
├─────────────────────────────────────────────────┤
│ 1. Developer creates PR                         │
│ 2. CI runs (typecheck, test, lint)              │
│ 3. ❌ If CI fails → STOP (fix required)          │
│ 4. ✅ If CI passes → Ready for review            │
│ 5. Owner reviews all changes                    │
│ 6. Owner approves OR requests changes           │
│ 7. If changes requested → Developer pushes fix   │
│ 8. If approved → Merge button enabled           │
│ 9. Owner merges (no force bypass possible)      │
│ 10. Main branch updated                         │
└─────────────────────────────────────────────────┘
```

---

## Troubleshooting

### "Merge button is disabled — why?"

| Reason | Solution |
|--------|----------|
| CI checks failing | Fix code; push updates |
| Awaiting approval | Owner must review and approve |
| Branch not up to date | Click "Update branch" button |
| Unsigned commits | Configure git signing; amend commits |

### "I approved, but merge is still blocked"

- New commits were pushed → Approval was dismissed → Re-approve latest commits

### "I can't find the merge button"

- You may not have permission to merge (only owner can)
- Rule may prevent your role from merging (by design)

---

## GitHub CLI Commands

### Check rule status
```bash
gh api repos/BhaskarNagireddy/PapperDash/rules/branches \
  --jq '.[] | select(.target == "main")'
```

### View branch protection details
```bash
gh api repos/BhaskarNagireddy/PapperDash/branches/main/protection
```

### List all open PRs awaiting your approval
```bash
gh pr list --repo BhaskarNagireddy/PapperDash \
  --state open \
  --search "is:pr review-requested:@me"
```

---

## Questions?

- **About this rule:** See `.github/branch-ruleset-main.json`
- **About CI checks:** See `.github/workflows/`
- **About architecture:** See `docs/architecture/`

---

**Last updated:** October 8, 2026  
**Enforcement Level:** Maximum  
**Owner:** @BhaskarNagireddy
