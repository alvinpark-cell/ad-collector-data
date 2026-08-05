'use client';
import { AdItem } from '@/lib/types';
import { getMediaSrc, formatDate, mediaUrl } from '@/lib/utils';
import { useState } from 'react';

interface AdCardProps {
  item: AdItem;
  isFavorited: boolean;
  onToggleFav: (id: string) => void;
  onClick: (item: AdItem) => void;
  dataDir?: string;
}

const PLATFORM_LABEL: Record<string, string> = { meta: 'Meta', google: 'Google', naver_bs: 'Naver' };
const PLATFORM_DOT: Record<string, string> = { meta: '#5b8def', google: '#f2735c', naver_bs: '#03c75a' };

export default function AdCard({ item, isFavorited, onToggleFav, onClick, dataDir = '' }: AdCardProps) {
  const [imgError, setImgError] = useState(false);
  const mediaSrc = dataDir
    ? (item.localPath ? mediaUrl(item.localPath, dataDir) : getMediaSrc(item))
    : getMediaSrc(item);
  const thumbSrc = dataDir
    ? (item.localThumb ? mediaUrl(item.localThumb, dataDir) : item.thumbnailUrl || '')
    : (item.thumbnailUrl || '');
  const date = formatDate(item.collectedAt);
  const adPeriod = (item.adStartedAt || item.adLastShownAt)
    ? `${item.adStartedAt || '?'} ~ ${item.adLastShownAt || '진행중'}`
    : null;

  return (
    <div
      style={{
        background: 'var(--bg-surface-solid)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)', overflow: 'hidden', cursor: 'pointer',
        boxShadow: 'var(--shadow-card)', transition: 'transform 0.18s ease, box-shadow 0.18s ease',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-card-hover)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-card)'; }}
      onClick={() => onClick(item)}
    >
      {/* 미디어 */}
      <div style={{ position: 'relative', aspectRatio: '1/1', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
        {item.mediaType === 'video' ? (
          <>
            {(thumbSrc && !imgError) ? (
              <img src={thumbSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImgError(true)} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', color: 'var(--text-muted)' }}>🎬</div>
            )}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.18)', pointerEvents: 'none' }}>
              <span style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" fill="#1a1a24" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              </span>
            </div>
          </>
        ) : (mediaSrc && !imgError) ? (
          <img src={mediaSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImgError(true)} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', color: 'var(--text-muted)' }}>🖼️</div>
        )}

        {/* 즐겨찾기 버튼 - 우상단, 글래스 스타일 */}
        <button
          style={{
            position: 'absolute', top: '8px', right: '8px', width: '26px', height: '26px', borderRadius: '50%',
            background: 'rgba(15,15,20,0.5)', backdropFilter: 'blur(4px)', border: 'none',
            color: isFavorited ? '#fbbf24' : 'rgba(255,255,255,0.75)', fontSize: '14px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}
          onClick={e => { e.stopPropagation(); onToggleFav(item.id); }}
        >
          {isFavorited ? '★' : '☆'}
        </button>

        {/* 영상 뱃지 */}
        {item.mediaType === 'video' && (
          <span style={{
            position: 'absolute', top: '8px', left: '8px', background: 'rgba(15,15,20,0.55)', backdropFilter: 'blur(4px)',
            color: '#fff', fontSize: '10px', fontWeight: 600, padding: '3px 7px', borderRadius: '20px', letterSpacing: '0.03em',
          }}>VIDEO</span>
        )}
      </div>

      {/* 카드 본문 */}
      <div style={{ padding: '12px 13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: PLATFORM_DOT[item.platform] || '#999', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {PLATFORM_LABEL[item.platform] || item.platform}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-faint)' }}>{adPeriod || date}</span>
        </div>

        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.advertiserName || `#${item.keyword} 관련 광고`}
        </div>
        {item.headline && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.headline}</div>
        )}
        {item.copyText && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
            {item.copyText}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '9px' }}>
          <span style={{
            fontSize: '11px', color: 'var(--accent-text)', background: 'var(--accent-soft)',
            padding: '2px 8px', borderRadius: '20px', fontWeight: 500,
          }}>#{item.keyword}</span>
          {item.landingUrl && (
            <a href={item.landingUrl} target="_blank" rel="noopener noreferrer"
              style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90px' }}
              onClick={e => e.stopPropagation()}>
              랜딩 ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
