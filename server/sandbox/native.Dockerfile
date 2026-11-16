# 코드 실행용 C·C++ 컴파일러 이미지(talju-run-native). gcc·g++와 C 표준 라이브러리만 넣은 작은 이미지다.
FROM alpine:3.20
RUN apk add --no-cache gcc g++ musl-dev
