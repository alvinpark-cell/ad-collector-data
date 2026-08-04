'use client';

import { useEffect, useState } from 'react';
import BubbleChart from './BubbleChart';
import InsightBox from './InsightBox';

interface KeywordCount { keyword: string; code?: string | null; investing: number; total: number; sampleReactions?: string[]; }
interface CommunityTrendData {
  updatedAt: string;
  general: KeywordCount[];
  brand: KeywordCount[];
  generalInsight?: string;
  brandInsight?: string;
}

function ReactionSamples({ items }: { items: KeywordCount[] }) {
  const withReactions = items.filter(i => i.sampleReactions && i.sampleReactions.length > 0);
  if (withReactions.length === 0) return null;
  return (
    <div style={{ marginTop: '14px' }}>
      <p style={{ fontSize: '12px', fontWeight: 700, color: '#c4c4d4', marginBottom: '8px' }}>💬 커뮤니티 실제 반응 (네이버 종목토론실)</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {withReactions.map(i => (
          <div key={i.keyword} style={{ background: '#22222f', border: '1px solid #2e2e3e', borderRadius: '8px', padding: '10px 14px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#a78bfa', marginBottom: '6px' }}>{i.keyword}</p>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {i.sampleReactions!.map((t, idx) => (
                <li key={idx} style={{ fontSize: '11px', color: '#c4c4d4' }}>{t}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CommunityTrend() {
  const [data, setData] = useState<CommunityTrendData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/community_trend.json')
      .then(r => r.json())
      .then((json: CommunityTrendData) => setData(json))
      .catch(e => setError(e instanceof Error ? e.message : '조회 실패'));
  }, []);

  if (error) return <p style={{ fontSize: '13px', color: '#f87171' }}>커뮤니티 반응 데이터를 불러오지 못했습니다: {error}</p>;
  if (!data) return <p style={{ fontSize: '13px', color: '#8888aa' }}>불러오는 중...</p>;

  return (
    <div>
      <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>커뮤니티 반응</h2>
      <p style={{ fontSize: '12px', color: '#8888aa', marginBottom: '4px' }}>
        인베스팅닷컴 검색 결과 건수를 기준으로 한 키워드별 상대적 관심도 (절대 언급량이 아닌 스냅샷 비교용 지표)
      </p>
      <p style={{ fontSize: '10px', color: '#555568', marginBottom: '24px' }}>
        최근 갱신: {new Date(data.updatedAt).toLocaleString('ko-KR')}
      </p>

      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, color: '#e2e2f0', marginBottom: '10px' }}>
          주식/투자/증권 실시간 인기검색 키워드
        </p>
        <p style={{ fontSize: '10px', color: '#555568', marginBottom: '10px' }}>
          고정 목록이 아니라, 매 수집 시점 네이버 금융 실시간 인기검색 종목 상위 {data.general.length}개를 그대로 가져옵니다.
        </p>
        <div style={{ background: 'rgba(26,26,36,0.8)', border: '1px solid #2e2e3e', borderRadius: '12px', padding: '18px', marginBottom: '14px' }}>
          <BubbleChart data={data.general.map(g => ({ keyword: g.keyword, count: g.total }))} />
        </div>
        <InsightBox title="🧠 일반 키워드 인사이트" text={data.generalInsight || '인사이트 없음'} />
        <ReactionSamples items={data.general} />
      </section>

      <section>
        <p style={{ fontSize: '13px', fontWeight: 700, color: '#e2e2f0', marginBottom: '10px' }}>
          메리츠증권 관련 키워드
        </p>
        <div style={{ background: 'rgba(26,26,36,0.8)', border: '1px solid #2e2e3e', borderRadius: '12px', padding: '18px', marginBottom: '14px' }}>
          <BubbleChart data={data.brand.map(b => ({ keyword: b.keyword, count: b.total }))} />
        </div>
        <InsightBox title="🧠 메리츠증권 키워드 인사이트" text={data.brandInsight || '인사이트 없음'} />
      </section>
    </div>
  );
}
