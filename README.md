# 자리바꾸기

Electron 기반 교실 자리 랜덤 배치 프로그램.

## 실행

```bash
npm install
npm start
```

## 현재 기능

- 학생 이름 여러 줄 입력
- 행/열 좌석 설정
- 랜덤 자리 배치
- 카메라 플래시/사진 찍힘 효과
- JSON 저장/불러오기

## 구조

```text
src/
├── main/       Electron 메인 프로세스
├── preload/    Renderer에 노출할 안전 API
└── renderer/   화면, CSS, 클라이언트 로직
```
