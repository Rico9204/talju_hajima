import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity.js';
import { BoardPost } from './board-post.entity.js';

// 업로드는 글쓰기보다 먼저 일어난다(uploadBoardAttachment → 받은 id를 글 생성 요청에 포함) —
// 그래서 postId가 nullable: 올린 직후엔 null이었다가 글이 실제로 만들어지면 그 글에 연결된다.
// data는 base64 data: URL로 그대로 저장(ProjectFile.content와 같은 방식, 별도 스토리지 없음).
@Entity('board_attachments')
export class BoardAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BoardPost, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: BoardPost | null;

  @Column({ name: 'post_id', type: 'uuid', nullable: true })
  postId: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploader_id' })
  uploader: User;

  @Column({ name: 'uploader_id' })
  uploaderId: string;

  @Column()
  name: string;

  @Column({ name: 'byte_size' })
  byteSize: number;

  @Column()
  kind: 'image' | 'file';

  @Column({ name: 'mime_type', type: 'varchar', nullable: true })
  mimeType: string | null;

  @Column({ type: 'text' })
  data: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
