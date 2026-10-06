/**
 * 数据库实现的唯一权威位置已迁移至共享包 `@openreel/expo-db`（TV 端 apps/tv 复用同一实现）。
 * 本文件保留为垫片，仅做 re-export，使手机端既有 import 路径全部继续可用（零回归），
 * 也保证此后 schema/迁移变更只需在共享包改一处，移动端与 TV 端永不漏改。
 */
export {
  ExpoSqliteProvider,
  MigrationDiskError,
  type MigrationProgress,
} from '@openreel/expo-db';