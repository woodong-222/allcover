# allcover — 볼링 정산 웹앱 구현 계획

- **상태**: `pending approval` (실행 승인 전)
- **작성일**: 2026-08-21
- **저장소**: `D:\GIT\allcover` — 빈 저장소, `README.md`만 존재 (커밋 `3016b5b`)
- **배포**: Vercel 정적 호스팅, 백엔드 없음

---

## 1. 확정 결정

| 항목 | 결정 |
|---|---|
| 스택 | Vite + React + TypeScript + Tailwind v4 |
| 저장 | localStorage 전용 (서버 없음) |
| 공유 | 결과 PNG + `navigator.share`, 미지원 시 다운로드 폴백 |
| 내기 방식 | **판돈 분배(천바리)** + **판비 내주기** 2종, 판마다 선택 |
| 배당 기준 | **인당 금액** (팀전 포함) |
| 순위 입력 | 이름/팀 칩을 **탭한 순서대로 1,2,3등** |
| 팀 편성 | 판마다 재편성 가능 (기본값은 직전 판 상속) |

---

## 2. 도메인 모델 — 내기 계산

모든 내기는 **제로섬 이체**다. 내기 유무와 무관하게 그날 총 지출액은 동일하고, 사람 사이에서 부담이 이동할 뿐이다.

### 방식 ① `pot` — 판돈 분배 (천바리)

참여자 전원이 인당 판돈 `ante`를 걷고, 순위 그룹별 **인당 배당액** `payout[rank]`을 나눈다.

```
pot         = ante × participants.length
payoutTotal = Σ_rank  payout[rank] × rankGroup[rank].length
imbalance   = payoutTotal - pot           // 0이어야 정상
betDelta[m] = ante - payout[rankOf(m)]    // + = 더 부담, - = 이득
```

검증:
- **개인전 5명, ante 1,000, 1등 3,000 / 2등 2,000**
  pot 5,000 = 배당 5,000 ✓
  1등 `-2,000` / 2등 `-1,000` / 3~5등 각 `+1,000` → Σ = 0 ✓
- **승자독식 5명, ante 1,000, 1등 5,000**
  1등 `-4,000` / 나머지 각 `+1,000` → Σ = 0 ✓
- **팀전 4팀×2명, ante 1,000, 1등팀 인당 3,000 / 2등팀 인당 1,000**
  pot 8,000 = 배당 (3,000×2)+(1,000×2) = 8,000 ✓
  1등팀원 각 `-2,000`(×2) / 2등팀원 각 `0` / 3·4등팀원 각 `+1,000`(×4) → Σ = 0 ✓

### 방식 ② `transfer` — 판비 내주기

진 쪽이 이긴 쪽의 1인분 금액을 대신 낸다. 순위 불필요, 승/패 2분.

```
winners = participants - losers
amount  = (transferSource === 'gameFee') ? gameFeePerGame : transferAmount
pot     = amount × winners.length
loser  l: betDelta += pot / losers.length
winner w: betDelta -= amount
```

검증:
- **팀전 4:4, amount = 판비 4,000** → 진 팀 각자 `+4,000`, 이긴 팀 각자 `-4,000`. 진 팀이 이긴 팀 1명분씩 내줌 ✓
- **개인전 8명, 꼴찌 1명, amount 4,000** → 꼴찌 `+28,000`, 나머지 각 `-4,000` ✓ (꼴찌 몰빵)

### 최종 부담

```
base[m]  = gameFeePerGame × 참여판수(m)
         + (shoeRenters.includes(m) ? shoeFee : 0)
         + 기타비용 분담분(m)
total[m] = base[m] + Σ_rounds betDelta[m]
```

불변식: `Σ betDelta === 0`, 따라서 `Σ total === Σ base === 실제 결제 총액`. (단 `imbalance ≠ 0`인 라운드가 있으면 그만큼 어긋나며, 이는 UI에 명시 경고한다.)

### 순위 입력 규칙 (탭 순서)

- 개인전이면 멤버 칩, 팀전이면 팀 칩을 탭하는 순서대로 `1등, 2등, 3등…` 배지 부여.
- 배당이 있는 등수까지만 탭하면 된다. **탭하지 않은 나머지는 전원 동일한 최하위 그룹(무배당)** 으로 처리.
- 이미 등수가 붙은 칩을 다시 탭하면 해제되고 뒤 등수가 한 칸씩 당겨진다.
- 공동 순위(동점)는 MVP 제외 → §7 후속 항목.

### 배당 입력 규칙

- `ante` 입력 시 `pot`이 실시간 표시된다.
- 등수별 인당 배당액 입력 옆에 **"남은 판돈 N원"** 이 실시간 갱신된다.
- **"나머지 자동 분배"** 버튼: 남은 금액을 마지막 등수 그룹에 인당 균등 배분.
- 프리셋: `승자독식`, `1·2등 차등`(pot의 60/40). ~~`직전 판과 동일`~~ → **제외 (2026-08-21)**: RoundCard의 "판 복제" 버튼이 배당까지 통째로 가져오므로 역할이 겹친다. 이 프리셋만을 위해 `PayoutEditor`가 직전 라운드를 props로 더 받게 하는 건 결합도만 늘린다. worker-ui-b가 구현 전에 차이를 보고해 결정했다.
- 저장 시 `imbalance ≠ 0`이면 해당 라운드 카드와 결과 화면 상단에 경고 배지를 띄운다. 계산은 숨기지 않고 그대로 반영한다.

---

## 3. 인수 조건 (테스트 가능)

### A. 계산 엔진 — `src/lib/calc.ts` (Vitest)
- [ ] A1. 일반 모드: 3명, 게임단가 4,000, 참여판수 **4/3/3**, 신발 **1명** 2,000 → `[16000, 14000, 12000]`, 합 42,000.
  <br>*(정정 2026-08-21: 초안의 입력 "3/3/2, 신발 2명"은 기대값 42,000과 산술적으로 맞지 않았다. 그 입력의 정답은 `[14000, 14000, 8000]` 합 36,000. worker-calc가 검산 중 발견해 입력을 기대값에 맞게 수정했고, 원문 입력 케이스도 테스트에 함께 남겨 두 시나리오를 모두 고정했다.)*
- [ ] A2. §2 pot 검증 3케이스(개인전 차등 / 승자독식 / 팀전 4팀)가 각각 명시된 `betDelta` 값과 정확히 일치.
- [ ] A3. §2 transfer 검증 2케이스(4:4 팀전 / 꼴찌 몰빵)가 명시된 값과 일치.
- [ ] A4. 제로섬 불변식: 고정 시드 랜덤 200케이스에서 `imbalance === 0`인 한 `Σ betDelta === 0`.
- [ ] A5. 총액 불변식: 위 케이스에서 `Σ total === Σ base`.
- [ ] A6. `imbalance` 계산이 정확: 팀전 4팀×2명 ante 1,000에서 1등팀 인당 3,000만 입력하면 `imbalance === -2000`.
- [ ] A7. 판별 미참여자는 그 판의 게임비·판돈·배당 어디에도 포함되지 않는다.
- [ ] A8. `transferSource: 'gameFee'` 라운드는 게임 단가를 바꾸면 결과가 자동 반영된다.
- [ ] A9. 엣지: `losers`가 0명이거나 참여자 전원인 라운드, 순위 탭이 0개인 라운드 → 해당 라운드 `betDelta` 전원 0, 크래시 없음.
- [ ] A10. 혼합 정산: 5판 중 2판 `pot`, 2판 `transfer`, 1판 `none`이 섞여도 A4·A5 불변식 유지.
- [ ] A11. 기타비용 `splitAmong: 'all'` 12,000원 / 5명 / 반올림 100원 → 각 2,400원, 오차 0.

### B. 반올림 — `src/lib/money.ts`
- [ ] B1. 반올림 단위 100원, 10,000원을 3명 균등 → 각 3,300원, 잔액 100원은 총무에게 가산되어 `Σ === 10000`.
- [ ] B2. 반올림 단위 0이면 원 단위 그대로, 오차 0.
- [ ] B3. 총무 미지정 시 잔액은 **최대 부담자**가 흡수하고, 해당 행에 `잔돈 조정 -100원` 배지가 표시된다.
- [ ] B4. 음수 최종 금액(내기로 이득 본 사람)도 반올림·표시가 정상 동작하며 "받을 금액"으로 표기된다.

### C. 영속성 — `src/lib/storage.ts`, `src/store/useSettlementStore.ts`
- [ ] C1. 게임 단가·신발비·기본 판돈 입력 후 새로고침 → 값 복원.
- [ ] C2. 판 3개 입력 중 탭을 닫았다 다시 열기 → 진행 중 세션 전체 복원.
- [ ] C3. 저장 스키마에 `version` 존재. 불일치 시 `migrate` 실행, 실패하면 원본을 `allcover:corrupt:{ts}`에 백업 후 초기 상태로 복구하며 **크래시하지 않는다**.
- [ ] C4. localStorage 비활성(사파리 프라이빗)·quota 초과 시 앱이 정상 동작하고 "저장 불가" 안내만 표시된다.
- [ ] C5. "새 정산 시작" 시 세션만 초기화되고 요금 프리셋·최근 멤버 이름은 유지된다.

### D. 공유 — `src/lib/share.ts`, `src/lib/capture.ts`
- [ ] D1. 결과 화면 진입 시 PNG blob이 **사전 생성**되어, 공유 버튼 클릭 핸들러가 `await` 없이 즉시 `navigator.share`를 호출한다 (iOS user-activation 소실 방지).
- [ ] D2. `navigator.canShare({files})`가 true인 환경(iOS Safari, Android Chrome)에서 공유 시트가 뜨고 카카오톡 전송이 된다.
- [ ] D3. 미지원 환경(데스크탑 Chrome/Firefox)에서 `allcover-YYYYMMDD.png` 다운로드로 폴백된다.
- [ ] D4. 공유 시트 취소(`AbortError`) 시 에러 토스트가 뜨지 않는다.
- [ ] D5. PNG 폭 ≥ 1080px, 크기 ≤ 2MB, 멤버 12명까지 잘림 없음.
- [ ] D6. PNG 안 한글 폰트가 깨지지 않는다.
- [ ] D7. 결과 카드 이미지에 판별 내기 요약(방식·판돈·순위)이 한 줄씩 포함되어, 받은 사람이 계산 근거를 확인할 수 있다.

### E. 반응형 / 접근성
- [ ] E1. 뷰포트 320 / 768 / 1280px에서 가로 스크롤 없음.
- [ ] E2. 탭 대상(칩, 체크박스, 버튼) 히트 영역 ≥ 44×44px.
- [ ] E3. 금액 입력에 `inputMode="numeric"` — 모바일 숫자 키패드.
- [ ] E4. 키보드 Tab만으로 멤버 추가 → 판 입력 → 결과까지 도달 가능.
- [ ] E5. Lighthouse Accessibility ≥ 95, 본문 대비비 ≥ 4.5:1.

### F. 빌드/배포
- [ ] F1. `npm run build` 무경고, `tsc --noEmit` 에러 0.
- [ ] F2. 초기 JS 번들 gzip ≤ 200KB.
- [ ] F3. Vercel 프리뷰에서 새로고침·딥링크 404 없음.

---

## 4. 구현 단계

### M0 — 셋업
- `npm create vite@latest . -- --template react-ts`
- Tailwind v4: `npm i -D tailwindcss @tailwindcss/vite` → `vite.config.ts`에 플러그인, `src/index.css`에 `@import "tailwindcss";`
- 런타임 의존성: `zustand`, `html-to-image`, `nanoid`
- 개발 의존성: `vitest`, `jsdom`, `@testing-library/react`
- `vercel.json`: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
- `.gitignore`: `node_modules`, `dist`, `.vercel`
- **완료 기준**: F1

### M1 — 타입 + 계산 엔진 (UI 없이 TDD)

`src/types.ts`
```ts
export type Member = { id: string; name: string };
export type Extra  = { id: string; label: string; amount: number; splitAmong: string[] | 'all' };

export type BetMethod = 'none' | 'pot' | 'transfer';

export type Round = {
  id: string;
  participants: string[];          // member ids
  teams: string[][] | null;        // null = 개인전. 판마다 재편성 가능
  method: BetMethod;
  // pot 전용
  ante: number;                    // 인당 판돈
  payout: number[];                // 등수별 인당 배당액, index 0 = 1등
  ranking: string[][];             // 탭 순서. 개인전은 [[id],[id]…], 팀전은 [[팀원…],…]
  // transfer 전용
  losers: string[];                // 진 사람(팀전이면 진 팀 멤버 전체)
  transferSource: 'gameFee' | 'custom';
  transferAmount: number;
};

export type Settlement = {
  version: number;
  id: string; date: string; title?: string;
  members: Member[];
  gameFeePerGame: number;
  shoeFee: number;
  shoeRenters: string[];
  defaultAnte: number;
  rounds: Round[];
  extras: Extra[];
  treasurerId?: string;
  roundingUnit: 0 | 10 | 100;
};

export type RoundBreakdown = { roundId: string; delta: Record<string, number>; imbalance: number };
export type MemberResult = {
  memberId: string; gameCount: number;
  gameFee: number; shoe: number; extra: number;
  betDelta: number; subtotal: number; rounded: number; adjustment: number;
};
```

- `src/lib/calc.ts` — 순수 함수. React 의존 0.
  - `roundDelta(round, gameFeePerGame): RoundBreakdown`
  - `calculate(s: Settlement): { results: MemberResult[]; breakdowns: RoundBreakdown[]; totalImbalance: number }`
- `src/lib/money.ts` — `roundTo(amount, unit)`, `distributeWithRemainder(total, shares, unit, absorberId)`
- **테스트 먼저**: `src/lib/calc.test.ts`, `src/lib/money.test.ts`
- **완료 기준**: A1–A11, B1–B4 전부 green

### M2 — 상태 + 영속성
- `src/store/useSettlementStore.ts` — zustand + `persist`
  - 키 분리: `allcover:session:v1`(진행 중 정산), `allcover:prefs:v1`(게임단가·신발비·기본판돈·반올림단위·최근 멤버 이름 최대 20개)
  - `version` + `migrate` + `onRehydrateStorage` 실패 폴백
- `src/lib/storage.ts` — localStorage try/catch 래퍼, 실패 시 in-memory 폴백
- 액션: `addMember` `removeMember` `renameMember` `addRound` `duplicateRound` `removeRound` `toggleParticipant` `setTeams` `setMethod` `setAnte` `setPayout` `tapRank` `toggleLoser` `setTransfer` `toggleShoeRenter` `addExtra` `setTreasurer` `resetSession`
- **완료 기준**: C1–C5

### M3 — 입력 UI
- `src/App.tsx` — 단일 페이지 세로 스크롤 (라우터 불필요). 멤버 → 요금 → 판 → 기타비용 → 결과
- `src/components/MemberEditor.tsx` — 이름 추가/삭제/수정 + 최근 멤버 칩 빠른 추가
- `src/components/FeeSettings.tsx` — 게임 단가, 신발비, 기본 판돈, 반올림 단위, 총무 지정
- `src/components/ShoeRentalPicker.tsx` — 신발 대여자 다중 체크
- `src/components/RoundList.tsx` / `RoundCard.tsx`
  - 참여자 체크
  - 방식 세그먼트: `없음 / 판돈 분배 / 판비 내주기`
  - 팀 편성 버튼 → `TeamSheet.tsx` (팀 수 선택 후 멤버 탭으로 팀 순환 배정, 기본은 직전 판 상속)
  - `pot`이면 → `AnteInput` + `RankPicker` + `PayoutEditor`
  - `transfer`이면 → 금액 소스(판비/직접입력) + 진 쪽 체크(팀전이면 팀 단위 토글)
  - "판 복제" 버튼 (직전 판 구성 그대로)
- `src/components/RankPicker.tsx` — 탭 순서 등수 부여, 재탭 해제 시 뒤 등수 당김
- `src/components/PayoutEditor.tsx` — 등수별 인당 배당 입력, "남은 판돈" 실시간, "나머지 자동 분배" 버튼, 불균형 경고
- `src/components/ExtraCosts.tsx` — 항목명/금액/분담 대상
- 레이아웃: 모바일 1열, `md:` 2열, `lg:` 좌측 입력 / 우측 결과 스티키
- **완료 기준**: E1–E4

### M4 — 결과 및 송금 뷰
- `src/components/ResultCard.tsx` — 캡처 대상. 고정 폭 540px, `pixelRatio: 2` → 1080px 출력
  - 헤더(날짜·장소·인원) / 멤버별 표(판수·게임비·신발비·기타·내기±·최종) / 총액 / **"각자 → {총무}에게 얼마"** 송금 리스트 / 판별 내기 요약(D7) / 잔돈 조정·불균형 배지
  - **캡처 서브트리 색상은 hex CSS 변수로 고정** (Tailwind v4 oklch 직렬화 회피)
- `src/lib/settle.ts` — 총무 미지정 시 그리디 최소 송금 계산
- **완료 기준**: A1·A2·A3 계산 결과와 화면 표시값 일치, B3, B4

### M5 — 이미지 공유
- `src/lib/capture.ts` — `html-to-image`의 `toBlob(node, { pixelRatio: 2, backgroundColor: '#ffffff', fontEmbedCSS })`. 결과 섹션 마운트 시 `useEffect`로 사전 생성 후 ref 보관.
- `src/lib/share.ts`
```ts
export async function shareImage(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'allcover 정산' });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
```
- `src/components/ShareBar.tsx` — 공유 / 이미지 저장 / 텍스트 복사
- **완료 기준**: D1–D7

### M6 — 마감 및 배포
- ~~폰트 self-host (`public/` 에 Pretendard 서브셋)~~ → **취소 (2026-08-21)**. `src/index.css`가 이미 시스템 폰트 스택(Pretendard 설치 시 사용, 미설치 시 Apple SD Gothic Neo / Malgun Gothic 폴백)이라 **웹폰트를 아예 쓰지 않는 편이 R3를 원천 제거**한다. self-host는 woff2 수 MB를 번들에 얹는 대가로 기기 간 렌더 일관성만 얻는데, 정산 이미지에는 그 대가가 크다고 판단했다.
  <br>**트레이드오프(감수)**: 공유된 PNG의 글꼴이 기기마다 다르게 보인다. 숫자·레이아웃은 동일하므로 정산 정확성에는 영향 없음. 인수조건 D6(한글 깨짐 없음)은 시스템 폰트로도 충족된다.
- 메타: `og:image`, `theme-color`, `viewport-fit=cover`, 파비콘
- Vercel 연결 → 프리뷰 배포 → 실기기 검증
- `README.md` 갱신 (실행/배포/내기 규칙 설명)
- **완료 기준**: F1–F3, E5

---

## 5. 리스크 및 완화

| # | 리스크 | 영향 | 완화 |
|---|---|---|---|
| R1 | Tailwind v4 기본 팔레트가 `oklch`라 `html-to-image` 직렬화에서 색이 깨질 수 있음 | 공유 이미지 색상 오류 | ResultCard 색을 hex CSS 변수로 고정. **M5가 아니라 M0 직후 캡처 스파이크 1회**로 조기 검증. 실패 시 플랜 B: Canvas 2D 직접 렌더링(`src/lib/renderCard.ts`, 의존성 0) |
| R2 | iOS Safari에서 async 후 `navigator.share` 호출 시 user-activation 소실 → `NotAllowedError` | 공유 버튼 무반응 | blob 사전 생성(D1). 클릭 핸들러 내부에서 `await` 없이 즉시 share |
| R3 | CDN 웹폰트가 캡처 이미지에서 누락 | PNG 한글 깨짐 | 폰트 self-host + `fontEmbedCSS` 사전 계산 (D6) |
| R4 | 배당 합계 ≠ 판돈 합계 (`imbalance`)로 총액이 안 맞음 | 정산 신뢰도 붕괴 | "남은 판돈" 실시간 표시 + "나머지 자동 분배" 버튼 + 저장 시 경고 배지 + 결과 화면 상단 불일치 총액 명시. 숨기지 않음 (A6) |
| R5 | 탭 순서 등수 UI를 사용자가 오해해서 잘못 탭 | 오정산 | 탭 즉시 `1등` 배지 표시, 재탭 해제 가능, 미탭 인원은 "무배당" 회색 처리로 상태가 항상 눈에 보임 |
| R12 | **인원 변경이 기존 pot 라운드를 조용히 불균형으로 만듦** (2026-08-21 통합 테스트로 발견) | 사용자가 원인 모른 채 정산 총액이 어긋남 | `removeMember`/`toggleParticipant`는 참조만 청소하고 `payout`은 보존한다. 따라서 pot(`ante × 참여인원`)만 줄고 배당 총액은 남아 `imbalance`가 생긴다. **자동 재조정은 채택하지 않았다** — 사용자가 입력한 배당액을 앱이 말없이 바꾸는 쪽이 더 위험하다. 대신 ①RoundCard의 불균형 배지 ②ResultCard 경고 블록에 **원인 힌트와 해당 판 번호** 표시로 즉시 드러낸다. `src/integration/scenario.test.ts`가 이 동작을 하드코딩으로 고정한다 |
| R6 | localStorage 스키마 변경 시 기존 데이터 파손 | 앱 크래시 | `version` + `migrate` + 손상본 백업 후 초기화 (C3) |
| R7 | 반올림으로 합계 불일치 | 정산 신뢰도 | 잔액 흡수 규칙 명문화 + 불변식 테스트 (B1–B4) + 화면에 조정액 표시 |
| R8 | 판마다 팀 재편성 + 방식 변경으로 라운드 상태가 복잡해짐 | 버그 온상 | 라운드 상태 전이를 순수 함수 리듀서로 격리하고 A9·A10 엣지 테스트로 고정 |
| R9 | 멤버 12명 초과 시 결과 카드가 세로로 길어짐 | 공유 이미지 가독성 | 13명 이상은 행 높이·폰트 축소, 20명 초과 시 2열 |
| R10 | 백엔드 없어 기기 간 동기화 불가 | 다른 폰으로 이어서 못 함 | MVP 범위 명시. 후속으로 URL hash 공유 (§7) |
| R11 | 신규 프로젝트라 커밋 없이 파일이 대량 생성됨 | 롤백 곤란 | M0 완료 시점 및 각 마일스톤 완료마다 커밋 |

---

## 5-A. 2차 요구사항 (2026-08-21, 사용자 지시)

진행 중인 리뷰 수정이 착지한 직후 별도 웨이브로 처리한다. 두 변경 모두 `types.ts`·store·calc·UI를 동시에 건드리므로 1차 수정과 겹쳐 진행하지 않는다.

### 5-A-1. 반올림을 1원 단위 올림으로 고정

`roundingUnit: 0 | 10 | 100` 선택을 **제거**하고 항상 **1원 단위 올림(ceil)** 으로 간다. 목적은 금액에서 소수점을 없애는 것이다.

- `Settlement.roundingUnit` 필드 삭제, `Prefs.roundingUnit` 삭제, `FeeSettings`의 반올림 단위 세그먼트 컨트롤 삭제
- `money.roundTo`는 `Math.ceil` 기준 1원 단위로 단순화
- **총액 보존은 유지한다**: 전원을 올리면 걷은 합계가 실제 결제액보다 커지므로, 그 초과분을 총무(없으면 최대 부담자)가 흡수해 `Σ rounded === Σ subtotal` 이 정확히 성립하게 한다. `distributeWithRemainder`의 기존 흡수 구조를 그대로 쓰되 단위만 1원 올림으로 바꾼다
- 인수조건 **B1·B2는 폐기**하고 아래로 대체한다
  - **B1'**: 임의 소수 subtotal 집합에 대해 각자 `rounded`가 정수이고 `Σ rounded === Σ subtotal`
  - **B2'**: 흡수자를 제외한 전원의 `rounded >= subtotal` (올림 방향 보장)
  - B3(흡수 규칙)·B4(음수 표기)는 유지

### 5-A-2. 정산 모드 / 내기 모드 분리

`Settlement.mode: 'normal' | 'bet'` 를 되살린다. (초안에 있었으나 내기 구조 재설계 때 판별 `method`로 흡수되며 누락됐다.)

- `normal`(정산 모드): 판은 참여 여부만 센다. `RoundCard`에서 방식 세그먼트·판돈·순위·배당·진 쪽·팀 편성 UI를 **전부 숨긴다**
- `bet`(내기 모드): 현재 동작 그대로
- **모드 전환은 비파괴적이다.** `normal`로 바꿔도 각 라운드의 `method`/`ante`/`payout`/`ranking`/`losers`/`teams`를 지우지 않고, `calculate()`가 `mode === 'normal'`일 때 모든 `betDelta`를 0으로 처리한다. 되돌리면 입력이 그대로 살아난다
  - **근거**: 잘못 눌렀을 때 순위·배당이 날아가면 복구할 방법이 없다. 계산에서만 제외하는 쪽이 안전하다
- `ResultCard`는 `normal` 모드에서 "내기±" 열과 판별 내기 요약(D7)을 숨긴다
- 토글 위치는 헤더 — 판마다가 아니라 정산 전체에 걸리는 설정임이 드러나야 한다

**신규 인수조건**
- **G1**: `mode: 'normal'` 이면 내기가 입력된 라운드가 있어도 모든 `betDelta === 0`, `totalImbalance === 0`
- **G2**: `bet` → `normal` → `bet` 왕복 후 `ranking`/`payout`/`losers`/`teams`가 전환 전과 `toEqual` 로 동일
- **G3**: `normal` 모드에서 `RoundCard`에 방식 세그먼트·판돈·순위·배당 UI가 렌더되지 않는다
- **G4**: `normal` 모드에서 `ResultCard`에 "내기±" 열과 판별 내기 요약이 없다

## 6. 검증 절차

1. **단위 테스트** — `npm run test`. `calc.test.ts` / `money.test.ts` 전부 통과. A·B 인수 조건과 1:1 매핑.
2. **타입** — `npx tsc --noEmit` 에러 0.
3. **빌드** — `npm run build` 경고 0. 번들 gzip 크기 측정.
4. **실기기 매트릭스** (수동, 항목별 스크린샷 기록)

   | 기기 / 브라우저 | 검증 항목 |
   |---|---|
   | iPhone Safari | D1, D2, E1, E3 |
   | Android Chrome | D2, E1 |
   | Desktop Chrome 1280px | D3, E1, E4 |
   | iPad Safari 768px | E1 |

5. **시나리오 E2E (수동)** — 8명 추가 → 게임단가 4,000 / 신발비 2,000 → 신발 3명 체크 → 5판 생성:
   - 1판 개인전 `pot`, ante 1,000, 1등 4,000 / 2등 4,000
   - 2판 개인전 `pot` 승자독식
   - 3판 4:4 팀전 `transfer`, 판비 연동
   - 4판 4팀×2명 `pot`, ante 1,000, 1등팀 인당 3,000 / 2등팀 인당 1,000
   - 5판 4명만 참여, `none`

   → 총무 지정 → 결과를 손계산과 대조 → 공유 → 카카오톡 전송 확인 → 새로고침 후 세션 복원 확인.
6. **Lighthouse** (모바일 프로필) — Performance ≥ 90, Accessibility ≥ 95.
7. **완료 선언 전 점검** — 변경 파일에 `TODO` / `FIXME` / `test.skip` / `it.only` / 미구현 분기 grep 결과 0건.

---

## 7. 미결 / 후속 항목

- **공동 순위(동점)** 처리 — 탭 롱프레스로 "직전 등수와 공동"
- URL hash 링크 공유 (`lz-string` 압축) — 받은 사람이 내역 검증
- PWA (`vite-plugin-pwa`) — 볼링장 지하 신호 대응
- 정산 히스토리 목록 및 재사용
- 점수 입력 → 자동 순위 → 점수차 비례 내기
- 정기 모임 그룹 프리셋 (멤버·요금·기본 내기 규칙 묶음 저장)
