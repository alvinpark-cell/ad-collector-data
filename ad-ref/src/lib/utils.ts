import { AdItem } from './types';

export function filterByPlatform(items: AdItem[], platform: string): AdItem[] {
  if (platform === 'all') return items;
  return items.filter(i => i.platform === platform);
}

export function filterByMediaType(items: AdItem[], mediaType: string): AdItem[] {
  if (mediaType === 'all') return items;
  return items.filter(i => i.mediaType === mediaType);
}

export function filterByPeriod(
  items: AdItem[],
  period: string,
  rangeStart?: string,
  rangeEnd?: string
): AdItem[] {
  if (period === 'all') return items;
  const now = new Date();
  if (period === 'custom' && rangeStart && rangeEnd) {
    const start = new Date(rangeStart);
    const end = new Date(rangeEnd);
    end.setHours(23, 59, 59, 999);
    return items.filter(i => {
      if (!i.collectedAt) return true;
      const d = new Date(i.collectedAt);
      return d >= start && d <= end;
    });
  }
  const days = parseInt(period);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return items.filter(i => {
    if (!i.collectedAt) return true;
    return new Date(i.collectedAt) >= cutoff;
  });
}

export function filterBySearch(items: AdItem[], text: string): AdItem[] {
  if (!text.trim()) return items;
  const q = text.trim().toLowerCase();
  return items.filter(i => {
    const hay = [i.advertiserName, i.keyword, i.copyText, i.headline, i.platform]
      .join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export function getMediaSrc(item: AdItem): string {
  if (item.mediaType === 'video') {
    return item.localThumb || item.thumbnailUrl || '';
  }
  return item.localPath || item.mediaUrl || '';
}

export function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ko-KR');
}

export function getBrandStats(items: AdItem[], brands: string[]) {
  return brands.map(brand => {
    const brandItems = items.filter(i =>
      (i.advertiserName || '').toLowerCase().includes(brand.toLowerCase()) ||
      (i.keyword || '').toLowerCase() === brand.toLowerCase()
    );
    return {
      name: brand,
      total: brandItems.length,
      meta: brandItems.filter(i => i.platform === 'meta').length,
      google: brandItems.filter(i => i.platform === 'google').length,
      video: brandItems.filter(i => i.mediaType === 'video').length,
      image: brandItems.filter(i => i.mediaType === 'image').length,
    };
  });
}
