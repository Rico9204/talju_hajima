import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

// 브라우저 Web Push 구독 정보(PushManager.subscribe() 결과) — 실제로 푸시를 "보내는" 로직은
// 아직 없다(VAPID 개인키/web-push 발송 트리거가 어디에도 없음). 이 모듈은 DataRepository가
// 요구하는 저장/삭제만 구현하고, 발송 기능은 트리거할 이벤트가 정해지면 별도로 추가한다.
@Entity('push_subscriptions')
@Unique(['endpoint'])
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'text' })
  endpoint: string;

  @Column()
  p256dh: string;

  @Column()
  auth: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
