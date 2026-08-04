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
  const [searchText, setSearchText] = useState('');
  const [searchMedia, setSearchMedia] = useState<'all' | 'image' | 'video'>('all');
  const [sliceYears, setSliceYears] = useState<Set<string>>(new Set());
  const [sliceMonths, setSliceMonths] = useState<Set<string>>(new Set());
  const [sliceAdvertisers, setSliceAdvertisers] = useState<Set<string>>(new Set());
  const [slicePlatforms, setSlicePlatforms] = useState<Set<string>>(new Set());
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [metaSearchText, setMetaSearchText] = useState('');
  const [googleSearchText, setGoogleSearchText] = useState('');
  const [metaStartDate, setMetaStartDate] = useState('');
  const [metaEndDate, setMetaEndDate] = useState('');
  const [googleStartDate, setGoogleStartDate] = useState('');
  const [googleEndDate, setGoogleEndDate] = useState('');
  const [selectedItem, setSelectedItem] = useState<AdItem | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [favPopup, setFavPopup] = useState<string | null>(null);
  const [favName, setFavName] = useState('');
  const [favFolder, setFavFolder] = useState('기본 즐겨찾기');
  const [bsExpanded, setBsExpanded] = useState<Set<string>>(new Set());
  const [bsSelectedWeek, setBsSelectedWeek] = useState<string | null>(null);

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

  const brandItems = useMemo(() => {
    if (!selectedBrand) return [];
    return data
      .filter(i => matchesBrand(i.advertiserName, selectedBrand) || (i.keyword || '').toLowerCase() === selectedBrand.toLowerCase())
      .filter(i => brandPlatform === 'all' ? true : i.platform === brandPlatform)
      .filter(i => brandMedia === 'all' ? true : i.mediaType === brandMedia)
      .sort((a, b) => (b.collectedAt || '').localeCompare(a.collectedAt || ''));
  }, [data, selectedBrand, brandPlatform, brandMedia]);

  // 게재일(adStartedAt) 우선, 없으면 수집일(collectedAt)로 대체 - 아직 게재일이 안 잡히는
  // 광고가 많아서 완전히 정확한 "게재 시점"은 아니지만 슬라이서가 항상 동작하도록 보장
  const getAdDate = (item: AdItem) => item.adStartedAt || item.collectedAt;

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
    return items.sort((a, b) => (b.collectedAt || '').localeCompare(a.collectedAt || ''));
  }, [data, searchText, searchMedia, slicePlatforms, sliceAdvertisers, sliceYears, sliceMonths]);

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
        localPath: i.localPath, mediaType: i.mediaType,
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

  const metaItems = useMemo(() => {
    let items = data.filter(i => i.platform === 'meta');
    if (metaSearchText.trim()) {
      const q = metaSearchText.toLowerCase();
      items = items.filter(i => [i.advertiserName, i.keyword, i.copyText].join(' ').toLowerCase().includes(q));
    }
    if (metaStartDate) items = items.filter(i => getAdDate(i) >= metaStartDate);
    if (metaEndDate) items = items.filter(i => getAdDate(i) <= metaEndDate + 'T23:59:59.999Z');
    return items.sort((a, b) => (b.collectedAt || '').localeCompare(a.collectedAt || ''));
  }, [data, metaSearchText, metaStartDate, metaEndDate]);

  const googleItems = useMemo(() => {
    let items = data.filter(i => i.platform === 'google');
    if (googleSearchText.trim()) {
      const q = googleSearchText.toLowerCase();
      items = items.filter(i => [i.advertiserName, i.keyword, i.copyText].join(' ').toLowerCase().includes(q));
    }
    if (googleStartDate) items = items.filter(i => getAdDate(i) >= googleStartDate);
    if (googleEndDate) items = items.filter(i => getAdDate(i) <= googleEndDate + 'T23:59:59.999Z');
    return items.sort((a, b) => (b.collectedAt || '').localeCompare(a.collectedAt || ''));
  }, [data, googleSearchText, googleStartDate, googleEndDate]);

  if (loading) return <div style={{ minHeight: '100vh', background: '#0f0f13', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8888aa' }}>로딩 중...</div>;

  const chip = (active: boolean) => ({
    padding: '4px 12px', borderRadius: '20px', border: `1px solid ${active ? '#6c63ff' : '#2e2e3e'}`,
    background: active ? 'rgba(108,99,255,0.12)' : 'transparent', color: active ? '#a78bfa' : '#8888aa',
    fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' as const,
  });

  const slicerBtn = (active: boolean) => ({
    padding: '5px 10px', borderRadius: '6px', border: `1px solid ${active ? '#03c75a' : '#2e2e3e'}`,
    background: active ? 'rgba(3,199,90,0.15)' : '#1a1a24', color: active ? '#03c75a' : '#8888aa',
    fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' as const, fontWeight: active ? 700 : 400,
  });

  const slicerGroup = (
    title: string,
    options: string[],
    selected: Set<string>,
    onToggle: (v: string) => void,
    formatLabel?: (v: string) => string,
  ) => (
    <div>
      <div style={{ fontSize: '10px', color: '#8888aa', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxHeight: '110px', overflowY: 'auto' }}>
        {options.length === 0
          ? <span style={{ fontSize: '11px', color: '#555568' }}>데이터 없음</span>
          : options.map(opt => (
            <button key={opt} onClick={() => onToggle(opt)} style={slicerBtn(selected.has(opt))}>
              {formatLabel ? formatLabel(opt) : opt}
            </button>
          ))}
      </div>
    </div>
  );

  const adGrid = (items: AdItem[], max = 300) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
      {items.slice(0, max).map(item => (
        <AdCard key={item.id} item={item} isFavorited={favorites.some(f => f.id === item.id)}
          onToggleFav={toggleFav} onClick={setSelectedItem} dataDir="/data" />
      ))}
    </div>
  );

  const sectionLabel = (text: string) => (
    <h2 style={{ fontSize: '11px', fontWeight: 600, color: '#8888aa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>{text}</h2>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f13', color: '#e2e2f0', fontFamily: '-apple-system, "Segoe UI", sans-serif', display: 'flex' }}>
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
                  <div key={key} style={{ background: 'rgba(26,26,36,0.8)', border: '1px solid #2e2e3e', borderRadius: '12px', padding: '16px 18px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#e2e2f0', marginBottom: '8px' }}>{label}</p>
                    {at ? (
                      <>
                        <p style={{ fontSize: '12px', color: '#a78bfa' }}>{at.toLocaleDateString('ko-KR')}</p>
                        <p style={{ fontSize: '11px', color: '#8888aa', marginTop: '2px' }}>{at.toLocaleTimeString('ko-KR')}</p>
                        <p style={{ fontSize: '11px', color: '#8888aa', marginTop: '6px' }}>신규 {s.newCount ?? 0}건</p>
                      </>
                    ) : (
                      <p style={{ fontSize: '12px', color: '#555568' }}>수집 이력 없음</p>
                    )}
                  </div>
                );
              })}

              {/* 메타 미디어 채우기는 별도 진행상황 지표(시도/성공/대기중)라 다르게 표시 */}
              <div style={{ background: 'rgba(26,26,36,0.8)', border: '1px solid #2e2e3e', borderRadius: '12px', padding: '16px 18px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#e2e2f0', marginBottom: '8px' }}>메타 이미지/영상 채우기</p>
                {collectionStatus.metaMediaBatch?.lastRunAt ? (
                  <>
                    <p style={{ fontSize: '12px', color: '#a78bfa' }}>
                      {new Date(collectionStatus.metaMediaBatch.lastRunAt).toLocaleDateString('ko-KR')}
                    </p>
                    <p style={{ fontSize: '11px', color: '#8888aa', marginTop: '2px' }}>
                      {new Date(collectionStatus.metaMediaBatch.lastRunAt).toLocaleTimeString('ko-KR')}
                    </p>
                    <p style={{ fontSize: '11px', color: '#8888aa', marginTop: '6px' }}>
                      {collectionStatus.metaMediaBatch.attempted}건 시도 · {collectionStatus.metaMediaBatch.updated}건 성공
                    </p>
                    <p style={{ fontSize: '11px', color: collectionStatus.metaMediaBatch.stillPending > 0 ? '#fb923c' : '#34d399', marginTop: '2px' }}>
                      {collectionStatus.metaMediaBatch.stillPending > 0
                        ? `아직 ${collectionStatus.metaMediaBatch.stillPending}건 대기 중`
                        : '전부 채움 완료'}
                    </p>
                  </>
                ) : (
                  <p style={{ fontSize: '12px', color: '#555568' }}>수집 이력 없음</p>
                )}
              </div>
            </div>
          </main>
        )}

        {view !== 'home' && (
          <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 24px' }}>

            {/* 뉴스 클리핑 - 스텁 (추후 기존 코드 연결 예정) */}
            {(view === 'news-daily' || view === 'news-weekly') && (
              <div style={{ textAlign: 'center', padding: '80px 20px', color: '#8888aa' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📰</div>
                <p style={{ fontSize: '15px', fontWeight: 600, color: '#e2e2f0', marginBottom: '6px' }}>
                  {view === 'news-daily' ? '데일리 뉴스' : '주간 인사이트'}
                </p>
                <p style={{ fontSize: '13px' }}>준비 중입니다</p>
              </div>
            )}

            {/* 경쟁사 대시보드 > 전체: 광고 검색(슬라이서) + 즐겨찾기 통합 */}
            {view === 'dash-all' && (
              <>
                <header style={{ marginBottom: '32px' }}>
                  <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#fff' }}>경쟁사 광고 - 전체</h1>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '13px', color: '#8888aa', flexWrap: 'wrap', lineHeight: 1.6 }}>
                    {totalStats.lastGoogle && <span>Google 최근 수집: {new Date(totalStats.lastGoogle).toLocaleString('ko-KR')}</span>}
                    {totalStats.lastMeta && <span>· Meta 최근 수집: {new Date(totalStats.lastMeta).toLocaleString('ko-KR')}</span>}
                  </div>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '32px' }}>
                  {[
                    { label: '활성 광고 (전체)', value: totalStats.total.toLocaleString(), color: '#a78bfa' },
                    { label: '신규 광고 (월간)', value: totalStats.new24h, color: '#34d399' },
                    { label: '종료 광고 (월간)', value: totalStats.ended24h, color: '#f87171' },
                    { label: '즐겨찾기', value: favorites.length, color: '#facc15' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: 'rgba(26,26,36,0.8)', border: '1px solid #2e2e3e', borderRadius: '14px', padding: '24px' }}>
                      <p style={{ fontSize: '13px', color: '#8888aa', fontWeight: 500 }}>{label}</p>
                      <p style={{ fontSize: '34px', fontWeight: 700, color, marginTop: '8px', letterSpacing: '-0.5px' }}>{value}</p>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: dynamicInsight ? '10px' : 0 }}>
                    <button onClick={generateCreativeInsight} disabled={insightLoading || searchResults.length === 0}
                      style={{
                        fontSize: '12px', color: '#a78bfa', background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.3)',
                        borderRadius: '8px', padding: '8px 14px', cursor: insightLoading ? 'default' : 'pointer', opacity: searchResults.length === 0 ? 0.5 : 1,
                      }}>
                      {insightLoading ? '🧠 생성 중... (최대 1~2분)' : dynamicInsight ? '🧠 지금 조건으로 다시 생성' : '🧠 지금 선택 조건으로 인사이트 생성'}
                    </button>
                    <span style={{ fontSize: '11px', color: '#8888aa' }}>현재 {searchResults.length}건 기준</span>
                    {insightStale && !insightLoading && (
                      <span style={{ fontSize: '11px', color: '#fb923c' }}>· 필터가 바뀌었어요 - 다시 생성해보세요</span>
                    )}
                    {insightError && <span style={{ fontSize: '11px', color: '#f87171' }}>· {insightError}</span>}
                  </div>
                  {dynamicInsight && (
                    <InsightBox title="🧠 소재 인사이트"
                      badge={`${dynamicInsight.label} 기준 (${dynamicInsight.itemCount}건)${insightStale ? ' · 이전 조건 결과' : ''}`}
                      text={dynamicInsight.text} />
                  )}
                </div>

                <div style={{ position: 'relative', maxWidth: '480px', marginBottom: '12px' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8888aa', pointerEvents: 'none' }}>🔍</span>
                  <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="키워드 또는 광고주명 검색..."
                    style={{ width: '100%', background: '#1a1a24', border: '1px solid #2e2e3e', borderRadius: '10px', padding: '10px 14px 10px 38px', color: '#e2e2f0', fontSize: '14px', outline: 'none' }} />
                </div>

                <div style={{ background: 'rgba(26,26,36,0.6)', border: '1px solid #2e2e3e', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                    {slicerGroup('년도', sliceOptions.years, sliceYears, v => toggleSetValue(setSliceYears, v), v => v + '년')}
                    {slicerGroup('월', sliceOptions.months, sliceMonths, v => toggleSetValue(setSliceMonths, v), v => `${v.split('-')[0]}.${v.split('-')[1]}`)}
                    {slicerGroup('광고주명', sliceOptions.advertisers, sliceAdvertisers, v => toggleSetValue(setSliceAdvertisers, v))}
                    {slicerGroup('매체', sliceOptions.platforms, slicePlatforms, v => toggleSetValue(setSlicePlatforms, v), v => v === 'meta' ? 'Meta' : v === 'google' ? 'Google' : v === 'naver_bs' ? '네이버 브검' : v)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #2e2e3e' }}>
                    <span style={{ fontSize: '10px', color: '#555568' }}>* 게재일(adStartedAt)이 없는 광고는 수집일 기준으로 년도/월이 계산됩니다</span>
                    {(sliceYears.size + sliceMonths.size + sliceAdvertisers.size + slicePlatforms.size) > 0 && (
                      <button onClick={clearSlicers} style={{ marginLeft: 'auto', fontSize: '11px', color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        ✕ 필터 초기화
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {(['all','image','video'] as const).map(m => (
                    <button key={m} onClick={() => setSearchMedia(m)} style={chip(searchMedia === m)}>{m === 'all' ? '전체' : m === 'image' ? '이미지' : '영상'}</button>
                  ))}
                  <div style={{ width: '1px', background: '#2e2e3e', margin: '0 4px', height: '16px' }} />
                  <button onClick={() => setShowFavOnly(v => !v)} style={chip(showFavOnly)}>⭐ 즐겨찾기만</button>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#8888aa' }}>
                    {showFavOnly ? `${favorites.length}개` : `${searchResults.length}개`}
                  </span>
                </div>

                {showFavOnly ? (
                  Object.keys(favFolders).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#8888aa' }}>
                      <div style={{ fontSize: '40px', marginBottom: '12px' }}>⭐</div>
                      <p>즐겨찾기한 광고가 없습니다<br />카드의 ☆ 버튼을 눌러 추가해보세요</p>
                    </div>
                  ) : Object.entries(favFolders).map(([folder, items]) => (
                    <div key={folder} style={{ marginBottom: '32px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#a78bfa', fontWeight: 600, fontSize: '14px' }}>
                        📁 {folder} <span style={{ color: '#8888aa', fontWeight: 400, fontSize: '12px' }}>{items.length}개</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                        {items.map(f => {
                          const item = data.find(d => d.id === f.id);
                          return item ? <AdCard key={f.id} item={item} isFavorited={true} onToggleFav={toggleFav} onClick={setSelectedItem} dataDir="/data" /> : null;
                        })}
                      </div>
                    </div>
                  ))
                ) : adGrid(searchResults)}
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
                        fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
                        background: pending > 0 ? 'rgba(251,146,60,0.15)' : 'rgba(52,211,153,0.15)',
                        color: pending > 0 ? '#fb923c' : '#34d399',
                      }}>
                        {pending > 0 ? `🖼️ 이미지/영상 대기 ${pending}건` : '🖼️ 이미지/영상 전부 채워짐'}
                      </span>
                    );
                  })()}
                </div>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px' }}>
                  <div>
                    <p style={{ fontSize: '11px', color: '#8888aa', marginBottom: '4px' }}>시작일</p>
                    <input type="date" value={metaStartDate} onChange={e => setMetaStartDate(e.target.value)}
                      style={{ background: '#1a1a24', border: '1px solid #2e2e3e', borderRadius: '6px', padding: '6px 10px', color: '#e2e2f0', fontSize: '12px' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', color: '#8888aa', marginBottom: '4px' }}>종료일</p>
                    <input type="date" value={metaEndDate} onChange={e => setMetaEndDate(e.target.value)}
                      style={{ background: '#1a1a24', border: '1px solid #2e2e3e', borderRadius: '6px', padding: '6px 10px', color: '#e2e2f0', fontSize: '12px' }} />
                  </div>
                  {(metaStartDate || metaEndDate) && (
                    <button onClick={() => { setMetaStartDate(''); setMetaEndDate(''); }}
                      style={{ background: 'transparent', border: '1px solid #2e2e3e', borderRadius: '6px', padding: '6px 10px', color: '#8888aa', fontSize: '12px', cursor: 'pointer' }}>
                      기간 초기화
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative', maxWidth: '420px', marginBottom: '16px' }}>
                  <input value={metaSearchText} onChange={e => setMetaSearchText(e.target.value)} placeholder="키워드 또는 광고주명 검색..."
                    style={{ width: '100%', background: '#1a1a24', border: '1px solid #2e2e3e', borderRadius: '10px', padding: '10px 14px', color: '#e2e2f0', fontSize: '13px', outline: 'none' }} />
                </div>
                <p style={{ fontSize: '11px', color: '#8888aa', marginBottom: '14px' }}>{metaItems.length}개</p>
                {adGrid(metaItems)}
              </>
            )}

            {/* 경쟁사 대시보드 > 구글 */}
            {view === 'dash-google' && (
              <>
                <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>구글 광고</h2>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px' }}>
                  <div>
                    <p style={{ fontSize: '11px', color: '#8888aa', marginBottom: '4px' }}>시작일</p>
                    <input type="date" value={googleStartDate} onChange={e => setGoogleStartDate(e.target.value)}
                      style={{ background: '#1a1a24', border: '1px solid #2e2e3e', borderRadius: '6px', padding: '6px 10px', color: '#e2e2f0', fontSize: '12px' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', color: '#8888aa', marginBottom: '4px' }}>종료일</p>
                    <input type="date" value={googleEndDate} onChange={e => setGoogleEndDate(e.target.value)}
                      style={{ background: '#1a1a24', border: '1px solid #2e2e3e', borderRadius: '6px', padding: '6px 10px', color: '#e2e2f0', fontSize: '12px' }} />
                  </div>
                  {(googleStartDate || googleEndDate) && (
                    <button onClick={() => { setGoogleStartDate(''); setGoogleEndDate(''); }}
                      style={{ background: 'transparent', border: '1px solid #2e2e3e', borderRadius: '6px', padding: '6px 10px', color: '#8888aa', fontSize: '12px', cursor: 'pointer' }}>
                      기간 초기화
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative', maxWidth: '420px', marginBottom: '16px' }}>
                  <input value={googleSearchText} onChange={e => setGoogleSearchText(e.target.value)} placeholder="키워드 또는 광고주명 검색..."
                    style={{ width: '100%', background: '#1a1a24', border: '1px solid #2e2e3e', borderRadius: '10px', padding: '10px 14px', color: '#e2e2f0', fontSize: '13px', outline: 'none' }} />
                </div>
                <p style={{ fontSize: '11px', color: '#8888aa', marginBottom: '14px' }}>{googleItems.length}개</p>
                {adGrid(googleItems)}
              </>
            )}

            {/* 경쟁사 대시보드 > 브랜드별 */}
            {view === 'dash-brand' && !selectedBrand && (
              <>
                <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#fff', marginBottom: '24px' }}>브랜드별</h1>

                <section style={{ marginBottom: '32px' }}>
                  {sectionLabel('경쟁사 KPI 매트릭스')}
                  <div style={{ background: 'rgba(26,26,36,0.8)', border: '1px solid #2e2e3e', borderRadius: '12px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #2e2e3e' }}>
                          {['경쟁사', '활성', '신규 M', '종료 M', 'VIDEO', 'IMAGE'].map(h => (
                            <th key={h} style={{ padding: '12px 16px', textAlign: h === '경쟁사' ? 'left' : 'right', fontSize: '11px', color: '#8888aa', fontWeight: 500, textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {brandStats.map(b => (
                          <tr key={b.name} onClick={() => goToBrand(b.name)}
                            style={{ borderBottom: '1px solid rgba(46,46,62,0.4)', cursor: 'pointer', background: b.isClient ? 'rgba(108,99,255,0.06)' : 'transparent', transition: 'background 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = b.isClient ? 'rgba(108,99,255,0.12)' : 'rgba(255,255,255,0.03)')}
                            onMouseLeave={e => (e.currentTarget.style.background = b.isClient ? 'rgba(108,99,255,0.06)' : 'transparent')}>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{ color: '#e2e2f0', fontWeight: 500 }}>{b.name}</span>
                              {b.isClient && <span style={{ marginLeft: '8px', background: 'rgba(108,99,255,0.4)', color: '#a78bfa', fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '3px' }}>client</span>}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#fff' }}>{b.total.toLocaleString()}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              {b.new24h > 0 ? <span style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>+{b.new24h}</span> : <span style={{ color: '#4e4e6e' }}>-</span>}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              {b.ended24h > 0 ? <span style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171', fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>-{b.ended24h}</span> : <span style={{ color: '#4e4e6e' }}>-</span>}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', color: '#c4c4d4' }}>{b.video > 0 ? b.video : <span style={{ color: '#4e4e6e' }}>-</span>}</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right', color: '#c4c4d4' }}>{b.image > 0 ? b.image : <span style={{ color: '#4e4e6e' }}>-</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  {sectionLabel('경쟁사 바로가기')}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                    {brandStats.map(b => (
                      <button key={b.name} onClick={() => goToBrand(b.name)}
                        style={{ background: b.isClient ? 'rgba(108,99,255,0.1)' : 'rgba(26,26,36,0.8)', border: `1px solid ${b.isClient ? 'rgba(108,99,255,0.4)' : '#2e2e3e'}`, borderRadius: '12px', padding: '12px', textAlign: 'center', cursor: 'pointer' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e2f0' }}>{b.name}</div>
                        <div style={{ fontSize: '11px', color: '#8888aa', marginTop: '4px' }}>활성 {b.total.toLocaleString()}</div>
                        {b.isClient && <div style={{ marginTop: '6px' }}><span style={{ background: 'rgba(108,99,255,0.3)', color: '#a78bfa', fontSize: '10px', padding: '1px 6px', borderRadius: '3px' }}>client</span></div>}
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* 브랜드 상세 */}
            {view === 'dash-brand' && selectedBrand && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                  <button onClick={() => setSelectedBrand(null)} style={{ background: 'none', border: '1px solid #2e2e3e', color: '#8888aa', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                    ← 목록으로
                  </button>
                  <h2 style={{ fontSize: '22px', fontWeight: 700 }}>{selectedBrand}</h2>
                  {brandStats.find(b => b.name === selectedBrand)?.isClient && (
                    <span style={{ background: 'rgba(108,99,255,0.4)', color: '#a78bfa', fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>client</span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                  {(() => {
                    const s = brandStats.find(b => b.name === selectedBrand);
                    if (!s) return null;
                    return [
                      { label: `전체 ${s.total}`, color: '#a78bfa' },
                      { label: `Meta ${data.filter(i=>i.platform==='meta'&&(i.advertiserName||'').includes(selectedBrand)).length}`, color: '#6aadff' },
                      { label: `Google ${data.filter(i=>i.platform==='google'&&(i.advertiserName||'').includes(selectedBrand)).length}`, color: '#ff8a80' },
                      { label: `이미지 ${s.image}`, color: '#e2e2f0' },
                      { label: `영상 ${s.video}`, color: '#e2e2f0' },
                    ].map(({ label, color }) => (
                      <span key={label} style={{ fontSize: '11px', color, background: '#22222f', padding: '3px 10px', borderRadius: '20px' }}>{label}</span>
                    ));
                  })()}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
                  {(['meta', 'google'] as const).map(plat => {
                    const platItems = data
                      .filter(i => i.platform === plat && ((i.advertiserName||'').toLowerCase().includes(selectedBrand.toLowerCase()) || (i.keyword||'').toLowerCase() === selectedBrand.toLowerCase()))
                      .sort((a,b) => (b.collectedAt || '').localeCompare(a.collectedAt || '')).slice(0, 5);
                    return (
                      <div key={plat} style={{ background: 'rgba(26,26,36,0.8)', border: '1px solid #2e2e3e', borderRadius: '12px', padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid #2e2e3e' }}>
                          <span style={{ background: plat === 'meta' ? '#1877f2' : '#ea4335', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>{plat}</span>
                          <span style={{ fontSize: '13px', fontWeight: 600 }}>최신 5개</span>
                        </div>
                        {platItems.length === 0 ? (
                          <div style={{ color: '#8888aa', fontSize: '12px', padding: '16px 0', textAlign: 'center' }}>수집된 {plat} 광고 없음</div>
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
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>전체 광고</span>
                    <span style={{ fontSize: '11px', color: '#8888aa' }}>{brandItems.length}개</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {(['all','meta','google'] as const).map(p => (
                        <button key={p} onClick={() => setBrandPlatform(p)} style={chip(brandPlatform === p)}>{p === 'all' ? '전체' : p}</button>
                      ))}
                      <div style={{ width: '1px', background: '#2e2e3e', margin: '0 4px' }} />
                      {(['all','image','video'] as const).map(m => (
                        <button key={m} onClick={() => setBrandMedia(m)} style={chip(brandMedia === m)}>{m === 'all' ? '전체' : m === 'image' ? '이미지' : '영상'}</button>
                      ))}
                    </div>
                  </div>
                  {adGrid(brandItems)}
                </div>
              </>
            )}

            {/* 모니터링 > 브랜드검색 */}
            {view === 'bs' && (
              <>
                <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>네이버 브랜드검색 모니터링</h2>
                <WeekSelector weekKeys={bsWeekKeys} selected={bsSelectedWeek} onSelect={setBsSelectedWeek} />

                {bsWeeklySummary.length > 0 && (
                  <div style={{ marginBottom: '16px', padding: '14px 18px', background: 'rgba(26,26,36,0.6)', border: '1px solid #2e2e3e', borderRadius: '10px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 700, color: '#8888aa', marginBottom: '10px' }}>이번 주 변경사항</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {bsWeeklySummary.map(({ brand, diff, changeCount }) => {
                        const changed = !diff.isFirstSnapshot && changeCount > 0;
                        return (
                          <div key={brand}
                            onClick={() => changed && !bsExpanded.has(brand) && toggleBsExpand(brand)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px',
                              cursor: changed ? 'pointer' : 'default',
                              background: changed ? 'rgba(251,146,60,0.15)' : 'rgba(136,136,170,0.06)',
                              border: `1px solid ${changed ? '#fb923c' : '#2e2e3e'}`,
                            }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e2f0' }}>{brand}</span>
                            {diff.isFirstSnapshot ? (
                              <span style={{ fontSize: '10px', color: '#6b7280' }}>최초 수집</span>
                            ) : changed ? (
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#fb923c' }}>🔴 변경 있음</span>
                            ) : (
                              <span style={{ fontSize: '10px', color: '#666680' }}>변경없음</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {bsData.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px', color: '#8888aa' }}>
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
                      const isOpen = bsExpanded.has(brand);
                      const summaryEntry = bsWeeklySummary.find(s => s.brand === brand);
                      const showDiffBox = isOpen && summaryEntry && !summaryEntry.diff.isFirstSnapshot && summaryEntry.changeCount > 0;

                      return (
                        <div key={brand} style={{ background: 'rgba(26,26,36,0.8)', border: '1px solid #2e2e3e', borderRadius: '12px', overflow: 'hidden' }}>
                          <button onClick={() => toggleBsExpand(brand)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', color: '#e2e2f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '15px', fontWeight: 600 }}>{brand}</span>
                              {brand === CLIENT_BRAND && <span style={{ background: 'rgba(108,99,255,0.4)', color: '#a78bfa', fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '3px' }}>client</span>}
                              <span style={{ fontSize: '11px', color: '#8888aa' }}>PC {pc ? '✓' : '✗'} · MO {mo ? '✓' : '✗'}</span>
                            </div>
                            <span style={{ color: '#8888aa', fontSize: '18px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
                          </button>

                          {isOpen && (
                            <div style={{ borderTop: '1px solid #2e2e3e', padding: '20px' }}>
                              {showDiffBox && summaryEntry && (
                                <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: '10px' }}>
                                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#fb923c', marginBottom: '8px' }}>이번 주 변경사항</p>
                                  <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {summaryEntry.diff.added.map((c, i) => (
                                      <li key={`a${i}`} style={{ fontSize: '11px', color: '#e2e2f0' }}>
                                        🆕 <span style={{ color: '#8888aa' }}>[{c.device.toUpperCase()}·{c.area}]</span> {c.text || '(제목 없음)'} 신규
                                      </li>
                                    ))}
                                    {summaryEntry.diff.removed.map((c, i) => (
                                      <li key={`r${i}`} style={{ fontSize: '11px', color: '#e2e2f0' }}>
                                        ❌ <span style={{ color: '#8888aa' }}>[{c.device.toUpperCase()}·{c.area}]</span> {c.text || '(제목 없음)'} 종료
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                                {[{ item: pc, label: 'PC' }, { item: mo, label: 'MO' }].map(({ item, label }) => (
                                  <div key={label} style={{ background: '#22222f', border: '1px solid #2e2e3e', borderRadius: '10px', overflow: 'hidden' }}>
                                    <div style={{ padding: '10px 14px', borderBottom: '1px solid #2e2e3e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ background: '#03c75a', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>{label}</span>
                                      <span style={{ fontSize: '12px', fontWeight: 600 }}>네이버 브랜드검색</span>
                                      {item && <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#8888aa' }}>{new Date(item.collectedAt).toLocaleDateString('ko-KR')}</span>}
                                    </div>
                                    <div style={{ padding: '12px' }}>
                                      {!item ? (
                                        <div style={{ color: '#8888aa', fontSize: '12px', padding: '20px 0', textAlign: 'center' }}>수집된 데이터 없음</div>
                                      ) : item.localPath ? (
                                        <div style={{ maxHeight: '320px', overflow: 'hidden', borderRadius: '8px', cursor: 'pointer', position: 'relative' }}
                                          onClick={() => window.open('/data/' + item.localPath, '_blank')}>
                                          <img src={'/data/' + item.localPath} alt="" style={{ width: '100%', display: 'block' }} />
                                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '6px' }}>
                                            <span style={{ fontSize: '10px', color: '#fff' }}>클릭해서 전체 이미지 보기</span>
                                          </div>
                                        </div>
                                      ) : (
                                        <div style={{ color: '#8888aa', fontSize: '12px', padding: '20px 0', textAlign: 'center' }}>이미지 없음</div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {pc && pc.buttons && pc.buttons.length > 0 && (
                                <div style={{ marginBottom: '24px' }}>
                                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#a78bfa', marginBottom: '10px' }}>PC 랜딩</p>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                                    {pc.buttons.filter((btn: any) => btn.landingScreenshot).map((btn: any, idx: number) => (
                                      <div key={idx} style={{ background: '#22222f', border: '1px solid #2e2e3e', borderRadius: '8px', overflow: 'hidden' }}>
                                        <div style={{ padding: '6px 10px', borderBottom: '1px solid #2e2e3e' }}>
                                          <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                            {btn.area && <span style={{ display: 'inline-block', background: '#03c75a', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px' }}>{btn.area}</span>}
                                            <span style={{ display: 'inline-block', background: '#6c63ff', color: '#fff', fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px' }}>{btn.buttonText || '버튼'}</span>
                                          </div>
                                          <a href={btn.finalUrl || btn.buttonUrl} target="_blank" rel="noopener noreferrer"
                                            style={{ display: 'block', fontSize: '9px', color: '#a78bfa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>
                                            {(btn.finalUrl || btn.buttonUrl || '').slice(0, 40)}...
                                          </a>
                                        </div>
                                        {btn.slideImage && (
                                          <div style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer', borderBottom: '1px solid #2e2e3e' }}
                                            onClick={() => window.open('/data/' + btn.slideImage, '_blank')}>
                                            <img src={'/data/' + btn.slideImage} alt="배너 이미지" style={{ width: '100%', display: 'block' }} />
                                            <span style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '8px', padding: '2px 6px', borderRadius: '3px' }}>배너 이미지</span>
                                          </div>
                                        )}
                                        <div style={{ position: 'relative', overflow: 'hidden', maxHeight: '220px', cursor: 'pointer' }}
                                          onClick={() => window.open(btn.finalUrl || btn.buttonUrl, '_blank')}>
                                          <img src={'/data/' + btn.landingScreenshot} alt="랜딩" style={{ width: '100%', display: 'block' }} />
                                          {btn.slideImage && <span style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '8px', padding: '2px 6px', borderRadius: '3px' }}>랜딩 페이지</span>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {mo && mo.buttons && mo.buttons.length > 0 && (
                                <div>
                                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#a78bfa', marginBottom: '10px' }}>MO 랜딩</p>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                                    {mo.buttons.filter((btn: any) => btn.landingScreenshot).map((btn: any, idx: number) => (
                                      <div key={idx} style={{ background: '#22222f', border: '1px solid #2e2e3e', borderRadius: '8px', overflow: 'hidden' }}>
                                        <div style={{ padding: '6px 10px', borderBottom: '1px solid #2e2e3e' }}>
                                          <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                            {btn.area && <span style={{ display: 'inline-block', background: '#03c75a', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px' }}>{btn.area}</span>}
                                            <span style={{ display: 'inline-block', background: '#6c63ff', color: '#fff', fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px' }}>{btn.buttonText || '버튼'}</span>
                                          </div>
                                          <a href={btn.finalUrl || btn.buttonUrl} target="_blank" rel="noopener noreferrer"
                                            style={{ display: 'block', fontSize: '9px', color: '#a78bfa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>
                                            {(btn.finalUrl || btn.buttonUrl || '').slice(0, 30)}...
                                          </a>
                                        </div>
                                        {btn.slideImage && (
                                          <div style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer', borderBottom: '1px solid #2e2e3e' }}
                                            onClick={() => window.open('/data/' + btn.slideImage, '_blank')}>
                                            <img src={'/data/' + btn.slideImage} alt="배너 이미지" style={{ width: '100%', display: 'block' }} />
                                            <span style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '8px', padding: '2px 6px', borderRadius: '3px' }}>배너 이미지</span>
                                          </div>
                                        )}
                                        <div style={{ position: 'relative', overflow: 'hidden', maxHeight: '300px', cursor: 'pointer' }}
                                          onClick={() => window.open(btn.finalUrl || btn.buttonUrl, '_blank')}>
                                          <img src={'/data/' + btn.landingScreenshot} alt="랜딩" style={{ width: '100%', display: 'block' }} />
                                          {btn.slideImage && <span style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '8px', padding: '2px 6px', borderRadius: '3px' }}>랜딩 페이지</span>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
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
                <MarketIndexPanel startDate={trendStartDate} endDate={trendEndDate} timeUnit={trendTimeUnit} />
                <InsightBox title="🧠 왜 이런 추이가 나왔을까"
                  badge="코스피/코스닥/나스닥 + 데이터랩 연동"
                  text={
                    trendInsightLoading ? '인사이트 생성 중...'
                    : trendInsightError ? `생성 실패: ${trendInsightError}`
                    : trendInsightText || '아래에서 브랜드를 선택하고 "조회"를 누르면 인사이트가 여기에 표시됩니다.'
                  } />
                <TrendAnalysis brands={BRANDS} clientBrand={CLIENT_BRAND}
                  startDate={trendStartDate} endDate={trendEndDate} timeUnit={trendTimeUnit}
                  onStartDateChange={setTrendStartDate} onEndDateChange={setTrendEndDate} onTimeUnitChange={setTrendTimeUnit}
                  onQueryResults={(results, brands) => { generateTrendInsight(results as DataLabResult[], brands); }} />
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

      {favPopup && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#1a1a24', border: '1px solid #2e2e3e', borderRadius: '12px', padding: '16px 20px', zIndex: 60, minWidth: '260px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>⭐ 즐겨찾기 추가</h4>
          <input value={favName} onChange={e => setFavName(e.target.value)} placeholder="내 이름"
            style={{ width: '100%', background: '#22222f', border: '1px solid #2e2e3e', borderRadius: '6px', padding: '7px 10px', color: '#e2e2f0', fontSize: '12px', marginBottom: '8px', outline: 'none' }} />
          <input value={favFolder} onChange={e => setFavFolder(e.target.value)} placeholder="폴더명"
            style={{ width: '100%', background: '#22222f', border: '1px solid #2e2e3e', borderRadius: '6px', padding: '7px 10px', color: '#e2e2f0', fontSize: '12px', marginBottom: '12px', outline: 'none' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={confirmFav} style={{ flex: 1, background: '#6c63ff', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>저장</button>
            <button onClick={() => setFavPopup(null)} style={{ flex: 1, background: '#22222f', color: '#8888aa', border: 'none', borderRadius: '6px', padding: '8px', fontSize: '12px', cursor: 'pointer' }}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}
