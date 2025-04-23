# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),  
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2025-04-23
### Added
- Initial version of the ECR cleanup script using Node.js.
- CLI arguments support for:
  - `--region`
  - `--retention-days`
  - `--tag-prefixes`
  - `--dry-run`
- Logging mechanism that writes image retention and deletion info to `logs/output.log`.
- Lifecycle policy application per repository.
- Evaluation logic for image retention and deletion based on:
  - Tagged prefix match (retains latest 2)
  - Tagged but older than retention days
  - Untagged and older than retention days
- Dry-run mode to simulate lifecycle policy without applying changes (added in a feature branch).
- README file with setup and usage instructions.