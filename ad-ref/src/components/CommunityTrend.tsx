'use client';

import { useEffect, useState } from 'react';
import BubbleChart from './BubbleChart';
import InsightBox from './InsightBox';

interface KeywordCount { keyword: string; investing: number; total: number; }
interface CommunityTrendData {
  updatedAt: string;
  general: KeywordCount[];
  brand: KeywordCount[];
  generalInsight?: string;
  brandInsight?: string;
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
          주식/투자/증권 관련 일반 키워드
        </p>
        <div style={{ background: 'rgba(26,26,36,0.8)', border: '1px solid #2e2e3e', borderRadius: '12px', padding: '18px', marginBottom: '14px' }}>
          <BubbleChart data={data.general.map(g => ({ keyword: g.keyword, count: g.total }))} />
        </div>
        <InsightBox title="🧠 일반 키워드 인사이트" text={data.generalInsight || '인사이트 없음'} />
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
