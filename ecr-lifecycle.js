const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Logger setup
const logFilePath = path.join(__dirname, 'logs', 'output.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

function log(message) {
    const timestamp = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: false
      });
    
      const formatted = `[${timestamp}] ${message.trim()}`;
      console.log(formatted);
      logStream.write(formatted + '\n');
}

// Parse CLI args
const args = process.argv.slice(2);
const region = getArgValue('--region') || 'us-east-1';
const retentionDays = parseInt(getArgValue('--retention-days') || '30');
const tagPrefixes = getArgValue('--tag-prefixes')?.split(',') || ['latest', 'main', 'release', 'dev'];
const dryRun = args.includes('--dry-run');

function getArgValue(flag) {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

function execAsync(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr));
      resolve(stdout);
    });
  });
}

function isTagMatchingPrefixes(tag, prefixes) {
  return prefixes.some(prefix => tag.startsWith(prefix));
}

function generateLifecyclePolicy(prefixes, retentionDays) {
  return JSON.stringify({
    rules: [
      {
        rulePriority: 1,
        description: "Keep last 2 images for important tag prefixes",
        selection: {
          tagStatus: "tagged",
          tagPrefixList: prefixes,
          countType: "imageCountMoreThan",
          countNumber: 2
        },
        action: { type: "expire" }
      },
      {
        rulePriority: 2,
        description: "Delete untagged images older than X days",
        selection: {
          tagStatus: "untagged",
          countType: "sinceImagePushed",
          countUnit: "days",
          countNumber: retentionDays
        },
        action: { type: "expire" }
      },
      {
        rulePriority: 3,
        description: "Delete tagged images older than X days not matching prefixes",
        selection: {
          tagStatus: "tagged",
          tagPrefixList: prefixes,
          countType: "sinceImagePushed",
          countUnit: "days",
          countNumber: retentionDays
        },
        action: { type: "expire" }
      }
    ]
  });
}

async function main() {
  log(`Fetching ECR repositories in region: ${region}...`);
  if (dryRun) {
    log(`Dry-run mode enabled: No lifecycle policies will be applied.`);
  }

  try {
    const reposOutput = await execAsync(`aws ecr describe-repositories --region ${region}`);
    const repos = JSON.parse(reposOutput).repositories;

    for (const repo of repos) {
      const repoName = repo.repositoryName;
      log(`Processing repository: ${repoName}`);

      // Apply lifecycle policy if not dry-run
      const policyText = generateLifecyclePolicy(tagPrefixes, retentionDays);
      if (!dryRun) {
        await execAsync(`aws ecr put-lifecycle-policy --repository-name ${repoName} --lifecycle-policy-text '${policyText}' --region ${region}`);
        log(`Lifecycle policy applied to ${repoName}`);
      } else {
        log(`(Dry-run) Lifecycle policy NOT applied to ${repoName}`);
      }

      const imagesOutput = await execAsync(`aws ecr list-images --repository-name ${repoName} --region ${region} --filter tagStatus=ANY --output json`);
      const imageIds = JSON.parse(imagesOutput).imageIds;

      if (!imageIds.length) {
        log(`No images found in ${repoName}`);
        continue;
      }

      const describeOutput = await execAsync(`aws ecr describe-images --repository-name ${repoName} --region ${region} --output json`);
      const images = JSON.parse(describeOutput).imageDetails;

      const retained = [];
      const deleted = [];

      const taggedImages = images.filter(img => img.imageTags);
      const untaggedImages = images.filter(img => !img.imageTags);

      const now = Date.now();

      for (const prefix of tagPrefixes) {
        const matching = taggedImages.filter(img => img.imageTags.some(tag => tag.startsWith(prefix)));
        matching.sort((a, b) => new Date(b.imagePushedAt) - new Date(a.imagePushedAt));
        retained.push(...matching.slice(0, 2));
      }

      for (const img of images) {
        const pushedAt = new Date(img.imagePushedAt).getTime();
        const ageInDays = (now - pushedAt) / (1000 * 60 * 60 * 24);
        const isAlreadyRetained = retained.includes(img);

        if (isAlreadyRetained) continue;

        if (!img.imageTags || img.imageTags.length === 0) {
          if (ageInDays > retentionDays) deleted.push(img);
        } else {
          const hasMatchingTag = img.imageTags.some(tag => isTagMatchingPrefixes(tag, tagPrefixes));
          if (!hasMatchingTag || ageInDays > retentionDays) {
            deleted.push(img);
          } else {
            retained.push(img);
          }
        }
      }

      log(`Images to be RETAINED in ${repoName}: (${retained.length})`);
      retained.forEach(img => log(`  - ${img.imageDigest} ${img.imageTags?.join(', ') || '[untagged]'}`));

      log(`Images to be DELETED in ${repoName}: (${deleted.length})`);
      deleted.forEach(img => log(`  - ${img.imageDigest} ${img.imageTags?.join(', ') || '[untagged]'}`));
    }
  } catch (err) {
    log(`Error: ${err.message}`);
  }
}

main();