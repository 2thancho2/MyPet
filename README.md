# 🐾 Desktop Pet (Electron)

## 1. 준비
1. [Node.js](https://nodejs.org) (LTS) 설치
2. 기존 스프라이트 시트 `desktop_pet_sprites.png` 를 `assets/` 폴더에 넣기
   (없으면 기본 펫이 🐶 이모지로 표시돼요)
3. 이 폴더에서:
   ```
   npm install --save-dev electron electron-builder
   ```

## 2. 실행
```
npm start
```
- 트레이(메뉴바) 아이콘 → 설정 / 펫 추가 / 종료
- 펫 좌클릭: 상태창, 드래그: 이동, 우클릭: 원형 메뉴

## 3. 설치 파일 만들기
```
npm run dist
```
- Windows 설치 파일은 Windows에서, Mac dmg는 Mac에서 빌드해야 해요.
- 서명하지 않으면 Mac은 Gatekeeper, Windows는 SmartScreen 경고가 떠요.

## 구조
- `main.js`      창/트레이/설정 저장 (설정 파일: 앱 데이터 폴더의 settings.json)
- `preload.js`   화면 <-> 메인 연결
- `renderer/overlay.*`   펫이 사는 투명 전체화면 (행동, 상호작용, 메뉴)
- `renderer/settings.*`  설정 창 (펫 관리, 사진 펫 만들기, 동작 설정)

## 알려진 한계
- 주 모니터에만 표시돼요.
- 펫의 클릭 영역은 이미지 전체 사각형이에요.
- 사진 펫은 배경 제거를 하지 않아요 (원형 스티커로 자르거나, 투명 PNG를 그대로 사용).
