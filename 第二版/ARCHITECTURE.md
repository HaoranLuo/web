# 羽毛球社团数字化管理平台 - 架构设计

本文档使用 Mermaid 图表详细说明系统架构设计。

---

## 1. 系统整体架构图

```mermaid
graph TB
    subgraph "前端层 Frontend"
        A[HTML/CSS/JavaScript<br/>用户界面]
        A1[index.html<br/>主页面]
        A2[admin.html<br/>管理后台]
        A3[styles.css<br/>样式文件]
        A4[script.js<br/>前端逻辑]
        A5[admin-script.js<br/>管理逻辑]
    end

    subgraph "API 网关层 Netlify Functions"
        B[用户相关 API]
        B1[config.js<br/>配置获取]
        B2[create-profile.js<br/>创建资料]
        B3[register.js<br/>活动报名]
        B4[final_cancel_registration_js.js<br/>取消报名]

        C[管理员 API]
        C1[admin-events.js<br/>活动管理]
        C2[admin-finance.js<br/>财务管理]
        C3[admin-inventory.js<br/>物资管理]
        C4[admin-roles.js<br/>角色管理]
        C5[approvals.js<br/>审批流程]
    end

    subgraph "数据层 Supabase"
        D[认证服务<br/>Supabase Auth]
        E[数据库<br/>PostgreSQL]
        E1[用户表 profiles]
        E2[活动表 events]
        E3[分组表 event_groups]
        E4[报名表 registrations]
        E5[财务表 finance_records]
        E6[物资表 inventory]
        E7[管理员表 admin_roles]
        E8[审批表 approvals]

        F[安全层<br/>Row Level Security]
    end

    subgraph "外部服务"
        G[微信小程序<br/>领票系统]
        H[学校活动网<br/>签到系统]
    end

    A --> B
    A --> C
    B --> D
    C --> D
    B --> E
    C --> E
    E --> F
    A --> G
    A --> H

    style A fill:#e1f5ff
    style B fill:#fff4e6
    style C fill:#fff4e6
    style D fill:#f3e5f5
    style E fill:#e8f5e9
    style F fill:#ffebee
    style G fill:#fce4ec
    style H fill:#fce4ec
```

---

## 2. 数据库 ER 图（实体关系图）

```mermaid
erDiagram
    AUTH_USERS ||--o| PROFILES : "has"
    AUTH_USERS ||--o{ REGISTRATIONS : "creates"
    AUTH_USERS ||--o{ ADMIN_ROLES : "has"

    EVENTS ||--o{ EVENT_GROUPS : "contains"
    EVENTS ||--o{ REGISTRATIONS : "has"

    EVENT_GROUPS ||--o{ REGISTRATIONS : "has"

    PROFILES ||--o{ APPROVALS : "submits"

    AUTH_USERS {
        uuid id PK
        string email
        timestamp created_at
    }

    PROFILES {
        uuid id PK "FK to auth.users"
        string real_name
        string student_id UK
        string college
        string email
        timestamp created_at
        timestamp updated_at
    }

    EVENTS {
        bigint id PK
        string title
        text description
        string status "open|ended"
        timestamp created_at
        timestamp updated_at
    }

    EVENT_GROUPS {
        bigint id PK
        bigint event_id FK
        string name
        int capacity
        int claimed
        string share_link
        string checkin_img
        timestamp created_at
        timestamp updated_at
    }

    REGISTRATIONS {
        bigint id PK
        uuid user_id FK
        bigint group_id FK
        bigint event_id FK
        timestamp created_at
    }

    FINANCE_RECORDS {
        bigint id PK
        string type "income|expense"
        decimal amount
        text description
        timestamp created_at
    }

    INVENTORY {
        bigint id PK
        string name
        string category "fixed_asset|consumable"
        int quantity
        string unit
        text description
        timestamp created_at
        timestamp updated_at
    }

    ADMIN_ROLES {
        bigint id PK
        uuid user_id FK
        string role "super_admin|event_manager|finance_manager|inventory_manager"
        timestamp created_at
    }

    APPROVALS {
        bigint id PK
        uuid user_id FK
        string field_name
        string old_value
        string new_value
        string status "pending|approved|rejected"
        uuid approved_by FK
        timestamp created_at
        timestamp updated_at
    }
```

---

## 3. 用户活动报名流程图

```mermaid
sequenceDiagram
    participant U as 用户浏览器
    participant F as Netlify Functions
    participant D as Supabase Database
    participant A as Supabase Auth

    U->>U: 用户点击"报名"按钮
    U->>A: 获取当前用户 Token
    A-->>U: 返回 JWT Token

    U->>F: POST /register<br/>{group_id, token}
    F->>A: 验证 Token
    A-->>F: 用户 ID

    F->>D: 开始事务
    D->>D: 检查互斥锁<br/>SELECT * FROM registrations<br/>WHERE user_id=$1 AND event_id=$2

    alt 已报名其他分组
        D-->>F: 返回冲突错误
        F-->>U: 400 错误：已报名其他分组
    else 未报名
        D->>D: 原子操作检查库存<br/>UPDATE event_groups<br/>SET claimed = claimed + 1<br/>WHERE id=$1 AND claimed < capacity<br/>RETURNING *

        alt 库存不足
            D-->>F: UPDATE 返回 0 行
            F-->>U: 400 错误：名额已满
        else 库存充足
            D->>D: 插入报名记录<br/>INSERT INTO registrations<br/>(user_id, group_id, event_id)
            D->>D: 触发器更新 claimed 计数
            D-->>F: 提交事务，返回成功
            F-->>U: 200 成功：报名成功

            U->>U: 显示签到二维码 Modal
            U->>U: 用户扫码完成签到
            U->>U: 点击"我已签到"
            U->>U: 显示领票链接（跳转微信小程序）
        end
    end
```

---

## 4. 管理员权限控制流程图

```mermaid
flowchart TD
    Start[管理员发起操作] --> CheckAuth{检查用户认证}
    CheckAuth -->|未登录| Reject1[返回 401 错误]
    CheckAuth -->|已登录| GetRole[查询 admin_roles 表]

    GetRole --> HasRole{是否有管理员角色?}
    HasRole -->|否| Reject2[返回 403 错误：无权限]
    HasRole -->|是| CheckPerm{检查具体权限}

    CheckPerm -->|活动管理| EventPerm{role=super_admin<br/>OR event_manager?}
    CheckPerm -->|财务管理| FinancePerm{role=super_admin<br/>OR finance_manager?}
    CheckPerm -->|物资管理| InvPerm{role=super_admin<br/>OR inventory_manager?}
    CheckPerm -->|角色管理| SuperPerm{role=super_admin?}

    EventPerm -->|否| Reject3[返回 403 错误]
    EventPerm -->|是| Execute[执行操作]

    FinancePerm -->|否| Reject3
    FinancePerm -->|是| Execute

    InvPerm -->|否| Reject3
    InvPerm -->|是| Execute

    SuperPerm -->|否| Reject3
    SuperPerm -->|是| Execute

    Execute --> RLS[数据库 RLS 策略二次验证]
    RLS -->|通过| Success[操作成功]
    RLS -->|拒绝| Reject4[返回数据库错误]

    style Start fill:#e3f2fd
    style Success fill:#c8e6c9
    style Reject1 fill:#ffcdd2
    style Reject2 fill:#ffcdd2
    style Reject3 fill:#ffcdd2
    style Reject4 fill:#ffcdd2
    style RLS fill:#fff9c4
```

---

## 5. 并发安全机制图

```mermaid
sequenceDiagram
    participant U1 as 用户1
    participant U2 as 用户2
    participant U3 as 用户3
    participant API as API Server
    participant DB as PostgreSQL

    Note over DB: 初始状态：claimed=9, capacity=10<br/>剩余 1 个名额

    par 并发请求
        U1->>API: 报名请求 (t=0ms)
        U2->>API: 报名请求 (t=5ms)
        U3->>API: 报名请求 (t=10ms)
    end

    API->>DB: 用户1: UPDATE event_groups<br/>SET claimed = claimed + 1<br/>WHERE id=1 AND claimed < 10
    Note over DB: 行锁 LOCKED
    DB->>DB: 检查 claimed(9) < capacity(10) ✓
    DB->>DB: claimed = 10
    DB-->>API: 返回 1 行 (成功)
    Note over DB: 行锁 RELEASED
    API-->>U1: 报名成功

    API->>DB: 用户2: UPDATE event_groups<br/>SET claimed = claimed + 1<br/>WHERE id=1 AND claimed < 10
    Note over DB: 行锁 LOCKED
    DB->>DB: 检查 claimed(10) < capacity(10) ✗
    DB-->>API: 返回 0 行 (失败)
    Note over DB: 行锁 RELEASED
    API-->>U2: 名额已满

    API->>DB: 用户3: UPDATE event_groups<br/>SET claimed = claimed + 1<br/>WHERE id=1 AND claimed < 10
    Note over DB: 行锁 LOCKED
    DB->>DB: 检查 claimed(10) < capacity(10) ✗
    DB-->>API: 返回 0 行 (失败)
    Note over DB: 行锁 RELEASED
    API-->>U3: 名额已满

    Note over U1,DB: 结果：只有用户1报名成功<br/>claimed=10, capacity=10<br/>无超卖！
```

---

## 6. 技术栈层级图

```mermaid
graph LR
    subgraph "部署层 Deployment"
        Deploy[Netlify<br/>全球 CDN + 自动 CI/CD]
    end

    subgraph "前端层 Frontend"
        HTML[HTML5<br/>语义化标签]
        CSS[CSS3<br/>Grid + Flexbox]
        JS[Vanilla JavaScript<br/>无框架依赖]
    end

    subgraph "后端层 Backend"
        NF[Netlify Functions<br/>Serverless 架构]
        NodeJS[Node.js 运行时]
    end

    subgraph "数据层 Data"
        SB[Supabase<br/>开源 BaaS]
        PG[PostgreSQL 15<br/>关系型数据库]
        Auth[Supabase Auth<br/>JWT 认证]
        Storage[Supabase Storage<br/>文件存储]
    end

    subgraph "安全层 Security"
        RLS[Row Level Security<br/>行级权限控制]
        HTTPS[HTTPS/TLS<br/>加密传输]
        JWT[JWT Token<br/>无状态认证]
    end

    Deploy --> HTML
    Deploy --> CSS
    Deploy --> JS
    Deploy --> NF

    HTML --> SB
    CSS --> SB
    JS --> SB
    NF --> SB

    SB --> PG
    SB --> Auth
    SB --> Storage

    PG --> RLS
    Auth --> JWT
    NF --> HTTPS

    style Deploy fill:#4caf50
    style HTML fill:#e3f2fd
    style CSS fill:#e3f2fd
    style JS fill:#e3f2fd
    style NF fill:#fff3e0
    style SB fill:#f3e5f5
    style PG fill:#e8f5e9
    style RLS fill:#ffebee
```

---

## 7. 数据流向图

```mermaid
flowchart LR
    subgraph User["用户浏览器"]
        UI[用户界面]
        LocalStorage[本地缓存<br/>Token/Profile]
    end

    subgraph Netlify["Netlify 边缘节点"]
        CDN[静态资源 CDN<br/>HTML/CSS/JS]
        Functions[Serverless Functions<br/>API 端点]
    end

    subgraph Supabase["Supabase 云服务"]
        AuthService[认证服务<br/>登录/注册]
        Database[(PostgreSQL<br/>业务数据)]
        RealTime[实时订阅<br/>WebSocket]
    end

    UI -->|HTTP GET| CDN
    CDN -->|返回静态文件| UI

    UI -->|API 请求| Functions
    Functions -->|查询/更新| Database
    Database -->|返回数据| Functions
    Functions -->|JSON 响应| UI

    UI -->|登录/注册| AuthService
    AuthService -->|JWT Token| UI
    UI -->|存储 Token| LocalStorage

    Database -.->|数据变更通知| RealTime
    RealTime -.->|推送更新| UI

    style User fill:#e1f5ff
    style Netlify fill:#fff8e1
    style Supabase fill:#f3e5f5
    style Database fill:#c8e6c9
    style LocalStorage fill:#ffecb3
```

---

## 8. 安全防护层级图

```mermaid
graph TB
    subgraph "第一层：网络层"
        HTTPS[HTTPS 加密传输<br/>TLS 1.3]
        CDN[Netlify CDN<br/>DDoS 防护]
    end

    subgraph "第二层：认证层"
        JWT[JWT Token 验证<br/>过期时间控制]
        MFA[邮箱验证<br/>防止虚假注册]
    end

    subgraph "第三层：授权层"
        RoleCheck[角色权限检查<br/>admin_roles 表]
        RLS[Row Level Security<br/>数据库行级权限]
    end

    subgraph "第四层：数据层"
        Constraint[数据库约束<br/>CHECK/UNIQUE/FK]
        Trigger[触发器验证<br/>业务逻辑检查]
    end

    subgraph "第五层：审计层"
        Log[操作日志<br/>created_at/updated_at]
        Approval[审批流程<br/>approvals 表]
    end

    HTTPS --> JWT
    CDN --> JWT
    JWT --> RoleCheck
    MFA --> RoleCheck
    RoleCheck --> RLS
    RLS --> Constraint
    Constraint --> Trigger
    Trigger --> Log
    RoleCheck --> Approval

    style HTTPS fill:#ffcdd2
    style JWT fill:#f8bbd0
    style RoleCheck fill:#e1bee7
    style RLS fill:#d1c4e9
    style Constraint fill:#c5cae9
    style Log fill:#bbdefb
```

---

## 9. 模块依赖关系图

```mermaid
graph TD
    A[index.html 主页面] --> B[script.js 前端核心]
    A1[admin.html 管理后台] --> B1[admin-script.js 管理核心]

    B --> C[Supabase Client SDK]
    B1 --> C

    B --> D[用户 API]
    D --> D1[config.js]
    D --> D2[create-profile.js]
    D --> D3[register.js]
    D --> D4[final_cancel_registration_js.js]

    B1 --> E[管理员 API]
    E --> E1[admin-events.js]
    E --> E2[admin-finance.js]
    E --> E3[admin-inventory.js]
    E --> E4[admin-roles.js]
    E --> E5[approvals.js]

    D --> F[Supabase Auth]
    E --> F

    D --> G[Supabase Database]
    E --> G

    G --> H[数据库触发器]
    H --> H1[update_updated_at_column]
    H --> H2[update_group_claimed_safe]
    H --> H3[handle_new_user]

    G --> I[RLS 策略]
    I --> I1[SELECT 策略]
    I --> I2[INSERT 策略]
    I --> I3[UPDATE 策略]
    I --> I4[DELETE 策略]

    style A fill:#e3f2fd
    style A1 fill:#e3f2fd
    style B fill:#fff3e0
    style B1 fill:#fff3e0
    style C fill:#f3e5f5
    style D fill:#e8f5e9
    style E fill:#e8f5e9
    style F fill:#fff9c4
    style G fill:#c8e6c9
    style H fill:#ffccbc
    style I fill:#ffcdd2
```

---

## 10. 部署流程图

```mermaid
flowchart TD
    Start[开发者提交代码] --> Git[Git Push to GitHub]
    Git --> Netlify[Netlify 检测到代码变更]

    Netlify --> Build[构建阶段]
    Build --> B1[安装依赖<br/>npm install]
    B1 --> B2[复制文件到 dist]
    B2 --> B3[注入环境变量]

    B3 --> Deploy[部署阶段]
    Deploy --> D1[上传静态文件到 CDN]
    Deploy --> D2[部署 Functions 到边缘节点]

    D1 --> Test[健康检查]
    D2 --> Test

    Test -->|失败| Rollback[自动回滚到上一版本]
    Test -->|成功| Live[发布到生产环境]

    Live --> DNS[更新 DNS 记录]
    DNS --> Cache[清除 CDN 缓存]
    Cache --> Done[部署完成]

    Rollback --> Alert[发送告警通知]
    Alert --> Fix[开发者修复问题]
    Fix --> Start

    style Start fill:#e3f2fd
    style Done fill:#c8e6c9
    style Rollback fill:#ffcdd2
    style Alert fill:#ffcdd2
    style Live fill:#c8e6c9
```

---

## 11. 系统扩展规划图

```mermaid
mindmap
  root((羽毛球社团<br/>管理平台))
    当前功能
      用户系统
        注册登录
        资料管理
      活动报名
        多分组
        库存控制
        签到验证
      管理后台
        权限管理
        活动管理
        财务管理
        物资管理
      社务公示
        财务流水
        物资展示

    近期规划 Phase 1
      积分系统
        签到积分
        活动参与积分
        积分兑换奖品
      消息通知
        活动提醒
        签到提醒
        系统公告
      数据统计
        参与度分析
        用户活跃度
        财务报表

    中期规划 Phase 2
      社区功能
        论坛讨论
        技术分享
        约球功能
      预约系统
        场地预约
        器材租借
      评价系统
        活动评价
        教练评分

    长期规划 Phase 3
      移动端 App
        React Native
        离线支持
        推送通知
      AI 功能
        智能配对
        技术分析
        训练建议
      多社团支持
        平台化
        数据隔离
        统一管理
```

---

## 总结

本架构文档通过 11 张 Mermaid 图表，从不同维度展示了羽毛球社团数字化管理平台的技术架构：

1. **整体架构图**：展示前端、API、数据层的整体关系
2. **ER 图**：详细的数据库表结构和关系
3. **活动报名流程图**：核心业务流程的时序图
4. **权限控制流程图**：管理员权限验证逻辑
5. **并发安全机制图**：解决超卖问题的技术原理
6. **技术栈层级图**：各层技术选型
7. **数据流向图**：数据在系统中的流动路径
8. **安全防护层级图**：多层次安全防护机制
9. **模块依赖关系图**：代码模块间的依赖关系
10. **部署流程图**：CI/CD 自动化部署流程
11. **系统扩展规划图**：未来功能规划脑图

这些图表可以帮助开发者快速理解系统设计，也可用于技术文档、团队培训和对外展示。
