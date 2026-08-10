'use client';

import { useState, useEffect, useMemo } from 'react';
import { AdItem, FavoriteItem } from '@/lib/types';
import AdCard from '@/components/AdCard';
import AdModal from '@/components/AdModal';
import TrendAnalysis, { defaultDateRange, DataLabResult } from '@/components/TrendAnalysis';
import MarketIndexPanel from '@/components/MarketIndexPanel';
import PowerlinkMonitor from '@/components/PowerlinkMonitor';
import PowerlinkBrandMonitor from '@/components/PowerlinkBrandMonitor';
import InsightBox from '@/components/InsightBox';
import TrendReport from '@/components/TrendReport';
import CommunityTrend from '@/components/CommunityTrend';
import WeekSelector from '@/components/WeekSelector';
import Sidebar, { ViewKey } from '@/components/Sidebar';
import { getMonthWeekKey, sortMonthWeekKeysDesc } from '@/lib/weekUtils';
import { diffBrandSnapshot } from '@/lib/bsDiff';
import { matchesBrand, normalizeName } from '@/lib/brandUtils';
import { mediaUrl } from '@/lib/utils';
import { pickVisuallyDistinctIds } from '@/lib/visualDedup';

const BRANDS = [
  '메리츠증권', '키움증권', '미래에셋증권', '삼성증권', 'NH투자증권',
  '한국투자증권', '신한투자증권', '토스증권', 'KB증권',
];
const CLIENT_BRAND = '메리츠증권';

interface Changes { newAds: AdItem[]; endedAds: AdItem[]; lastUpdated: string | null; }

export default function Home() {
  const [data, setData] = useState<AdItem[]>([]);
  const [changes, setChanges] = useState<Changes>({ newAds: [], endedAds: [], lastUpdated: null });
  const [bsData, setBsData] = useState<any[]>([]);
  const [collectionStatus, setCollectionStatus] = useState<Record<string, any>>({});
  const [dynamicInsight, setDynamicInsight] = useState<{ text: string; itemCount: number; label: string } | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [insightGeneratedForKey, setInsightGeneratedForKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewKey>('home');
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [brandPlatform, setBrandPlatform] = useState<'all' | 'meta' | 'google'>('all');
  const [brandMedia, setBrandMedia] = useState<'all' | 'image' | 'video'>('all');
  const [brandSort, setBrandSort] = useState<'recent' | 'duration'>('recent');
  const [searchText, setSearchText] = useState('');
  const [searchMedia, setSearchMedia] = useState<'all' | 'image' | 'video'>('all');
  const [searchSort, setSearchSort] = useState<'recent' | 'duration'>('recent');
  // 같은 템플릿/모델에 문구만 다른 소재가 시각적으로 비슷해서 사람 눈에는 "중복 수집된 것
  // 처럼" 보이는 문제 - 데이터는 그대로 두고, 화면에 보여줄 대표 소재만 추려서 접는 토글
  const [hideSimilarImages, setHideSimilarImages] = useState(false);
  const [sliceYears, setSliceYears] = useState<Set<string>>(new Set());
  const [sliceMonths, setSliceMonths] = useState<Set<string>>(new Set());
  const [sliceAdvertisers, setSliceAdvertisers] = useState<Set<string>>(new Set());
  const [slicePlatforms, setSlicePlatforms] = useState<Set<string>>(new Set());
  const [metaSearchText, setMetaSearchText] = useState('');
  const [googleSearchText, setGoogleSearchText] = useState('');
  const [metaSort, setMetaSort] = useState<'recent' | 'duration'>('recent');
  const [googleSort, setGoogleSort] = useState<'recent' | 'duration'>('recent');
  const [metaStartDate, setMetaStartDate] = useState('');
  const [metaEndDate, setMetaEndDate] = useState('');
  const [googleStartDate, setGoogleStartDate] = useState('');
  const [googleEndDate, setGoogleEndDate] = useState('');
  const [metaSliceAdvertisers, setMetaSliceAdvertisers] = useState<Set<string>>(new Set());
  const [googleSliceAdvertisers, setGoogleSliceAdvertisers] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<AdItem | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [favPopup, setFavPopup] = useState<string | null>(null);
  const [favName, setFavName] = useState('');
  const [favFolder, setFavFolder] = useState('기본 즐겨찾기');
  const [bsExpanded, setBsExpanded] = useState<Set<string>>(new Set());
  const [bsSelectedWeek, setBsSelectedWeek] = useState<string | null>(null);
  // 브랜드검색 PC/MO 스크린샷 클릭 시 전체 스크린샷 1장 + 그 디바이스의 메인이미지(슬라이드)들을
  // 좌우 화살표로 넘겨보는 갤러리 - PC와 MO는 서로 다른 슬라이드라 갤러리를 따로 연다.
  const [bsGallery, setBsGallery] = useState<{ path: string; caption?: string }[] | null>(null);
  const [bsGalleryIndex, setBsGalleryIndex] = useState(0);

  // 검색어 트렌드 화면의 코스피/코스닥/나스닥 차트가 데이터랩 조회 기간과 동일한 구간을
  // 보여줘야 해서, 날짜 범위/단위를 여기서 공유 상태로 관리하고 두 컴포넌트에 같이 내려준다.
  const trendDefaultRange = useMemo(() => defaultDateRange(), []);
  const [trendStartDate, setTrendStartDate] = useState(trendDefaultRange.start);
  const [trendEndDate, setTrendEndDate] = useState(trendDefaultRange.end);
  const [trendTimeUnit, setTrendTimeUnit] = useState<'date' | 'week' | 'month'>('month');
  // 검색어 트렌드(데이터랩) + 코스피/코스닥/나스닥을 함께 봐야 하는 인사이트라 여기서
  // 생성하고, MarketIndexPanel(지수 표/그래프)과 TrendAnalysis(브랜드 선택 + 데이터랩
  // 차트) 사이에 독립 섹션으로 표시한다.
  const [trendInsightText, setTrendInsightText] = useState<string | null>(null);
  const [trendInsightLoading, setTrendInsightLoading] = useState(false);
  const [trendInsightError, setTrendInsightError] = useState<string | null>(null);

  const generateTrendInsight = async (dataLabResults: DataLabResult[], selectedBrands: string[]) => {
    if (dataLabResults.length === 0) return;
    setTrendInsightLoading(true);
    setTrendInsightError(null);
    try {
      const marketRes = await fetch('/data/market_index.json').then(r => r.json()).catch(() => ({}));
      const summarize = (idx: { data: { date: string; close: number }[] } | undefined) => {
        if (!idx || !idx.data) return null;
        const filtered = idx.data.filter((d: { date: string }) => d.date >= trendStartDate && d.date <= trendEndDate);
        if (filtered.length < 2) return null;
        return {
          changePct: ((filtered[filtered.length - 1].close - filtered[0].close) / filtered[0].close) * 100,
          points: filtered,
        };
      };
      const marketIndexSummary = {
        kospi: summarize(marketRes.kospi),
        kosdaq: summarize(marketRes.kosdaq),
        nasdaq: summarize(marketRes.nasdaq),
      };
      const res = await fetch('/api/trend-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataLabResults, marketIndexSummary, brands: selectedBrands }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '인사이트 생성 실패');
      setTrendInsightText(json.text);
    } catch (e) {
      setTrendInsightError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setTrendInsightLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      fetch('/data/index.json').then(r => r.json()).catch(() => []),
      fetch('/data/changes.json').then(r => r.json()).catch(() => ({ newAds: [], endedAds: [], lastUpdated: null })),
      fetch('/data/bs_index.json').then(r => r.json()).catch(() => []),
      fetch('/data/collection_status.json').then(r => r.json()).catch(() => ({})),
    ]).then(([d, c, bs, status]) => {
      setData(d); setChanges(c); setBsData(bs); setCollectionStatus(status); setLoading(false);
      const weeks = sortMonthWeekKeysDesc(bs.map((i: any) => getMonthWeekKey(i.collectedAt)));
      if (weeks.length > 0) setBsSelectedWeek(weeks[0]);
    });
    try {
      const s = localStorage.getItem('ad_ref_favorites'); if (s) setFavorites(JSON.parse(s));
      const n = localStorage.getItem('ad_ref_username'); if (n) setFavName(n);
      const f = localStorage.getItem('ad_ref_lastfolder'); if (f) setFavFolder(f);
    } catch (_) {}
  }, []);

  // 즐겨찾기한 광고가 이후에(중복 정리 등으로) index.json에서 삭제되면, 즐겨찾기 목록엔
  // id가 남아있는데 실제 카드가 안 그려져서 별 버튼으로 해제할 방법이 없어짐 -> data가
  // 로드된 뒤 더 이상 존재하지 않는 항목은 자동으로 걸러내고 localStorage도 같이 갱신
  useEffect(() => {
    if (data.length === 0 || favorites.length === 0) return;
    const validIds = new Set(data.map(d => d.id));
    const pruned = favorites.filter(f => validIds.has(f.id));
    if (pruned.length !== favorites.length) {
      setFavorites(pruned);
      localStorage.setItem('ad_ref_favorites', JSON.stringify(pruned));
    }
  }, [data, favorites]);

  const goToBrand = (brand: string) => {
    setView('dash-brand');
    setSelectedBrand(brand); setBrandPlatform('all'); setBrandMedia('all');
  };

  const bsWeekKeys = useMemo(() => sortMonthWeekKeysDesc(bsData.map((i: any) => getMonthWeekKey(i.collectedAt))), [bsData]);
  const bsWeekData = useMemo(() => {
    if (!bsSelectedWeek) return bsData;
    return bsData.filter((i: any) => getMonthWeekKey(i.collectedAt) === bsSelectedWeek);
  }, [bsData, bsSelectedWeek]);

  // 브랜드+디바이스별 전체 수집 이력(시간순 오름차순) - 직전 스냅샷과 비교해 변경사항을 찾기 위함
  const bsHistoryByBrand = useMemo(() => {
    const map: Record<string, { pc: any[]; mo: any[] }> = {};
    BRANDS.forEach(brand => {
      const items = bsData.filter((i: any) => i.advertiserName === brand);
      map[brand] = {
        pc: items.filter((i: any) => i.device === 'pc').sort((a: any, b: any) => (a.collectedAt || '').localeCompare(b.collectedAt || '')),
        mo: items.filter((i: any) => i.device === 'mo').sort((a: any, b: any) => (a.collectedAt || '').localeCompare(b.collectedAt || '')),
      };
    });
    return map;
  }, [bsData]);

  const findPrevBsEntry = (history: any[], current: any) => {
    if (!current) return null;
    const idx = history.findIndex((e: any) => e.id === current.id);
    if (idx <= 0) return null;
    return history[idx - 1];
  };

  // 현재 선택된 주차 기준, 브랜드별 변경사항을 한 곳에 모아 보여주기 위한 요약
  // (브랜드 카드를 하나하나 펼쳐보지 않아도 캘린더 바로 아래에서 전체를 한눈에 파악 가능하도록)
  const bsWeeklySummary = useMemo(() => {
    return BRANDS.map(brand => {
      const brandBs = bsWeekData.filter((i: any) => i.advertiserName === brand);
      if (brandBs.length === 0) return null;
      const pc = brandBs.filter((i: any) => i.device === 'pc').sort((a: any, b: any) => (b.collectedAt || '').localeCompare(a.collectedAt || ''))[0];
      const mo = brandBs.filter((i: any) => i.device === 'mo').sort((a: any, b: any) => (b.collectedAt || '').localeCompare(a.collectedAt || ''))[0];
      const history = bsHistoryByBrand[brand] || { pc: [], mo: [] };
      const prevPc = findPrevBsEntry(history.pc, pc);
      const prevMo = findPrevBsEntry(history.mo, mo);
      const diff = diffBrandSnapshot(prevPc, pc, prevMo, mo);
      return { brand, diff, changeCount: diff.added.length + diff.removed.length };
    }).filter((v): v is { brand: string; diff: ReturnType<typeof diffBrandSnapshot>; changeCount: number } => v !== null);
  }, [bsWeekData, bsHistoryByBrand]);

  const brandStats = useMemo(() => {
    return BRANDS.map(brand => {
      const items = data.filter(i =>
        matchesBrand(i.advertiserName, brand) ||
        (i.keyword || '').toLowerCase() === brand.toLowerCase()
      );
      const newCount = changes.newAds.filter(i => matchesBrand(i.advertiserName, brand)).length;
      const endedCount = changes.endedAds.filter(i => matchesBrand(i.advertiserName, brand)).length;
      return { name: brand, total: items.length, new24h: newCount, ended24h: endedCount,
        video: items.filter(i => i.mediaType === 'video').length,
        image: items.filter(i => i.mediaType === 'image').length,
        isClient: brand === CLIENT_BRAND };
    });
  }, [data, changes]);

  const totalStats = useMemo(() => ({
    total: data.length, new24h: changes.newAds.length, ended24h: changes.endedAds.length,
    lastMeta: data.filter(i => i.platform === 'meta').sort((a,b) => (b.collectedAt || '').localeCompare(a.collectedAt || ''))[0]?.collectedAt,
    lastGoogle: data.filter(i => i.platform === 'google').sort((a,b) => (b.collectedAt || '').localeCompare(a.collectedAt || ''))[0]?.collectedAt,
  }), [data, changes]);

  // 게재일(adStartedAt) 우선, 구글은 이게 원래 항상 비어있어서(구글이 시작일 정보를 안 줌)
  // 그다음으로 마지막 게재일(adLastShownAt)을 본다 - 이게 없으면 수집일(collectedAt)로 대체.
  // (2026-08-07 수정: collectedAt만 쓰면 2025년에 끝난 광고를 오늘 재확인했다는 이유로
  //  "2026년 소재"로 잡히는 문제가 있었음 - adLastShownAt이 있으면 그게 훨씬 정확한
  //  실제 게재 시점이라 우선한다.)
  const getAdDate = (item: AdItem) => item.adStartedAt || item.adLastShownAt || item.collectedAt;

  // "게재일 긴 순서" 정렬용 - 처음 확인된 시점(adStartedAt, 없으면 최초 수집일)부터 마지막으로
  // 확인된 시점(종료된 광고는 adLastShownAt, 아직도 게재 중이면 지금 이 순간)까지의 기간.
  // 오래 살아남은(계속 재수집되며 확인된) 소재일수록 값이 커진다.
  const getAdDurationMs = (item: AdItem) => {
    const start = new Date(item.adStartedAt || item.collectedAt).getTime();
    const end = new Date(item.status === 'ended' ? (item.adLastShownAt || item.collectedAt) : (item.adLastShownAt || Date.now())).getTime();
    if (isNaN(start) || isNaN(end)) return 0;
    return Math.max(0, end - start);
  };

  // "최신순" 정렬용 - adStartedAt/adLastShownAt이 둘 다 없는 광고(오래전에 끝났는데 상세페이지에서
  // 마지막 게재일을 더 이상 안 보여주는 경우, 실측상 종료 소재의 약 40%)는 getAdDate가 collectedAt으로
  // 대체되는데, 이 값은 "백필로 재발견된 시점"일 뿐 실제 게재 시점과 무관하다. 그대로 두면 2025년에
  // 끝난 소재가 며칠 전 백필됐다는 이유만으로 최신순 맨 위에 뜨는 문제가 생긴다(실측 확인: 메리츠증권
  // 모델 이미지 소재 다수). 그래서 실제 날짜 정보가 있는 광고를 항상 먼저 두고, 그 안에서만 최신순으로
  // 비교한다 - 날짜 정보 없는 광고끼리는 collectedAt으로 비교해 순서만 안정적으로 유지한다.
  const compareByRecency = (a: AdItem, b: AdItem) => {
    const aReal = !!(a.adStartedAt || a.adLastShownAt);
    const bReal = !!(b.adStartedAt || b.adLastShownAt);
    if (aReal !== bReal) return aReal ? -1 : 1;
    return getAdDate(b).localeCompare(getAdDate(a));
  };

  const brandItems = useMemo(() => {
    if (!selectedBrand) return [];
    return data
      .filter(i => matchesBrand(i.advertiserName, selectedBrand) || (i.keyword || '').toLowerCase() === selectedBrand.toLowerCase())
      .filter(i => brandPlatform === 'all' ? true : i.platform === brandPlatform)
      .filter(i => brandMedia === 'all' ? true : i.mediaType === brandMedia)
      .sort((a, b) => brandSort === 'duration'
        ? getAdDurationMs(b) - getAdDurationMs(a)
        : compareByRecency(a, b));
  }, [data, selectedBrand, brandPlatform, brandMedia, brandSort]);

  const sliceOptions = useMemo(() => {
    const years = new Set<string>();
    const months = new Set<string>();
    // "미래에셋증권"과 "미래에셋증권 주식회사"처럼 법인 표기만 다른 같은 브랜드가 슬라이서에
    // 별개 항목으로 뜨지 않도록, 정규화된 이름 기준으로 묶어서 대표 표기 하나만 남긴다.
    // 알려진 9개 브랜드명과 일치하면 그 깔끔한 이름을 대표로 쓰고, 아니면 가장 짧은(보통
    // 더 깔끔한) 원본 표기를 대표로 쓴다.
    const advertiserGroups = new Map<string, string>();
    const platforms = new Set<string>();
    data.forEach(item => {
      const d = new Date(getAdDate(item));
      if (!isNaN(d.getTime())) {
        years.add(String(d.getFullYear()));
        months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      if (item.advertiserName) {
        const norm = normalizeName(item.advertiserName);
        if (norm) {
          const knownBrand = BRANDS.find(b => normalizeName(b) === norm);
          const existing = advertiserGroups.get(norm);
          const label = knownBrand || (existing && existing.length <= item.advertiserName.length ? existing : item.advertiserName);
          advertiserGroups.set(norm, label);
        }
      }
      if (item.platform) platforms.add(item.platform);
    });
    return {
      years: Array.from(years).sort().reverse(),
      months: Array.from(months).sort().reverse(),
      advertisers: Array.from(advertiserGroups.values()).sort(),
      platforms: Array.from(platforms).sort(),
    };
  }, [data]);

  // 메타/구글 탭 전용 광고주 슬라이서 - sliceOptions.advertisers와 같은 정규화 그룹핑
  // 로직을 플랫폼별로 나눠서 쓴다. 하드코딩된 목록이 아니라 매번 data에서 새로 뽑으므로
  // 새 광고주가 수집되면 다음 로드 때 자동으로 슬라이서 옵션에 나타난다.
  const advertiserOptionsFor = (platform: 'meta' | 'google') => {
    const groups = new Map<string, string>();
    data.filter(i => i.platform === platform).forEach(item => {
      if (!item.advertiserName) return;
      const norm = normalizeName(item.advertiserName);
      if (!norm) return;
      const knownBrand = BRANDS.find(b => normalizeName(b) === norm);
      const existing = groups.get(norm);
      const label = knownBrand || (existing && existing.length <= item.advertiserName.length ? existing : item.advertiserName);
      groups.set(norm, label);
    });
    return Array.from(groups.values()).sort();
  };
  const metaAdvertiserOptions = useMemo(() => advertiserOptionsFor('meta'), [data]);
  const googleAdvertiserOptions = useMemo(() => advertiserOptionsFor('google'), [data]);

  const toggleSetValue = (setFn: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    setFn(prev => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  };

  const clearSlicers = () => {
    setSliceYears(new Set()); setSliceMonths(new Set());
    setSliceAdvertisers(new Set()); setSlicePlatforms(new Set());
  };

  const searchResults = useMemo(() => {
    let items = data;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      items = items.filter(i => [i.advertiserName, i.keyword, i.copyText, i.platform].join(' ').toLowerCase().includes(q));
    }
    if (searchMedia !== 'all') items = items.filter(i => i.mediaType === searchMedia);
    if (slicePlatforms.size > 0) items = items.filter(i => slicePlatforms.has(i.platform));
    if (sliceAdvertisers.size > 0) {
      const selectedGroups = Array.from(sliceAdvertisers);
      items = items.filter(i => selectedGroups.some(g => matchesBrand(i.advertiserName, g)));
    }
    if (sliceYears.size > 0) {
      items = items.filter(i => {
        const d = new Date(getAdDate(i));
        return !isNaN(d.getTime()) && sliceYears.has(String(d.getFullYear()));
      });
    }
    if (sliceMonths.size > 0) {
      items = items.filter(i => {
        const d = new Date(getAdDate(i));
        return !isNaN(d.getTime()) && sliceMonths.has(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      });
    }
    return items.sort((a, b) => searchSort === 'duration'
      ? getAdDurationMs(b) - getAdDurationMs(a)
      : compareByRecency(a, b));
  }, [data, searchText, searchMedia, slicePlatforms, sliceAdvertisers, sliceYears, sliceMonths, searchSort]);

  // "비슷한 소재 접기" 토글이 켜져 있을 때만 계산한다(꺼져있으면 그대로 통과, 비용 없음).
  // items는 이미 최신순으로 정렬돼 들어와서, 그리디 방식으로 훑을 때 항상 최신 것이 대표로 남는다.
  const visualDedupeIds = (items: AdItem[]) => hideSimilarImages ? pickVisuallyDistinctIds(items) : null;
  const withVisualDedupe = (items: AdItem[]) => {
    const ids = visualDedupeIds(items);
    return ids ? items.filter(i => ids.has(i.id)) : items;
  };

  // 소재 인사이트는 "지금 선택된 조건"을 그대로 반영해야 해서(광고주/월/매체 뭘 고르든),
  // 매번 자동으로 다시 생성하지 않고 사용자가 버튼을 눌렀을 때만 현재 필터된 결과로
  // Claude를 호출한다 - 필터가 바뀌면 이전 결과가 낡았다는 걸 표시만 해준다.
  const currentFilterKey = useMemo(() => JSON.stringify({
    searchText, searchMedia,
    platforms: Array.from(slicePlatforms).sort(),
    advertisers: Array.from(sliceAdvertisers).sort(),
    years: Array.from(sliceYears).sort(),
    months: Array.from(sliceMonths).sort(),
  }), [searchText, searchMedia, slicePlatforms, sliceAdvertisers, sliceYears, sliceMonths]);
  const insightStale = dynamicInsight !== null && insightGeneratedForKey !== currentFilterKey;

  const generateCreativeInsight = async () => {
    setInsightLoading(true);
    setInsightError(null);
    try {
      const label = sliceAdvertisers.size === 1 ? Array.from(sliceAdvertisers)[0] as string : undefined;
      const payloadItems = searchResults.map(i => ({
        advertiserName: i.advertiserName, platform: i.platform, copyText: i.copyText,
        headline: i.headline, status: i.status, collectedAt: i.collectedAt,
        localPath: i.localPath, mediaType: i.mediaType, aiDescription: i.aiDescription,
      }));
      const res = await fetch('/api/creative-insight', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payloadItems, label }),
      });
      const json = await res.json();
      if (json.error) {
        setInsightError(json.error);
      } else {
        setDynamicInsight({ text: json.text, itemCount: json.itemCount ?? searchResults.length, label: label || '현재 필터' });
        setInsightGeneratedForKey(currentFilterKey);
      }
    } catch (e) {
      setInsightError(e instanceof Error ? e.message : '인사이트 생성 실패');
    } finally {
      setInsightLoading(false);
    }
  };

  const toggleFav = (id: string) => {
    if (favorites.some(f => f.id === id)) {
      const next = favorites.filter(f => f.id !== id);
      setFavorites(next); localStorage.setItem('ad_ref_favorites', JSON.stringify(next));
    } else { setFavPopup(id); }
  };

  const confirmFav = () => {
    if (!favPopup) return;
    const entry: FavoriteItem = { id: favPopup, name: favName || '나', folder: favFolder, addedAt: new Date().toISOString() };
    const next = [...favorites, entry];
    setFavorites(next); localStorage.setItem('ad_ref_favorites', JSON.stringify(next));
    localStorage.setItem('ad_ref_username', favName); localStorage.setItem('ad_ref_lastfolder', favFolder);
    setFavPopup(null);
  };

  const favFolders = useMemo(() => {
    const folders: Record<string, FavoriteItem[]> = {};
    favorites.forEach(f => { if (!folders[f.folder]) folders[f.folder] = []; folders[f.folder].push(f); });
    return folders;
  }, [favorites]);

  const toggleBsExpand = (key: string) => {
    setBsExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const openBsGallery = (images: { path: string; caption?: string }[]) => { setBsGallery(images); setBsGalleryIndex(0); };
  const closeBsGallery = () => setBsGallery(null);
  const bsGalleryPrev = () => setBsGalleryIndex(i => (bsGallery ? (i - 1 + bsGallery.length) % bsGallery.length : 0));
  const bsGalleryNext = () => setBsGalleryIndex(i => (bsGallery ? (i + 1) % bsGallery.length : 0));

  useEffect(() => {
    if (!bsGallery) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeBsGallery();
      else if (e.key === 'ArrowLeft') bsGalleryPrev();
      else if (e.key === 'ArrowRight') bsGalleryNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bsGallery]);

  const metaItems = useMemo(() => {
    let items = data.filter(i => i.platform === 'meta');
    if (metaSearchText.trim()) {
      const q = metaSearchText.toLowerCase();
      items = items.filter(i => [i.advertiserName, i.keyword, i.copyText].join(' ').toLowerCase().includes(q));
    }
    if (metaStartDate) items = items.filter(i => getAdDate(i) >= metaStartDate);
    if (metaEndDate) items = items.filter(i => getAdDate(i) <= metaEndDate + 'T23:59:59.999Z');
    if (metaSliceAdvertisers.size > 0) {
      const selected = Array.from(metaSliceAdvertisers);
      items = items.filter(i => selected.some(g => matchesBrand(i.advertiserName, g)));
    }
    return items.sort((a, b) => metaSort === 'duration'
      ? getAdDurationMs(b) - getAdDurationMs(a)
      : compareByRecency(a, b));
  }, [data, metaSearchText, metaStartDate, metaEndDate, metaSliceAdvertisers, metaSort]);

  const googleItems = useMemo(() => {
    let items = data.filter(i => i.platform === 'google');
    if (googleSearchText.trim()) {
      const q = googleSearchText.toLowerCase();
      items = items.filter(i => [i.advertiserName, i.keyword, i.copyText].join(' ').toLowerCase().includes(q));
    }
    if (googleStartDate) items = items.filter(i => getAdDate(i) >= googleStartDate);
    if (googleEndDate) items = items.filter(i => getAdDate(i) <= googleEndDate + 'T23:59:59.999Z');
    if (googleSliceAdvertisers.size > 0) {
      const selected = Array.from(googleSliceAdvertisers);
      items = items.filter(i => selected.some(g => matchesBrand(i.advertiserName, g)));
    }
    return items.sort((a, b) => googleSort === 'duration'
      ? getAdDurationMs(b) - getAdDurationMs(a)
      : compareByRecency(a, b));
  }, [data, googleSearchText, googleStartDate, googleEndDate, googleSliceAdvertisers, googleSort]);

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>로딩 중...</div>;

  // 페이지 전반의 "카드/패널" 컨테이너 - AdCard/Sidebar/Modal 외에 홈 화면, KPI 타일,
  // 슬라이서 패널 등에도 같은 라운드/섀도우 톤을 입힌다.
  const cardStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-card)',
    ...extra,
  });

  const chip = (active: boolean) => ({
    padding: '4px 12px', borderRadius: '20px', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'rgba(var(--accent-rgb),0.12)' : 'transparent', color: active ? 'var(--accent-text)' : 'var(--text-muted)',
    fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' as const,
  });

  const slicerBtn = (active: boolean) => ({
    padding: '5px 10px', borderRadius: '6px', border: `1px solid ${active ? '#03c75a' : 'var(--border)'}`,
    background: active ? 'rgba(3,199,90,0.15)' : 'var(--bg-surface-solid)', color: active ? '#03c75a' : 'var(--text-muted)',
    fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' as const, fontWeight: active ? 700 : 400,
  });

  // 같은 템플릿에 문구만 다른 구글 소재가 시각적으로 비슷해 사람 눈에 "중복 수집처럼" 보이는
  // 문제 대응용 - 데이터는 그대로 두고 화면에 대표 소재만 남기는 토글. 전역 상태 하나를 여러
  // 탭(전체/구글/브랜드 상세)에서 공유해서 쓴다.
  const similarToggleButton = () => (
    <button onClick={() => setHideSimilarImages(v => !v)} style={chip(hideSimilarImages)}>
      {hideSimilarImages ? '✓ ' : ''}비슷한 소재 접기
    </button>
  );

  // adGrid()가 화면에는 최근 150개만 그려서(카드 수천 개를 한 번에 그리면 브라우저가 느려짐),
  // 위쪽 "N개" 카운트(전체 필터링된 개수)와 실제 보이는 카드 수가 달라서 "왜 다 안 나오지"
  // 오해가 생겼다(2026-08-07). 150개 넘을 때만 이 안내를 보여준다.
  const gridCapNote = (totalCount: number, cap = 150) => totalCount > cap ? (
    <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '12px' }}>
      ※ 화면에는 최근 {cap}개만 표시됩니다(전체 {totalCount.toLocaleString()}개 중). 특정 브랜드의 전체 목록은 &quot;경쟁사 바로가기&quot;에서 브랜드를 클릭하면 전부 볼 수 있습니다.
    </p>
  ) : null;

  const slicerGroup = (
    title: string,
    options: string[],
    selected: Set<string>,
    onToggle: (v: string) => void,
    formatLabel?: (v: string) => string,
  ) => (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxHeight: '110px', overflowY: 'auto' }}>
        {options.length === 0
          ? <span style={{ fontSize: '13px', color: 'var(--text-faint)' }}>데이터 없음</span>
          : options.map(opt => (
            <button key={opt} onClick={() => onToggle(opt)} style={slicerBtn(selected.has(opt))}>
              {formatLabel ? formatLabel(opt) : opt}
            </button>
          ))}
      </div>
    </div>
  );

  // 년도/월처럼 "그때그때 하나만 고르는" 필터는 칩 다중선택보다 다른 필터들(단위, 시작일 등)과
  // 똑같은 드롭다운 형식이 UI 전체에서 더 일관돼 보인다 - 단일 선택으로 단순화.
  const dropdownFilter = (
    title: string,
    options: string[],
    selected: Set<string>,
    setFn: React.Dispatch<React.SetStateAction<Set<string>>>,
    formatLabel?: (v: string) => string,
  ) => (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </div>
      <select
        value={selected.size > 0 ? Array.from(selected)[0] : ''}
        onChange={e => setFn(e.target.value ? new Set([e.target.value]) : new Set())}
        style={{ width: '100%', background: 'var(--bg-surface-solid)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text-primary)', fontSize: '14px' }}
      >
        <option value="">전체</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{formatLabel ? formatLabel(opt) : opt}</option>
        ))}
      </select>
    </div>
  );

  const adGrid = (items: AdItem[], max = 150) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
      {items.slice(0, max).map(item => (
        <AdCard key={item.id} item={item} isFavorited={favorites.some(f => f.id === item.id)}
          onToggleFav={toggleFav} onClick={setSelectedItem} dataDir="/data" />
      ))}
    </div>
  );

  const sectionLabel = (text: string) => (
    <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>{text}</h2>
  );

  // "브랜드별" 탭의 KPI 매트릭스+바로가기 - 전체 탭(KPI 박스 바로 밑)과 브랜드별 탭
  // (브랜드 미선택 상태) 양쪽에서 같이 쓴다.
  const brandOverviewSection = () => (
    <>
      <section style={{ marginBottom: '32px' }}>
        {sectionLabel('경쟁사 KPI 매트릭스')}
        <div style={cardStyle({ overflow: 'hidden' })}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '16px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['경쟁사', '활성', '신규 M', '종료 M', 'VIDEO', 'IMAGE'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: h === '경쟁사' ? 'left' : 'right', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {brandStats.map(b => (
                <tr key={b.name} onClick={() => goToBrand(b.name)}
                  style={{ borderBottom: '1px solid rgba(var(--border-rgb),0.4)', cursor: 'pointer', background: b.isClient ? 'rgba(var(--accent-rgb),0.06)' : 'transparent', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = b.isClient ? 'rgba(var(--accent-rgb),0.12)' : 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = b.isClient ? 'rgba(var(--accent-rgb),0.06)' : 'transparent')}>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{b.name}</span>
                    {b.isClient && <span style={{ marginLeft: '8px', background: 'rgba(var(--accent-rgb),0.4)', color: 'var(--accent-text)', fontSize: '12px', fontWeight: 600, padding: '1px 6px', borderRadius: '3px' }}>client</span>}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{b.total.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {b.new24h > 0 ? <span style={{ background: 'rgba(52,211,153,0.15)', color: 'var(--success)', fontSize: '14px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>+{b.new24h}</span> : <span style={{ color: 'var(--text-faint)' }}>-</span>}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {b.ended24h > 0 ? <span style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--danger)', fontSize: '14px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>-{b.ended24h}</span> : <span style={{ color: 'var(--text-faint)' }}>-</span>}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>{b.video > 0 ? b.video : <span style={{ color: 'var(--text-faint)' }}>-</span>}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>{b.image > 0 ? b.image : <span style={{ color: 'var(--text-faint)' }}>-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: '32px' }}>
        {sectionLabel('경쟁사 바로가기')}
        <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '-6px', marginBottom: '12px' }}>
          숫자는 해당 브랜드의 활성 소재 개수입니다 - 브랜드를 클릭하면 전체 소재를 확인할 수 있습니다.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
          {brandStats.map(b => (
            <button key={b.name} onClick={() => goToBrand(b.name)}
              style={{ background: b.isClient ? 'var(--accent-soft)' : 'var(--bg-surface)', border: `1px solid ${b.isClient ? 'rgba(var(--accent-rgb),0.4)' : 'var(--border)'}`, borderRadius: '12px', padding: '12px', textAlign: 'center', cursor: 'pointer' }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{b.name}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>활성 {b.total.toLocaleString()}</div>
              {b.isClient && <div style={{ marginTop: '6px' }}><span style={{ background: 'rgba(var(--accent-rgb),0.3)', color: 'var(--accent-text)', fontSize: '12px', padding: '1px 6px', borderRadius: '3px' }}>client</span></div>}
            </button>
          ))}
        </div>
      </section>
    </>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)', fontFamily: '-apple-system, "Segoe UI", sans-serif', display: 'flex' }}>
      <Sidebar active={view} onSelect={(key) => { setView(key); setSelectedBrand(null); }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {view === 'home' && (
          <main style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>수집 현황</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
              {[
                { key: 'meta', label: '메타' },
                { key: 'google', label: '구글' },
                { key: 'brandsearch', label: '브랜드검색' },
                { key: 'powerlink', label: '검색광고(파워링크)' },
                { key: 'metaBrandBatch', label: '메타 브랜드 순환' },
              ].map(({ key, label }) => {
                const s = collectionStatus[key];
                const at = s?.lastCollectedAt ? new Date(s.lastCollectedAt) : null;
                return (
                  <div key={key} style={cardStyle({ padding: '16px 18px' })}>
                    <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>{label}</p>
                    {at ? (
                      <>
                        <p style={{ fontSize: '14px', color: 'var(--accent-text)' }}>{at.toLocaleDateString('ko-KR')}</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>{at.toLocaleTimeString('ko-KR')}</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>신규 {s.newCount ?? 0}건</p>
                      </>
                    ) : (
                      <p style={{ fontSize: '14px', color: 'var(--text-faint)' }}>수집 이력 없음</p>
                    )}
                  </div>
                );
              })}

              {/* 메타 미디어 채우기는 별도 진행상황 지표(시도/성공/대기중)라 다르게 표시 */}
              <div style={cardStyle({ padding: '16px 18px' })}>
                <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>메타 이미지/영상 채우기</p>
                {collectionStatus.metaMediaBatch?.lastRunAt ? (
                  <>
                    <p style={{ fontSize: '14px', color: 'var(--accent-text)' }}>
                      {new Date(collectionStatus.metaMediaBatch.lastRunAt).toLocaleDateString('ko-KR')}
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {new Date(collectionStatus.metaMediaBatch.lastRunAt).toLocaleTimeString('ko-KR')}
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      {collectionStatus.metaMediaBatch.attempted}건 시도 · {collectionStatus.metaMediaBatch.updated}건 성공
                    </p>
                    <p style={{ fontSize: '13px', color: collectionStatus.metaMediaBatch.stillPending > 0 ? '#fb923c' : 'var(--success)', marginTop: '2px' }}>
                      {collectionStatus.metaMediaBatch.stillPending > 0
                        ? `아직 ${collectionStatus.metaMediaBatch.stillPending}건 대기 중`
                        : '전부 채움 완료'}
                    </p>
                  </>
                ) : (
                  <p style={{ fontSize: '14px', color: 'var(--text-faint)' }}>수집 이력 없음</p>
                )}
              </div>
            </div>
          </main>
        )}

        {view !== 'home' && (
          <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 24px' }}>

            {/* 뉴스 클리핑 - 스텁 (추후 기존 코드 연결 예정) */}
            {(view === 'news-daily' || view === 'news-weekly') && (
              <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📰</div>
                <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  {view === 'news-daily' ? '데일리 뉴스' : '주간 인사이트'}
                </p>
                <p style={{ fontSize: '15px' }}>준비 중입니다</p>
              </div>
            )}

            {/* 경쟁사 대시보드 > 전체: 광고 검색(슬라이서) + 즐겨찾기 통합 */}
            {view === 'dash-all' && (
              <>
                <header style={{ marginBottom: '32px' }}>
                  <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>경쟁사 광고 - 전체</h1>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '15px', color: 'var(--text-muted)', flexWrap: 'wrap', lineHeight: 1.6 }}>
                    {totalStats.lastGoogle && <span>Google 최근 수집: {new Date(totalStats.lastGoogle).toLocaleString('ko-KR')}</span>}
                    {totalStats.lastMeta && <span>· Meta 최근 수집: {new Date(totalStats.lastMeta).toLocaleString('ko-KR')}</span>}
                  </div>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '32px' }}>
                  {[
                    { label: '활성 광고 (전체)', value: totalStats.total.toLocaleString(), color: 'var(--accent-text)' },
                    { label: '신규 광고 (월간)', value: totalStats.new24h, color: 'var(--success)' },
                    { label: '종료 광고 (월간)', value: totalStats.ended24h, color: 'var(--danger)' },
                    { label: '즐겨찾기', value: favorites.length, color: '#facc15' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={cardStyle({ padding: '24px' })}>
                      <p style={{ fontSize: '15px', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</p>
                      <p style={{ fontSize: '34px', fontWeight: 700, color, marginTop: '8px', letterSpacing: '-0.5px' }}>{value}</p>
                    </div>
                  ))}
                </div>

                {brandOverviewSection()}

                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: dynamicInsight ? '10px' : 0 }}>
                    <button onClick={generateCreativeInsight} disabled={insightLoading || searchResults.length === 0}
                      style={{
                        fontSize: '14px', color: 'var(--accent-text)', background: 'var(--accent-soft)', border: '1px solid rgba(var(--accent-rgb),0.3)',
                        borderRadius: '8px', padding: '8px 14px', cursor: insightLoading ? 'default' : 'pointer', opacity: searchResults.length === 0 ? 0.5 : 1,
                      }}>
                      {insightLoading ? '🧠 생성 중... (최대 1~2분)' : dynamicInsight ? '🧠 지금 조건으로 다시 생성' : '🧠 지금 선택 조건으로 인사이트 생성'}
                    </button>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>현재 {searchResults.length}건 기준</span>
                    {insightStale && !insightLoading && (
                      <span style={{ fontSize: '13px', color: '#fb923c' }}>· 필터가 바뀌었어요 - 다시 생성해보세요</span>
                    )}
                    {insightError && <span style={{ fontSize: '13px', color: 'var(--danger)' }}>· {insightError}</span>}
                  </div>
                  {dynamicInsight && (
                    <InsightBox title="🧠 소재 인사이트"
                      badge={`${dynamicInsight.label} 기준 (${dynamicInsight.itemCount}건)${insightStale ? ' · 이전 조건 결과' : ''}`}
                      text={dynamicInsight.text} />
                  )}
                </div>

                <div style={{ position: 'relative', maxWidth: '480px', marginBottom: '12px' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
                  <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="키워드 또는 광고주명 검색..."
                    style={{ width: '100%', background: 'var(--bg-surface-solid)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px 10px 38px', color: 'var(--text-primary)', fontSize: '16px', outline: 'none' }} />
                </div>

                <div style={cardStyle({ padding: '14px', marginBottom: '12px' })}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                    {dropdownFilter('년도', sliceOptions.years, sliceYears, setSliceYears, v => v + '년')}
                    {dropdownFilter('월', sliceOptions.months, sliceMonths, setSliceMonths, v => `${v.split('-')[0]}.${v.split('-')[1]}`)}
                    {slicerGroup('광고주명', sliceOptions.advertisers, sliceAdvertisers, v => toggleSetValue(setSliceAdvertisers, v))}
                    {slicerGroup('매체', sliceOptions.platforms, slicePlatforms, v => toggleSetValue(setSlicePlatforms, v), v => v === 'meta' ? 'Meta' : v === 'google' ? 'Google' : v === 'naver_bs' ? '네이버 브검' : v)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>* 게재일(adStartedAt)이 없는 광고는 수집일 기준으로 년도/월이 계산됩니다</span>
                    {(sliceYears.size + sliceMonths.size + sliceAdvertisers.size + slicePlatforms.size) > 0 && (
                      <button onClick={clearSlicers} style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        ✕ 필터 초기화
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {(['all','image','video'] as const).map(m => (
                    <button key={m} onClick={() => setSearchMedia(m)} style={chip(searchMedia === m)}>{m === 'all' ? '전체' : m === 'image' ? '이미지' : '영상'}</button>
                  ))}
                  <div style={{ width: '1px', background: 'var(--border)', margin: '0 4px' }} />
                  {(['recent','duration'] as const).map(s => (
                    <button key={s} onClick={() => setSearchSort(s)} style={chip(searchSort === s)}>{s === 'recent' ? '최신순' : '게재일 긴 순서'}</button>
                  ))}
                  {similarToggleButton()}
                  <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>{withVisualDedupe(searchResults).length}개</span>
                </div>
                {gridCapNote(withVisualDedupe(searchResults).length)}

                {adGrid(withVisualDedupe(searchResults))}
              </>
            )}

            {/* 경쟁사 대시보드 > 즐겨찾기 */}
            {view === 'dash-fav' && (
              <>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '24px' }}>즐겨찾기</h1>
                {Object.keys(favFolders).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '40px', marginBottom: '12px' }}>⭐</div>
                    <p>즐겨찾기한 광고가 없습니다<br />카드의 ☆ 버튼을 눌러 추가해보세요</p>
                  </div>
                ) : Object.entries(favFolders).map(([folder, items]) => (
                  <div key={folder} style={{ marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--accent-text)', fontWeight: 600, fontSize: '16px' }}>
                      📁 {folder} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '14px' }}>{items.length}개</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                      {items.map(f => {
                        const item = data.find(d => d.id === f.id);
                        return item ? <AdCard key={f.id} item={item} isFavorited={true} onToggleFav={toggleFav} onClick={setSelectedItem} dataDir="/data" /> : null;
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* 경쟁사 대시보드 > 메타 */}
            {view === 'dash-meta' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 700 }}>메타 광고</h2>
                  {(() => {
                    const mb = collectionStatus.metaMediaBatch;
                    if (!mb) return null;
                    const pending = mb.stillPending ?? 0;
                    return (
                      <span style={{
                        fontSize: '13px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
                        background: pending > 0 ? 'rgba(251,146,60,0.15)' : 'rgba(52,211,153,0.15)',
                        color: pending > 0 ? '#fb923c' : 'var(--success)',
                      }}>
                        {pending > 0 ? `🖼️ 이미지/영상 대기 ${pending}건` : '🖼️ 이미지/영상 전부 채워짐'}
                      </span>
                    );
                  })()}
                </div>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px' }}>
                  <div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>시작일</p>
                    <input type="date" value={metaStartDate} onChange={e => setMetaStartDate(e.target.value)}
                      style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text-primary)', fontSize: '14px' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>종료일</p>
                    <input type="date" value={metaEndDate} onChange={e => setMetaEndDate(e.target.value)}
                      style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text-primary)', fontSize: '14px' }} />
                  </div>
                  {(metaStartDate || metaEndDate) && (
                    <button onClick={() => { setMetaStartDate(''); setMetaEndDate(''); }}
                      style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text-muted)', fontSize: '14px', cursor: 'pointer' }}>
                      기간 초기화
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative', maxWidth: '420px', marginBottom: '16px' }}>
                  <input value={metaSearchText} onChange={e => setMetaSearchText(e.target.value)} placeholder="키워드 또는 광고주명 검색..."
                    style={{ width: '100%', background: 'var(--bg-surface-solid)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '15px', outline: 'none' }} />
                </div>
                <div style={cardStyle({ padding: '14px', marginBottom: '16px' })}>
                  {slicerGroup('광고주', metaAdvertiserOptions, metaSliceAdvertisers, v => toggleSetValue(setMetaSliceAdvertisers, v))}
                  {metaSliceAdvertisers.size > 0 && (
                    <button onClick={() => setMetaSliceAdvertisers(new Set())}
                      style={{ marginTop: '10px', fontSize: '13px', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      ✕ 광고주 필터 초기화
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>{metaItems.length}개</p>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                    {(['recent','duration'] as const).map(s => (
                      <button key={s} onClick={() => setMetaSort(s)} style={chip(metaSort === s)}>{s === 'recent' ? '최신순' : '게재일 긴 순서'}</button>
                    ))}
                  </div>
                </div>
                {gridCapNote(metaItems.length)}
                {adGrid(metaItems)}
              </>
            )}

            {/* 경쟁사 대시보드 > 구글 */}
            {view === 'dash-google' && (
              <>
                <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>구글 광고</h2>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px' }}>
                  <div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>시작일</p>
                    <input type="date" value={googleStartDate} onChange={e => setGoogleStartDate(e.target.value)}
                      style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text-primary)', fontSize: '14px' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>종료일</p>
                    <input type="date" value={googleEndDate} onChange={e => setGoogleEndDate(e.target.value)}
                      style={{ background: 'var(--bg-surface-solid)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text-primary)', fontSize: '14px' }} />
                  </div>
                  {(googleStartDate || googleEndDate) && (
                    <button onClick={() => { setGoogleStartDate(''); setGoogleEndDate(''); }}
                      style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text-muted)', fontSize: '14px', cursor: 'pointer' }}>
                      기간 초기화
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative', maxWidth: '420px', marginBottom: '16px' }}>
                  <input value={googleSearchText} onChange={e => setGoogleSearchText(e.target.value)} placeholder="키워드 또는 광고주명 검색..."
                    style={{ width: '100%', background: 'var(--bg-surface-solid)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '15px', outline: 'none' }} />
                </div>
                <div style={cardStyle({ padding: '14px', marginBottom: '16px' })}>
                  {slicerGroup('광고주', googleAdvertiserOptions, googleSliceAdvertisers, v => toggleSetValue(setGoogleSliceAdvertisers, v))}
                  {googleSliceAdvertisers.size > 0 && (
                    <button onClick={() => setGoogleSliceAdvertisers(new Set())}
                      style={{ marginTop: '10px', fontSize: '13px', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      ✕ 광고주 필터 초기화
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  {similarToggleButton()}
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>{withVisualDedupe(googleItems).length}개</p>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                    {(['recent','duration'] as const).map(s => (
                      <button key={s} onClick={() => setGoogleSort(s)} style={chip(googleSort === s)}>{s === 'recent' ? '최신순' : '게재일 긴 순서'}</button>
                    ))}
                  </div>
                </div>
                {gridCapNote(withVisualDedupe(googleItems).length)}
                {adGrid(withVisualDedupe(googleItems))}
              </>
            )}

            {/* 경쟁사 대시보드 > 브랜드별 (내용은 전체 탭에도 동일하게 표시됨 - brandOverviewSection) */}
            {view === 'dash-brand' && !selectedBrand && (
              <>
                <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '24px' }}>브랜드별</h1>
                {brandOverviewSection()}
              </>
            )}

            {/* 브랜드 상세 */}
            {view === 'dash-brand' && selectedBrand && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                  <button onClick={() => setSelectedBrand(null)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
                    ← 목록으로
                  </button>
                  <h2 style={{ fontSize: '22px', fontWeight: 700 }}>{selectedBrand}</h2>
                  {brandStats.find(b => b.name === selectedBrand)?.isClient && (
                    <span style={{ background: 'rgba(var(--accent-rgb),0.4)', color: 'var(--accent-text)', fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>client</span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                  {(() => {
                    const s = brandStats.find(b => b.name === selectedBrand);
                    if (!s) return null;
                    const brandItemsAll = data.filter(i =>
                      matchesBrand(i.advertiserName, selectedBrand) || (i.keyword || '').toLowerCase() === selectedBrand.toLowerCase()
                    );
                    const countBy = (platform: string, mediaType: string) =>
                      brandItemsAll.filter(i => i.platform === platform && i.mediaType === mediaType).length;
                    return [
                      { label: `전체 ${s.total}`, color: 'var(--accent-text)' },
                      { label: `Meta ${countBy('meta','image') + countBy('meta','video')}`, color: '#6aadff' },
                      { label: `Google ${countBy('google','image') + countBy('google','video')}`, color: '#ff8a80' },
                      { label: `Meta 이미지 ${countBy('meta','image')}`, color: 'var(--text-secondary)' },
                      { label: `Meta 영상 ${countBy('meta','video')}`, color: 'var(--text-secondary)' },
                      { label: `Google 이미지 ${countBy('google','image')}`, color: 'var(--text-secondary)' },
                      { label: `Google 영상 ${countBy('google','video')}`, color: 'var(--text-secondary)' },
                    ].map(({ label, color }) => (
                      <span key={label} style={{ fontSize: '13px', color, background: 'var(--bg-elevated)', padding: '3px 10px', borderRadius: '20px' }}>{label}</span>
                    ));
                  })()}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
                  {(['meta', 'google'] as const).map(plat => {
                    const platItems = data
                      .filter(i => i.platform === plat && ((i.advertiserName||'').toLowerCase().includes(selectedBrand.toLowerCase()) || (i.keyword||'').toLowerCase() === selectedBrand.toLowerCase()))
                      .sort((a,b) => (b.collectedAt || '').localeCompare(a.collectedAt || '')).slice(0, 5);
                    return (
                      <div key={plat} style={cardStyle({ padding: '16px' })}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ background: plat === 'meta' ? '#1877f2' : '#ea4335', color: '#fff', fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>{plat}</span>
                          <span style={{ fontSize: '15px', fontWeight: 600 }}>최신 5개</span>
                        </div>
                        {platItems.length === 0 ? (
                          <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '16px 0', textAlign: 'center' }}>수집된 {plat} 광고 없음</div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                            {platItems.map(item => (
                              <AdCard key={item.id} item={item} isFavorited={favorites.some(f=>f.id===item.id)} onToggleFav={toggleFav} onClick={setSelectedItem} dataDir="/data" />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600 }}>전체 광고</span>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{withVisualDedupe(brandItems).length}개</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {(['all','meta','google'] as const).map(p => (
                        <button key={p} onClick={() => setBrandPlatform(p)} style={chip(brandPlatform === p)}>{p === 'all' ? '전체' : p}</button>
                      ))}
                      <div style={{ width: '1px', background: 'var(--border)', margin: '0 4px' }} />
                      {(['all','image','video'] as const).map(m => (
                        <button key={m} onClick={() => setBrandMedia(m)} style={chip(brandMedia === m)}>{m === 'all' ? '전체' : m === 'image' ? '이미지' : '영상'}</button>
                      ))}
                      <div style={{ width: '1px', background: 'var(--border)', margin: '0 4px' }} />
                      {(['recent','duration'] as const).map(s => (
                        <button key={s} onClick={() => setBrandSort(s)} style={chip(brandSort === s)}>{s === 'recent' ? '최신순' : '게재일 긴 순서'}</button>
                      ))}
                      {similarToggleButton()}
                    </div>
                  </div>
                  {adGrid(withVisualDedupe(brandItems), Infinity)}
                </div>
              </>
            )}

            {/* 모니터링 > 브랜드검색 */}
            {view === 'bs' && (
              <>
                <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>네이버 브랜드검색 모니터링</h2>
                <WeekSelector weekKeys={bsWeekKeys} selected={bsSelectedWeek} onSelect={setBsSelectedWeek} />

                {bsWeeklySummary.length > 0 && (
                  <div style={cardStyle({ marginBottom: '16px', padding: '14px 18px' })}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px' }}>이번 주 변경사항</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {bsWeeklySummary.map(({ brand, diff, changeCount }) => {
                        const changed = !diff.isFirstSnapshot && changeCount > 0;
                        return (
                          <div key={brand}
                            onClick={() => changed && !bsExpanded.has(brand) && toggleBsExpand(brand)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px',
                              cursor: changed ? 'pointer' : 'default',
                              background: changed ? 'rgba(251,146,60,0.15)' : 'rgba(var(--text-muted-rgb),0.06)',
                              border: `1px solid ${changed ? '#fb923c' : 'var(--border)'}`,
                            }}>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{brand}</span>
                            {diff.isFirstSnapshot ? (
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>최초 수집</span>
                            ) : changed ? (
                              <span style={{ fontSize: '14px', fontWeight: 800, color: '#fb923c' }}>🔴 변경 있음</span>
                            ) : (
                              <span style={{ fontSize: '12px', color: '#666680' }}>변경없음</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {bsData.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔎</div>
                    <p>수집된 브랜드검색 데이터가 없습니다</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {BRANDS.map(brand => {
                      const brandBs = bsWeekData.filter((i: any) => i.advertiserName === brand);
                      if (brandBs.length === 0) return null;
                      const pc = brandBs.filter((i: any) => i.device === 'pc').sort((a: any, b: any) => (b.collectedAt || '').localeCompare(a.collectedAt || ''))[0];
                      const mo = brandBs.filter((i: any) => i.device === 'mo').sort((a: any, b: any) => (b.collectedAt || '').localeCompare(a.collectedAt || ''))[0];

                      // creativeSetId 기준으로 PC/MO를 소재 세트로 묶는다 - 이전에 수집된(creativeSetId
                      // 없는) 데이터는 device별로 하나의 레거시 세트에 담아 그대로 보여준다.
                      const setMap = new Map<string, { label: string; pc?: any; mo?: any }>();
                      brandBs.forEach((item: any) => {
                        // creativeSetId 없는 구버전 데이터는 브랜드당 PC/MO 하나씩만 있던 시절 것이라
                        // 전부 같은 "legacy" 버킷 하나에 담아 기존처럼 PC+MO 한 쌍으로 보여준다.
                        const setId = item.creativeSetId || 'legacy';
                        if (!setMap.has(setId)) setMap.set(setId, { label: item.creativeLabel || '소재' });
                        const entry = setMap.get(setId)!;
                        const key = item.device === 'mo' ? 'mo' : 'pc';
                        const existing = entry[key];
                        if (!existing || (item.collectedAt || '') > (existing.collectedAt || '')) entry[key] = item;
                      });
                      const creativeSets = Array.from(setMap.values());

                      const isOpen = bsExpanded.has(brand);
                      const summaryEntry = bsWeeklySummary.find(s => s.brand === brand);
                      const showDiffBox = isOpen && summaryEntry && !summaryEntry.diff.isFirstSnapshot && summaryEntry.changeCount > 0;

                      return (
                        <div key={brand} style={cardStyle({ overflow: 'hidden' })}>
                          <button onClick={() => toggleBsExpand(brand)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '15px', fontWeight: 600 }}>{brand}</span>
                              {brand === CLIENT_BRAND && <span style={{ background: 'rgba(var(--accent-rgb),0.4)', color: 'var(--accent-text)', fontSize: '12px', fontWeight: 600, padding: '1px 6px', borderRadius: '3px' }}>client</span>}
                              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>PC {pc ? '✓' : '✗'} · MO {mo ? '✓' : '✗'}</span>
                            </div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '18px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
                          </button>

                          {isOpen && (
                            <div style={{ borderTop: '1px solid var(--border)', padding: '20px' }}>
                              {showDiffBox && summaryEntry && (
                                <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: '10px' }}>
                                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#fb923c', marginBottom: '8px' }}>이번 주 변경사항</p>
                                  <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {summaryEntry.diff.added.map((c, i) => (
                                      <li key={`a${i}`} style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                                        🆕 <span style={{ color: 'var(--text-muted)' }}>[{c.device.toUpperCase()}·{c.area}]</span> {c.text || '(제목 없음)'} 신규
                                      </li>
                                    ))}
                                    {summaryEntry.diff.removed.map((c, i) => (
                                      <li key={`r${i}`} style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                                        ❌ <span style={{ color: 'var(--text-muted)' }}>[{c.device.toUpperCase()}·{c.area}]</span> {c.text || '(제목 없음)'} 종료
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {creativeSets.map((set, setIdx) => {
                                const mainImages: { path: string; area: string }[] = [];
                                const seenImg = new Set<string>();
                                [set.pc, set.mo].forEach((item: any) => {
                                  (item?.buttons || []).forEach((btn: any) => {
                                    if (btn.slideImage && !seenImg.has(btn.slideImage)) {
                                      seenImg.add(btn.slideImage);
                                      mainImages.push({ path: btn.slideImage, area: btn.area || '메인이미지' });
                                    }
                                  });
                                });
                                // 전체 스크린샷 클릭 시 열리는 갤러리는 PC/MO가 서로 다른 슬라이드를 보여줘야
                                // 해서 디바이스별로 따로 모은다(위 mainImages는 화면 하단 썸네일 줄에 쓰는
                                // PC+MO 합친 목록이라 갤러리용으로는 재사용할 수 없음). 각 슬라이드의 실제
                                // 문구(헤드라인/서브텍스트)와 버튼 텍스트도 같이 캡션으로 보여줄 수 있게
                                // 이미지 경로만이 아니라 캡션 문자열도 같이 만들어서 넘긴다.
                                const slideCaption = (b: any) => {
                                  const titleLine = b.slideTitle || '';
                                  const parts = [titleLine, b.slideSubText || ''].filter(Boolean).join(' · ');
                                  return b.buttonText ? `${parts}${parts ? ' — ' : ''}[${b.buttonText}]` : parts;
                                };
                                const pcSlides = (set.pc?.buttons || []).filter((b: any) => b.slideImage).map((b: any) => ({ path: b.slideImage, caption: slideCaption(b) }));
                                const moSlides = (set.mo?.buttons || []).filter((b: any) => b.slideImage).map((b: any) => ({ path: b.slideImage, caption: slideCaption(b) }));

                                return (
                                  <div key={setIdx} style={{ marginBottom: '28px' }}>
                                    {creativeSets.length > 1 && (
                                      <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', background: 'var(--bg-elevated)', display: 'inline-block', padding: '3px 10px', borderRadius: '6px', marginBottom: '10px' }}>{set.label}</p>
                                    )}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: mainImages.length > 0 ? '10px' : '24px' }}>
                                      {[{ item: set.pc, label: 'PC', slides: pcSlides }, { item: set.mo, label: 'MO', slides: moSlides }].map(({ item, label, slides }) => (
                                        <div key={label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                                          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ background: '#03c75a', color: '#fff', fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>{label}</span>
                                            <span style={{ fontSize: '14px', fontWeight: 600 }}>네이버 브랜드검색</span>
                                            {item && <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(item.collectedAt).toLocaleDateString('ko-KR')}</span>}
                                          </div>
                                          <div style={{ padding: '12px' }}>
                                            {!item ? (
                                              <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '20px 0', textAlign: 'center' }}>수집된 데이터 없음</div>
                                            ) : item.localPath ? (
                                              <div style={{ maxHeight: '320px', overflow: 'hidden', borderRadius: '8px', cursor: 'pointer', position: 'relative' }}
                                                onClick={() => openBsGallery([{ path: item.localPath }, ...slides])}>
                                                <img src={mediaUrl(item.localPath)} alt="" style={{ width: '100%', display: 'block' }} />
                                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '6px' }}>
                                                  <span style={{ fontSize: '12px', color: '#fff' }}>클릭해서 전체 이미지 보기{slides.length > 0 ? ` (스크린샷 + 메인이미지 ${slides.length}장)` : ''}</span>
                                                </div>
                                              </div>
                                            ) : (
                                              <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '20px 0', textAlign: 'center' }}>이미지 없음</div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    {mainImages.length > 0 && (
                                      <div style={{ marginBottom: '24px' }}>
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>메인이미지 ({mainImages.length})</p>
                                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                                          {mainImages.map((img, i) => (
                                            <div key={i} style={{ flexShrink: 0, width: '100px', cursor: 'pointer', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}
                                              onClick={() => window.open(mediaUrl(img.path), '_blank')}>
                                              <img src={mediaUrl(img.path)} alt={img.area} style={{ width: '100%', height: '100px', objectFit: 'cover', display: 'block' }} />
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {set.pc && set.pc.buttons && set.pc.buttons.length > 0 && (
                                      <div style={{ marginBottom: '24px' }}>
                                        <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-text)', marginBottom: '10px' }}>PC 랜딩</p>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                                          {set.pc.buttons.filter((btn: any) => btn.landingScreenshot).map((btn: any, idx: number) => (
                                            <div key={idx} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                                              <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                                                <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                                  {btn.area && <span style={{ display: 'inline-block', background: '#03c75a', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px' }}>{btn.area}</span>}
                                                  <span style={{ display: 'inline-block', background: 'var(--accent)', color: '#fff', fontSize: '12px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px' }}>{btn.buttonText || '버튼'}</span>
                                                </div>
                                                <a href={btn.finalUrl || btn.buttonUrl} target="_blank" rel="noopener noreferrer"
                                                  style={{ display: 'block', fontSize: '11px', color: 'var(--accent-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>
                                                  {(btn.finalUrl || btn.buttonUrl || '').slice(0, 40)}...
                                                </a>
                                              </div>
                                              <div style={{ position: 'relative', overflow: 'hidden', maxHeight: '220px', cursor: 'pointer' }}
                                                onClick={() => window.open(btn.finalUrl || btn.buttonUrl, '_blank')}>
                                                <img src={mediaUrl(btn.landingScreenshot)} alt="랜딩" style={{ width: '100%', display: 'block' }} />
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {set.mo && set.mo.buttons && set.mo.buttons.length > 0 && (
                                      <div>
                                        <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-text)', marginBottom: '10px' }}>MO 랜딩</p>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                                          {set.mo.buttons.filter((btn: any) => btn.landingScreenshot).map((btn: any, idx: number) => (
                                            <div key={idx} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                                              <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                                                <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                                  {btn.area && <span style={{ display: 'inline-block', background: '#03c75a', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px' }}>{btn.area}</span>}
                                                  <span style={{ display: 'inline-block', background: 'var(--accent)', color: '#fff', fontSize: '12px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px' }}>{btn.buttonText || '버튼'}</span>
                                                </div>
                                                <a href={btn.finalUrl || btn.buttonUrl} target="_blank" rel="noopener noreferrer"
                                                  style={{ display: 'block', fontSize: '11px', color: 'var(--accent-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>
                                                  {(btn.finalUrl || btn.buttonUrl || '').slice(0, 30)}...
                                                </a>
                                              </div>
                                              <div style={{ position: 'relative', overflow: 'hidden', maxHeight: '300px', cursor: 'pointer' }}
                                                onClick={() => window.open(btn.finalUrl || btn.buttonUrl, '_blank')}>
                                                <img src={mediaUrl(btn.landingScreenshot)} alt="랜딩" style={{ width: '100%', display: 'block' }} />
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* 검색어 트렌드 */}
            {view === 'trend' && (
              <>
                <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>검색어 트렌드</h2>
                <TrendAnalysis brands={BRANDS} clientBrand={CLIENT_BRAND}
                  startDate={trendStartDate} endDate={trendEndDate} timeUnit={trendTimeUnit}
                  onStartDateChange={setTrendStartDate} onEndDateChange={setTrendEndDate} onTimeUnitChange={setTrendTimeUnit}
                  onQueryResults={(results, brands) => { generateTrendInsight(results as DataLabResult[], brands); }} />
                <div style={{ marginTop: '24px' }}>
                  <InsightBox title="🧠 왜 이런 추이가 나왔을까"
                    badge="코스피/코스닥/나스닥 + 데이터랩 연동"
                    text={
                      trendInsightLoading ? '인사이트 생성 중...'
                      : trendInsightError ? `생성 실패: ${trendInsightError}`
                      : trendInsightText || '위에서 브랜드를 선택하고 "조회"를 누르면 인사이트가 여기에 표시됩니다.'
                    } />
                </div>
                <div style={{ marginTop: '24px' }}>
                  <MarketIndexPanel startDate={trendStartDate} endDate={trendEndDate} timeUnit={trendTimeUnit} />
                </div>
              </>
            )}

            {/* 트렌드 리포트 (구글 시트 연동) */}
            {view === 'trend-report' && <TrendReport />}

            {/* 커뮤니티 반응 (버블차트) */}
            {view === 'community-trend' && <CommunityTrend />}

            {/* 모니터링 > 검색광고 일반키워드 (파워링크) */}
            {view === 'pwl' && (
              <>
                <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px' }}>검색광고 일반키워드 모니터링</h2>
                <PowerlinkMonitor />
              </>
            )}

            {/* 모니터링 > 검색광고 브랜드키워드 (파워링크) */}
            {view === 'pwl-brand' && (
              <>
                <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px' }}>검색광고 브랜드키워드 모니터링</h2>
                <PowerlinkBrandMonitor />
              </>
            )}
          </main>
        )}
      </div>

      {selectedItem && <AdModal item={selectedItem} onClose={() => setSelectedItem(null)} dataDir="/data" />}

      {bsGallery && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,6,10,0.85)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={closeBsGallery}>
          <button onClick={(e) => { e.stopPropagation(); closeBsGallery(); }}
            style={{ position: 'absolute', top: '20px', right: '24px', background: 'none', border: 'none', color: '#fff', fontSize: '28px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
          <span style={{ position: 'absolute', top: '24px', left: '24px', color: 'rgba(255,255,255,0.8)', fontSize: '14px' }}>
            {bsGalleryIndex + 1} / {bsGallery.length}{bsGalleryIndex === 0 ? ' · 전체 스크린샷' : ' · 메인이미지'}
          </span>
          {bsGallery.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); bsGalleryPrev(); }}
              style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: '28px', width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer' }}>‹</button>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', maxWidth: '90vw', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}>
            <img src={mediaUrl(bsGallery[bsGalleryIndex].path)} alt=""
              style={{ maxWidth: '90vw', maxHeight: '78vh', objectFit: 'contain', borderRadius: '8px' }} />
            {bsGallery[bsGalleryIndex].caption && (
              <p style={{ color: '#fff', fontSize: '14px', textAlign: 'center', background: 'rgba(0,0,0,0.5)', padding: '8px 16px', borderRadius: '8px', maxWidth: '600px' }}>
                {bsGallery[bsGalleryIndex].caption}
              </p>
            )}
          </div>
          {bsGallery.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); bsGalleryNext(); }}
              style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: '28px', width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer' }}>›</button>
          )}
        </div>
      )}

      {favPopup && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: 'var(--bg-surface-solid)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px', zIndex: 60, minWidth: '260px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>⭐ 즐겨찾기 추가</h4>
          <input value={favName} onChange={e => setFavName(e.target.value)} placeholder="내 이름"
            style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px', padding: '7px 10px', color: 'var(--text-primary)', fontSize: '14px', marginBottom: '8px', outline: 'none' }} />
          <input value={favFolder} onChange={e => setFavFolder(e.target.value)} placeholder="폴더명"
            style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px', padding: '7px 10px', color: 'var(--text-primary)', fontSize: '14px', marginBottom: '12px', outline: 'none' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={confirmFav} style={{ flex: 1, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: 500 }}>저장</button>
            <button onClick={() => setFavPopup(null)} style={{ flex: 1, background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', padding: '8px', fontSize: '14px', cursor: 'pointer' }}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}
