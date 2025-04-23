const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Logger setup
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
const logFilePath = path.join(logDir, 'output.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

function log(message) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ${message}`;
  console.log(formatted);
  logStream.write(formatted + '\n');
}

// Helper to extract argument value
function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : null;
}

// Parse arguments
const region = getArgValue('--region') || 'us-east-1';
const retentionDays = parseInt(getArgValue('--retention-days')) || 30;
const tagPrefixes = (getArgValue('--tag-prefixes') || 'latest,main,release,dev').split(',');

// Build lifecycle policy
function buildPolicy(retentionDays, tagPrefixes) {
  return {
    rules: [
      {
        rulePriority: 1,
        description: "Keep last 2 images for important tag prefixes",
        selection: {
          tagStatus: "tagged",
          tagPrefixList: tagPrefixes,
          countType: "imageCountMoreThan",
          countNumber: 2
        },
        action: { type: "expire" }
      },
      {
        rulePriority: 2,
        description: `Delete untagged images older than ${retentionDays} days`,
        selection: {
          tagStatus: "untagged",
          countType: "sinceImagePushed",
          countUnit: "days",
          countNumber: retentionDays
        },
        action: { type: "expire" }
      }
    ]
  };
}

// Main logic
function main() {
  try {
    log(`Fetching ECR repositories in region: ${region}...`);
    const repoListRaw = execSync(`aws ecr describe-repositories --region ${region} --query "repositories[].repositoryName" --output json`);
    const repos = JSON.parse(repoListRaw.toString());

    if (repos.length === 0) {
      log("No repositories found.");
      return;
    }

    const policy = buildPolicy(retentionDays, tagPrefixes);
    const policyString = JSON.stringify(policy).replace(/"/g, '\\"');

    repos.forEach(repo => {
      const command = `aws ecr put-lifecycle-policy --repository-name ${repo} --region ${region} --lifecycle-policy-text "${policyString}"`;
      try {
        execSync(command, { stdio: "inherit" });
        log(`Policy applied to repository: ${repo}`);
      } catch (err) {
        log(`Failed to apply policy to ${repo}: ${err.message}`);
      }
    });

  } catch (err) {
    log(`Error: ${err.message}`);
  }
}

main();
