'use client';

import { useEffect, useMemo, useState } from 'react';

interface TrendRecord {
  year: number; month: number; company: string; brand: string; appName: string;
  aosMau: number; iosMau: number; newInstalls: number;
  malePct: number; femalePct: number;
  age10: number; age20: number; age30: number; age40: number; age50: number; age60: number;
}

// 팀 구글 시트의 "구분" 코드 -> 표시 순서/브랜드명. 이미지 리포트와 동일한 순서를 유지.
const COMPANY_ORDER = ['메리츠', '삼성', '미래', 'NH', 'KB', '신한', '한투', '키움', '토스'];
const COMPANY_LABEL: Record<string, string> = {
  메리츠: '메리츠증권', 삼성: '삼성증권', 미래: '미래에셋증권', NH: 'NH투자증권',
  KB: 'KB증권', 신한: '신한투자증권', 한투: '한국투자증권', 키움: '키움증권', 토스: '토스증권',
};
const CLIENT_COMPANY = '메리츠';
const COLORS: Record<string, string> = {
  메리츠: 'var(--accent)', 삼성: '#e05a7a', 미래: 'var(--success)', NH: '#facc15',
  KB: 'var(--accent-text)', 신한: '#f472b6', 한투: 'var(--text-muted)', 키움: '#e0a030', 토스: '#3aa0e0',
};

function monthKey(y: number, m: number) { return `${y}-${String(m).padStart(2, '0')}`; }
function fmt(n: number) { return Math.round(n).toLocaleString('ko-KR'); }
function pctChange(cur: number, prev: number) { return prev === 0 ? null : ((cur - prev) / prev) * 100; }

function downloadCsv(records: TrendRecord[]) {
  const headers = ['연도', '월', '구분', '앱 이름', 'AOS MAU', 'iOS MAU', '신규설치', '남%', '여%', '10대', '20대', '30대', '40대', '50대', '60대+'];
  const rows = records.map(r => [
    r.year, r.month, r.company, r.appName, r.aosMau, r.iosMau, r.newInstalls,
    r.malePct, r.femalePct, r.age10, r.age20, r.age30, r.age40, r.age50, r.age60,
  ]);
  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trend_report_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TrendReport() {
  const [records, setRecords] = useState<TrendRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/trend_report.json')
      .then(r => r.json())
      .then(json => setRecords(json.records || []))
      .catch(e => setError(e instanceof Error ? e.message : '조회 실패'));
  }, []);

  const months = useMemo(
    () => Array.from(new Set(records.map(r => monthKey(r.year, r.month)))).sort(),
    [records]
  );
  const last3Months = months.slice(-3);
  const [currentMonth, prevMonth] = [months[months.length - 1], months[months.length - 2]];

  const byCompanyMonth = useMemo(() => {
    const map = new Map<string, TrendRecord>();
    records.forEach(r => map.set(`${r.company}::${monthKey(r.year, r.month)}`, r));
    return map;
  }, [records]);

  const companies = COMPANY_ORDER.filter(c => records.some(r => r.company === c));

  if (error) return <p style={{ fontSize: '15px', color: 'var(--danger)' }}>트렌드 리포트를 불러오지 못했습니다: {error}</p>;
  if (records.length === 0) return <p style={{ fontSize: '15px', color: 'var(--text-muted)' }}>트렌드 리포트 데이터가 아직 없습니다.</p>;

  // 1) 전월 대비 MAU/신규설치 증감
  const momRows = companies.map(c => {
    const cur = byCompanyMonth.get(`${c}::${currentMonth}`);
    const prev = byCompanyMonth.get(`${c}::${prevMonth}`);
    const curMau = cur ? cur.aosMau + cur.iosMau : 0;
    const prevMau = prev ? prev.aosMau + prev.iosMau : 0;
    return {
      company: c, appName: cur?.appName || prev?.appName || '',
      curMau, prevMau, mauChange: pctChange(curMau, prevMau),
      curInstalls: cur?.newInstalls || 0, prevInstalls: prev?.newInstalls || 0,
      installChange: pctChange(cur?.newInstalls || 0, prev?.newInstalls || 0),
    };
  });

  // 2) 최근 3개월 MAU 추이 (라인차트) - 토스는 다른 브랜드보다 MAU가 한 자릿수 이상 커서
  // 같은 축에 그리면 나머지 8개가 거의 바닥에 붙어버린다. 토스만 우측 보조축을 따로 써서
  // 나머지 브랜드들의 증감이 잘 보이게 한다.
  const width = 720, height = 260, padLeft = 60, padBottom = 28, padTop = 16, padRight = 60;
  const plotW = width - padLeft - padRight, plotH = height - padTop - padBottom;
  const mauOf = (c: string, m: string) => {
    const r = byCompanyMonth.get(`${c}::${m}`);
    return r ? r.aosMau + r.iosMau : 0;
  };
  const secondaryCompanies = companies.filter(c => c === '토스');
  const primaryCompanies = companies.filter(c => c !== '토스');
  const primaryMax = Math.max(...primaryCompanies.flatMap(c => last3Months.map(m => mauOf(c, m))), 1);
  const secondaryMax = Math.max(...secondaryCompanies.flatMap(c => last3Months.map(m => mauOf(c, m))), 1);
  const xFor = (i: number) => padLeft + (last3Months.length <= 1 ? 0 : (i / (last3Months.length - 1)) * plotW);
  const yForPrimary = (v: number) => padTop + plotH - (v / primaryMax) * plotH;
  const yForSecondary = (v: number) => padTop + plotH - (v / secondaryMax) * plotH;
  const primaryLines = primaryCompanies.map(c => ({
    company: c,
    points: last3Months.map((m, i) => `${xFor(i)},${yForPrimary(mauOf(c, m))}`).join(' '),
  }));
  const secondaryLines = secondaryCompanies.map(c => ({
    company: c,
    points: last3Months.map((m, i) => `${xFor(i)},${yForSecondary(mauOf(c, m))}`).join(' '),
  }));

  return (
    <div>
      <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>트렌드 리포트</h2>
      <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
        팀 구글 시트 기준 · 최근 데이터 {currentMonth} (구글 시트에서 정기적으로 다시 받아와 갱신됩니다)
      </p>
      <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '24px' }}>
        * MAU·신규설치 단위: 명 · 증감률(%) = (이번달 - 전월) / 전월 × 100 · 성별/연령대는 최근 3개월 평균 비중(%)
      </p>

      {/* 전월 대비 증감 */}
      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
          앱별 전월 대비 MAU·신규설치 증감 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({prevMonth} → {currentMonth}, MAU는 AOS+iOS 합계)</span>
        </p>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px', minWidth: '720px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['앱 이름', '이번달 MAU', '전월 MAU', 'MAU 증감', '이번달 신규설치', '전월 신규설치', '신규설치 증감'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {momRows.map(row => (
                <tr key={row.company} style={{ borderBottom: '1px solid rgba(var(--border-rgb),0.4)', background: row.company === CLIENT_COMPANY ? 'rgba(var(--accent-rgb),0.06)' : 'transparent' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{COMPANY_LABEL[row.company]}</span>
                    {row.company === CLIENT_COMPANY && <span style={{ marginLeft: '6px', background: 'rgba(var(--accent-rgb),0.4)', color: 'var(--accent-text)', fontSize: '12px', fontWeight: 600, padding: '1px 6px', borderRadius: '3px' }}>client</span>}
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{row.appName}</div>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(row.curMau)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(row.prevMau)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: (row.mauChange ?? 0) >= 0 ? 'var(--danger)' : '#3aa0e0', fontWeight: 600 }}>
                    {row.mauChange === null ? '-' : `${row.mauChange >= 0 ? '▲' : '▼'} ${Math.abs(row.mauChange).toFixed(1)}%`}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(row.curInstalls)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(row.prevInstalls)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: (row.installChange ?? 0) >= 0 ? 'var(--danger)' : '#3aa0e0', fontWeight: 600 }}>
                    {row.installChange === null ? '-' : `${row.installChange >= 0 ? '▲' : '▼'} ${Math.abs(row.installChange).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3개월 MAU 추이 */}
      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
          최근 3개월 앱별 MAU 추이 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(AOS+iOS 합계 · 토스증권은 MAU 규모가 커서 우측 보조축 사용)</span>
        </p>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '10px' }}>
            {companies.map(c => (
              <span key={c} style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: COLORS[c], display: 'inline-block' }} />
                {COMPANY_LABEL[c]}{c === '토스' && ' (우측 축)'}
              </span>
            ))}
          </div>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '260px' }}>
            {[0, 0.25, 0.5, 0.75, 1].map(f => (
              <line key={f} x1={padLeft} y1={padTop + plotH * f} x2={width - padRight} y2={padTop + plotH * f} stroke="var(--border)" strokeWidth="1" strokeDasharray="3,3" />
            ))}
            {primaryLines.map(l => <polyline key={l.company} points={l.points} fill="none" stroke={COLORS[l.company]} strokeWidth="2" />)}
            {secondaryLines.map(l => <polyline key={l.company} points={l.points} fill="none" stroke={COLORS[l.company]} strokeWidth="2" strokeDasharray="5,3" />)}
            {/* 좌측 축 (토스 제외 8개 브랜드) */}
            {[0, 0.5, 1].map(f => (
              <text key={f} x={padLeft - 8} y={padTop + plotH * (1 - f) + 4} fontSize="10" fill="var(--text-muted)" textAnchor="end">{fmt(primaryMax * f)}</text>
            ))}
            {/* 우측 축 (토스) */}
            {secondaryLines.length > 0 && [0, 0.5, 1].map(f => (
              <text key={f} x={width - padRight + 8} y={padTop + plotH * (1 - f) + 4} fontSize="10" fill={COLORS['토스']} textAnchor="start">{fmt(secondaryMax * f)}</text>
            ))}
            {last3Months.map((m, i) => (
              <text key={m} x={xFor(i)} y={height - 8} fontSize="10" fill="var(--text-muted)" textAnchor="middle">{m.slice(0, 4)}년 {m.slice(5)}월</text>
            ))}
          </svg>
        </div>
      </section>

      {/* 3개월 한눈에 보기 */}
      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
          최근 3개월 한눈에 보기 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(9개 앱 · 최근 3개월 MAU 및 최근 3개월 평균 성별/연령대 비중)</span>
        </p>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '900px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th rowSpan={2} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>구분</th>
                <th colSpan={last3Months.length} style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>MAU (AOS+iOS)</th>
                <th colSpan={2} style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>최근 3개월 평균 성별</th>
                <th colSpan={6} style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>최근 3개월 평균 연령대</th>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {last3Months.map(m => <th key={m} style={{ padding: '4px 12px', textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>{m}</th>)}
                <th style={{ padding: '4px 12px', textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>남%</th>
                <th style={{ padding: '4px 12px', textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>여%</th>
                {['10대', '20대', '30대', '40대', '50대', '60대+'].map(a => (
                  <th key={a} style={{ padding: '4px 12px', textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map(c => {
                const recs = last3Months.map(m => byCompanyMonth.get(`${c}::${m}`)).filter((r): r is TrendRecord => !!r);
                const avg = (key: keyof TrendRecord) => recs.length ? recs.reduce((s, r) => s + (r[key] as number), 0) / recs.length : 0;
                return (
                  <tr key={c} style={{ borderBottom: '1px solid rgba(var(--border-rgb),0.4)', background: c === CLIENT_COMPANY ? 'rgba(var(--accent-rgb),0.06)' : 'transparent' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{COMPANY_LABEL[c]}</td>
                    {last3Months.map(m => {
                      const r = byCompanyMonth.get(`${c}::${m}`);
                      return <td key={m} style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{r ? fmt(r.aosMau + r.iosMau) : '-'}</td>;
                    })}
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{avg('malePct').toFixed(1)}%</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{avg('femalePct').toFixed(1)}%</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{avg('age10').toFixed(1)}%</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{avg('age20').toFixed(1)}%</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{avg('age30').toFixed(1)}%</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{avg('age40').toFixed(1)}%</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{avg('age50').toFixed(1)}%</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{avg('age60').toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Raw 데이터 */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Raw 데이터 전체 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(전체 월 · 전체 인덱스 항상 표시)</span>
          </p>
          <button onClick={() => downloadCsv(records)}
            style={{ fontSize: '14px', color: 'var(--accent-text)', background: 'var(--accent-soft)', border: '1px solid rgba(var(--accent-rgb),0.3)', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer' }}>
            CSV 다운로드
          </button>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', overflowY: 'auto', overflowX: 'auto', maxHeight: '480px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '800px' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface-solid)' }}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['연도', '월', '구분', '앱 이름', 'AOS MAU', 'iOS MAU', '신규설치', '남%', '여%'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...records].sort((a, b) => (b.year - a.year) || (b.month - a.month) || a.company.localeCompare(b.company)).map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(var(--border-rgb),0.3)' }}>
                  <td style={{ padding: '6px 10px' }}>{r.year}</td>
                  <td style={{ padding: '6px 10px' }}>{r.month}월</td>
                  <td style={{ padding: '6px 10px' }}>{COMPANY_LABEL[r.company] || r.company}</td>
                  <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{r.appName}</td>
                  <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{fmt(r.aosMau)}</td>
                  <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{fmt(r.iosMau)}</td>
                  <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{fmt(r.newInstalls)}</td>
                  <td style={{ padding: '6px 10px' }}>{r.malePct.toFixed(1)}%</td>
                  <td style={{ padding: '6px 10px' }}>{r.femalePct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
