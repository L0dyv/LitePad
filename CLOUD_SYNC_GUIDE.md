# LitePad 云同步功能指南

## 术语说明

| 术语 | 说明 |
|------|------|
| **Tab（标签页）** | LitePad 中的笔记单元。采用"Tab"命名是因为应用采用类似浏览器多标签页的交互模式，每个 Tab 就是一个独立的笔记页面。|
| **本地版本号（localVersion）** | 客户端的乐观锁计数器，每次本地修改自增1。服务器端对应字段为 `version`。|
| **同步时间（syncedAt）** | 该 Tab 上次成功同步到服务器的时间戳（**使用服务器返回的 serverTime**，非客户端本地时间）。`null` 表示从未同步过。|
| **软删除（deleted）** | 标记删除而非真正删除。同步时会将删除操作同步到其他设备，同步完成后才真正从数据库删除。|
| **serverTime** | 服务器返回的时间戳（毫秒级 Unix 时间戳）。所有时间比较都基于服务器时间，避免客户端时钟偏差问题。|

## 一、需求分析

### 用户需求
1. **免账户使用** - 应用默认可以无账户使用，数据存储在本地
2. **可选云同步** - 用户可以在设置中启用/禁用云同步功能，随时切换
3. **本地离线优先** - 即使网络断开，应用仍可正常工作
4. **数据不丢失** - 离线3天后重新上线，本地修改和云端修改都不会丢失
5. **自托管支持** - 用户可以部署自己的同步服务器
6. **实时同步** - 多设备之间实时同步数据
7. **简单易用** - "80岁老奶奶都会用"的简单操作流程

### 设计原则
- **Local-first 架构** - 本地为主，云端为辅
- **无中心依赖** - 即使服务器故障，本地数据仍可使用
- **版本控制** - 通过版本号和时间戳追踪变更
- **冲突检测** - 自动检测本地和云端的冲突
- **渐进式启用** - 用户可随时启用/禁用同步

## 二、架构设计

### 2.1 用户流程

```
┌─────────────────────────────────────────────────────────────┐
│  首次打开应用                                                │
│                                                              │
│  → 直接可用，无需任何账户                                     │
│  → 数据存本地，完全离线可用                                   │
│  → 设置里有个「云同步」选项（默认关闭）                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  用户想开启同步                                              │
│                                                              │
│  设置 → 云同步 → 开启 → 登录/注册                             │
│  → 本地数据自动上传到云端                                     │
│  → 之后自动实时同步                                           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  用户想关闭同步                                              │
│                                                              │
│  设置 → 云同步 → 关闭                                        │
│  → 本地数据保留（不删除）                                     │
│  → 云端数据也保留（不删除）                                   │
│  → 只是停止同步，两边各自独立                                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  用户再次开启同步                                            │
│                                                              │
│  → 检测本地和云端的差异                                       │
│  → 无冲突：自动合并（本地新增的上传，云端新增的下载）          │
│  → 有冲突：弹出冲突解决界面，由用户选择                       │
│  → 恢复实时同步                                               │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      用户设备                                │
│  ┌─────────────┐    ┌─────────────┐                        │
│  │  React App  │───▶│ IndexedDB   │  ← 本地持久化            │
│  │  (UI)       │    │ (本地数据库) │    (替代localStorage)   │
│  └──────┬──────┘    └─────────────┘                        │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────┐                                       │
│  │  Sync Engine    │  ← 同步引擎（核心）                     │
│  │  - 变更追踪      │                                       │
│  │  - 冲突检测      │                                       │
│  │  - 离线队列      │                                       │
│  │  - WebSocket   │                                       │
│  └────────┬────────┘                                       │
└───────────┼─────────────────────────────────────────────────┘
            │ HTTPS + WebSocket
            ▼
┌───────────────────────────────────────────────────────────┐
│                   同步服务器 (Hono)                        │
│  ┌──────────────────┐    ┌──────────────┐                 │
│  │  REST API        │    │  WebSocket   │ ← 实时推送       │
│  │  - /auth/login   │    │  (双向通信)   │                 │
│  │  - /sync/pull    │    │              │                 │
│  │  - /sync/push    │    │              │                 │
│  └────────┬─────────┘    └──────┬───────┘                 │
│           │                     │                        │
│           └─────────┬───────────┘                        │
│                     ▼                                     │
│          ┌────────────────────┐                         │
│          │   SQLite Database  │                         │
│          │  - users 表         │                         │
│          │  - tabs 表          │                         │
│          │  - 版本控制         │                         │
│          └────────────────────┘                         │
└───────────────────────────────────────────────────────────┘
```

## 三、技术实现

### 3.1 数据结构

#### 客户端数据结构（camelCase）
```typescript
// 存储在 IndexedDB 中
interface Tab {
    id: string                  // UUID - 全局唯一标识（客户端生成）
    title: string              // 标签页标题
    content: string            // 文本内容
    createdAt: number          // 创建时间（客户端本地时间戳）
    updatedAt: number          // 最后修改时间（客户端本地时间戳）
    
    // 同步相关字段
    localVersion: number       // 本地版本号，每次修改 +1
    syncedAt: number | null    // 上次同步时间（服务器时间戳），null=从未同步
    deleted: boolean           // 软删除标记
}
```

**Tab ID 生成规则**：
- **生成主体**：客户端生成，服务器直接使用客户端提供的 ID
- **生成方式**：`crypto.randomUUID()`（符合 RFC 4122 v4 标准）
- **唯一性保证**：UUID v4 的碰撞概率极低（约 2^-122），实际上可视为唯一
- **首次创建**：Tab 在客户端创建时就生成 ID，即使未同步也有唯一标识

#### 服务器端数据结构（snake_case，SQLite）
```sql
CREATE TABLE tabs (
    id TEXT NOT NULL,              -- 与客户端 id 对应
    user_id TEXT NOT NULL,         -- 所属用户
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    version INTEGER DEFAULT 1,      -- 对应客户端 localVersion
    created_at INTEGER NOT NULL,    -- 对应客户端 createdAt
    updated_at INTEGER NOT NULL,    -- 对应客户端 updatedAt
    deleted INTEGER DEFAULT 0,      -- 0=未删除, 1=已删除
    PRIMARY KEY (id, user_id)
);
```

**字段映射**：客户端使用 camelCase，服务器使用 snake_case，API 传输时自动转换。

#### 同步配置（SyncConfig）
```typescript
interface SyncConfig {
    id: string                 // 固定为 'default'
    enabled: boolean          // 同步是否开启
    userId: string | null     // 登录的用户ID
    serverUrl: string         // 服务器地址
    lastSyncAt: number | null // 上次全局同步时间（服务器时间戳）
    deviceId: string          // 当前设备唯一ID
}
```

**serverUrl 默认值**：
- 默认为空字符串，用户需自行配置
- 开发环境示例：`http://localhost:3000`
- 生产环境示例：`https://sync.your-domain.com`
- 注：本项目暂无官方公共同步服务器，需用户自行部署

**deviceId 说明**：
- 生成方式：首次启动时调用 `crypto.randomUUID()` 生成
- 存储位置：IndexedDB 的 syncConfig 表中
- 重装影响：重装应用或清除数据会导致 deviceId 变化，但不影响同步（用账户关联数据）

#### Token 存储
```typescript
// 存储位置：localStorage
localStorage.setItem('litepad-access-token', 'eyJhbGciOiJIUzI1NiIs...')
localStorage.setItem('litepad-refresh-token', 'eyJhbGciOiJIUzI1NiIs...')
```

**安全考量**：
- Token 存储在 localStorage 中
- Tauri 应用环境下，localStorage 被隔离在应用沙箱内，安全风险较低
- 仍需注意 XSS 攻击风险，确保应用不执行不受信任的脚本

#### 附件数据结构（Attachment）

```typescript
// 客户端 IndexedDB
interface Attachment {
    hash: string            // SHA-256 主键（去重）
    filename: string        // 原始文件名
    mimeType: string        // image/png, image/jpeg 等
    size: number            // 字节数
    ext: string             // 文件扩展名 .png, .jpg
    localPath: string       // 本地文件路径（Tauri 管理）
    syncStatus: 'pending' | 'synced' | 'downloading' | 'error'
    createdAt: number       // 创建时间（客户端本地时间戳）
    syncedAt: number | null // 上次同步时间（**服务器时间戳**），null=从未同步
}
```

**syncStatus 状态说明**：
- `pending`：待上传（本地新增，尚未同步到服务器）
- `synced`：已同步（本地和服务器一致）
- `downloading`：下载中（从服务器下载到本地）
- `error`：同步失败（上传或下载出错，需要重试）

**附件生命周期管理**：
- **添加**：用户粘贴/拖放图片 → 立即保存到本地 → 标记 `syncStatus: 'pending'`
- **上传**：下次同步时批量上传 pending 状态的附件
- **删除**：附件**不会自动删除**，即使引用它的笔记被删除（因为可能被多个笔记引用）
- **垃圾回收**：暂不实现自动清理，用户可手动清理未引用的附件（未来功能）

**Hash 冲突处理**：
- **相同 hash**：意味着文件内容完全相同（SHA-256 碰撞概率可忽略）
  - 服务器只存储第一次上传的元数据（filename、mimeType）
  - 后续相同 hash 的上传会被忽略（INSERT OR IGNORE）
  - 例：用户A上传 `photo.png`，用户B上传相同内容但名为 `image.png`，服务器保留 `photo.png`
- **不同 hash**：就是不同的文件，各自独立存储，不存在冲突
  - 即使 filename 相同，hash 不同也是两个独立附件

```sql
-- 服务器 SQLite
CREATE TABLE attachments (
    hash TEXT NOT NULL,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    ext TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (hash, user_id)
);
```

**图片 URL 格式**：
- **旧格式**：`asset://localhost/C:/path/to/image.png`（绝对路径，不可跨设备）
- **新格式**：`litepad://images/{sha256}{ext}`（如 `litepad://images/a1b2c3...f6.png`）

**Hash 去重机制**：
- 相同图片（内容相同）会生成相同的 SHA-256 hash
- 服务器和客户端都只存储一份
- 节省存储空间和传输带宽

### 3.2 关键技术点

#### 版本控制与变更检测
```
                    ┌──────────────────────────────────────┐
                    │           变更检测逻辑                │
                    └──────────────────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
            syncedAt === null?                updatedAt > syncedAt?
                    │                                 │
              ┌─────┴─────┐                    ┌─────┴─────┐
              ▼           ▼                    ▼           ▼
             YES         NO                   YES         NO
              │           │                    │           │
         从未同步      已同步过             有本地修改    无修改
         需要上传      继续检查              需要同步     已是最新
```

- **localVersion** - 本地乐观锁，每次修改 +1，用于服务器端判断是否接受更新
- **syncedAt** - 上次同步时间戳，用于判断本地是否有未同步的修改
- **变更检测** - `syncedAt === null` 或 `updatedAt > syncedAt` 表示需要同步

#### 冲突检测与处理

**冲突判定条件**：
- **版本比较（核心）**：客户端 `localVersion` 与服务器 `version` 不一致，且两边都有修改
- **时间戳辅助**：`updatedAt > syncedAt` 表示本地有未同步的修改（用于快速判断是否需要推送）

**具体判定逻辑**（推送时）：
1. 服务器检查：客户端提交的 `localVersion` 是否 >= 服务器当前 `version`
2. 如果是：接受客户端版本，服务器 `version` 更新为客户端的 `localVersion`
3. 如果否：说明服务器有更新的版本，标记为冲突

```
场景分析：

场景1：无冲突 - 仅本地修改
  客户端：syncedAt=100, updatedAt=200 (有修改)
  服务器：updated_at=100 (无修改)
  → 直接上传客户端版本

场景2：无冲突 - 仅服务器修改
  客户端：syncedAt=100, updatedAt=100 (无修改)
  服务器：updated_at=200 (有修改)
  → 直接下载服务器版本

场景3：冲突 - 双方都有修改
  客户端：syncedAt=100, updatedAt=200 (有修改)
  服务器：updated_at=150 (也有修改)
  → 弹出冲突解决界面
```

**冲突解决选项**：
| 选项 | 行为 | syncedAt 更新 |
|------|------|---------------|
| 保留本地 | 客户端版本覆盖服务器，localVersion 设为 max(local, server) + 1 | 设为服务器返回的 serverTime |
| 使用云端 | 服务器版本覆盖本地 | 设为服务器返回的 serverTime |
| 保留两个 | 原 Tab 保持本地版本，创建新 Tab 保存云端版本 | 原 Tab: 设为 serverTime；新 Tab: 设为 null（待同步）|

**"保留两个版本"的完整字段初始化**：
```typescript
// 原 Tab（保持本地版本）
{
    ...localTab,
    localVersion: Math.max(localTab.localVersion, remoteTab.version) + 1,
    syncedAt: serverTime  // 使用服务器时间
}

// 新 Tab（保存云端版本）
{
    id: crypto.randomUUID(),                    // 客户端生成新 UUID
    title: remoteTab.title + '（云端）',         // 标题加后缀（如已有后缀则加数字：「云端2」）
    content: remoteTab.content,
    createdAt: remoteTab.createdAt,             // 保留原创建时间
    updatedAt: Date.now(),                      // 当前客户端时间
    localVersion: 1,                            // 新 Tab 从 1 开始
    syncedAt: null,                             // null 表示需要上传
    deleted: false
}
```

**重复标题处理**：如果标题已包含"（云端）"后缀，则改为"（云端2）"、"（云端3）"等。

#### 软删除处理

```
删除流程：
1. 用户删除 Tab → 本地标记 deleted=true, updatedAt=now, localVersion++
2. 同步时推送删除标记到服务器
3. 服务器标记该 Tab 的 deleted=1
4. 其他设备拉取时收到 deleted=true
5. 其他设备本地也标记删除
6. 确认所有设备同步完成后，可选择硬删除（真正删除记录）

注意：目前实现中，软删除的记录会一直保留。
后续可添加定时清理机制（如30天后自动硬删除）。
```

**删除与编辑冲突的优先级**：
```
场景：设备A删除了笔记1，设备B同时编辑了笔记1

规则：编辑操作优先于删除操作（保守策略，避免数据丢失）

处理流程：
1. 设备A推送：笔记1 deleted=true, localVersion=N
2. 设备B推送：笔记1 有内容更新, localVersion=M
3. 服务器比较 localVersion：
   - 如果 M > N：保留编辑，设备A收到"恢复"通知
   - 如果 N > M 或 N == M：标记为冲突，让用户选择
4. 设备A收到变更：笔记1被"复活"，显示最新内容
```

**原因**：删除操作可以重做，但被删除的编辑内容难以恢复。采用保守策略确保数据不丢失。

**关于时间戳的说明**：
- 冲突检测主要依赖 `localVersion`（每次修改自增），而非 `updatedAt`
- `updatedAt` 是客户端本地时间，仅用于显示"最后修改时间"，不参与冲突判定
- 这样设计避免了设备时钟不同步导致的问题

#### 离线支持
- 所有数据优先存储到 IndexedDB（本地数据库）
- 网络断开时，应用继续正常工作
- 变更自动累积，待网络恢复后批量推送
- IndexedDB 配额通常为几百MB到几GB，足够笔记应用使用

#### 实时同步与心跳
- **WebSocket** 双向通信，支持实时推送
- **心跳机制**：每30秒发送 `ping`，服务器响应 `pong`（WebSocket 层面的心跳）
- **超时判定**：客户端 60秒 内没收到任何消息（包括 pong），则认为连接断开，触发重连
- **自动重连**：断开后自动重连，采用指数退避策略
  - 第1次：1秒后重连
  - 第2次：2秒后重连
  - 第3次：4秒后重连
  - 第4次：8秒后重连
  - 第5次：16秒后重连
  - 达到最大次数后停止，用户可手动触发

#### 待同步队列的持久化
- **存储位置**：IndexedDB（非内存）
- **实现方式**：通过 `syncedAt` 和 `syncStatus` 字段判断
  - Tab：`updatedAt > syncedAt` 或 `syncedAt === null` 表示待同步
  - Attachment：`syncStatus === 'pending'` 或 `'error'` 表示待同步
- **应用关闭**：队列不会丢失，下次启动后继续同步
- **大小限制**：无硬性限制，受 IndexedDB 配额约束

#### 多设备同时删除同一文档
- 场景：设备A和设备B同时删除笔记1
- 处理：服务器直接接受，不产生冲突（删除是幂等操作）
- 结果：两个设备的推送都成功，笔记1被标记为已删除

#### 网络切换处理
- WiFi 切换到移动网络时，WebSocket 连接可能断开
- 自动重连机制会尝试重新建立连接
- Token 在连接时验证，重连时使用已保存的 Token，无需重新登录
- 如果 Token 过期，会自动用 refreshToken 刷新

### 3.3 API 设计

#### 认证 API
| 端点 | 方法 | 功能 |
|------|------|------|
| `/auth/register` | POST | 注册新用户 |
| `/auth/login` | POST | 登录获取 Token |
| `/auth/refresh` | POST | 刷新 Token |
| `/auth/logout` | POST | 登出 |

**登出流程**：
```
1. 调用 POST /auth/logout（服务器端使 refreshToken 失效）
2. 断开 WebSocket 连接
3. 清除本地的 accessToken 和 refreshToken
4. 清除 SyncConfig.userId
5. 将 SyncConfig.enabled 设为 false
6. 本地 Tab 和 Attachment 数据保留（不清除）
```

#### 同步 API
| 端点 | 方法 | 功能 |
|------|------|------|
| `/sync/full` | GET | 全量拉取（首次同步）|
| `/sync/pull` | GET | 增量拉取（`?since=timestamp`）|
| `/sync/push` | POST | 推送本地变更 |
| `/ws` | WebSocket | 实时双向同步 |
| `/health` | GET | 健康检查（返回 `{"status":"ok","time":timestamp}`）|

**`/sync/full` vs `/sync/pull?since=0` 的区别**：
- 功能上等价，都返回用户的所有 Tab
- `/sync/full` 语义更清晰，专门用于首次同步
- `/sync/pull?since=0` 是增量拉取的边界情况
- 建议：首次同步用 `/sync/full`，后续同步用 `/sync/pull`

**增量拉取的边界处理**：
- 查询条件：`updated_at > since`（严格大于，不包含等于）
- 示例：`/sync/pull?since=1706900000000` 返回 `updated_at > 1706900000000` 的所有 Tab
- 原因：使用严格大于可避免边界重复，since 通常为上次同步的 serverTime

**WebSocket 连接地址**：
- 格式：`ws://{serverUrl}/ws` 或 `wss://{serverUrl}/ws`（HTTPS 时使用 wss）
- 示例：`wss://sync.example.com/ws`

**WebSocket 认证方式**（推荐 URL 参数）：
```
推荐方式：URL 参数
ws://server/ws?token=eyJhbGciOiJIUzI1NiIs...

服务器收到连接后立即验证 token，无效则关闭连接
```

#### 附件 API
| 端点 | 方法 | 功能 |
|------|------|------|
| `/attachments/meta` | POST | 批量推送附件元数据 |
| `/attachments/needed` | POST | 查询服务器缺失的附件（仅检查，不创建记录）|
| `/attachments/upload/{hash}` | PUT | 上传单个附件（Binary）|
| `/attachments/download/{hash}` | GET | 下载单个附件 |
| `/attachments/batch` | POST | 批量查询**指定 hash** 的附件元数据 |
| `/attachments/list` | GET | 获取用户**所有**附件列表 |

**附件 API 请求/响应格式**：
```typescript
// POST /attachments/needed - 查询缺失附件
// 请求
{ "hashes": ["a1b2c3...", "d4e5f6..."] }
// 响应
{ "needed": ["a1b2c3..."], "serverTime": 1706900000000 }

// POST /attachments/batch - 批量查询元数据
// 请求
{ "hashes": ["a1b2c3..."] }
// 响应
{ "attachments": [{ hash, filename, mimeType, size, ext, createdAt }], "serverTime": ... }
```

**API 区别说明**：
- `/attachments/batch`：传入 hash 数组，返回这些 hash 对应的元数据（用于下载前获取 ext、filename）
- `/attachments/list`：不传参，返回用户所有附件（用于管理界面、统计存储空间）

**附件同步触发时机**：
```
1. 添加图片时：
   - 用户粘贴/拖放图片 → 立即保存到本地文件系统
   - 同时在 IndexedDB 创建 Attachment 记录（syncStatus: 'pending'）
   - 图片 URL 立即可用（litepad://images/{hash}{ext}）
   - 注意：此时图片尚未上传到服务器

2. 同步时（手动触发或 WebSocket 连接后）：
   a. 先同步笔记内容（Tab）
   b. 再同步附件：
      - 推送所有 pending 状态的附件元数据
      - 服务器返回需要上传的 hash 列表
      - 逐个上传附件文件
      - 更新 syncStatus 为 'synced'

3. 其他设备接收笔记时：
   a. 收到包含 litepad://images/xxx 的笔记
   b. 编辑器渲染时检测到图片 URL
   c. 检查本地是否有该 hash 的文件
   d. 没有则显示加载占位符，并后台下载
   e. 下载完成后自动显示图片
```

**litepad:// 协议处理**：
```
解析位置：Tauri 后端（main.rs）注册 register_uri_scheme_protocol

处理流程：
1. 接收请求 litepad://images/{hash}{ext}
2. 在本地 data/images/ 目录查找文件
3. 找到 → 返回文件内容（带正确的 Content-Type 和缓存头）
4. 未找到 → 返回 404

图片未找到时的 UI 处理：
- 编辑器显示占位符图标
- 后台自动尝试从服务器下载
- 下载成功后图片自动显示
- 下载失败后显示错误图标，点击可重试
```

**附件上传失败重试**：
```
失败处理：
1. 上传失败 → syncStatus 设为 'error'
2. 下次同步时自动重试 error 状态的附件
3. 连续失败 3 次后停止自动重试，需用户手动触发

用户可在设置页查看：
- 待上传附件数量
- 上传失败附件数量
- 手动重试按钮
```

**附件下载验证**：
```
上传时验证：服务器计算上传文件的 SHA-256，与 URL 中的 hash 比对
下载时验证：客户端下载后可选验证 hash（默认信任服务器）
Hash 不匹配：拒绝保存，标记为下载失败
```

### 3.4 WebSocket 消息格式

#### 客户端 → 服务器
```typescript
// 推送本地变更
{
    type: 'push',
    tabs: Array<{
        id: string
        title: string
        content: string
        localVersion: number
        createdAt: number
        updatedAt: number
        syncedAt: number | null
        deleted: boolean
    }>
}

// 拉取服务器变更（since 之后的）
{
    type: 'pull',
    since: number  // 时间戳，0 表示全量拉取
}

// 心跳
{ type: 'ping' }
```

#### 服务器 → 客户端
```typescript
// 连接成功
{
    type: 'connected',
    userId: string,
    serverTime: number
}

// 变更推送（来自其他设备的修改）
{
    type: 'changes',
    tabs: Array<{
        id: string
        title: string
        content: string
        version: number        // 服务器版本号，客户端应同步到 localVersion
        createdAt: number
        updatedAt: number
        deleted: boolean
        // 注意：服务器不返回 syncedAt，由客户端设为 serverTime
    }>,
    serverTime: number         // 客户端收到后，将这些 Tab 的 syncedAt 设为此值
}

// 客户端处理 changes 消息的逻辑：
// 1. 遍历 tabs 数组
// 2. 对于每个 tab，先在本地查找：
//    a. 本地不存在该 ID：直接插入，设置 syncedAt = serverTime
//    b. 本地存在且 syncedAt === null：本地是新创建未同步的，标记为冲突
//    c. 本地存在且 updatedAt <= syncedAt：本地无修改，直接用服务器版本覆盖
//    d. 本地存在且 updatedAt > syncedAt：本地有修改，标记为冲突
// 3. 所有处理完成后，更新成功覆盖的 Tab 的 syncedAt 为 serverTime
//
// 重要：syncedAt === null 表示本地新建但从未同步，不能简单判断为"无修改"

// 同步确认
{
    type: 'ack',
    synced: string[],          // 成功同步的 Tab ID 列表（客户端应将这些 Tab 的 syncedAt 设为 serverTime）
    updates: Array<ServerTab>, // 服务器版本更新的 Tab（客户端版本过旧，需要用服务器版本覆盖）
                               // 场景：客户端推送 version=3，但服务器已有 version=5
    conflicts: Array<{         // 冲突列表（需要用户介入）
        local: ClientTab,      // 客户端提交的版本
        remote: ServerTab      // 服务器当前版本
    }>,
    serverTime: number         // 服务器时间戳，客户端用于更新 syncedAt
}

// 心跳响应
{
    type: 'pong',
    serverTime: number
}

// 错误
{
    type: 'error',
    message: string
}
```

### 3.5 认证与 Token 机制

#### Token 类型
| Token | 有效期 | 用途 |
|-------|--------|------|
| accessToken | 1小时 | API 请求认证 |
| refreshToken | 30天 | 刷新 accessToken |

#### Token 刷新流程（REST API）
```
1. 客户端发起 API 请求，附带 accessToken
2. 服务器返回 401 (Token 过期)
3. 客户端用 refreshToken 调用 /auth/refresh
4. 获取新的 accessToken
5. 用新 Token 重试原请求
6. 如果 refreshToken 也过期 → 跳转登录页面
```

#### WebSocket 重连时的 Token 刷新流程
```
┌─────────────────┐
│  WebSocket 断开 │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  指数退避等待   │  1s → 2s → 4s → 8s → 16s
└────────┬────────┘
         │
         ▼
┌─────────────────┐     accessToken 有效？
│  检查 Token    │─────────────────────────┐
└────────┬────────┘                         │
         │ 是                               │ 否/过期
         ▼                                  ▼
┌─────────────────┐                 ┌─────────────────┐
│  尝试重连 WS   │                 │  用 refreshToken │
│  附带 Token    │                 │  获取新 Token    │
└────────┬────────┘                 └────────┬────────┘
         │                                   │
         ▼                                   ▼
    连接成功                           刷新成功？
         │                          ┌────┴────┐
         ▼                          ▼         ▼
┌─────────────────┐              是         否
│  发送 pull     │               │          │
│  同步离线变更   │               ▼          ▼
└─────────────────┘        用新 Token   清除登录态
                           重连 WS      提示重新登录
```

#### 错误码定义
| HTTP 状态码 | 场景 | 错误 | 处理方式 |
|------------|------|------|---------|
| 400 | 通用 | 请求参数错误 | 检查请求格式 |
| 401 | 认证 | Token 无效/过期 | 刷新 Token 或重新登录 |
| 404 | 通用 | 资源不存在 | 检查资源 ID |
| 409 | 注册 | 邮箱已注册 | 提示用户登录而非注册 |
| 409 | 同步 | 数据冲突 | 返回冲突详情，客户端弹出冲突解决界面 |
| 500 | 通用 | 服务器内部错误 | 稍后重试 |

**注意**：同一状态码 409 在不同场景有不同含义，通过响应体的 `code` 字段区分：
```json
// 注册冲突
{ "code": "EMAIL_EXISTS", "message": "邮箱已注册" }

// 数据同步冲突
{ "code": "SYNC_CONFLICT", "conflicts": [...] }
```

### 3.6 完整同步流程（数据流图）

```
用户编辑笔记
     │
     ▼
┌─────────────────┐
│  更新本地 Tab   │  localVersion++, updatedAt=now
│  (IndexedDB)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     WebSocket 已连接？
│  检查连接状态   │─────────────────────────┐
└────────┬────────┘                         │
         │ 是                               │ 否
         ▼                                  ▼
┌─────────────────┐                 ┌─────────────────┐
│  通过 WebSocket │                 │  存入待同步队列 │
│  发送 push 消息 │                 │  等待重连后推送 │
└────────┬────────┘                 └─────────────────┘
         │
         ▼
┌─────────────────┐
│   服务器处理    │
│  - 检查版本号   │
│  - 检测冲突     │
│  - 存储/拒绝    │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
 无冲突      有冲突
    │         │
    ▼         ▼
┌────────┐  ┌────────────┐
│ 返回   │  │ 返回       │
│ ack    │  │ conflict   │
└───┬────┘  └─────┬──────┘
    │             │
    ▼             ▼
┌────────┐  ┌────────────┐
│ 更新   │  │ 弹出冲突   │
│syncedAt│  │ 解决界面   │
└────────┘  └────────────┘
```

### 3.7 同步状态

```typescript
type SyncStatus = 
    | 'disconnected'  // 未连接（未登录或同步已关闭）
    | 'connecting'    // 正在连接 WebSocket
    | 'connected'     // 已连接，待机状态
    | 'syncing'       // 正在同步数据
    | 'error'         // 连接错误
```

状态显示在设置页的「云同步」区块中。

### 3.8 数据迁移（localStorage → IndexedDB）

首次启动新版本时，自动执行迁移：

```
1. 检查 localStorage 中的 'litepad-indexeddb-migrated' 标记
2. 如果未迁移：
   a. 读取 localStorage 中的所有数据
   b. 转换为新的数据结构（添加 localVersion、syncedAt、deleted 字段）
   c. 写入 IndexedDB
   d. 设置迁移完成标记
3. 如果已迁移：跳过

注意：迁移不会删除 localStorage 中的原数据，作为备份保留。
```

**迁移失败的处理**：
```
迁移的幂等性保证：
1. 迁移标记在最后一步设置（所有数据写入成功后）
2. 如果中途失败（配额不足、浏览器崩溃）：
   - 重启应用后，检测到未设置迁移标记
   - 会重新执行迁移（覆盖写入，不会重复）
3. 回滚策略：
   - localStorage 中的原数据始终保留
   - 如需回滚，删除 IndexedDB 数据库，删除迁移标记
   - 应用会从 localStorage 重新加载
```

#### 图片 URL 迁移（v1.x → v2.0.0）

从 v2.0.0 开始，图片使用新的 `litepad://images/{hash}{ext}` 格式。对于从 v1.x 升级的用户，需要迁移旧的 `asset://localhost/...` 格式。

**迁移触发条件**：
```
1. 检查 localStorage 中的 'litepad-last-version' 记录
2. 只有以下情况才执行迁移：
   a. 上次版本 < 2.0.0（老用户升级）
   b. 无版本记录但有历史数据（老用户首次升级到有版本记录的版本）
3. 新用户（首次安装 >= 2.0.0）不执行迁移
```

**迁移流程**：
```
1. 扫描所有笔记，提取 asset://localhost/... 格式的图片路径
2. 对每个旧图片：
   a. 检查文件是否存在
   b. 存在则读取内容、计算 hash、复制到新位置、创建元数据
   c. 不存在则跳过（保留原 URL，后续访问会显示为损坏图片）
3. 更新笔记内容，替换为新的 litepad://images/... URL
4. 标记迁移完成
```

**迁移失败处理**：
```
单个图片迁移失败：
- 文件不存在：跳过该图片，保留原 URL，计数器 +1（skipped）
- 读取失败：跳过该图片，计数器 +1（failed）
- 笔记中的原 URL 保留不变（不会变成损坏的新 URL）

整体迁移失败：
- 如果所有图片都失败：仍然标记迁移完成（避免重复尝试）
- 迁移结果会打印到控制台日志

用户通知：
- 迁移过程静默进行，不阻塞应用启动
- 失败的图片会在编辑器中显示为损坏图片图标
- 未来可添加设置页的"迁移报告"查看功能
```

**版本记录**：
- 每次启动后更新 `litepad-last-version` 为当前版本
- 用于判断后续升级是否需要执行特定版本的迁移

### 3.9 边界情况处理

#### 冲突解决界面关闭时的行为
```
用户弹出冲突解决界面后，直接关闭弹窗（不做选择）：

处理策略：
1. 冲突状态保持，本地数据不变
2. 该 Tab 被标记为"待解决冲突"状态
3. 下次同步时会再次检测到冲突，再次弹出界面
4. 用户可以在设置中查看"未解决冲突数量"
5. 在所有冲突解决前，该 Tab 不会被推送到服务器

UI 提示：
- 状态栏显示"有 N 个冲突待解决"
- 设置页云同步区块显示警告图标
```

#### 多设备同时"保留两个版本"
```
场景：设备A和设备B同时对笔记1产生冲突，都选择"保留两个版本"

设备A的操作：
- 保留"笔记1"（本地版本 A）
- 新建"笔记1（云端）"（来自服务器的版本 B）

设备B的操作：
- 保留"笔记1"（本地版本 B）
- 新建"笔记1（云端）"（来自服务器的版本 A）

同步后的结果：
- 设备A：笔记1、笔记1（云端）、笔记1（云端2）[从B同步来的]
- 设备B：笔记1、笔记1（云端）、笔记1（云端2）[从A同步来的]

可能有 3-4 个版本，但数据不丢失。用户可手动清理。

标题去重规则：
- 检测到"（云端）"后缀已存在 → 改为"（云端2）"
- 检测到"（云端2）"已存在 → 改为"（云端3）"
- 以此类推
```

## 四、项目结构

### 客户端
```
src/
├── db/                          # IndexedDB 数据库
│   └── index.ts                # 数据库模块（含 attachments 表）
├── sync/                        # 云同步模块
│   ├── config.ts               # 同步配置
│   ├── auth.ts                 # 认证
│   ├── api.ts                  # REST API（标签页同步）
│   ├── attachments.ts          # 附件同步
│   ├── websocket.ts            # WebSocket
│   └── index.ts                # 入口
├── utils/
│   ├── storage.ts              # 本地存储
│   └── migration.ts            # 旧图片 URL 迁移
├── lib/
│   └── tauri-api.ts            # Tauri API 封装
└── components/
    ├── AuthModal.tsx           # 登录/注册弹窗
    ├── ConflictResolver.tsx     # 冲突解决界面
    └── Settings.tsx            # 设置页（新增同步配置）
```

### 服务端
```
server/
├── src/
│   ├── index.ts                # 入口
│   ├── routes/
│   │   ├── auth.ts            # 认证 API
│   │   ├── sync.ts            # 同步 API
│   │   └── attachments.ts     # 附件 API
│   ├── ws/
│   │   └── handler.ts         # WebSocket 处理
│   ├── db/
│   │   ├── schema.ts          # 表结构定义（含 attachments 表）
│   │   └── index.ts           # 数据库操作
│   └── utils/
│       ├── jwt.ts             # Token 管理
│       └── conflict.ts        # 冲突检测
├── data/
│   └── attachments/           # 附件文件存储目录
├── package.json
├── tsconfig.json
├── Dockerfile
└── docker-compose.yml
```

## 五、使用指南

### 5.1 用户使用

#### 首次使用
1. 下载并打开 LitePad 应用
2. 无需任何登录，直接使用
3. 新建笔记，正常编辑

#### 启用云同步
1. 打开设置（Ctrl+,）
2. 找到「云同步」区块
3. 打开「启用云同步」开关
4. 弹出登录/注册弹窗
5. 选择登录或注册账户
6. 登录成功后，应用自动同步数据

#### 在另一设备上使用
1. 打开 LitePad 应用
2. 打开设置 → 云同步 → 启用
3. 用同一账户登录
4. 自动拉取云端数据
5. 之后所有修改实时同步

#### 处理冲突
1. 当同一文档在多设备同时修改时，会出现冲突提示
2. 弹窗显示本地版本和云端版本
3. 选择"保留本地"、"使用云端"或"保留两个版本"
4. 点击"解决冲突"完成

#### 禁用同步
1. 打开设置 → 云同步
2. 关闭「启用云同步」开关
3. 本地数据保留，云端数据也保留
4. 随时可以重新启用同步

### 5.2 开发者 / 自托管

#### 部署中心服务器

**使用 Docker（推荐）**
```bash
cd server
docker-compose up -d
```

服务器将在 `http://localhost:3000` 启动

**手动部署**
```bash
cd server
npm install
npm run build
npm start
```

**数据库初始化**：服务器首次启动时自动创建 SQLite 数据库文件和表结构，无需手动操作。数据库文件默认位于 `server/data/litepad.db`。

#### 自托管服务器配置

用户可以在客户端设置中配置自己的服务器地址：

```
设置（Ctrl+,）→ 云同步 → 启用 → 高级设置（点击+号展开）→ 服务器地址
例如：http://192.168.1.100:3000 或 https://sync.your-domain.com
```

**配置入口**：位于 `src/components/Settings.tsx` 中的「云同步」区块，点击「高级设置」展开后可见服务器地址输入框。

#### 环境变量

服务端支持以下环境变量：

```bash
PORT=3000                                    # 服务端口
DB_PATH=./data/litepad.db                   # 数据库文件路径（相对于工作目录）
JWT_SECRET=your-secret-key                 # JWT 密钥（生产环境必须更改）
NODE_ENV=production                        # 环境模式
```

**数据库路径说明**：
| 部署方式 | 工作目录 | 数据库绝对路径 |
|----------|---------|---------------|
| 手动部署 | `server/` | `server/data/litepad.db` |
| Docker 部署 | `/app` | `/app/data/litepad.db`（容器内）|
| Docker + 数据卷 | `/app` | 宿主机映射目录（如 `./data:/app/data`）|

**故障排除时**：根据部署方式选择对应路径删除数据库文件。

#### Docker Compose 配置示例

```yaml
# docker-compose.yml
version: '3.8'
services:
  litepad-sync:
    build: .
    ports:
      - "3000:3000"           # 宿主机端口:容器端口
    volumes:
      - ./data:/app/data      # 持久化数据库到宿主机
    environment:
      - NODE_ENV=production
      - JWT_SECRET=请更换为随机字符串  # 重要：生产环境必须更改
      - PORT=3000
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**部署步骤**：
```bash
cd server
# 生成安全的 JWT_SECRET
export JWT_SECRET=$(openssl rand -hex 32)
# 启动服务
docker-compose up -d
# 查看日志
docker-compose logs -f
```

## 六、功能对比

### 三种使用状态

| 状态 | 描述 | 数据位置 | 使用场景 |
|------|------|----------|---------|
| **未登录** | 纯本地使用 | 仅本地 | 单设备、离线 |
| **已登录 + 同步开** | 自动同步 | 本地 + 云端 | 多设备实时协作 |
| **已登录 + 同步关** | 暂停同步 | 本地（云端冻结） | 临时禁用云同步 |

### 关键场景

#### 场景1：首次启用同步
```
本地有 5 个笔记 → 全部上传到云端 → 结果：本地5个 + 云端5个

详细流程：
1. 用户启用同步并登录
2. 客户端调用 POST /sync/push 推送所有 Tab（syncedAt 为 null 的）
3. 服务器存储成功，返回 { synced: [...], serverTime: 1706900000000 }
4. 客户端将这 5 个笔记的 syncedAt 设为 1706900000000（服务器时间）
5. 更新 SyncConfig.lastSyncAt = 1706900000000
```

#### 场景2：关闭同步后本地新增
```
关闭时：本地5个 + 云端5个
期间：本地新增3个 → 本地8个 + 云端5个
重新开启：检测差异 → 上传新增3个 → 结果：本地8个 + 云端8个
```

#### 场景3：多设备不同修改（冲突）
```
时间线：
T1: 设备A和设备B都同步完成，笔记1内容="Hello"
T2: 设备A离线，编辑笔记1内容="Hello World"
T3: 设备B在线，编辑笔记1内容="Hello LitePad"，同步成功
T4: 设备A上线，尝试同步

检测到冲突：
- 设备A本地版本："Hello World"（T2修改）
- 服务器版本："Hello LitePad"（T3修改）
- 两边都在上次同步(T1)之后修改过 → 冲突

解决方式：
- 弹出冲突解决界面
- 用户选择"保留本地" → 服务器更新为"Hello World"
- 用户选择"使用云端" → 本地更新为"Hello LitePad"
- 用户选择"保留两个" → 保留"Hello World"，新建"笔记1（云端）"内容为"Hello LitePad"
```

#### 场景4：离线3天后重新上线
```
离线期间：本地编辑了10条笔记
上线后：自动检测待同步 → 上传这10条 → 同时下载云端的新数据
结果：完全同步，数据不丢失
```

## 七、性能与限制

### 存储限制
| 项目 | 限制 | 说明 |
|------|------|------|
| IndexedDB 配额 | 浏览器分配（通常几百MB~几GB）| 超出时浏览器会提示用户 |
| 单个 Tab 大小 | 无硬性限制 | 建议单个笔记不超过 1MB |
| Tab 数量 | 无硬性限制 | 性能考虑，建议不超过 1000 个 |

### 同步性能
| 操作 | 预期耗时 | 说明 |
|------|---------|------|
| 首次全量同步 | 取决于数据量 | 100个笔记（平均 10KB/个）约 1-3 秒 |
| 增量同步 | < 500ms | 仅同步变更部分 |
| WebSocket 实时推送 | < 100ms | 同区域服务器（延迟 < 50ms 的网络环境）|

**性能基准假设**：
- 单个笔记平均大小：10KB（约 5000 个中文字符或 10000 个英文字符）
- 网络环境：延迟 < 100ms 的稳定连接
- 服务器配置：单核 1GB 内存 VPS 可支持约 100 并发用户

### 已知限制
1. **图片大小限制**：单个图片最大 10MB
2. **不支持协作编辑**：同一文档多人同时编辑会产生冲突
3. **不支持离线注册**：注册和登录需要网络连接
4. **单点服务器**：默认配置为单服务器，无高可用
5. **仅支持常见图片格式**：PNG, JPG, GIF, WebP, SVG, BMP

## 八、安全性

### 认证
- 密码使用 bcryptjs 进行加密存储
- JWT Token 用于身份验证
- 刷新 Token 用于长期登录
- 支持 Token 过期和自动刷新

### 隐私
- 所有通信使用 HTTPS/WSS 加密
- 用户数据与账户绑定，互不可见
- 本地数据可离线使用，不依赖服务器

### 数据持久化
- SQLite 数据库文件存储在 `data/` 目录
- 支持定期备份
- Docker 部署时使用数据卷持久化

## 九、故障排除

### 问题：无法连接到服务器
- 检查网络连接
- 检查服务器地址是否正确
- 检查防火墙设置

### 问题：同步卡住
- 检查本地网络连接
- 刷新浏览器或重启应用
- 查看浏览器控制台错误日志

### 问题：数据不一致
- 检查 IndexedDB 中的数据
- 查看同步日志
- 手动触发同步按钮

### 问题：服务器数据库损坏
- 停止服务器
- 删除 `data/litepad.db` 文件
- 重启服务器（会重新初始化数据库）

## 十、后续改进方向

1. **CRDT 自动合并** - 使用 Yjs 库自动合并文本冲突
2. **增强搜索** - 支持云端搜索和全文检索
3. **协作编辑** - 支持多用户实时协作编辑同一文档
4. **版本历史** - 保存文档修改历史，支持版本回溯
5. **分享功能** - 支持分享笔记给其他用户
6. **权限控制** - 支持设置笔记的访问权限
7. **定时备份** - 自动定期备份用户数据
8. **邮件通知** - 多设备修改时邮件提醒

---

**最后更新**: 2026-02-03
**项目**: LitePad - 本地优先的云同步笔记应用
