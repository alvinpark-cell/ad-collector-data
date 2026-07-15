'use client';
import { AdItem } from '@/lib/types';
import { getMediaSrc, formatDate } from '@/lib/utils';
import { useState } from 'react';

interface AdCardProps {
  item: AdItem;
  isFavorited: boolean;
  onToggleFav: (id: string) => void;
  onClick: (item: AdItem) => void;
  dataDir?: string;
}

export default function AdCard({ item, isFavorited, onToggleFav, onClick, dataDir = '' }: AdCardProps) {
  const [imgError, setImgError] = useState(false);
  const mediaSrc = dataDir
    ? (item.localPath ? `${dataDir}/${item.localPath}` : getMediaSrc(item))
    : getMediaSrc(item);
  const thumbSrc = dataDir
    ? (item.localThumb ? `${dataDir}/${item.localThumb}` : item.thumbnailUrl || '')
    : (item.thumbnailUrl || '');
  const date = formatDate(item.collectedAt);
  const adPeriod = (item.adStartedAt || item.adLastShownAt)
    ? `${item.adStartedAt || '?'} ~ ${item.adLastShownAt || '진행중'}`
    : null;

  const platColor: Record<string, string> = {
    meta: '#1877f2', google: '#ea4335', naver_bs: '#03c75a',
  };

  return (
    <div
      style={{ background: '#1a1a24', border: '1px solid #2e2e3e', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.2s, border-color 0.2s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#6c63ff'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.borderColor = '#2e2e3e'; }}
      onClick={() => onClick(item)}
    >
      {/* 미디어 */}
      <div style={{ position: 'relative', aspectRatio: '1/1', background: '#22222f', overflow: 'hidden' }}>
        {item.mediaType === 'video' ? (
          <>
            {(thumbSrc && !imgError) ? (
              <img src={thumbSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImgError(true)} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', color: '#8888aa' }}>🎬</div>
            )}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
              <svg width="36" height="36" fill="rgba(255,255,255,0.85)" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </>
        ) : (mediaSrc && !imgError) ? (
          <img src={mediaSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImgError(true)} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', color: '#8888aa' }}>🖼️</div>
        )}

        {/* 플랫폼 뱃지 */}
        <span style={{ position: 'absolute', top: '7px', left: '7px', background: platColor[item.platform] || '#666', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', textTransform: 'uppercase' }}>
          {item.platform}
        </span>

        {/* 영상 뱃지 */}
        {item.mediaType === 'video' && (
          <span style={{ position: 'absolute', top: '7px', right: '30px', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: '9px', padding: '2px 5px', borderRadius: '3px' }}>VIDEO</span>
        )}

        {/* 즐겨찾기 버튼 */}
        <button
          style={{ position: 'absolute', top: '5px', right: '7px', background: 'rgba(0,0,0,0.55)', border: 'none', color: isFavorited ? '#fbbf24' : 'rgba(255,255,255,0.5)', fontSize: '16px', padding: '2px 5px', borderRadius: '4px', cursor: 'pointer', lineHeight: 1 }}
          onClick={e => { e.stopPropagation(); onToggleFav(item.id); }}
        >
          {isFavorited ? '★' : '☆'}
        </button>
      </div>

      {/* 카드 본문 */}
      <div style={{ padding: '9px 11px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e2f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.advertiserName || `#${item.keyword} 관련 광고`}
        </div>
        {item.headline && (
          <div style={{ fontSize: '10px', color: '#c4c4d4', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.headline}</div>
        )}
        <div style={{ fontSize: '10px', color: '#a78bfa', marginTop: '2px' }}>#{item.keyword}</div>
        {item.copyText && (
          <div style={{ fontSize: '10px', color: '#8888aa', marginTop: '3px', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
            {item.copyText}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
          <span style={{ fontSize: '9px', color: '#8888aa' }}>{adPeriod || date}</span>
          {item.landingUrl && (
            <a href={item.landingUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '9px', color: '#a78bfa', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90px' }}
              onClick={e => e.stopPropagation()}>
              ↗ 랜딩
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
