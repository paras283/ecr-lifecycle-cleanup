const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Logger setup
const logFilePath = path.join(__dirname, 'logs', 'output.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

function log(message) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ${message}`;
  console.log(formatted);
  logStream.write(formatted + '\n');
}

// Parse CLI args
const args = process.argv.slice(2);
const region = getArgValue('--region') || 'us-east-1';
const retentionDays = parseInt(getArgValue('--retention-days') || '30');
const tagPrefixes = getArgValue('--tag-prefixes')?.split(',') || ['latest', 'main', 'release', 'dev'];

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

async function main() {
  log(`Fetching ECR repositories in region: ${region}...`);

  try {
    const reposOutput = await execAsync(`aws ecr describe-repositories --region ${region}`);
    const repos = JSON.parse(reposOutput).repositories;

    for (const repo of repos) {
      const repoName = repo.repositoryName;
      log(`Processing repository: ${repoName}`);

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

      // Retain last 2 images for each matching prefix
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

      log(`Images to be RETAINED in ${repoName}:`);
      retained.forEach(img => log(`  - ${img.imageDigest} ${img.imageTags?.join(', ') || '[untagged]'}`));

      log(`Images to be DELETED in ${repoName}:`);
      deleted.forEach(img => log(`  - ${img.imageDigest} ${img.imageTags?.join(', ') || '[untagged]'}`));
    }
  } catch (err) {
    log(`Error: ${err.message}`);
  }
}

main();
