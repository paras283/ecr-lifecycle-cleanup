const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Logger setup
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
const logFilePath = path.join(logDir, 'output.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

function log(message) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}`;
  console.log(entry);
  logStream.write(entry + '\n');
}

// CLI Args
const args = process.argv.slice(2);
function getArgValue(flag) {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}
const region = getArgValue('--region') || 'us-east-1';
const retentionDays = parseInt(getArgValue('--retention-days') || '30');
const tagPrefixes = getArgValue('--tag-prefixes')?.split(',') || ['latest', 'main', 'release', 'dev'];

// Build lifecycle policy JSON
function buildPolicy() {
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
        action: {
          type: "expire"
        }
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
        action: {
          type: "expire"
        }
      },
      {
        rulePriority: 3,
        description: `Delete tagged images older than ${retentionDays} days`,
        selection: {
          tagStatus: "tagged",
          countType: "sinceImagePushed",
          countUnit: "days",
          countNumber: retentionDays
        },
        action: {
          type: "expire"
        }
      }
    ]
  };
}

function execAsync(command) {
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr));
      resolve(stdout);
    });
  });
}

async function main() {
  log(`Fetching repositories in region: ${region}`);
  try {
    const repoOutput = await execAsync(`aws ecr describe-repositories --region ${region}`);
    const repos = JSON.parse(repoOutput).repositories;

    if (!repos.length) {
      log("No repositories found.");
      return;
    }

    const policy = buildPolicy();
    const policyText = JSON.stringify(policy).replace(/"/g, '\\"');

    for (const repo of repos) {
      const repoName = repo.repositoryName;
      log(`Applying lifecycle policy to ${repoName}`);
      try {
        await execAsync(`aws ecr put-lifecycle-policy --repository-name ${repoName} --region ${region} --lifecycle-policy-text "${policyText}"`);
        log(`Successfully applied policy to ${repoName}`);
      } catch (err) {
        log(`Failed to apply policy to ${repoName}: ${err.message}`);
      }
    }
  } catch (err) {
    log(`Error fetching repositories: ${err.message}`);
  }
}

main();
