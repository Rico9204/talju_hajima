# 코드 실행용 C 컴파일러 이미지(talju-run-c). 컴파일러와 C 표준 라이브러리만 넣은 작은 이미지다.
FROM alpine:3.20
RUN apk add --no-cache gcc musl-dev
