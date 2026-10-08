## What and why
<!-- What this changes for customers, staff or the system, and why. Link the ADR or issue if there is one. -->

## Tests
<!-- Name the tests added or changed. Every behaviour change needs one (docs/engineering/testing.md). -->
- Unit:
- Integration:

## Checklist
- [ ] New or changed behaviour has unit and/or integration tests
- [ ] A bug fix includes the test that would have caught it
- [ ] Database changes include a migration and work with the previous release
- [ ] No secrets, personal data or storage keys in code, logs or responses
- [ ] Any scanner exception is recorded with its reason (docs/engineering/testing.md, "Warnings and false positives")
- [ ] Docs and ADRs updated if behaviour or architecture changed
