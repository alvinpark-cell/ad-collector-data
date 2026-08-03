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
  landingUrl?: string;
  sourceUrl?: string;
  keyword: string;
  searchType: 'keyword' | 'brand';
  adStartedAt?: string;
  adLastShownAt?: string;
  detailsLink?: string;
  placements?: string;
  collectedAt: string;
  device?: 'pc' | 'mo';
  buttons?: LandingButton[];
  screenshotPath?: string;
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

export interface PowerlinkAd {
  rank: number;
  advertiserName: string | null;
  displayUrl: string | null;
  title: string;
  description: string | null;
  adPeriod: string | null;
  landingUrl: string | null;
  adId: string | null;
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
