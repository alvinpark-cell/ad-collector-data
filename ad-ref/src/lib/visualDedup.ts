// 화면 표시용 "비슷한 소재 접기" 필터 - ad-collector/utils.js의 pHash(32x32=1024비트)를
// 그대로 문자 단위 비교하면 클러스터링이 약할 때(비슷한데 안 겹치는 소재가 많을 때) 사실상
// O(n^2)이 되어 수천 개 항목에서 브라우저가 몇십 초씩 멈춘다(실측 확인, 2026-08-07).
// 그래서 두 단계로 빠르게 만든다:
// 1) 1024비트를 8x8=64비트로 다운샘플(4칸씩 띄엄띄엄 샘플) - 비교 1회가 16배 가벼워짐
// 2) 64비트 해시의 상위 16비트를 버킷 키로 써서, 같은 버킷(또는 인접 버킷) 안에서만 비교
//    - 완전히 정밀하진 않지만(경계에 걸친 유사 이미지를 놓칠 수 있음), 화면 정리용 기능이라
//      약간의 재현율 손해보다 응답성이 훨씬 중요하다.
const THRESHOLD_64 = 6; // 64비트 기준 임계값(1024비트 임계값 10을 다운샘플 비율로 환산한 근사치)
const GRID = 32; // 원본 pHash가 32x32 그레이스케일 기준(ad-collector/utils.js와 동일)
const DOWNSAMPLE = 8; // 8x8로 줄임
const STEP = GRID / DOWNSAMPLE; // 4칸씩 샘플

function downsampleTo64(hash: string): bigint {
  let bits = '';
  for (let r = 0; r < DOWNSAMPLE; r++) {
    for (let c = 0; c < DOWNSAMPLE; c++) {
      const idx = (r * STEP) * GRID + (c * STEP);
      bits += hash[idx] || '0';
    }
  }
  return BigInt('0b' + bits);
}

const ZERO = BigInt(0);
const ONE = BigInt(1);

function popcount64(x: bigint): number {
  let count = 0;
  while (x > ZERO) {
    x &= x - ONE; // 최하위 1비트 제거 (Brian Kernighan 알고리즘)
    count++;
  }
  return count;
}

function bucketKey(hash64: bigint): number {
  return Number(hash64 >> BigInt(48)); // 상위 16비트만 버킷 키로 (0~65535)
}

export interface VisuallyDedupable {
  id: string;
  visualHash?: string;
}

// items는 이미 원하는 우선순위(예: 최신순)로 정렬되어 들어온다고 가정 - 순서대로 훑으면서
// 같은 버킷에 이미 대표로 뽑힌 것과 비슷하면 건너뛴다(그리디). 대표로 남는 id의 Set을 반환.
export function pickVisuallyDistinctIds<T extends VisuallyDedupable>(items: T[]): Set<string> {
  const buckets = new Map<number, bigint[]>();
  const keptIds = new Set<string>();

  for (const item of items) {
    if (!item.visualHash) {
      keptIds.add(item.id); // 해시 없는 항목(메타, 영상 등)은 항상 대표로 남긴다
      continue;
    }
    const h = downsampleTo64(item.visualHash);
    const key = bucketKey(h);
    const bucket = buckets.get(key);
    const isDup = !!bucket && bucket.some(k => popcount64(h ^ k) <= THRESHOLD_64);
    if (!isDup) {
      if (bucket) bucket.push(h);
      else buckets.set(key, [h]);
      keptIds.add(item.id);
    }
  }

  return keptIds;
}
