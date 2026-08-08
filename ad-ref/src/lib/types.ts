export interface AdItem {
  id: string;
  platform: 'meta' | 'google' | 'naver_bs';
  mediaType: 'image' | 'video';
  mediaUrl: string;
  thumbnailUrl?: string;
  localPath?: string;
  localThumb?: string;
  advertiserName: string;
  copyText: string;
  headline?: string;
  // 문구/헤드라인이 아예 없는(모델·비주얼 위주) 구글 소재를 googleDescriptionBackfill.js가
  // 이미지 분석으로 미리 채워둔 설명 - 소재 인사이트가 "문구 없음" 소재도 분석에 반영하도록 씀
  aiDescription?: string;
  // 구글 이미지 소재의 시각적 유사도 해시(32x32 그레이스케일 1024비트, 이진 문자열) - 데이터
  // 저장/중복판정에는 안 쓰고, 대시보드의 "비슷한 소재 접기" 화면 표시용 필터에만 쓴다.
  visualHash?: string;
  landingUrl?: string;
  sourceUrl?: string;
  keyword: string;
  searchType: 'keyword' | 'brand';
  adStartedAt?: string;
  adLastShownAt?: string;
  detailsLink?: string;
  placements?: string;
  collectedAt: string;
  status?: 'active' | 'ended';
  device?: 'pc' | 'mo';
  buttons?: LandingButton[];
  screenshotPath?: string;
  // 이 소재가 게재 중인 것으로 확인된 월 목록 ('YYYY-MM'). URL/adId 중복으로 새 항목이
  // 추가되지 않는 달에도, 다시 수집됐다면 현재 월이 여기 누적됨 (월별 신규/지속 소재 파악용)
  seenInMonths?: string[];
}

export interface LandingButton {
  buttonText: string;
  buttonUrl: string;
  finalUrl: string;
  landingScreenshot: string | null;
}

export type Platform = 'all' | 'meta' | 'google';
export type MediaType = 'all' | 'image' | 'video';
export type Period = 'all' | '7' | '30' | '180' | '365' | 'custom';
export type Tab = 'search' | 'brand' | 'favorites';

export interface FavoriteItem {
  id: string;
  name: string;
  folder: string;
  addedAt: string;
}

export interface PowerlinkSublink { title: string; url: string; imageUrl?: string; }
export interface PowerlinkExtraTitle { badge: string; text: string; url: string; }

export interface PowerlinkAd {
  rank: number;
  advertiserName: string | null;
  displayUrl: string | null;
  title: string;
  description: string | null;
  adPeriod: string | null;
  landingUrl: string | null;
  adId: string | null;
  sublinks?: PowerlinkSublink[];
  imageSublinks?: PowerlinkSublink[];
  extraTitle?: PowerlinkExtraTitle | null;
  imageUrl?: string | null;
  localImage?: string;
}

export interface PowerlinkItem {
  id: string;
  platform: 'naver_powerlink';
  device: 'pc' | 'mo';
  keyword: string;
  ads: PowerlinkAd[];
  collectedAt: string;
}
