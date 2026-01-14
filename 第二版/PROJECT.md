# 羽毛球社团数字化管理平台 - 项目介绍

## 📋 项目概述

羽毛球社团数字化管理平台是一个完整的社团管理解决方案，旨在解决传统社团管理中的痛点：活动报名混乱、财务不透明、物资管理困难等问题。本平台采用现代化的 Serverless 架构，实现了零成本部署、高并发处理和完善的权限管理。

### 核心价值
- **高效管理**：自动化活动报名、签到核验、库存控制全流程
- **透明公开**：财务流水、物资管理实时公示，增强成员信任
- **技术先进**：采用 Serverless 架构，无需服务器维护，自动扩展
- **安全可靠**：多层次安全防护，数据库级别权限控制

---

## 🎯 核心功能

### 1. 用户管理系统
**功能描述**：
- 用户注册/登录（基于 Supabase Auth）
- 个人资料管理（姓名、学号、学院、邮箱）
- 自动创建用户 Profile（首次登录触发）

**技术亮点**：
- Row Level Security (RLS) 确保用户只能修改自己的资料
- 自动触发器同步 auth.users 和 profiles 表
- 学号唯一性校验防止重复注册

### 2. 活动报名系统
**功能描述**：
- 多分组活动创建（如新手场/高手场分流）
- 实时库存显示（已报名/总容量）
- 一键报名，自动库存扣减
- 强制签到流程（显示签到二维码）
- 领票链接生成（微信小程序跳转）

**技术亮点**：
- **原子操作**：数据库事务保证库存操作原子性，防止超卖
- **互斥锁**：同一用户不能重复报名同一活动的不同分组
- **触发器自动更新**：`update_group_claimed_safe()` 函数自动更新 claimed 计数
- **并发安全**：使用 `WHERE claimed < capacity` 条件进行库存检查，配合 PostgreSQL 的 MVCC 机制

### 3. 管理员系统
**功能描述**：
- 角色权限管理（超级管理员、财务、物资管理员等）
- 活动创建/编辑/结束
- 财务记录添加/删除/审批
- 物资管理添加/修改/删除
- 用户审批流程（新用户信息审核）

**权限分级**：
- `super_admin`：全部权限
- `event_manager`：活动管理权限
- `finance_manager`：财务管理权限
- `inventory_manager`：物资管理权限

### 4. 社务公示系统
**功能描述**：
- 财务流水公示（收入/支出记录）
- 物资库存展示（固定资产/消耗品分类）
- 实时数据更新

**透明化设计**：
- 所有成员可查看财务和物资信息
- 只有管理员可修改数据
- 审批流程确保数据准确性

### 5. 取消报名功能
**功能描述**：
- 用户可取消自己的报名
- 自动释放库存配额
- 触发器自动更新 claimed 计数

---

## 💡 技术创新点

### 1. 高并发抢票解决方案
**问题**：传统前端检查库存容易出现超卖（多个用户同时看到"还有 1 个名额"并同时提交）

**解决方案**：
```sql
-- 使用数据库原子操作 + WHERE 条件
UPDATE event_groups
SET claimed = claimed + 1
WHERE id = $1 AND claimed < capacity
RETURNING *;
```

- 前端不参与库存判断，所有逻辑在后端 API 处理
- PostgreSQL 的行锁机制保证并发安全
- 触发器自动更新 claimed 计数，避免手动计算错误

### 2. Serverless 架构优势
**传统架构痛点**：
- 需要购买服务器（成本高）
- 需要配置 Nginx、PM2 等（运维复杂）
- 扩展性差（高并发需要手动扩容）

**Serverless 优势**：
- **零成本部署**：Netlify + Supabase 免费额度足够中小型社团使用
- **自动扩展**：高并发时自动启动更多 Function 实例
- **无需运维**：不需要管理服务器、数据库备份自动化

### 3. Row Level Security (RLS) 安全机制
**原理**：在数据库层面控制数据访问权限，即使 API 被绕过也无法访问未授权数据

**实现示例**：
```sql
-- 用户只能查看自己的报名记录
CREATE POLICY "Users can view own registrations"
ON registrations FOR SELECT
USING (auth.uid() = user_id);

-- 只有管理员可以添加财务记录
CREATE POLICY "Only finance managers can insert"
ON finance_records FOR INSERT
USING (
  EXISTS (
    SELECT 1 FROM admin_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'finance_manager')
  )
);
```

### 4. 响应式设计
- CSS Grid + Flexbox 实现自适应布局
- 移动端优先设计理念
- 流畅的动画效果（CSS Transitions）

---

## 🏗️ 技术架构

### 技术栈
| 层级 | 技术选型 | 说明 |
|------|---------|------|
| **前端** | HTML5 + CSS3 + Vanilla JS | 轻量级，无框架依赖 |
| **后端** | Netlify Functions (Node.js) | Serverless 函数 |
| **数据库** | Supabase (PostgreSQL) | 开源 Firebase 替代品 |
| **认证** | Supabase Auth | 内置 JWT 认证 |
| **部署** | Netlify | 自动 CI/CD |

### 数据库设计
**核心数据表**：
- `profiles`：用户资料（与 auth.users 关联）
- `events`：活动表（标题、描述、状态）
- `event_groups`：活动分组（容量、已报名数、签到图、分享链接）
- `registrations`：报名记录（用户-活动关联）
- `finance_records`：财务流水（类型、金额、描述）
- `inventory`：物资库存（名称、类别、数量、单位）
- `admin_roles`：管理员角色（用户 ID、角色类型）

**关键触发器**：
- `update_updated_at_column`：自动更新 updated_at 字段
- `update_group_claimed_safe`：并发安全的库存计数更新
- `handle_new_user`：新用户自动创建 Profile

### API 设计
**Netlify Functions**：
- `config.js`：动态注入 Supabase 配置（前端获取）
- `register.js`：处理报名请求（并发控制）
- `create-profile.js`：创建用户 Profile
- `approvals.js`：用户信息审批流程
- `admin-events.js`：管理员活动管理
- `admin-finance.js`：管理员财务管理
- `admin-inventory.js`：管理员物资管理
- `admin-roles.js`：管理员角色管理
- `final_cancel_registration_js.js`：取消报名

---

## 📱 用户流程

### 新用户注册流程
1. 访问平台首页
2. 点击"注册"按钮
3. 填写邮箱、密码、姓名、学号、学院
4. 系统发送验证邮件
5. 点击邮件链接验证
6. 自动创建 Profile 记录
7. 登录成功，进入主页

### 活动报名流程
1. 用户浏览活动列表
2. 选择感兴趣的活动（如"周五夜羽"）
3. 选择分组（新手场/高手场）
4. 点击"报名"按钮
5. 后端原子操作：
   - 检查库存 (`claimed < capacity`)
   - 检查互斥锁（是否已报名其他分组）
   - 创建报名记录
   - 更新 claimed 计数
6. 前端显示签到二维码 Modal
7. 用户完成学校活动网签到
8. 点击"我已签到"按钮
9. 显示领票链接（微信小程序）

### 管理员管理流程
1. 管理员登录后台
2. 查看权限范围：
   - 活动管理员：创建活动、添加分组
   - 财务管理员：添加收支记录
   - 物资管理员：更新库存信息
3. 执行相应操作
4. 数据实时同步到前端展示

---

## 🔒 安全措施

### 1. 数据库层面
- **RLS 策略**：所有表启用 Row Level Security
- **权限分离**：Service Role Key 仅在后端使用，前端使用 Anon Key
- **约束检查**：CHECK 约束防止非法数据（如 capacity > 0）
- **外键级联**：用户删除时自动清理关联数据

### 2. API 层面
- **JWT 验证**：所有 API 请求需携带有效 Token
- **参数校验**：后端验证所有输入参数
- **错误处理**：统一错误响应格式，不暴露敏感信息

### 3. 前端层面
- **HTTPS**：Netlify 自动强制 HTTPS
- **XSS 防护**：使用 `textContent` 而非 `innerHTML` 渲染用户输入
- **CSRF 防护**：Supabase SDK 自动处理

---

## 📊 性能优化

### 数据库优化
- **索引创建**：在常用查询字段创建索引（user_id, event_id, group_id）
- **触发器优化**：使用 PostgreSQL 原生触发器，性能优于应用层计数
- **查询优化**：避免 N+1 查询，使用 JOIN 减少往返次数

### 前端优化
- **懒加载**：活动列表按需加载
- **本地缓存**：用户 Profile 缓存到 LocalStorage
- **防抖节流**：报名按钮防止重复点击

---

## 🚀 部署说明

### 环境变量配置
| 变量名 | 说明 | 获取位置 |
|--------|------|----------|
| `SUPABASE_URL` | Supabase 项目 URL | Supabase Dashboard > Settings > API |
| `SUPABASE_ANON_KEY` | 匿名密钥（前端使用） | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务密钥（后端使用） | Supabase Dashboard > Settings > API |

### 快速部署步骤
1. **Fork 项目**到自己的 GitHub
2. **创建 Supabase 项目**，执行 `database.sql`
3. **连接 Netlify**，导入 Git 仓库
4. **配置环境变量**（上表三个变量）
5. **触发部署**，等待构建完成
6. **访问 Netlify 分配的域名**测试功能

详细步骤见 [SETUP.md](./SETUP.md)

---

## 📈 未来规划

### 功能扩展
- [ ] 积分系统（签到积分、兑换奖品）
- [ ] 数据分析（活动参与度统计、用户活跃度）
- [ ] 通知推送（活动提醒、签到提醒）
- [ ] 社区论坛（成员交流、技术分享）

### 技术升级
- [ ] 迁移到 Next.js 提升 SEO
- [ ] 引入 TypeScript 增强类型安全
- [ ] PWA 支持（离线访问）
- [ ] 移动端 App（React Native）

---

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：
1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 📞 联系方式

如有问题或建议，欢迎通过以下方式联系：
- 提交 Issue：[GitHub Issues](https://github.com/your-repo/issues)
- 邮件联系：[your-email@example.com]

---

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](./LICENSE) 文件。

---

**感谢使用羽毛球社团数字化管理平台！** 🏸🎉
