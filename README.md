# ECR Lifecycle Cleanup Tool

A Node.js script to apply lifecycle policies to AWS Elastic Container Registry (ECR) repositories and log which images will be retained or deleted. Supports a dry-run mode to preview changes without applying them.

## Features

- Automatically applies lifecycle policies to all repositories in a given region.
- Supports customizable retention days and tag prefixes.
- Logs images to be retained and deleted based on lifecycle logic.
- Dry-run mode available for safe previewing of changes.
- CLI argument support for flexible configuration.

## Requirements

- Node.js (v14 or later)
- AWS CLI configured with necessary permissions
- IAM user with permissions: `ecr:DescribeRepositories`, `ecr:ListImages`, `ecr:DescribeImages`, `ecr:PutLifecyclePolicy`

## Setup

1. Clone the repository:

git clone https://github.com/paras283/ecr-lifecycle-cleanup.git
cd ecr-cleanup-script

2. Install dependencies:

npm install

3. Ensure AWS CLI is configured:

aws configure

## Usage

node ecr-lifecycle.js --region <aws-region> --retention-days <days> --tag-prefixes <prefix1,prefix2,...> [--dry-run]

### Example:

node ecr-lifecycle.js --region us-east-1 --retention-days 30 --tag-prefixes latest,release,dev --dry-run

## Output

- Logs are saved in `logs/output.log`.
- Includes:
  - ECR repositories found
  - Lifecycle policy applied (or skipped in dry-run)
  - Images retained
  - Images marked for deletion


## Git Strategy

- `master`: Production-ready code
- `feature/*`: Feature development branches
- Use pull requests to merge features into `master`
- Descriptive commit messages for each logical change
- Ignore log files using `.gitignore`

## Author

- Built as part of an assignment to demonstrate ECR automation and lifecycle management.

## License

This project is open-source. Use it freely in personal or professional environments.