// 브랜드검색 주차별/월별 스냅샷 간 변경사항(신규/종료 버튼) 계산

interface BsButton {
  area?: string;
  buttonText?: string;
  buttonUrl?: string;
  finalUrl?: string;
}

export interface BsButtonDiffItem {
  device: 'pc' | 'mo';
  area: string;
  text: string;
}

export interface BsButtonDiff {
  added: BsButtonDiffItem[];
  removed: BsButtonDiffItem[];
  isFirstSnapshot: boolean; // 이전 스냅샷 자체가 없어 비교 불가(최초 수집)
}

// 식별 기준은 URL만 사용(영역 라벨은 포함하지 않음). 영역 이름 분류 로직은 코드가 계속
// 개선되면서 바뀌는데(예: "메인 배너" -> "메인이미지1"), 라벨을 키에 포함하면 실제 광고
// 내용은 그대로인데도 라벨만 바뀐 것을 "종료+신규"로 오인하게 됨. 실제 랜딩 URL에는
// utm_content 등으로 위치별 구분이 이미 들어있어 URL만으로도 동일 위치 식별이 충분함.
function buttonKey(b: BsButton): string {
  return b.finalUrl || b.buttonUrl || '';
}

function diffOneDevice(device: 'pc' | 'mo', prevButtons: BsButton[] | undefined, currButtons: BsButton[] | undefined) {
  const prevList = prevButtons || [];
  const currList = currButtons || [];
  const prevKeys = new Set(prevList.map(buttonKey));
  const currKeys = new Set(currList.map(buttonKey));

  const added: BsButtonDiffItem[] = currList
    .filter(b => !prevKeys.has(buttonKey(b)))
    .map(b => ({ device, area: b.area || '기타', text: b.buttonText || '' }));
  const removed: BsButtonDiffItem[] = prevList
    .filter(b => !currKeys.has(buttonKey(b)))
    .map(b => ({ device, area: b.area || '기타', text: b.buttonText || '' }));

  return { added, removed };
}

// pcCurr/moCurr: 현재 선택된 주차의 PC/MO 항목, pcPrev/moPrev: 그 직전 스냅샷(같은 브랜드/디바이스)
export function diffBrandSnapshot(
  pcPrev: { buttons?: BsButton[] } | null | undefined,
  pcCurr: { buttons?: BsButton[] } | null | undefined,
  moPrev: { buttons?: BsButton[] } | null | undefined,
  moCurr: { buttons?: BsButton[] } | null | undefined
): BsButtonDiff {
  const isFirstSnapshot = !pcPrev && !moPrev;
  const pcDiff = diffOneDevice('pc', pcPrev?.buttons, pcCurr?.buttons);
  const moDiff = diffOneDevice('mo', moPrev?.buttons, moCurr?.buttons);
  return {
    added: [...pcDiff.added, ...moDiff.added],
    removed: [...pcDiff.removed, ...moDiff.removed],
    isFirstSnapshot,
  };
}
