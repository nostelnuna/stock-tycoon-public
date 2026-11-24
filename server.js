const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 10000,
  pingTimeout: 20000,
});

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '20822';
const STARTING_CASH = 1000000; // 100만 원

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/api/qr', async (req, res) => {
  try {
    const targetUrl = req.query.url || `${req.protocol}://${req.get('host')}/`;
    const dataUrl = await QRCode.toDataURL(targetUrl, {
      width: 320,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
    res.json({ dataUrl, targetUrl });
  } catch (err) {
    res.status(500).json({ error: 'QR 생성 실패' });
  }
});

// ---------------------------------------------------------------------------
// 가상 상장 종목 (10개 업종/테마)
// ---------------------------------------------------------------------------
const STOCK_CATALOG = [
  {
    code: 'SEMI',
    name: '한빛반도체',
    sector: '반도체',
    emoji: '💾',
    initialPrice: 12000,
    volatility: 'HIGH',
    desc: 'AI 가속기용 HBM 및 파운드리 주력 기업. 글로벌 설비투자 및 수출 규제에 민감.',
  },
  {
    code: 'AUTO',
    name: '태극모터스',
    sector: '자동차',
    emoji: '🚗',
    initialPrice: 10000,
    volatility: 'MEDIUM',
    desc: '하이브리드·전기차 글로벌 완성차 제조사. 북미 판매량과 환율·관세 영향이 큼.',
  },
  {
    code: 'AIRL',
    name: '스카이항공',
    sector: '항공',
    emoji: '✈️',
    initialPrice: 8000,
    volatility: 'HIGH',
    desc: '국제선 여객 및 항공 화물 운송사. 국제 유가·환율·여행 수요에 따라 크게 등락.',
  },
  {
    code: 'FINC',
    name: '세이프금융',
    sector: '금융',
    emoji: '🏦',
    initialPrice: 10000,
    volatility: 'LOW',
    desc: '대형 금융지주. 금리 변동 및 대출·건전성 지표에 따라 주가가 움직이는 대표 가치주.',
  },
  {
    code: 'CONS',
    name: '데일리푸드',
    sector: '소비재',
    emoji: '🛒',
    initialPrice: 7000,
    volatility: 'LOW',
    desc: '필수 식음료·유통 기업. 경기 방어주 성격이 강하며 원재료 곡물가와 내수 소비에 연동.',
  },
  {
    code: 'COSM',
    name: '루나코스메틱',
    sector: '화장품',
    emoji: '💄',
    initialPrice: 9000,
    volatility: 'HIGH',
    desc: 'K-뷰티 글로벌 수출 및 면세점 주력 브랜드. 해외 직구·인바운드 관광객 증가 시 강세.',
  },
  {
    code: 'CHEM',
    name: '넥스트케미칼',
    sector: '석유화학',
    emoji: '🧪',
    initialPrice: 9000,
    volatility: 'MEDIUM',
    desc: '기초 유분 및 첨단 스페셜티 소재 기업. 국제 유가(나프타 원가)와 글로벌 경기 사이클 반영.',
  },
  {
    code: 'STEL',
    name: '대한철강',
    sector: '철강',
    emoji: '🏗️',
    initialPrice: 8000,
    volatility: 'MEDIUM',
    desc: '자동차강판·조선 후판 공급사. 건설 경기, 중국발 공급 과잉, 인프라 투자와 직결.',
  },
  {
    code: 'CNST',
    name: '에코건설',
    sector: '건설',
    emoji: '🏢',
    initialPrice: 8000,
    volatility: 'HIGH',
    desc: '국내외 플랜트·주택·SOC 시공 기업. 기준금리, 부동산 PF 리스크, 해외 수주에 민감.',
  },
  {
    code: 'BIOH',
    name: '넥스바이오',
    sector: '바이오',
    emoji: '🧬',
    initialPrice: 11000,
    volatility: 'HIGH',
    desc: '신약 파이프라인 및 바이오시밀러 개발사. 임상 결과 및 기술수출 공시에 따라 급등락.',
  },
  {
    code: 'CRYP',
    name: '비트체인',
    sector: '가상자산',
    emoji: '🪙',
    initialPrice: 10000,
    volatility: 'HIGH',
    desc: '디지털 자산 거래소 및 블록체인 인프라 기업. 글로벌 유동성·규제·ETF 자금 흐름에 극도로 민감.',
  },
  {
    code: 'ENRG',
    name: '그린파워',
    sector: '에너지',
    emoji: '⚡',
    initialPrice: 9000,
    volatility: 'MEDIUM',
    desc: '신재생 발전·전력망·원자력 인프라 기업. AI 데이터센터 전력 수요와 에너지 정책에 연동.',
  },
];

// ---------------------------------------------------------------------------
// 라운드별 시황 브리핑 덱 (32종)
// - EASY: 직관적 정보 (±10% 이내 소폭 변동)
// - HARD: 거시·밸류체인·원가·선반영 등 복합 추론 필요 (±10% ~ ±30% 고변동)
// ---------------------------------------------------------------------------
const MARKET_NEWS_DECK = [
  // --- EASY (±10% 이내) ---
  {
    id: 'E01',
    difficulty: 'EASY',
    title: '국내 주요 편의점·마트 3분기 객단가 소폭 상승',
    summary: '가공식품 및 간편식 수요가 꾸준히 이어지며 데일리푸드 매출이 전년 동기 대비 4%대 완만한 증가세를 기록했습니다.',
    impacts: { CONS: 0.06 },
    outcomeNote: '내수 식음료 수요 유지로 데일리푸드가 소폭 상승했습니다.',
  },
  {
    id: 'E02',
    difficulty: 'EASY',
    title: '주요 시중은행 가계대출 연체율 안정세 유지',
    summary: '세이프금융의 대손충당금 적립 부담이 시장 예상치에 부합하며 안정적인 분기 실적이 전망됩니다.',
    impacts: { FINC: 0.05 },
    outcomeNote: '건전성 지표 안정으로 세이프금융이 완만히 올랐습니다.',
  },
  {
    id: 'E03',
    difficulty: 'EASY',
    title: '신차 출시 대기 수요 일부 이연… 내수 출하량 보합',
    summary: '태극모터스 페이스리프트 모델 대기 수요로 단기 국내 판매가 주춤했으나, 해외 판매가 이를 상쇄하고 있습니다.',
    impacts: { AUTO: -0.04 },
    outcomeNote: '단기 출하량 둔화로 태극모터스가 소폭 하락했습니다.',
  },
  {
    id: 'E04',
    difficulty: 'EASY',
    title: '면세점 K-뷰티 팝업스토어 방문객 증가',
    summary: '주말 관광객 유입에 힘입어 루나코스메틱 주요 매장 매출이 전주 대비 소폭 개선되었습니다.',
    impacts: { COSM: 0.07 },
    outcomeNote: '오프라인 매장 매출 개선으로 루나코스메틱이 소폭 상승했습니다.',
  },
  {
    id: 'E05',
    difficulty: 'EASY',
    title: '유럽향 철강 쿼터 소진 임박… 단기 선적 속도 조절',
    summary: '대한철강의 분기 수출 물량 일부가 다음 분기로 이월되면서 단기 매출 인식이 소폭 지연될 전망입니다.',
    impacts: { STEL: -0.06 },
    outcomeNote: '수출 물량 이월로 대한철강이 소폭 하락했습니다.',
  },
  {
    id: 'E06',
    difficulty: 'EASY',
    title: '국내 주요 공항 국제선 여객 수 전월 대비 5% 증가',
    summary: '단거리 노선 탑승률이 견조하게 유지되며 스카이항공의 비수기 방어력이 확인되었습니다.',
    impacts: { AIRL: 0.06 },
    outcomeNote: '단거리 여객 호조로 스카이항공이 소폭 상승했습니다.',
  },
  {
    id: 'E07',
    difficulty: 'EASY',
    title: '글로벌 PC·모바일 메모리 재고 소진 속도 둔화',
    summary: '레거시 제품군 수요가 예상보다 더뎌 한빛반도체의 단기 가격 협상력이 다소 약화되었습니다.',
    impacts: { SEMI: -0.07 },
    outcomeNote: '레거시 메모리 수요 둔화로 한빛반도체가 소폭 하락했습니다.',
  },
  {
    id: 'E08',
    difficulty: 'EASY',
    title: '에코건설, 수도권 소규모 정비사업 시공사 선정',
    summary: '공사비 약 1,800억 원 규모의 도급 계약을 체결하며 안정적인 일감을 확보했습니다.',
    impacts: { CNST: 0.07 },
    outcomeNote: '소규모 정비사업 수주로 에코건설이 소폭 상승했습니다.',
  },
  {
    id: 'E09',
    difficulty: 'EASY',
    title: '넥스바이오, 건강기능식품 자회사 실적 개선',
    summary: '본업 외 건기식 부문 매출이 8% 늘며 연구개발비 부담을 일부 완화했습니다.',
    impacts: { BIOH: 0.06 },
    outcomeNote: '자회사 실적 개선으로 넥스바이오가 소폭 상승했습니다.',
  },
  {
    id: 'E10',
    difficulty: 'EASY',
    title: '기초 화학제품 정기보수(셧다운)로 가동률 일시 하락',
    summary: '넥스트케미칼 여수 공장 정기보수 일정에 따라 이번 달 출하량이 소폭 감소할 예정입니다.',
    impacts: { CHEM: -0.06 },
    outcomeNote: '정기보수 영향으로 넥스트케미칼이 소폭 하락했습니다.',
  },

  // --- HARD (복합 추론 필요, ±10% ~ ±30% 고변동) ---
  {
    id: 'H01',
    difficulty: 'HARD',
    title: '브렌트유 배럴당 98달러 급등 속 나프타 크래킹 마진 마이너스 전환',
    summary: '원유 정제 후 기초유분(에틸렌)을 생산할수록 손해가 나는 역마진 구조가 고착화되고 있습니다. 반면 산유국 발주 플랜트 프로젝트는 탄력을 받고 있습니다.',
    impacts: { CHEM: -0.22, AIRL: -0.24, CNST: 0.16 },
    outcomeNote: '고유가 직격탄으로 항공·석유화학이 급락한 반면, 중동 플랜트 수혜 기대감으로 건설이 급등했습니다.',
  },
  {
    id: 'H02',
    difficulty: 'HARD',
    title: '미 국채 10년물 금리 급락 및 장단기 금리차 정상화 신호',
    summary: '할인율 부담이 큰 장기 듀레이션 자산으로 글로벌 자금이 대거 이동하는 가운데, 순이자마진(NIM) 피크아웃 우려가 금융권 전반에 번지고 있습니다.',
    impacts: { BIOH: 0.24, CNST: 0.19, SEMI: 0.14, FINC: -0.15 },
    outcomeNote: '금리 하락 수혜로 바이오·건설·반도체가 급등하고, 마진 축소 우려로 금융이 하락했습니다.',
  },
  {
    id: 'H03',
    difficulty: 'HARD',
    title: '원/달러 환율 1,440원 돌파… 외화 결제 비중 높은 업종 비상',
    summary: '달러 결제 매출 비중이 75%를 넘는 수출 제조사는 환차익이 극대화되지만, 항공기 리스료와 유류비·원곡을 달러로 결제하는 내수·운송 기업은 영업외손실이 급증합니다.',
    impacts: { AUTO: 0.20, SEMI: 0.18, COSM: 0.16, AIRL: -0.24, CONS: -0.14 },
    outcomeNote: '고환율로 수출주(자동차·반도체·화장품)가 급등하고, 외화 비용이 큰 항공·소비재가 급락했습니다.',
  },
  {
    id: 'H04',
    difficulty: 'HARD',
    title: '중국 부동산 부양책 실망감… 열연강판·에틸렌 현물가 동반 신저가',
    summary: '역내 인프라 착공 지연으로 잉여 물량이 아시아 시장에 저가로 쏟아지며, 전방 산업이 아닌 기초 소재 공급사들의 판가 방어가 사실상 불가능해졌습니다.',
    impacts: { STEL: -0.24, CHEM: -0.20, AUTO: 0.12 },
    outcomeNote: '원재료 판가 하락으로 철강·화학이 급락한 반면, 강판 원가가 낮아진 자동차는 수익성이 개선되었습니다.',
  },
  {
    id: 'H05',
    difficulty: 'HARD',
    title: '글로벌 빅테크 CapEx(설비투자) 가이던스 35% 상향 vs 전력망 병목',
    summary: '데이터센터용 가속기 발주는 폭증하고 있으나, 변압기·전력 인프라 부족으로 실제 가동 시점이 일부 지연될 수 있다는 신중론이 공존합니다.',
    impacts: { SEMI: 0.25, CNST: 0.15 },
    outcomeNote: 'AI 설비투자 상향 모멘텀으로 반도체와 데이터센터 시공 기대감의 건설이 동반 급등했습니다.',
  },
  {
    id: 'H06',
    difficulty: 'HARD',
    title: '지방 미분양 7만 호 돌파 및 브릿지론 연장 거부 사례 속출',
    summary: '자금 경색 리스크가 시공사 책임준공 물량으로 전이되고 있으며, 주요 금융지주 역시 PF 충당금 추가 적립 압박에서 자유롭지 못한 상황입니다.',
    impacts: { CNST: -0.28, STEL: -0.17, FINC: -0.13 },
    outcomeNote: 'PF 부실 우려 확산으로 건설이 하한가 근접 급락했고 철강·금융도 동반 하락했습니다.',
  },
  {
    id: 'H07',
    difficulty: 'HARD',
    title: '아마존·틱톡샵 K-뷰티 역직구 폭증… 다만 플랫폼 광고비(CAC) 2배 상승',
    summary: '외형 매출은 사상 최대를 경신 중이나, 인플루언서 시딩·광고 단가 급등으로 순이익률 개선 여부에 대해서는 애널리스트 간 의견이 극명히 갈립니다.',
    impacts: { COSM: 0.22, CONS: 0.12 },
    outcomeNote: '매출 폭발 성장에 무게가 실리며 화장품과 소비재가 큰 폭으로 상승했습니다.',
  },
  {
    id: 'H08',
    difficulty: 'HARD',
    title: '국제 곡물(대두·소맥) 선물 가격 3개월 새 28% 급락',
    summary: '남미 대풍작으로 식음료 제조사의 투입 원가 부담이 크게 줄어들 전망입니다. 판가 인하 압박보다 마진 스프레드 확대 효과가 훨씬 클 것으로 분석됩니다.',
    impacts: { CONS: 0.22 },
    outcomeNote: '원재료 곡물가 급락에 따른 마진 개선으로 데일리푸드가 급등했습니다.',
  },
  {
    id: 'H09',
    difficulty: 'HARD',
    title: 'FDA 자문위원회, 동종 계열 표적항암제 부작용(독성) 데이터 재검토 요청',
    summary: '타사 경쟁 약물의 안전성 이슈가 부각되면서, 동일 기전 파이프라인을 보유한 국내 바이오 기업들의 임상 통과 확률에 대한 재평가가 진행 중입니다.',
    impacts: { BIOH: -0.26 },
    outcomeNote: '동일 기전 안전성 우려 전이로 넥스바이오가 큰 폭으로 급락했습니다.',
  },
  {
    id: 'H10',
    difficulty: 'HARD',
    title: '글로벌 빅파마 특허 절벽(Patent Cliff) 도래… 바이오시밀러·라이선스인 쟁탈전',
    summary: '블록버스터 의약품 특허 만료를 앞둔 다국적 제약사들이 아시아권 후기 임상 파이프라인 확보에 총력을 기울이고 있습니다.',
    impacts: { BIOH: 0.27 },
    outcomeNote: '글로벌 기술이전 기대감이 폭발하며 넥스바이오가 급등했습니다.',
  },
  {
    id: 'H11',
    difficulty: 'HARD',
    title: '북미 인플레이션 감축법(IRA) 세부 지침 개정… 역외 조달 부품 관세 유예',
    summary: '한국계 완성차 및 첨단 소재 기업이 북미 현지 세액공제 요건을 충족하게 되면서, 경쟁사 대비 가격 경쟁력이 단숨에 역전되었습니다.',
    impacts: { AUTO: 0.23, CHEM: 0.17 },
    outcomeNote: 'IRA 수혜 확정으로 자동차와 첨단 소재(석유화학)가 동반 급등했습니다.',
  },
  {
    id: 'H12',
    difficulty: 'HARD',
    title: '해상 운임 지수(SCFI) 4주 연속 급등 및 홍해 우회 항로 장기화',
    summary: '해상 물류비 폭등으로 완성차·화장품 수출 기업의 운반비가 급증한 반면, 긴급 물량이 항공 화물로 전환되며 화물 운임 단가가 치솟고 있습니다.',
    impacts: { AIRL: 0.21, AUTO: -0.15, COSM: -0.14 },
    outcomeNote: '항공 화물 수요 급증으로 항공주가 급등했고, 물류비 부담으로 자동차·화장품은 하락했습니다.',
  },
  {
    id: 'H13',
    difficulty: 'HARD',
    title: '정부 기업 밸류업 세제 혜택 확정… PBR 0.5배 미만 저평가주 배당 확대 의무화',
    summary: '자사주 소각과 배당성향 상향 시 법인세 감면이 적용되면서, 전통적인 저PBR 가치주(금융·철강·자동차)로 기관 패시브 자금이 대거 유입되고 있습니다.',
    impacts: { FINC: 0.18, STEL: 0.16, AUTO: 0.14 },
    outcomeNote: '밸류업 세제 혜택으로 저PBR 대표주인 금융·철강·자동차가 동반 강세를 보였습니다.',
  },
  {
    id: 'H14',
    difficulty: 'HARD',
    title: '주요국 반도체 첨단 패키징 장비 반입 금지 및 보복 관세 예고',
    summary: '공급망 이원화 비용이 급증하면서 차세대 칩 양산 일정에 차질이 빚어질 수 있다는 경고음이 커지고 있습니다.',
    impacts: { SEMI: -0.26, AUTO: -0.12 },
    outcomeNote: '공급망 규제 충격으로 한빛반도체가 급락하고 차량용 칩 수급 우려로 자동차도 하락했습니다.',
  },
  {
    id: 'H15',
    difficulty: 'HARD',
    title: '전 세계 탄소국경조정제도(CBAM) 조기 시행 합의',
    summary: '탄소 배출량이 많은 고로 기반 철강과 전통 석유화학 제품에 톤당 탄소세가 부과되며, 저탄소 공법 전환 비용이 실적에 본격 반영됩니다.',
    impacts: { STEL: -0.21, CHEM: -0.19 },
    outcomeNote: '탄소세 부담 현실화로 철강과 석유화학이 동반 급락했습니다.',
  },
  {
    id: 'H16',
    difficulty: 'HARD',
    title: '글로벌 경기 침체(R의 공포) 지표 발표… 안전자산 및 필수재 대피 랠리',
    summary: '제조업 PMI가 3개월 연속 기준선(50)을 하회하며 경기 민감주(반도체·화학·철강·항공) 전반에서 대규모 투매가 발생하고 있습니다.',
    impacts: { CONS: 0.17, FINC: 0.13, SEMI: -0.18, CHEM: -0.16, AIRL: -0.17 },
    outcomeNote: '경기 침체 우려로 방어주(소비재·금융)만 상승하고 경기 민감주는 일제히 급락했습니다.',
  },
  {
    id: 'H17',
    difficulty: 'HARD',
    title: '산유국 감산 철회 및 비OPEC 원유 생산량 사상 최대치 기록',
    summary: '국제 유가가 배럴당 62달러까지 급락하면서 운송 및 석유화학 다운스트림 마진이 극적으로 개선되는 국면에 진입했습니다.',
    impacts: { AIRL: 0.25, CHEM: 0.20 },
    outcomeNote: '유가 급락에 따른 원가 절감으로 항공과 석유화학이 동반 급등했습니다.',
  },
  {
    id: 'H18',
    difficulty: 'HARD',
    title: '국가 주도 80조 원 규모 에코 스마트시티·철도 지하화 특별법 통과',
    summary: '대규모 공공 토목 발주와 특수강재 수요가 향후 5년간 보장되면서 관련 밸류체인 전체의 실적 추정치가 상향 조정되고 있습니다.',
    impacts: { CNST: 0.25, STEL: 0.21 },
    outcomeNote: '대규모 인프라 특별법 통과로 건설과 철강이 동반 급등했습니다.',
  },
  {
    id: 'H19',
    difficulty: 'HARD',
    title: '주요국 화장품 위생허가(NMPA) 전면 재심사 및 면세 따이공 수수료 축소',
    summary: '중국향 통관 지연과 면세 채널 매출 급감이 겹치며, 북미 다변화에 성공하지 못한 브랜드들의 재고 손실이 눈덩이처럼 불어나고 있습니다.',
    impacts: { COSM: -0.25 },
    outcomeNote: '통관 규제 및 면세 채널 부진으로 루나코스메틱이 급락했습니다.',
  },
  {
    id: 'H20',
    difficulty: 'HARD',
    title: '유럽연합, 내연기관 퇴출 유예 및 하이브리드 차량 보조금 부활',
    summary: '전기차 캐즘(일시적 수요 정체) 속에서 하이브리드 라인업 비중이 높은 완성차 제조사의 점유율과 대당 마진이 폭발적으로 확대되고 있습니다.',
    impacts: { AUTO: 0.24, CHEM: -0.14 },
    outcomeNote: '하이브리드 호황으로 태극모터스가 급등한 반면 배터리 소재 중심의 화학은 하락했습니다.',
  },
  {
    id: 'H21',
    difficulty: 'HARD',
    title: '시중은행 예대금리차 축소 권고 및 가계부채 총량 규제 강화',
    summary: '대출 성장세 둔화와 이자이익 감소가 불가피해지면서 배당 매력에도 불구하고 금융 섹터 전반에 매도세가 출회되고 있습니다.',
    impacts: { FINC: -0.16, CNST: -0.14 },
    outcomeNote: '대출 규제 강화로 금융과 부동산 연계 건설주가 동반 하락했습니다.',
  },
  {
    id: 'H22',
    difficulty: 'HARD',
    title: '글로벌 외식 물가 폭등… 가정간편식(HMR) 및 PB 식품 소비 폭발',
    summary: '외식을 줄이고 집밥·간편식을 찾는 소비자가 급증하면서 대형 식품·유통사의 가동률과 영업 레버리지 효과가 극대화되고 있습니다.',
    impacts: { CONS: 0.20, COSM: -0.12 },
    outcomeNote: '불황형 소비 확산으로 데일리푸드가 급등하고 고가 소비(화장품)는 소폭 조정을 받았습니다.',
  },
];


// ---------------------------------------------------------------------------
// 히든 돌발 이벤트 덱 (긍정적 / 부정적 각 4종 — 장 마감 시 정체 공개)
// ---------------------------------------------------------------------------
const HIDDEN_EVENT_DECK = [
  {
    id: 'HD_POS_1',
    difficulty: 'HARD',
    isHidden: true,
    title: '글로벌 무역 분쟁 전격 타결 및 관세 전면 철폐 선언',
    summary: '예상치 못한 정상회담 합의로 주요국 간 보복 관세가 즉시 철회되었습니다.',
    impacts: { SEMI: 0.36, AUTO: 0.34, COSM: 0.28, AIRL: 0.25 },
    outcomeNote: '🕵️ [히든 변수 공개] 글로벌 관세 철폐 전격 타결! 수출주 전반이 급등했습니다.',
  },
  {
    id: 'HD_POS_2',
    difficulty: 'HARD',
    isHidden: true,
    title: '차세대 고효율 친환경 소재·배터리 혁신 기술 상용화 발표',
    summary: '생산 단가를 절반으로 낮추는 혁신 공정이 전격 공개되며 산업계 판도가 뒤바뀌고 있습니다.',
    impacts: { CHEM: 0.38, AUTO: 0.30, STEL: 0.20 },
    outcomeNote: '🕵️ [히든 변수 공개] 혁신 소재 상용화 발표로 석유화학·자동차·철강이 급등했습니다.',
  },
  {
    id: 'HD_POS_3',
    difficulty: 'HARD',
    isHidden: true,
    title: '글로벌 보건당국, 넥스바이오 핵심 신약 긴급사용승인 전격 결정',
    summary: '예정보다 1년 앞당겨진 긴급 승인으로 즉각적인 글로벌 매출 발생이 확정되었습니다.',
    impacts: { BIOH: 0.44, CONS: 0.15 },
    outcomeNote: '🕵️ [히든 변수 공개] 넥스바이오 신약 긴급사용승인! 바이오 업종이 크게 폭등했습니다.',
  },
  {
    id: 'HD_POS_4',
    difficulty: 'HARD',
    isHidden: true,
    title: '국제기구·주요국 100조 원 규모 공동 재건 및 관광 진흥 패키지 가동',
    summary: '대규모 평화 재건 사업과 무비자 관광 특구 지정이 동시에 발표되었습니다.',
    impacts: { CNST: 0.38, AIRL: 0.35, STEL: 0.28, COSM: 0.22 },
    outcomeNote: '🕵️ [히든 변수 공개] 대규모 재건·관광 패키지 가동으로 건설·항공·철강·화장품이 동반 급등했습니다.',
  },
  {
    id: 'HD_NEG_1',
    difficulty: 'HARD',
    isHidden: true,
    title: '핵심 해상 물류로 군사 충돌 발발 및 긴급 항로 봉쇄',
    summary: '예고 없는 무력 충돌로 국제 유가가 급등하고 글로벌 물류망이 마비되었습니다.',
    impacts: { AIRL: -0.42, CHEM: -0.35, AUTO: -0.24, FINC: 0.10 },
    outcomeNote: '🕵️ [히든 변수 공개] 해상 물류로 군사 충돌 발발! 항공·화학·자동차가 급락했습니다.',
  },
  {
    id: 'HD_NEG_2',
    difficulty: 'HARD',
    isHidden: true,
    title: '글로벌 금융·전산망 대규모 사이버 테러 발생',
    summary: '주요 결제망과 반도체 설계 서버가 동시 공격을 받아 일시 가동 중단 사태가 벌어졌습니다.',
    impacts: { FINC: -0.38, SEMI: -0.30, CONS: -0.20 },
    outcomeNote: '🕵️ [히든 변수 공개] 대규모 사이버 테러 발생으로 금융·반도체·소비재가 하락했습니다.',
  },
  {
    id: 'HD_NEG_3',
    difficulty: 'HARD',
    isHidden: true,
    title: '주요 산업단지 대규모 정전 및 핵심 소재 공장 가동 중단',
    summary: '예기치 못한 전력망 사고로 반도체·철강·화학 라인의 복구에 수 주가 소요될 전망입니다.',
    impacts: { SEMI: -0.40, STEL: -0.35, CHEM: -0.32 },
    outcomeNote: '🕵️ [히든 변수 공개] 산업단지 대형 정전 사태로 반도체·철강·석유화학이 급락했습니다.',
  },
  {
    id: 'HD_NEG_4',
    difficulty: 'HARD',
    isHidden: true,
    title: '신종 감염병 변이 확산 경보 및 국제선 검역 재강화',
    summary: '각국 국경 통제 강화 조짐으로 여행·면세 수요가 급감하고 비대면·의약품 수요가 급증하고 있습니다.',
    impacts: { AIRL: -0.45, COSM: -0.35, CONS: 0.25, BIOH: 0.30 },
    outcomeNote: '🕵️ [히든 변수 공개] 감염병 변이 경보로 항공·화장품이 급락하고 바이오·소비재가 급등했습니다.',
  },
  {
    id: 'HD_POS_5',
    difficulty: 'HARD',
    isHidden: true,
    title: '주요국 중앙은행, 디지털 자산 전략적 비축 및 결제망 통합 전격 발표',
    summary: '국가 단위 매입과 초국경 결제 채택이 선언되며 가상자산 시장에 전례 없는 자금이 쏠리고 있습니다.',
    impacts: { CRYP: 0.45, SEMI: 0.18 },
    outcomeNote: '🕵️ [히든 변수 공개] 국가 단위 디지털 자산 채택 발표! 비트체인이 폭등했습니다.',
  },
  {
    id: 'HD_NEG_5',
    difficulty: 'HARD',
    isHidden: true,
    title: '글로벌 대형 가상자산 수탁사 해킹 사고 및 대규모 인출 중단 사태',
    summary: '신뢰도 붕괴로 디지털 자산 전반에 패닉 셀이 발생하며 관련 인프라 기업이 직격탄을 맞았습니다.',
    impacts: { CRYP: -0.45, FINC: 0.08 },
    outcomeNote: '🕵️ [히든 변수 공개] 대형 수탁사 해킹 사태로 비트체인이 폭락했습니다.',
  },
  {
    id: 'HD_POS_6',
    difficulty: 'HARD',
    isHidden: true,
    title: '초전도 송전망·차세대 청정에너지 상용화 실증 전격 성공',
    summary: '전력 손실 제로에 가까운 송전 기술이 공개되며 에너지와 반도체 산업의 원가 구조가 혁신됩니다.',
    impacts: { ENRG: 0.42, SEMI: 0.22, CHEM: 0.15 },
    outcomeNote: '🕵️ [히든 변수 공개] 차세대 에너지·송전 기술 실증 성공으로 그린파워가 폭등했습니다.',
  },
];

// ---------------------------------------------------------------------------
// 게임 상태 저장소
// ---------------------------------------------------------------------------
const state = {
  phase: 'LOBBY', // LOBBY | TRADING | MARKET_CLOSE | GAME_OVER
  round: 0,
  totalRounds: 20,
  timer: 0,
  paused: false,
  phaseNonce: 0,
  players: new Map(),
  hostTokens: new Set(),
  stocks: {},
  usedNewsIds: new Set(),
  currentBriefings: [],
  roundSummaryLogs: [],
  chatHistory: [],
};

let timerInterval = null;

function generateToken() {
  return crypto.randomBytes(12).toString('hex');
}

function initStocks() {
  state.stocks = {};
  for (const item of STOCK_CATALOG) {
    state.stocks[item.code] = {
      ...item,
      price: item.initialPrice,
      prevPrice: item.initialPrice,
      pctChange: 0,
      history: [item.initialPrice],
    };
  }
}
initStocks();

function getPlayerBySocket(socketId) {
  for (const p of state.players.values()) {
    if (p.socketId === socketId) return p;
  }
  return null;
}

function isHostSocket(socket) {
  if (socket.data && socket.data.isHost) return true;
  if (socket.data && socket.data.hostToken && state.hostTokens.has(socket.data.hostToken)) {
    return true;
  }
  return false;
}

function cleanupDeadSockets() {
  let removed = 0;
  for (const [token, p] of state.players.entries()) {
    const activeSocket = p.socketId ? io.sockets.sockets.get(p.socketId) : null;
    if (!p.connected || !activeSocket || !activeSocket.connected) {
      state.players.delete(token);
      removed += 1;
    }
  }
  return removed;
}

function computePlayerPortfolioValue(p) {
  let stockValue = 0;
  for (const [code, pos] of Object.entries(p.holdings)) {
    const st = state.stocks[code];
    if (st && pos.qty > 0) {
      stockValue += pos.qty * st.price;
    }
  }
  const totalAsset = p.cash + stockValue;
  const returnPct = ((totalAsset - STARTING_CASH) / STARTING_CASH) * 100;
  return { stockValue, totalAsset, returnPct };
}

function getRankings() {
  const arr = Array.from(state.players.values()).map((p) => {
    const { stockValue, totalAsset, returnPct } = computePlayerPortfolioValue(p);
    return {
      token: p.token,
      nickname: p.nickname,
      cash: p.cash,
      stockValue,
      totalAsset,
      returnPct: Number(returnPct.toFixed(2)),
      tradeCount: p.tradeCount || 0,
    };
  });

  arr.sort((a, b) => {
    if (b.totalAsset !== a.totalAsset) return b.totalAsset - a.totalAsset;
    return b.cash - a.cash;
  });

  let rank = 1;
  arr.forEach((item, idx) => {
    if (idx > 0 && item.totalAsset < arr[idx - 1].totalAsset) {
      rank = idx + 1;
    }
    item.rank = rank;
  });
  return arr;
}

function getPublicPlayers() {
  return Array.from(state.players.values()).map((p) => {
    const { stockValue, totalAsset, returnPct } = computePlayerPortfolioValue(p);
    return {
      token: p.token,
      nickname: p.nickname,
      connected: p.connected,
      cash: p.cash,
      holdings: p.holdings,
      stockValue,
      totalAsset,
      returnPct: Number(returnPct.toFixed(2)),
    };
  });
}

function broadcastState() {
  const rawRankings = (state.phase === 'MARKET_CLOSE' || state.phase === 'GAME_OVER') ? getRankings() : [];
  const safeRankings = state.phase === 'MARKET_CLOSE'
    ? rawRankings.map((r) => ({ rank: r.rank, token: r.token, nickname: r.nickname }))
    : rawRankings;

  const basePayload = {
    phase: state.phase,
    round: state.round,
    totalRounds: state.totalRounds,
    timer: state.timer,
    paused: state.paused,
    phaseNonce: state.phaseNonce,
    stocks: Object.values(state.stocks),
    briefings: state.currentBriefings.map((b) => {
      if (b.isHidden && state.phase === 'TRADING') {
        return {
          id: b.id,
          isHidden: true,
          title: '???',
          summary: '장 마감 전까지 내용이 공개되지 않는 돌발 히든 변수입니다. (시장에 큰 긍정적 또는 부정적 충격을 줄 수 있습니다)',
        };
      }
      return {
        id: b.id,
        isHidden: Boolean(b.isHidden),
        title: b.title,
        summary: b.summary,
      };
    }),
    roundSummaryLogs: state.roundSummaryLogs,
    players: getPublicPlayers(),
  };

  for (const s of io.sockets.sockets.values()) {
    s.emit('game:state', {
      ...basePayload,
      rankings: isHostSocket(s) ? rawRankings : safeRankings,
    });
  }
}

let lastManualAdvanceAt = 0;

function startTimer(seconds, onExpire) {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const expectedNonce = state.phaseNonce;
  state.timer = seconds;
  state.paused = false;
  broadcastState();

  timerInterval = setInterval(() => {
    if (state.phaseNonce !== expectedNonce) {
      clearInterval(timerInterval);
      timerInterval = null;
      return;
    }
    if (state.paused) return;
    state.timer -= 1;
    if (state.timer <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      state.timer = 0;
      if (state.phaseNonce === expectedNonce) {
        onExpire();
      }
    } else {
      io.emit('game:tick', { timer: state.timer, paused: state.paused });
    }
  }, 1000);
}

// ---------------------------------------------------------------------------
// 라운드 진행 로직 (라운드당 6개 브리핑 제공)
// ---------------------------------------------------------------------------
function drawRoundBriefings() {
  let pool = MARKET_NEWS_DECK.filter((n) => !state.usedNewsIds.has(n.id));
  if (pool.length < 8) {
    state.usedNewsIds.clear();
    pool = [...MARKET_NEWS_DECK];
  }
  const easyPool = pool.filter((n) => n.difficulty === 'EASY');
  const hardPool = pool.filter((n) => n.difficulty === 'HARD');

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  shuffle(easyPool);
  shuffle(hardPool);

  // 라운드당 8개 정보 제공 (쉬운 정보 2개 + 복합 추론 정보 5~6개, 약 45% 확률로 1개 히든 변수 ???)
  const includeHidden = Math.random() < 0.45;
  const hardCount = includeHidden ? 5 : 6;
  const picked = [
    ...easyPool.slice(0, 2),
    ...hardPool.slice(0, hardCount),
  ];
  if (includeHidden) {
    let hPool = HIDDEN_EVENT_DECK.filter((h) => !state.usedNewsIds.has(h.id));
    if (hPool.length === 0) hPool = [...HIDDEN_EVENT_DECK];
    shuffle(hPool);
    picked.push(hPool[0]);
  }

  if (picked.length < 8) {
    const remaining = shuffle(pool.filter((n) => !picked.includes(n)));
    picked.push(...remaining.slice(0, 8 - picked.length));
  }

  shuffle(picked);
  picked.forEach((n) => state.usedNewsIds.add(n.id));
  return picked;
}

function startTradingPhase() {
  state.round += 1;
  state.phase = 'TRADING';
  state.phaseNonce += 1;
  state.roundSummaryLogs = [];
  state.currentBriefings = drawRoundBriefings();
  startTimer(120, closeMarketAndSettle);
}

function closeMarketAndSettle() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  state.phase = 'MARKET_CLOSE';
  state.phaseNonce += 1;

  const sectorDelta = {};
  const touchedByHard = {};
  const touchedByHidden = {};
  Object.keys(state.stocks).forEach((code) => {
    sectorDelta[code] = 0;
    touchedByHard[code] = false;
    touchedByHidden[code] = false;
  });

  const logs = [];
  for (const news of state.currentBriefings) {
    logs.push(`📰 ${news.outcomeNote}`);
    for (const [code, delta] of Object.entries(news.impacts)) {
      if (sectorDelta[code] !== undefined) {
        sectorDelta[code] += delta;
        if (news.difficulty === 'HARD') touchedByHard[code] = true;
        if (news.isHidden) touchedByHidden[code] = true;
      }
    }
  }

  for (const stock of Object.values(state.stocks)) {
    stock.prevPrice = stock.price;
    const noiseRange = touchedByHidden[stock.code] ? 0.05 : touchedByHard[stock.code] ? 0.04 : 0.02;
    const noise = (Math.random() * 2 - 1) * noiseRange;
    let rawPct = sectorDelta[stock.code] + noise;

    // 난이도별 변동폭 제한:
    // - EASY만 적용된 종목: ±10% 이내
    // - HARD 일반 정보 적용 종목: ±30% 이내
    // - 히든 정보(???) 적용 종목: 최대 ±50% 이내
    const maxSwing = touchedByHidden[stock.code] ? 0.50 : (!touchedByHard[stock.code] && sectorDelta[stock.code] !== 0) ? 0.10 : 0.30;
    const clampedPct = Math.max(-maxSwing, Math.min(maxSwing, rawPct));
    const newPrice = Math.max(1000, Math.round((stock.price * (1 + clampedPct)) / 100) * 100);

    stock.price = newPrice;
    stock.pctChange = Number((((newPrice - stock.prevPrice) / stock.prevPrice) * 100).toFixed(1));
    stock.history.push(newPrice);
  }



  state.roundSummaryLogs = logs;

  startTimer(25, () => {
    if (state.round >= state.totalRounds) {
      state.phase = 'GAME_OVER';
      state.phaseNonce += 1;
      broadcastState();
    } else {
      startTradingPhase();
    }
  });
}

function advancePhaseManually() {
  if (state.phase === 'TRADING') {
    closeMarketAndSettle();
  } else if (state.phase === 'MARKET_CLOSE') {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (state.round >= state.totalRounds) {
      state.phase = 'GAME_OVER';
      state.phaseNonce += 1;
      broadcastState();
    } else {
      startTradingPhase();
    }
  }
}

// ---------------------------------------------------------------------------
// Socket.io 이벤트 핸들러
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  socket.on('host:auth', ({ pin, hostToken }, callback) => {
    if (hostToken && state.hostTokens.has(hostToken)) {
      socket.data.isHost = true;
      socket.data.hostToken = hostToken;
      broadcastState();
      return callback?.({ ok: true, hostToken });
    }
    if (String(pin || '').trim() === ADMIN_PIN) {
      const newHostToken = generateToken();
      state.hostTokens.add(newHostToken);
      socket.data.isHost = true;
      socket.data.hostToken = newHostToken;
      broadcastState();
      return callback?.({ ok: true, hostToken: newHostToken });
    }
    return callback?.({ ok: false, error: '관리자 PIN이 올바르지 않습니다.' });
  });

  socket.on('player:join', ({ nickname, token }, callback) => {
    if (token && state.players.has(token)) {
      const existing = state.players.get(token);
      existing.socketId = socket.id;
      existing.connected = true;
      socket.data.playerToken = token;
      broadcastState();
      return callback?.({
        ok: true,
        token: existing.token,
        nickname: existing.nickname,
        chatHistory: state.chatHistory.slice(-40),
      });
    }

    const cleanName = String(nickname || '').trim().slice(0, 16);
    if (!cleanName) return callback?.({ ok: false, error: '닉네임을 입력해 주세요.' });
    if (state.phase !== 'LOBBY') {
      return callback?.({ ok: false, error: '이미 투자 게임이 진행 중입니다. 다음 판을 기다려 주세요.' });
    }
    if (state.players.size >= 35) {
      return callback?.({ ok: false, error: '최대 정원(35명)이 가득 찼습니다.' });
    }
    for (const p of state.players.values()) {
      if (p.nickname.toLowerCase() === cleanName.toLowerCase()) {
        return callback?.({ ok: false, error: '이미 사용 중인 닉네임입니다.' });
      }
    }

    const newToken = generateToken();
    const holdings = {};
    STOCK_CATALOG.forEach((s) => {
      holdings[s.code] = { qty: 0, avgCost: 0 };
    });

    state.players.set(newToken, {
      token: newToken,
      socketId: socket.id,
      nickname: cleanName,
      connected: true,
      cash: STARTING_CASH,
      holdings,
      tradeCount: 0,
    });
    socket.data.playerToken = newToken;
    broadcastState();
    return callback?.({
      ok: true,
      token: newToken,
      nickname: cleanName,
      chatHistory: state.chatHistory.slice(-40),
    });
  });

  socket.on('game:request_state', () => {
    broadcastState();
  });

  socket.on('host:start_game', ({ totalRounds }, callback) => {
    if (!isHostSocket(socket)) return callback?.({ ok: false, error: '방장 권한이 없습니다.' });
    cleanupDeadSockets();

    if (state.players.size < 1) {
      return callback?.({ ok: false, error: '최소 1명 이상의 참가자가 필요합니다.' });
    }

    const roundsNum = Math.floor(Number(totalRounds));
    state.totalRounds = (Number.isFinite(roundsNum) && roundsNum >= 1 && roundsNum <= 20) ? roundsNum : 20;
    state.round = 0;
    state.usedNewsIds.clear();
    state.chatHistory = [];
    initStocks();

    for (const p of state.players.values()) {
      p.cash = STARTING_CASH;
      p.tradeCount = 0;
      STOCK_CATALOG.forEach((s) => {
        p.holdings[s.code] = { qty: 0, avgCost: 0 };
      });
    }

    startTradingPhase();
    return callback?.({ ok: true });
  });

  socket.on('host:pause_resume', (_, callback) => {
    if (!isHostSocket(socket)) return callback?.({ ok: false });
    state.paused = !state.paused;
    io.emit('game:tick', { timer: state.timer, paused: state.paused });
    broadcastState();
    return callback?.({ ok: true, paused: state.paused });
  });

  socket.on('host:extend_time', ({ seconds = 30 }, callback) => {
    if (!isHostSocket(socket)) return callback?.({ ok: false });
    state.timer += Number(seconds) || 30;
    io.emit('game:tick', { timer: state.timer, paused: state.paused });
    return callback?.({ ok: true, timer: state.timer });
  });

  socket.on('host:next_phase', (_, callback) => {
    if (!isHostSocket(socket)) return callback?.({ ok: false });
    const now = Date.now();
    if (now - lastManualAdvanceAt < 1500) {
      return callback?.({ ok: false, error: '잠시 후 다시 시도해 주세요.' });
    }
    lastManualAdvanceAt = now;
    advancePhaseManually();
    return callback?.({ ok: true });
  });

  socket.on('host:kick_player', ({ targetToken }, callback) => {
    if (!isHostSocket(socket)) return callback?.({ ok: false });
    const target = state.players.get(targetToken);
    if (target) {
      if (target.socketId) io.to(target.socketId).emit('player:kicked');
      state.players.delete(targetToken);
      broadcastState();
    }
    return callback?.({ ok: true });
  });

  socket.on('host:reset_game', (_, callback) => {
    if (!isHostSocket(socket)) return callback?.({ ok: false });
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    cleanupDeadSockets();
    state.phase = 'LOBBY';
    state.round = 0;
    state.timer = 0;
    state.paused = false;
    state.phaseNonce += 1;
    state.currentBriefings = [];
    state.roundSummaryLogs = [];
    state.usedNewsIds.clear();
    initStocks();

    for (const p of state.players.values()) {
      p.cash = STARTING_CASH;
      p.tradeCount = 0;
      STOCK_CATALOG.forEach((s) => {
        p.holdings[s.code] = { qty: 0, avgCost: 0 };
      });
    }
    broadcastState();
    return callback?.({ ok: true });
  });

  socket.on('trade:order', ({ code, side, qty }, callback) => {
    const p = getPlayerBySocket(socket.id);
    if (!p) return callback?.({ ok: false, error: '참가자 정보를 찾을 수 없습니다.' });
    if (state.phase !== 'TRADING') {
      return callback?.({ ok: false, error: '현재 거래 시간이 아닙니다.' });
    }
    const stock = state.stocks[code];
    if (!stock) return callback?.({ ok: false, error: '존재하지 않는 종목입니다.' });

    const orderQty = Math.floor(Number(qty));
    if (!Number.isFinite(orderQty) || orderQty <= 0) {
      return callback?.({ ok: false, error: '유효한 수량을 입력해 주세요.' });
    }

    const pos = p.holdings[code];
    if (side === 'BUY') {
      const cost = orderQty * stock.price;
      if (cost > p.cash) {
        return callback?.({ ok: false, error: '보유 현금이 부족합니다.' });
      }
      const prevTotalCost = pos.qty * pos.avgCost;
      const newQty = pos.qty + orderQty;
      pos.avgCost = Math.round((prevTotalCost + cost) / newQty);
      pos.qty = newQty;
      p.cash -= cost;
      p.tradeCount += 1;
    } else if (side === 'SELL') {
      if (orderQty > pos.qty) {
        return callback?.({ ok: false, error: '보유 수량이 부족합니다.' });
      }
      const proceeds = orderQty * stock.price;
      pos.qty -= orderQty;
      if (pos.qty === 0) pos.avgCost = 0;
      p.cash += proceeds;
      p.tradeCount += 1;
    } else {
      return callback?.({ ok: false, error: '잘못된 주문 유형입니다.' });
    }

    broadcastState();
    return callback?.({
      ok: true,
      message: `${stock.name} ${orderQty}주 ${side === 'BUY' ? '매수' : '매도'} 체결 (${(orderQty * stock.price).toLocaleString()}원)`,
    });
  });

  socket.on('chat:send', ({ text }) => {
    const p = getPlayerBySocket(socket.id);
    const cleanText = String(text || '').trim().slice(0, 200);
    if (!cleanText) return;
    const sender = p ? p.nickname : (isHostSocket(socket) ? '진행자' : null);
    if (!sender) return;

    const msg = {
      id: generateToken().slice(0, 8),
      sender,
      text: cleanText,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    };
    state.chatHistory.push(msg);
    if (state.chatHistory.length > 80) state.chatHistory.shift();
    io.emit('chat:message', msg);
  });

  socket.on('disconnect', () => {
    const p = getPlayerBySocket(socket.id);
    if (p) {
      p.connected = false;
      broadcastState();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Stock Tycoon server running on port ${PORT}`);
});
