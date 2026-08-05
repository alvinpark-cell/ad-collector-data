'use client';
import { AdItem } from '@/lib/types';
import { getMediaSrc, mediaUrl } from '@/lib/utils';

interface AdModalProps {
  item: AdItem | null;
  onClose: () => void;
  dataDir?: string;
}

export default function AdModal({ item, onClose, dataDir = '' }: AdModalProps) {
  if (!item) return null;

  const mediaSrc = dataDir
    ? (item.localPath ? mediaUrl(item.localPath, dataDir) : getMediaSrc(item))
    : getMediaSrc(item);
  const videoSrc = item.localPath ? (dataDir ? mediaUrl(item.localPath, dataDir) : item.localPath) : '';
  const thumbSrc = dataDir
    ? (item.localThumb ? mediaUrl(item.localThumb, dataDir) : item.thumbnailUrl || '')
    : (item.thumbnailUrl || '');
  const date = item.collectedAt ? new Date(item.collectedAt).toLocaleString('ko-KR') : '-';
  const adPeriod = (item.adStartedAt || item.adLastShownAt)
    ? `${item.adStartedAt || '?'} ~ ${item.adLastShownAt || '진행 중'}`
    : null;

  const placementLabel: Record<string, string> = {
    facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger', audience_network: 'Audience Network',
  };
  const placementsDisplay = item.placements
    ? item.placements.split(',').map(p => placementLabel[p] || p).join(' · ')
    : '-';

  const fields: [string, string][] = [
    ['플랫폼', item.platform],
    ['노출 매체', placementsDisplay],
    ['광고주', item.advertiserName || '-'],
    ['키워드', item.keyword || '-'],
    ['수집일', date],
    ['게재일', adPeriod || '-'],
  ];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,6,10,0.6)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-surface-solid)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
          width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-card-hover)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, background: 'var(--bg-surface-solid)', zIndex: 1, borderTopLeftRadius: 'var(--radius-card)', borderTopRightRadius: 'var(--radius-card)' }}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{item.advertiserName || '광고 상세'}</span>
          <button onClick={onClose} style={{
            width: '28px', height: '28px', borderRadius: '50%', background: 'var(--bg-elevated)', border: 'none',
            color: 'var(--text-muted)', fontSize: '15px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* 본문 */}
        <div style={{ padding: '22px' }}>
          {/* 미디어 */}
          {item.mediaType === 'video' ? (
            videoSrc ? (
              <video src={videoSrc} controls poster={thumbSrc} style={{ width: '100%', borderRadius: '12px', marginBottom: '18px', maxHeight: '400px', background: '#000' }} />
            ) : thumbSrc ? (
              <>
                <img src={thumbSrc} alt="" style={{ width: '100%', borderRadius: '12px', marginBottom: '8px' }} />
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>영상 썸네일 (YouTube에서 재생)</p>
              </>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', marginBottom: '18px', background: 'var(--bg-elevated)', borderRadius: '12px' }}>미리보기 없음</div>
            )
          ) : mediaSrc ? (
            <img src={mediaSrc} alt="" style={{ width: '100%', borderRadius: '12px', marginBottom: '18px', maxHeight: '460px', objectFit: 'contain', background: 'var(--bg-elevated)' }} />
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', marginBottom: '18px', background: 'var(--bg-elevated)', borderRadius: '12px' }}>미리보기 없음</div>
          )}

          {/* 헤드라인 */}
          {item.headline && (
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px', lineHeight: 1.4 }}>{item.headline}</div>
          )}

          {/* 메타 정보 - 2열 그리드 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', background: 'var(--bg-elevated)', borderRadius: '12px', padding: '14px 16px' }}>
            {fields.map(([key, val]) => (
              <div key={key}>
                <div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>{key}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{val}</div>
              </div>
            ))}
            {item.landingUrl && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>랜딩 URL</div>
                <a href={item.landingUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: 'var(--accent-text)', wordBreak: 'break-all', textDecoration: 'none' }}>
                  {item.landingUrl}
                </a>
              </div>
            )}
          </div>

          {/* 광고 문구 */}
          {item.copyText && (
            <div style={{ marginTop: '14px', background: 'var(--bg-elevated)', borderRadius: '12px', padding: '14px 16px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.65, whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
              {item.copyText}
            </div>
          )}

          {/* 버튼들 */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{
                fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', background: 'var(--bg-elevated)',
                padding: '8px 14px', borderRadius: '20px', textDecoration: 'none',
              }}>원본 광고 보기 →</a>
            )}
            {item.mediaType === 'video' && item.mediaUrl?.includes('youtube') && (
              <a href={item.mediaUrl} target="_blank" rel="noopener noreferrer" style={{
                fontSize: '13px', fontWeight: 500, color: 'var(--danger)', background: 'var(--bg-elevated)',
                padding: '8px 14px', borderRadius: '20px', textDecoration: 'none',
              }}>YouTube에서 보기 →</a>
            )}
            {item.landingUrl && (
              <a href={item.landingUrl} target="_blank" rel="noopener noreferrer" style={{
                fontSize: '13px', fontWeight: 500, color: '#fff', background: 'var(--accent)',
                padding: '8px 14px', borderRadius: '20px', textDecoration: 'none',
              }}>랜딩 페이지 열기 →</a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
