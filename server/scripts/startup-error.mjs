export function startupError(error) {
  const errors = [error, ...(Array.isArray(error?.errors) ? error.errors : [])];
  if (errors.some((item) => item?.code === 'ECONNREFUSED')) {
    return 'PostgreSQL 연결이 거부되었습니다. Docker Desktop이 정상 실행되는지 확인한 뒤 프로젝트 루트에서 docker compose -f server/docker-compose.yml up -d 를 실행하세요. 별도 PostgreSQL을 사용한다면 해당 서버와 DATABASE_URL을 확인하세요.';
  }
  if (error?.code === '42P01') {
    return 'DB 초기화가 필요합니다. 새 DB라면 server 폴더에서 pnpm run db:setup 을 실행하세요. 기존 DB라면 누락된 마이그레이션을 확인하세요.';
  }
  return error?.message || error?.code || error?.name || '서버 시작에 실패했습니다.';
}
