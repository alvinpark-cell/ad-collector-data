'use client';
import { AdItem } from '@/lib/types';
import { getMediaSrc } from '@/lib/utils';

interface AdModalProps {
  item: AdItem | null;
  onClose: () => void;
  dataDir?: string;
}

export default function AdModal({ item, onClose, dataDir = '' }: AdModalProps) {
  if (!item) return null;

  const mediaSrc = dataDir
    ? (item.localPath ? `${dataDir}/${item.localPath}` : getMediaSrc(item))
    : getMediaSrc(item);
  const thumbSrc = dataDir
    ? (item.localThumb ? `${dataDir}/${item.localThumb}` : item.thumbnailUrl || '')
    : (item.thumbnailUrl || '');
  const date = item.collectedAt ? new Date(item.collectedAt).toLocaleString('ko-KR') : '-';
  const adPeriod = (item.adStartedAt || item.adLastShownAt)
    ? `${item.adStartedAt || '?'} ~ ${item.adLastShownAt || '진행 중'}`
    : null;

  const placementLabel: Record<string, string> = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    messenger: 'Messenger',
    audience_network: 'Audience Network',
  };
  const placementsDisplay = item.placements
    ? item.placements.split(',').map(p => placementLabel[p] || p).join(' · ')
    : '-';

  const rows: [string, string][] = [
    ['플랫폼', item.platform],
    ['노출 매체', placementsDisplay],
    ['광고주', item.advertiserName || '-'],
    ['키워드', item.keyword || '-'],
    ['수집일', date],
    ['게재일', adPeriod || '-'],
  ];
  if (item.headline) rows.push(['헤드라인', item.headline]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#1a1a24', border: '1px solid #2e2e3e', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #2e2e3e', position: 'sticky', top: 0, background: '#1a1a24', zIndex: 1 }}>
          <span style={{ fontWeight: 600, color: '#e2e2f0' }}>{item.advertiserName || '광고 상세'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8888aa', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* 본문 */}
        <div style={{ padding: '20px' }}>
          {/* 미디어 */}
          {item.mediaType === 'video' ? (
            item.mediaUrl ? (
              <video src={item.mediaUrl} controls poster={thumbSrc} style={{ width: '100%', borderRadius: '8px', marginBottom: '16px', maxHeight: '400px', background: '#000' }} />
            ) : thumbSrc ? (
              <>
                <img src={thumbSrc} alt="" style={{ width: '100%', borderRadius: '8px', marginBottom: '8px' }} />
                <p style={{ fontSize: '11px', color: '#8888aa', marginBottom: '16px' }}>영상 썸네일 (YouTube에서 재생)</p>
              </>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: '#8888aa', marginBottom: '16px' }}>미리보기 없음</div>
            )
          ) : mediaSrc ? (
            <img src={mediaSrc} alt="" style={{ width: '100%', borderRadius: '8px', marginBottom: '16px', maxHeight: '500px', objectFit: 'contain', background: '#0f0f13' }} />
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: '#8888aa', marginBottom: '16px' }}>미리보기 없음</div>
          )}

          {/* 메타 정보 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {rows.map(([key, val]) => (
              <div key={key} style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                <span style={{ color: '#8888aa', minWidth: '76px', flexShrink: 0 }}>{key}</span>
                <span style={{ color: '#e2e2f0', wordBreak: 'break-all' }}>{val}</span>
              </div>
            ))}
            {item.landingUrl && (
              <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                <span style={{ color: '#8888aa', minWidth: '76px', flexShrink: 0 }}>랜딩 URL</span>
                <a href={item.landingUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa', wordBreak: 'break-all', textDecoration: 'none' }}>
                  {item.landingUrl}
                </a>
              </div>
            )}
          </div>

          {/* 광고 문구 */}
          {item.copyText && (
            <div style={{ marginTop: '12px', background: '#22222f', borderRadius: '8px', padding: '12px', fontSize: '11px', color: '#c4c4d4', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
              {item.copyText}
            </div>
          )}

          {/* 버튼들 */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '14px', flexWrap: 'wrap' }}>
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa', fontSize: '12px', textDecoration: 'none' }}>
                원본 광고 보기 →
              </a>
            )}
            {item.mediaType === 'video' && item.mediaUrl?.includes('youtube') && (
              <a href={item.mediaUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#f87171', fontSize: '12px', textDecoration: 'none' }}>
                YouTube에서 보기 →
              </a>
            )}
            {item.landingUrl && (
              <a href={item.landingUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#34d399', fontSize: '12px', textDecoration: 'none' }}>
                랜딩 페이지 열기 →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
