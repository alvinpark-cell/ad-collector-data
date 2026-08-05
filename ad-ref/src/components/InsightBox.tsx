// Claude CLI가 만든 인사이트 텍스트("첫 줄 요약 + '- '로 시작하는 불릿 여러 줄" 포맷)를
// 줄글이 아니라 한눈에 훑어볼 수 있는 카드로 렌더링하는 공용 컴포넌트.
// insightClient.js의 buildInsightPrompt가 강제하는 포맷과 짝을 이룬다.

const NO_INSIGHT_TEXT = '인사이트 없음';

function parseInsight(text: string): { summary: string; points: string[] } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const points: string[] = [];
  let summary = '';
  for (const line of lines) {
    if (line.startsWith('- ')) points.push(line.slice(2).trim());
    else if (!summary) summary = line;
    else points.push(line);
  }
  return { summary, points };
}

export default function InsightBox({
  title, badge, text,
}: {
  title: string;
  badge?: string;
  text: string;
}) {
  const isEmpty = text.trim() === NO_INSIGHT_TEXT;

  return (
    <div style={{
      background: isEmpty ? 'rgba(var(--text-muted-rgb),0.06)' : 'rgba(var(--accent-rgb),0.08)',
      border: `1px solid ${isEmpty ? 'rgba(var(--text-muted-rgb),0.18)' : 'rgba(var(--accent-rgb),0.25)'}`,
      borderRadius: '14px', padding: '20px 22px', marginBottom: '24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: isEmpty ? 0 : '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: isEmpty ? 'var(--text-muted)' : 'var(--accent-text)' }}>{title}</span>
        {badge && <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{badge}</span>}
      </div>
      {isEmpty ? (
        <p style={{ fontSize: '15px', color: 'var(--text-muted)' }}>분석할 만한 소재가 아직 충분하지 않습니다.</p>
      ) : (() => {
        const { summary, points } = parseInsight(text);
        return (
          <>
            {summary && (
              <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: points.length ? '10px' : 0 }}>
                {summary}
              </p>
            )}
            {points.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {points.map((p, i) => (
                  <li key={i} style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{p}</li>
                ))}
              </ul>
            )}
          </>
        );
      })()}
    </div>
  );
}
