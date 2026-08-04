/**
 * S3 호환 오브젝트 스토리지 업로드.
 *
 * 환경변수 6개(S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
 * S3_PUBLIC_BASE_URL)가 전부 설정된 경우에만 활성화된다. 하나라도 비어있으면 기존처럼
 * 로컬 파일만 쓰는 동작으로 그대로 돌아간다 - 로컬 개발/테스트가 계속 가능해야 하기 때문.
 *
 * 업로드 대상 파일의 "상대 경로"(예: images/meta/xxx.jpg, screenshots/bs_xxx.jpg)를
 * 그대로 S3 오브젝트 키로 써서, 버킷 안에서도 로컬 폴더 구조와 동일하게 보이게 한다.
 *
 * .env 파일(이 디렉토리 기준)을 자동으로 읽는다 - settings.json처럼 로컬에 두고 쓰되
 * git에는 올리지 않는(.gitignore의 .env 패턴) 방식.
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true });

const fs = require('fs');
const path = require('path');

function isS3Enabled() {
  return !!(
    process.env.S3_ENDPOINT && process.env.S3_REGION && process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_PUBLIC_BASE_URL
  );
}

let _client = null;
function getClient() {
  if (_client) return _client;
  const { S3Client } = require('@aws-sdk/client-s3');
  _client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // MinIO 등 대부분의 S3 호환 스토리지는 path-style 접근이 필요
  });
  return _client;
}

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4',
};
function guessContentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * outputDir 기준 상대경로(relativePath) 파일을 S3에 올리고, 성공하면 로컬 파일을 지운 뒤
 * 공개 URL을 반환한다. S3가 비활성화 상태이거나 파일이 없으면 원래 relativePath를 그대로
 * 반환하고, 업로드 자체가 실패해도(네트워크 오류 등) 로컬 파일을 남긴 채 relativePath를
 * 그대로 반환한다 - 호출부는 이 함수가 절대 throw하지 않는다고 가정하고 그냥 반환값을
 * item.localPath 등에 그대로 써넣으면 된다 (로컬 상대경로일 수도, 완전한 URL일 수도 있음).
 */
async function uploadIfEnabled(outputDir, relativePath) {
  if (!relativePath || !isS3Enabled()) return relativePath;
  const fullPath = path.join(outputDir, relativePath);
  if (!fs.existsSync(fullPath)) return relativePath;

  try {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const body = fs.readFileSync(fullPath);
    const key = relativePath.replace(/\\/g, '/'); // 윈도우 경로 구분자(\) 방지 - S3 키는 항상 /
    await getClient().send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: guessContentType(relativePath),
    }));
    fs.unlinkSync(fullPath);
    const base = process.env.S3_PUBLIC_BASE_URL.replace(/\/+$/, '');
    return `${base}/${key}`;
  } catch (e) {
    console.error(`  [S3 업로드 실패] ${relativePath}: ${e.message} (로컬 파일 유지, 수집은 계속 진행)`);
    return relativePath;
  }
}

module.exports = { isS3Enabled, uploadIfEnabled };
