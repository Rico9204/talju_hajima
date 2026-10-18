import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

// 사용자가 캠퍼스 공지 크롤러(프론트의 lib/crawler)에서 스크랩한 공지 — 공지 자체는 외부
// 대학 게시판을 그대로 긁어온 것이라 여기 저장하지 않고, 사용자가 다시 찾아볼 수 있게 스냅샷만
// 보관한다(원문이 나중에 삭제/변경돼도 스크랩 당시 모습은 남아있도록).
@Entity('scrapped_notices')
@Unique(['userId', 'noticeId'])
export class ScrappedNotice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  // 프론트 NoticeItem.id — 학교+게시판+게시글 기준으로 안정적인 문자열 id(크롤러가 생성).
  @Column({ name: 'notice_id' })
  noticeId: string;

  @Column({ name: 'school_code' })
  schoolCode: string;

  @Column({ name: 'school_name' })
  schoolName: string;

  @Column()
  category: string;

  @Column()
  title: string;

  @Column()
  author: string;

  @Column({ name: 'post_date' })
  postDate: string;

  @Column()
  link: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
