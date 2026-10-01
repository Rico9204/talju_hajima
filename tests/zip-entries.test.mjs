// ZIP 목록 보기: 압축을 풀지 않고 중앙 디렉터리만 읽어 파일 목록·크기를 낸다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { listZipEntries, zipEntriesText } from '../src/lib/zipEntries.ts';

// 테스트용 최소 zip(압축 없이 저장). names: [이름 바이트, UTF-8 표시 여부, 내용]
function buildZip(files, comment = '') {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, utf8, content] of files) {
    const data = Buffer.from(content);
    const flags = utf8 ? 0x800 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(flags, 6);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(flags, 8);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(Buffer.byteLength(comment), 20);
  return new Blob([Buffer.concat([...locals, dir, end, Buffer.from(comment)])]);
}

test('ZIP 목록: 파일만(폴더 제외) 이름순, 압축 전 크기, 끝에 주석이 있어도 찾는다', async () => {
  const zip = buildZip([
    [Buffer.from('src/'), true, ''],
    [Buffer.from('src/main.ts'), false, 'console.log(1)'],
    [Buffer.from('README.md'), false, '# hi'],
    [Buffer.from('docs\\a.md'), false, 'a'], // Windows Compress-Archive식 구분자
  ], '배포용 압축');
  assert.deepEqual(await listZipEntries(zip), [
    { path: 'docs/a.md', size: 1 },
    { path: 'README.md', size: 4 },
    { path: 'src/main.ts', size: 14 },
  ]);
});

test('ZIP 목록: UTF-8 표시가 있는 이름과, 한국어 Windows식(CP949) 이름을 모두 읽는다', async () => {
  const zip = buildZip([
    [Buffer.from('보고서.hwp'), true, 'x'],
    [Buffer.from([0xc7, 0xd1, 0xb1, 0xdb, 0x2e, 0x74, 0x78, 0x74]), false, 'yy'], // "한글.txt" (CP949)
  ]);
  assert.deepEqual((await listZipEntries(zip)).map((e) => e.path).sort(), ['보고서.hwp', '한글.txt']);
});

test('ZIP 목록: zip이 아니면 안내 오류, 버전 비교용 글은 한 파일당 한 줄', async () => {
  await assert.rejects(listZipEntries(new Blob(['그냥 글자'])), /ZIP 파일이 아니거나/);
  assert.equal(zipEntriesText([{ path: 'a.txt', size: 10 }, { path: 'b.bin', size: 2048 }]), 'a.txt (10 B)\nb.bin (2.0 KB)');
});
